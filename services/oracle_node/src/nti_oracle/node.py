"""OperatorNode, ValidatorNode, DisputeWatcher, and TelegramNotifier for NTI Oracle."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import httpx
from nti_core.config import NTIConfig
from nti_core.types import KolProfile
from nti_engine.calc import run_epoch
from nti_engine.models import EngineKol, EnginePost, EpochResult, PrevEpochState
from nti_fetcher.protocol import PostSource

from nti_oracle.dataset import (
    DatasetUploader,
    DeltaArtifact,
    build_delta_dataset,
    parse_delta_blob,
    reconstruct_window,
    tx_id_to_bytes32,
)
from nti_oracle.omission import run_omission_check
from nti_oracle.signing import (
    SignedAttestation,
    encode_v_vector_solidity,
    sign_attestation,
    verify_attestation,
)


class ConsensusError(RuntimeError):
    """Raised when quorum or median deviation rules fail for an epoch commit."""


def compute_median_vector(vectors: Sequence[Sequence[int]]) -> tuple[int, ...]:
    """Compute element-wise integer median across validator vectors."""
    if not vectors:
        raise ValueError("Cannot compute median of empty vector list")
    width = len(vectors[0])
    out: list[int] = []
    for idx in range(width):
        col = sorted(int(v[idx]) for v in vectors)
        mid = len(col) // 2
        if len(col) % 2 == 1:
            out.append(col[mid])
        else:
            out.append((col[mid - 1] + col[mid]) // 2)
    return tuple(out)


def max_vector_delta_bps(vec_a: Sequence[int], vec_b: Sequence[int]) -> int:
    """Maximum element-wise absolute difference in basis points."""
    return max((abs(int(a) - int(b)) for a, b in zip(vec_a, vec_b, strict=True)), default=0)


@dataclass(frozen=True, slots=True)
class ValidationDecision:
    approved: bool
    validator: str
    epoch_id: int
    max_delta_bps: int
    overlap: float
    attestation: SignedAttestation | None
    reason: str | None = None


@dataclass(frozen=True, slots=True)
class CommitPayload:
    epoch_id: int
    series_id: int
    dataset_hash: str
    config_hash: str
    arweave_tx: str
    arweave_tx_bytes32: str
    operator_i_vector: tuple[int, ...]
    operator_v_vector: tuple[int, ...]
    median_i_vector: tuple[int, ...]
    max_operator_delta_bps: int
    attestations: tuple[SignedAttestation, ...]
    epoch_result: EpochResult


class ValidatorNode:
    """Independent validator verifying dataset hash, recomputing engine, and checking omission."""

    def __init__(
        self,
        *,
        private_key: str,
        cfg: NTIConfig,
        chain_id: int,
        verifying_contract: str,
        validator_source: PostSource,
    ) -> None:
        from eth_account import Account

        self._private_key = private_key
        self.address = Account.from_key(private_key).address
        self._cfg = cfg
        self._chain_id = chain_id
        self._verifying_contract = verifying_contract
        self._source = validator_source

    async def verify_and_sign(
        self,
        *,
        delta_blob: bytes | DeltaArtifact,
        expected_dataset_hash: str,
        prev_deltas: Sequence[bytes | DeltaArtifact],
        prev_state: PrevEpochState,
        operator_i_vector: Sequence[int],
        kol_profiles: Sequence[KolProfile],
        prev_commit_hash: str,
    ) -> ValidationDecision:
        header, _, delta_posts, _, chain_hash = parse_delta_blob(delta_blob)

        if chain_hash.lower() != expected_dataset_hash.lower():
            return ValidationDecision(
                approved=False,
                validator=self.address,
                epoch_id=header.epoch_id,
                max_delta_bps=10_000,
                overlap=0.0,
                attestation=None,
                reason=f"Dataset hash mismatch: expected {expected_dataset_hash}, got {chain_hash}",
            )

        if header.config_hash.lower() != self._cfg.config_hash().lower():
            return ValidationDecision(
                approved=False,
                validator=self.address,
                epoch_id=header.epoch_id,
                max_delta_bps=10_000,
                overlap=0.0,
                attestation=None,
                reason="Config hash mismatch",
            )

        reconstructed = reconstruct_window(
            deltas=[*prev_deltas, delta_blob],
            target_epoch_id=header.epoch_id,
            boundary_unix=header.boundary_unix,
            series_id=header.series_id,
            lookback_hours=self._cfg.lookback_hours,
        )
        result = run_epoch(reconstructed, prev_state, self._cfg)
        delta_bps = max_vector_delta_bps(result.i_vector, operator_i_vector)

        # Build operator post IDs by KOL for the 4-hour delta window
        boundary_dt = datetime.fromtimestamp(header.boundary_unix, tz=UTC)
        window_start_dt = boundary_dt - timedelta(seconds=self._cfg.epoch_seconds)
        op_ids_by_kol: dict[int, set[int]] = {}
        for p in delta_posts:
            p_dt = datetime.fromtimestamp(p.created_at_unix, tz=UTC)
            if window_start_dt <= p_dt < boundary_dt:
                op_ids_by_kol.setdefault(p.user_id, set()).add(p.tweet_id)

        omission = await run_omission_check(
            kols=kol_profiles,
            operator_post_ids_by_kol=op_ids_by_kol,
            validator_source=self._source,
            prev_commit_hash=prev_commit_hash,
            epoch_id=header.epoch_id,
            window_start=window_start_dt,
            boundary=boundary_dt,
            sample_fraction=self._cfg.validator.sample_fraction,
            min_overlap=self._cfg.validator.min_overlap,
        )

        if not omission.passed:
            return ValidationDecision(
                approved=False,
                validator=self.address,
                epoch_id=header.epoch_id,
                max_delta_bps=delta_bps,
                overlap=omission.overlap,
                attestation=None,
                reason=(
                    f"Omission check failed: overlap={omission.overlap:.4f} "
                    f"< {self._cfg.validator.min_overlap:.2f} "
                    f"(missing={len(omission.missing_post_ids)})"
                ),
            )

        if delta_bps >= self._cfg.validator.max_delta_bps:
            return ValidationDecision(
                approved=False,
                validator=self.address,
                epoch_id=header.epoch_id,
                max_delta_bps=delta_bps,
                overlap=omission.overlap,
                attestation=None,
                reason=(
                    f"Vector deviation {delta_bps} bps >= limit "
                    f"{self._cfg.validator.max_delta_bps} bps"
                ),
            )

        att = sign_attestation(
            private_key=self._private_key,
            epoch_id=header.epoch_id,
            dataset_hash=chain_hash,
            config_hash=header.config_hash,
            i_vector=result.i_vector,
            v_vector=result.v_vector,
            chain_id=self._chain_id,
            verifying_contract=self._verifying_contract,
        )
        return ValidationDecision(
            approved=True,
            validator=self.address,
            epoch_id=header.epoch_id,
            max_delta_bps=delta_bps,
            overlap=omission.overlap,
            attestation=att,
            reason=None,
        )


class OperatorNode:
    """Builds canonical delta dataset, uploads it, runs engine, and collects validator quorum."""

    def __init__(
        self,
        *,
        cfg: NTIConfig,
        uploader: DatasetUploader,
        chain_id: int,
        verifying_contract: str,
        registered_validators: set[str],
        min_validators: int = 3,
    ) -> None:
        self._cfg = cfg
        self._uploader = uploader
        self._chain_id = chain_id
        self._verifying_contract = verifying_contract
        self._registered = {a.lower() for a in registered_validators}
        self._min_validators = min_validators

    async def build_and_collect_commit(
        self,
        *,
        epoch_id: int,
        boundary_unix: int,
        series_id: int,
        kols: Sequence[EngineKol],
        kol_profiles: Sequence[KolProfile],
        delta_posts: Sequence[EnginePost],
        prev_deltas: Sequence[bytes | DeltaArtifact],
        prev_state: PrevEpochState,
        prev_dataset_hash: str,
        prev_arweave_tx: str,
        prev_commit_hash: str,
        validators: Sequence[ValidatorNode],
        a_max: Decimal | None = None,
    ) -> CommitPayload:
        config_hash = self._cfg.config_hash()
        artifact = build_delta_dataset(
            epoch_id=epoch_id,
            boundary_unix=boundary_unix,
            series_id=series_id,
            config_hash=config_hash,
            kols=kols,
            posts=delta_posts,
            prev_dataset_hash=prev_dataset_hash,
            prev_arweave_tx=prev_arweave_tx,
            a_max=a_max,
        )
        arweave_tx = await self._uploader.upload(epoch_id, artifact.chain_hash, artifact.gzipped)

        reconstructed = reconstruct_window(
            deltas=[*prev_deltas, artifact],
            target_epoch_id=epoch_id,
            boundary_unix=boundary_unix,
            series_id=series_id,
            lookback_hours=self._cfg.lookback_hours,
        )
        op_result = run_epoch(reconstructed, prev_state, self._cfg)

        valid_atts: list[SignedAttestation] = []
        seen_validators: set[str] = set()
        for val in validators:
            decision = await val.verify_and_sign(
                delta_blob=artifact.gzipped,
                expected_dataset_hash=artifact.chain_hash,
                prev_deltas=prev_deltas,
                prev_state=prev_state,
                operator_i_vector=op_result.i_vector,
                kol_profiles=kol_profiles,
                prev_commit_hash=prev_commit_hash,
            )
            if not decision.approved or decision.attestation is None:
                continue
            signer_lc = decision.attestation.validator.lower()
            if signer_lc not in self._registered or signer_lc in seen_validators:
                continue
            if not verify_attestation(
                decision.attestation,
                decision.attestation.validator,
                chain_id=self._chain_id,
                verifying_contract=self._verifying_contract,
            ):
                continue
            seen_validators.add(signer_lc)
            valid_atts.append(decision.attestation)

        if len(valid_atts) < self._min_validators:
            raise ConsensusError(
                f"Insufficient valid attestations for epoch {epoch_id}: "
                f"{len(valid_atts)} < {self._min_validators}"
            )

        median_i = compute_median_vector([a.i_vector for a in valid_atts])
        op_delta = max_vector_delta_bps(op_result.i_vector, median_i)
        if op_delta > self._cfg.validator.max_delta_bps:
            raise ConsensusError(
                f"Operator vector deviates {op_delta} bps from validator median "
                f"(limit {self._cfg.validator.max_delta_bps} bps)"
            )

        return CommitPayload(
            epoch_id=epoch_id,
            series_id=series_id,
            dataset_hash=artifact.chain_hash,
            config_hash=config_hash,
            arweave_tx=arweave_tx,
            arweave_tx_bytes32=tx_id_to_bytes32(arweave_tx),
            operator_i_vector=op_result.i_vector,
            operator_v_vector=encode_v_vector_solidity(op_result.v_vector),
            median_i_vector=median_i,
            max_operator_delta_bps=op_delta,
            attestations=tuple(valid_atts),
            epoch_result=op_result,
        )


class TelegramNotifier:
    """O3 Telegram operations alerter with injectable sink for offline verification."""

    def __init__(
        self,
        bot_token: str,
        chat_id: str,
        *,
        client: httpx.AsyncClient | None = None,
        sink: list[str] | None = None,
        timeout: float = 15.0,
    ) -> None:
        self._bot_token = bot_token
        self._chat_id = chat_id
        self._client = client
        self._sink = sink
        self._timeout = timeout

    async def send(self, text: str) -> None:
        if self._sink is not None:
            self._sink.append(text)
            return
        if not self._bot_token or not self._chat_id:
            return
        url = f"https://api.telegram.org/bot{self._bot_token}/sendMessage"
        payload = {"chat_id": self._chat_id, "text": text}
        if self._client is not None:
            resp = await self._client.post(url, json=payload)
        else:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(url, json=payload)
        resp.raise_for_status()

    async def alert_late_epoch(self, epoch_id: int, minutes_late: int, stage: str) -> None:
        await self.send(f"[NTI ALERT] Epoch {epoch_id} late at stage '{stage}' (+{minutes_late}m)")

    async def alert_fetch_failure(
        self, epoch_id: int, failure_pct: float, failover_used: bool
    ) -> None:
        await self.send(
            f"[NTI ALERT] Epoch {epoch_id} fetch failure {failure_pct:.2f}% "
            f"(failover_used={failover_used})"
        )

    async def alert_llm_fallback(
        self, provider_from: str, provider_to: str, invalid_pct: float
    ) -> None:
        await self.send(
            f"[NTI ALERT] LLM failover {provider_from} -> {provider_to} "
            f"(invalid={invalid_pct:.2f}%)"
        )

    async def alert_low_eth(
        self,
        role: str,
        address: str,
        balance_eth: Decimal,
        threshold_eth: Decimal = Decimal("0.05"),
    ) -> None:
        await self.send(
            f"[NTI ALERT] Low ETH on {role} ({address}): {balance_eth} ETH < {threshold_eth} ETH"
        )

    async def alert_dispute_opened(
        self, epoch_id: int, dispute_id: int, narrative_id: int, challenger: str
    ) -> None:
        await self.send(
            f"[NTI ALERT] Dispute #{dispute_id} opened on epoch {epoch_id} "
            f"(narrative={narrative_id}, challenger={challenger})"
        )

    async def alert_validator_deviation(
        self, epoch_id: int, validator: str, max_delta_bps: int
    ) -> None:
        await self.send(
            f"[NTI ALERT] Validator {validator} deviated {max_delta_bps} bps on epoch {epoch_id}"
        )


class DisputeWatcher:
    """Monitors operational SLOs and dispute events, forwarding threshold breaches to Telegram."""

    def __init__(
        self,
        notifier: TelegramNotifier,
        *,
        deviation_alert_bps: int = 50,
        fetch_failure_alert_pct: float = 1.0,
        min_eth_balance: Decimal = Decimal("0.05"),
        commit_deadline_minutes: int = 120,
        final_deadline_minutes: int = 240,
    ) -> None:
        self._notifier = notifier
        self._deviation_alert_bps = deviation_alert_bps
        self._fetch_failure_alert_pct = fetch_failure_alert_pct
        self._min_eth_balance = min_eth_balance
        self._commit_deadline_minutes = commit_deadline_minutes
        self._final_deadline_minutes = final_deadline_minutes

    async def check_epoch_timeliness(
        self, epoch_id: int, minutes_since_boundary: int, *, committed: bool, finalized: bool
    ) -> bool:
        alerted = False
        if not committed and minutes_since_boundary > self._commit_deadline_minutes:
            await self._notifier.alert_late_epoch(epoch_id, minutes_since_boundary, "commit")
            alerted = True
        elif not finalized and minutes_since_boundary > self._final_deadline_minutes:
            await self._notifier.alert_late_epoch(epoch_id, minutes_since_boundary, "finalize")
            alerted = True
        return alerted

    async def check_fetch_health(
        self, epoch_id: int, failure_pct: float, failover_used: bool
    ) -> bool:
        if failure_pct > self._fetch_failure_alert_pct or failover_used:
            await self._notifier.alert_fetch_failure(epoch_id, failure_pct, failover_used)
            return True
        return False

    async def check_validator_deviation(
        self, epoch_id: int, validator: str, delta_bps: int
    ) -> bool:
        if delta_bps > self._deviation_alert_bps:
            await self._notifier.alert_validator_deviation(epoch_id, validator, delta_bps)
            return True
        return False

    async def check_eth_balance(self, role: str, address: str, balance_eth: Decimal) -> bool:
        if balance_eth < self._min_eth_balance:
            await self._notifier.alert_low_eth(role, address, balance_eth, self._min_eth_balance)
            return True
        return False

    async def on_dispute_opened(
        self, epoch_id: int, dispute_id: int, narrative_id: int, challenger: str
    ) -> None:
        await self._notifier.alert_dispute_opened(epoch_id, dispute_id, narrative_id, challenger)
