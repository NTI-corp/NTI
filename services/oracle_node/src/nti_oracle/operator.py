"""Live epoch preparation: authoritative chain state, archives, and isolated validators."""

from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path
from typing import Any

from eth_abi import decode
from eth_account import Account
from nti_core.config import NTIConfig
from nti_core.types import KolProfile
from nti_engine.calc import ENGINE_VERSION
from nti_engine.models import EngineKol
from nti_fetcher.accounts import AccountPool
from nti_fetcher.adapters import TwscrapeSource
from nti_fetcher.runner import FetchRunner
from nti_fetcher.storage import SupabaseStorage

from nti_oracle.archive import load_archive_chain, normalize_hash
from nti_oracle.chain import OnChainOracleState, OracleCommitClient
from nti_oracle.dataset import (
    ZERO_HASH,
    LocalFileUploader,
    MirroredUploader,
    SupabaseStorageMirror,
    reconstruct_window,
)
from nti_oracle.inputs import calculation_provenance, next_series_id, previous_epoch_state
from nti_oracle.live_inputs import prepare_engine_posts
from nti_oracle.node import CommitPayload, OperatorNode, ValidatorNode


async def require_complete_fetch_evidence(
    *,
    storage: SupabaseStorage,
    epoch_id: int,
    epoch_start: int,
    now: int,
    freshness_seconds: int,
    min_success_ratio: float = 0.95,
) -> dict[str, Any]:
    """Fail closed unless the target epoch has a recent, complete scrape run."""
    rows = await storage.select(
        "fetch_cycle_runs",
        columns=(
            "run_id,epoch_id,status,started_at,finished_at,total_eligible,accounts_ok,"
            "accounts_failed,due_user_ids,omitted_user_ids,manifest_sha256"
        ),
        filters={"epoch_id": f"eq.{int(epoch_id)}"},
        order="finished_at.desc",
        limit=1,
    )
    if not rows:
        raise RuntimeError(f"No persisted fetch-cycle evidence for epoch {epoch_id}")
    run = rows[0]
    if run.get("status") != "collecting":
        raise RuntimeError(f"Fetch cycle for epoch {epoch_id} is not complete")
    try:
        started = int(
            datetime.fromisoformat(str(run["started_at"]).replace("Z", "+00:00")).timestamp()
        )
        finished = int(
            datetime.fromisoformat(str(run["finished_at"]).replace("Z", "+00:00")).timestamp()
        )
        eligible = int(run["total_eligible"])
        ok = int(run["accounts_ok"])
        failed = int(run["accounts_failed"])
        due = {int(value) for value in run["due_user_ids"]}
        omitted = {int(value) for value in (run.get("omitted_user_ids") or [])}
    except (KeyError, TypeError, ValueError) as exc:
        raise RuntimeError(f"Malformed fetch-cycle evidence for epoch {epoch_id}") from exc
    if not run.get("manifest_sha256"):
        raise RuntimeError(f"Fetch cycle for epoch {epoch_id} has no manifest digest")
    if now - finished > freshness_seconds:
        raise RuntimeError(f"Fetch cycle for epoch {epoch_id} is stale")
    if started < epoch_start or finished < started or finished > now:
        raise RuntimeError(f"Fetch cycle for epoch {epoch_id} is outside the current epoch")
    if eligible != len(due) or due & omitted or omitted or ok + failed != eligible:
        raise RuntimeError(f"Fetch cycle for epoch {epoch_id} omitted or lost eligible accounts")
    success_ratio = (ok / eligible) if eligible else 1.0
    if success_ratio < min_success_ratio:
        raise RuntimeError(
            f"Fetch cycle for epoch {epoch_id} success ratio {success_ratio:.1%} "
            f"is below {min_success_ratio:.0%}"
        )
    return run


async def prepare_commit(
    *,
    epoch_id: int,
    cfg: NTIConfig,
    kols: list[KolProfile],
    storage: SupabaseStorage,
    client: OracleCommitClient,
    state: OnChainOracleState,
    chain_id: int,
    oracle_address: str,
    repo_root: Path,
) -> tuple[CommitPayload, str]:
    boundary = state.genesis_timestamp + epoch_id * cfg.epoch_seconds
    cutoff = min(state.block_timestamp, boundary + (cfg.observation_window_seconds or 0))
    await require_complete_fetch_evidence(
        storage=storage,
        epoch_id=epoch_id,
        epoch_start=boundary,
        now=state.block_timestamp,
        freshness_seconds=cfg.epoch_seconds,
        min_success_ratio=float(os.environ.get("FETCHER_MIN_SUCCESS_RATIO", "0.95")),
    )
    posts, model = await prepare_engine_posts(
        storage=storage,
        cfg=cfg,
        kols=kols,
        epoch_id=epoch_id,
        boundary_unix=boundary,
        observation_cutoff_unix=cutoff,
        repo_root=repo_root,
    )
    if not posts:
        raise RuntimeError(
            "No observed classified posts available; refusing an empty official index"
        )
    provenance = calculation_provenance(
        cfg.config_hash(),
        model,
        os.environ.get("CLASSIFIER_PROMPT_VERSION", "v2"),
        ENGINE_VERSION,
    )
    omission_enabled = os.environ.get("VALIDATOR_OMISSION_CHECK", "0") == "1"
    provenance["omission_mode"] = "independent_pool" if omission_enabled else "disabled"
    mirror = SupabaseStorageMirror(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    prior = await storage.select(
        "epochs",
        columns="epoch_id,series_id,dataset_hash,arweave_tx,commit_tx,status",
        filters={"epoch_id": f"lt.{epoch_id}", "dataset_hash": "not.is.null"},
        order="epoch_id.desc",
        limit=1,
    )
    blobs: list[bytes] = []
    prev_hash, prev_locator, prev_commit = ZERO_HASH, "", ZERO_HASH
    last_header = None
    if prior:
        blobs, last_header, prev_locator, prev_hash = await load_archive_chain(
            prior[0],
            repo_root / "data/deltas",
            mirror,
        )
        prev_commit = normalize_hash(prior[0].get("commit_tx")) or ZERO_HASH
    previous_series = last_header.series_id if last_header else 0
    series_id = next_series_id(
        previous_series, last_header.provenance if last_header else None, provenance
    )

    # Derive gap and EMA state from the oracle, not a potentially lagging SQL mirror.
    ids = set(range(max(1, epoch_id - cfg.v_lag_epochs), epoch_id))
    if state.latest_final_epoch:
        ids.add(state.latest_final_epoch)
    epochs: list[dict[str, Any]] = []
    values: list[dict[str, Any]] = []
    for ep in sorted(ids):
        status, _ = await client.get_epoch_status(ep)
        ep_series = int(
            decode(["uint32"], await client._call("epochSeries(uint32)", ["uint32"], [ep]))[0]
        )
        label = {0: "missing", 1: "committed", 2: "disputed", 3: "final", 4: "incomplete"}[status]
        epochs.append({"epoch_id": ep, "series_id": ep_series, "status": label})
        if status == 3:
            vector, _ = await client.get_epoch_vector(ep)
            values.extend(
                {"epoch_id": ep, "narrative_id": nid, "i_bps": vector[i]}
                for i, nid in enumerate(sorted(cfg.narratives))
            )
    prev_state = previous_epoch_state(epoch_id, series_id, epochs, values, cfg.v_lag_epochs)

    # A new series starts with a full observed window; subsequent archives contain
    # only changed posts/24h engagement readings. The previous hash remains linked.
    delta_posts = posts
    if blobs and previous_series == series_id:
        previous = reconstruct_window(
            blobs,
            target_epoch_id=epoch_id,
            boundary_unix=boundary,
            series_id=series_id,
            lookback_hours=cfg.lookback_hours,
        )
        old_by_id = {p.tweet_id: p for p in previous.posts}
        delta_posts = [p for p in posts if old_by_id.get(p.tweet_id) != p]

    keys = [os.environ[f"VALIDATOR_PRIVATE_KEY_{i}"] for i in (1, 2, 3)]
    addresses = [Account.from_key(k).address for k in keys]
    if len(set(a.lower() for a in addresses)) != 3:
        raise RuntimeError("Three distinct validator keys are required")
    operator_address = Account.from_key(os.environ["OPERATOR_PRIVATE_KEY"]).address
    if operator_address.lower() in {a.lower() for a in addresses}:
        raise RuntimeError("Operator must not share a validator key")
    pool: AccountPool | None = None
    db_path = Path(os.environ.get("TWSCRAPE_DB_PATH", "data/state/accounts.db"))
    if not db_path.is_absolute():
        db_path = repo_root / db_path
    if omission_enabled:
        pool_path = Path(os.environ.get("X_ACCOUNTS_FILE", "secrets/x_accounts.json"))
        if not pool_path.is_absolute():
            pool_path = repo_root / pool_path
        pool = AccountPool.from_file(pool_path, state_path=repo_root / "data/state/x_budget.json")
        if len(pool.validator_accounts()) < 3:
            raise RuntimeError(
                "Independent omission verification requires three dedicated X accounts"
            )
    validators = [
        ValidatorNode(
            private_key=key,
            cfg=cfg,
            chain_id=chain_id,
            verifying_contract=oracle_address,
            validator_source=TwscrapeSource(
                db_path=db_path,
                account_pool=pool,
                pool_key=f"validator_{i}",
            )
            if omission_enabled
            else None,
        )
        for i, key in enumerate(keys)
    ]
    uploader = MirroredUploader(LocalFileUploader(repo_root / "data/deltas"), mirror, required=True)
    operator = OperatorNode(
        cfg=cfg,
        uploader=uploader,
        chain_id=chain_id,
        verifying_contract=oracle_address,
        registered_validators=set(addresses),
        min_validators=3,
    )
    payload = await operator.build_and_collect_commit(
        epoch_id=epoch_id,
        boundary_unix=boundary,
        series_id=series_id,
        kols=[EngineKol(k.user_id, k.followers, k.h_k, k.r_k) for k in kols],
        kol_profiles=FetchRunner.eligible_kols(kols, epoch_id),
        delta_posts=delta_posts,
        prev_deltas=blobs,
        prev_state=prev_state,
        prev_dataset_hash=prev_hash,
        prev_arweave_tx=prev_locator,
        prev_commit_hash=prev_commit,
        validators=validators,
        observation_cutoff_unix=cutoff,
        provenance=provenance,
    )
    if payload.epoch_result.incomplete or sum(payload.operator_i_vector) != 10000:
        raise RuntimeError("Incomplete index or invalid basis-point sum; refusing commit")
    return payload, model
