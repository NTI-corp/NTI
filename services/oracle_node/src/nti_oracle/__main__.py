"""CLI entrypoint: python -m nti_oracle --role operator|validator|keeper|monitor."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

from eth_account import Account
from nti_core.config import NTIConfig, load_config
from nti_core.types import KolProfile
from nti_engine.models import EnginePost
from nti_fetcher.adapters import TwscrapeSource
from nti_fetcher.storage import SupabaseStorage

from nti_oracle.chain import OracleCommitClient
from nti_oracle.dataset import (
    SupabaseStorageMirror,
    tx_id_to_bytes32,
)
from nti_oracle.keeper_tasks import (
    _guard,
    accrue_basket_fees,
    distribute_fees,
    manage_grant_round,
    rebalance_baskets,
    redeem_basket_fees,
    run_buyback,
    settle_markets,
    sync_radar_alerts,
)
from nti_oracle.monitor import (
    AlertDeduper,
    MonitorInputs,
    default_state_path,
    now_unix,
    run_monitor,
)
from nti_oracle.node import TelegramNotifier

REPO_ROOT = Path(__file__).resolve().parents[4]


def _resolve_repo_path(raw: str | Path) -> Path:
    p = Path(raw)
    if p.is_absolute() or p.exists():
        return p
    alt = REPO_ROOT / p
    return alt if alt.exists() else p


def _to_pg_bytea(hex_str: str) -> str:
    cleaned = hex_str[2:] if hex_str.startswith("0x") else hex_str
    return f"\\x{cleaned.lower()}"


def _load_oracle_address(chain_id: int) -> str:
    dep_path = REPO_ROOT / "contracts" / "deployments" / f"{chain_id}.json"
    if not dep_path.exists():
        raise RuntimeError(f"Deployment manifest missing: {dep_path}")
    data = json.loads(dep_path.read_text(encoding="utf-8"))
    addr = str(data.get("oracleCommit", ""))
    if not addr:
        raise RuntimeError(f"oracleCommit address missing in {dep_path}")
    return addr


def _load_deployment(chain_id: int) -> dict[str, str]:
    dep_path = REPO_ROOT / "contracts" / "deployments" / f"{chain_id}.json"
    if not dep_path.exists():
        raise RuntimeError(f"Deployment manifest missing: {dep_path}")
    return {k: str(v) for k, v in json.loads(dep_path.read_text(encoding="utf-8")).items()}


def _rpc_url_for_chain(chain_id: int) -> str:
    if chain_id == 4663:
        return os.environ.get("RPC_URL_MAINNET", "https://robinhood-rpc.publicnode.com")
    return os.environ.get("RPC_URL_TESTNET", "https://robinhood-sepolia-rpc.publicnode.com")


def _parse_dt_unix(iso_str: str) -> int:
    cleaned = iso_str.replace("Z", "+00:00")
    return int(datetime.fromisoformat(cleaned).timestamp())


def _epochs_to_scan(last_processed_epoch: int, mature_epoch: int) -> range:
    """Epochs that may hold fetch evidence.

    A chain that has never committed starts at the newest mature epoch: scanning from epoch 1 would
    walk more than a hundred thousand epochs.
    """
    start = mature_epoch if last_processed_epoch == 0 else last_processed_epoch + 1
    return range(start, mature_epoch + 1)


def _due_operator_epoch(
    block_timestamp: int,
    genesis_timestamp: int,
    epoch_seconds: int,
    commit_delay: int,
    last_processed_epoch: int,
    ready_fetch_epochs: set[int],
) -> int | None:
    """Return the earliest mature epoch with usable fetch evidence."""
    mature_epoch = max(
        0,
        (block_timestamp - genesis_timestamp - commit_delay) // epoch_seconds,
    )
    if mature_epoch <= last_processed_epoch:
        return None
    candidates = (
        epoch for epoch in ready_fetch_epochs if last_processed_epoch < epoch <= mature_epoch
    )
    return min(candidates, default=None)


async def _load_active_kols(storage: SupabaseStorage) -> list[KolProfile]:
    rows = await storage.select(
        "kols",
        columns="user_id,handle,followers,h_k,r_k,poll_tier,active",
        filters={"active": "eq.true"},
        order="followers.desc",
    )
    return [
        KolProfile(
            user_id=int(r["user_id"]),
            handle=str(r["handle"]),
            followers=int(r.get("followers", 0)),
            h_k=int(r.get("h_k", 1)),
            r_k=Decimal(str(r.get("r_k", "1"))),
            poll_tier=int(r.get("poll_tier", 1)),
            active=bool(r.get("active", True)),
        )
        for r in rows
    ]


async def _ensure_classified_posts(
    *,
    storage: SupabaseStorage,
    cfg: NTIConfig,
    kols: list[KolProfile],
    epoch_id: int,
    boundary_unix: int,
    source: TwscrapeSource | None,
    observation_cutoff_unix: int | None = None,
) -> tuple[list[EnginePost], str]:
    from nti_oracle.live_inputs import prepare_engine_posts

    return await prepare_engine_posts(
        storage=storage,
        cfg=cfg,
        kols=kols,
        epoch_id=epoch_id,
        boundary_unix=boundary_unix,
        observation_cutoff_unix=observation_cutoff_unix or boundary_unix,
        repo_root=REPO_ROOT,
    )


async def _run_operator(args: argparse.Namespace, cfg: NTIConfig) -> dict[str, Any]:
    sb_url = os.environ["SUPABASE_URL"]
    sb_key = os.environ["SUPABASE_SERVICE_KEY"]
    storage = SupabaseStorage(sb_url, sb_key)

    oracle_addr = _load_oracle_address(args.chain_id)
    rpc_url = _rpc_url_for_chain(args.chain_id)
    client = OracleCommitClient(
        rpc_url=rpc_url, contract_address=oracle_addr, chain_id=args.chain_id
    )
    state = await client.read_state()

    if args.epoch is not None:
        target_epoch = args.epoch
    else:
        from nti_oracle.operator import FetchEvidenceError, require_complete_fetch_evidence

        commit_delay = await client.get_commit_delay()
        mature_epoch = max(
            0,
            (state.block_timestamp - state.genesis_timestamp - commit_delay) // cfg.epoch_seconds,
        )
        if mature_epoch <= state.last_processed_epoch:
            target_epoch = state.last_processed_epoch
        else:
            ready_epochs: set[int] = set()
            min_success_ratio = float(os.environ.get("FETCHER_MIN_SUCCESS_RATIO", "0.95"))
            for epoch_id in _epochs_to_scan(state.last_processed_epoch, mature_epoch):
                epoch_start = state.genesis_timestamp + epoch_id * cfg.epoch_seconds
                try:
                    await require_complete_fetch_evidence(
                        storage=storage,
                        epoch_id=epoch_id,
                        epoch_start=epoch_start,
                        now=state.block_timestamp,
                        freshness_seconds=cfg.epoch_seconds,
                        expected_due_user_ids=None,
                        min_success_ratio=min_success_ratio,
                    )
                except FetchEvidenceError:
                    continue
                ready_epochs.add(epoch_id)
                break
            target_epoch = _due_operator_epoch(
                state.block_timestamp,
                state.genesis_timestamp,
                cfg.epoch_seconds,
                commit_delay,
                state.last_processed_epoch,
                ready_epochs,
            )
            if target_epoch is None:
                return {
                    "role": "operator",
                    "status": "waiting_for_fresh_fetch_evidence",
                    "mature_epoch": mature_epoch,
                    "last_processed_epoch": state.last_processed_epoch,
                    "latest_final_epoch": state.latest_final_epoch,
                }
    if target_epoch <= state.last_processed_epoch:
        return {
            "role": "operator",
            "status": "up_to_date",
            "target_epoch": target_epoch,
            "last_processed_epoch": state.last_processed_epoch,
            "latest_final_epoch": state.latest_final_epoch,
        }

    from nti_oracle.operator import prepare_commit

    payload, model_name = await prepare_commit(
        epoch_id=target_epoch,
        cfg=cfg,
        kols=await _load_active_kols(storage),
        storage=storage,
        client=client,
        state=state,
        chain_id=args.chain_id,
        oracle_address=oracle_addr,
        repo_root=REPO_ROOT,
    )

    if args.dry_run:
        return {
            "role": "operator",
            "status": "dry_run",
            "epoch_id": target_epoch,
            "model": model_name,
            "post_count": payload.input_post_count,
            "dataset_hash": payload.dataset_hash,
            "i_vector": list(payload.median_i_vector),
        }

    op_key = os.environ["OPERATOR_PRIVATE_KEY"]
    current_status, _ = await client.get_epoch_status(payload.epoch_id)
    if current_status != 0:
        return {"role": "operator", "status": "already_processed", "epoch_id": payload.epoch_id}
    tx_hash = await client.commit_epoch(
        private_key=op_key,
        epoch_id=payload.epoch_id,
        series_id=payload.series_id,
        dataset_hash=payload.dataset_hash,
        config_hash=payload.config_hash,
        arweave_tx_bytes32=tx_id_to_bytes32(payload.arweave_tx),
        i_vector=payload.operator_i_vector,
        v_vector=payload.operator_v_vector,
        attestations=payload.attestations,
    )

    now_iso = datetime.now(UTC).isoformat()
    await storage.upsert_epochs(
        [
            {
                "epoch_id": payload.epoch_id,
                "series_id": payload.series_id,
                "status": "committed",
                "dataset_hash": _to_pg_bytea(payload.dataset_hash),
                "arweave_tx": payload.arweave_tx,
                "config_hash": _to_pg_bytea(payload.config_hash),
                "commit_tx": _to_pg_bytea(tx_hash),
                "committed_at": now_iso,
            }
        ]
    )
    await storage.upsert_narrative_epoch(
        [
            {
                "epoch_id": payload.epoch_id,
                "narrative_id": n.narrative_id,
                "s_n": str(n.s_n),
                "m_bps": n.m_bps,
                "i_bps": n.i_bps,
                "v_bps": n.v_bps,
                "v_flag": n.v_flag,
                "weighted_posts": str(n.weighted_posts),
            }
            for n in payload.epoch_result.narratives
        ]
    )
    contrib_rows = [
        {
            "epoch_id": payload.epoch_id,
            "narrative_id": n.narrative_id,
            "user_id": c.user_id,
            "share_bps": c.share_bps,
            "capped": c.capped,
        }
        for n in payload.epoch_result.narratives
        for c in n.contributors
    ]
    if contrib_rows:
        await storage.upsert(
            "kol_contribution",
            contrib_rows,
            on_conflict="epoch_id,narrative_id,user_id",
        )
    await storage.upsert(
        "attestations",
        [
            {
                "epoch_id": payload.epoch_id,
                "validator": _to_pg_bytea(att.validator),
                "i_bps": list(att.i_vector),
                "v_bps": list(att.v_vector),
                "signature": _to_pg_bytea(att.signature),
            }
            for att in payload.attestations
        ],
        on_conflict="epoch_id,validator",
    )

    finalize_tx = await _finalize_when_window_is_short(client, storage, payload.epoch_id, op_key)

    return {
        "role": "operator",
        "status": "committed",
        "epoch_id": payload.epoch_id,
        "tx_hash": tx_hash,
        "finalize_tx": finalize_tx,
        "post_count": payload.input_post_count,
        "dataset_hash": payload.dataset_hash,
        "i_vector": list(payload.median_i_vector),
    }


async def _finalize_when_window_is_short(
    client: OracleCommitClient, storage: SupabaseStorage, epoch_id: int, key: str
) -> str | None:
    """Finalize right after commit when the on-chain dispute window is only seconds long (testnet).

    With the production 2 hour window this is skipped and the keeper finalizes later. Errors are
    swallowed on purpose: the keeper retries on its next run.
    """
    try:
        window = await client.get_dispute_window()
        if window > 120:
            return None
        await asyncio.sleep(window + 3)
        tx = await client.finalize_epoch(private_key=key, epoch_id=epoch_id)
        await storage.patch(
            "epochs",
            filters={"epoch_id": f"eq.{epoch_id}"},
            values={"status": "final", "finalized_at": datetime.now(UTC).isoformat()},
        )
        return tx
    except Exception:  # noqa: BLE001 - keeper will finalize on its next tick
        return None


async def _run_keeper(args: argparse.Namespace) -> dict[str, Any]:
    sb_url = os.environ["SUPABASE_URL"]
    sb_key = os.environ["SUPABASE_SERVICE_KEY"]
    storage = SupabaseStorage(sb_url, sb_key)

    oracle_addr = _load_oracle_address(args.chain_id)
    rpc_url = _rpc_url_for_chain(args.chain_id)
    client = OracleCommitClient(
        rpc_url=rpc_url, contract_address=oracle_addr, chain_id=args.chain_id
    )
    state = await client.read_state()
    dispute_window = await client.get_dispute_window()

    committed = await storage.select(
        "epochs",
        columns="epoch_id,status",
        filters={"status": "eq.committed"},
        order="epoch_id.asc",
    )
    finalized: list[dict[str, Any]] = []
    keeper_key = os.environ.get("KEEPER_PRIVATE_KEY") or os.environ["OPERATOR_PRIVATE_KEY"]

    for row in committed:
        eid = int(row["epoch_id"])
        onchain_status, committed_at = await client.get_epoch_status(eid)
        if onchain_status == 3:
            await storage.patch(
                "epochs",
                filters={"epoch_id": f"eq.{eid}"},
                values={"status": "final", "finalized_at": datetime.now(UTC).isoformat()},
            )
            finalized.append({"epoch_id": eid, "tx_hash": "already_final_onchain"})
        elif onchain_status == 1 and state.block_timestamp >= committed_at + dispute_window:
            tx_hash = await client.finalize_epoch(private_key=keeper_key, epoch_id=eid)
            await storage.patch(
                "epochs",
                filters={"epoch_id": f"eq.{eid}"},
                values={"status": "final", "finalized_at": datetime.now(UTC).isoformat()},
            )
            finalized.append({"epoch_id": eid, "tx_hash": tx_hash})

    tasks = await _run_keeper_tasks(args, storage, client, keeper_key)

    return {
        "role": "keeper",
        "chain_id": args.chain_id,
        "checked": len(committed),
        "finalized": finalized,
        "tasks": tasks,
    }


async def _run_keeper_tasks(
    args: argparse.Namespace,
    storage: SupabaseStorage,
    oracle: OracleCommitClient,
    keeper_key: str,
) -> list[dict[str, Any]]:
    """Run the guarded market, basket, fee, buyback, grant and Radar maintenance cycle."""
    dep = _load_deployment(args.chain_id)
    rpc_url = _rpc_url_for_chain(args.chain_id)
    chain_state = await oracle.read_state()
    chain_timestamp = chain_state.block_timestamp

    def at_address(addr: str) -> OracleCommitClient:
        if not addr or int(addr, 16) == 0:
            raise ValueError("Cannot construct a contract client for the zero address")
        return OracleCommitClient(rpc_url=rpc_url, contract_address=addr, chain_id=args.chain_id)

    def at(name: str) -> OracleCommitClient | None:
        addr = dep.get(name, "")
        if not addr or int(addr, 16) == 0:
            return None
        return at_address(addr)

    market, fee_router, registry, grants = (
        at("narrativeMarket"),
        at("feeRouter"),
        at("registry"),
        at("grants"),
    )
    results: list[dict[str, Any]] = []

    if market is not None:
        results.append(
            await _guard(
                "settle_markets",
                lambda: settle_markets(market, oracle, private_key=keeper_key),
            )
        )
    basket_factory = at("basketFactory")
    if basket_factory is not None:
        results.append(
            await _guard(
                "accrue_basket_fees",
                lambda: accrue_basket_fees(
                    basket_factory,
                    at_address,
                    private_key=keeper_key,
                    now=chain_timestamp,
                ),
            )
        )
        if fee_router is not None and dep.get("weth"):
            results.append(
                await _guard(
                    "redeem_basket_fees",
                    lambda: redeem_basket_fees(
                        basket_factory,
                        fee_router,
                        at_address,
                        fee_router_address=dep["feeRouter"],
                        weth_address=dep["weth"],
                        private_key=keeper_key,
                        now=chain_timestamp,
                    ),
                )
            )

    if fee_router is not None:
        results.append(
            await _guard(
                "distribute_fees",
                lambda: distribute_fees(fee_router, private_key=keeper_key),
            )
        )
        if registry is not None:
            results.append(
                await _guard(
                    "buyback",
                    lambda: run_buyback(
                        fee_router,
                        registry,
                        private_key=keeper_key,
                        at_address=at_address,
                        deployment=dep,
                        v4_pools_json=os.environ.get("BUYBACK_V4_POOLS_JSON"),
                        now=chain_timestamp,
                    ),
                )
            )

    if basket_factory is not None and dep.get("weth"):
        allocation_index: dict[int, int] | None = None
        if chain_state.latest_final_epoch > 0:
            final_rows = await storage.select(
                "narrative_epoch",
                columns="narrative_id,i_bps",
                filters={"epoch_id": f"eq.{chain_state.latest_final_epoch}"},
                order="narrative_id.asc",
            )
            candidate = {int(row["narrative_id"]): int(row["i_bps"]) for row in final_rows}
            if len(candidate) == 10 and sum(candidate.values()) == 10_000:
                allocation_index = candidate
        results.append(
            await _guard(
                "rebalance_baskets",
                lambda: rebalance_baskets(
                    basket_factory,
                    at_address,
                    weth_address=dep["weth"],
                    private_key=keeper_key,
                    now=chain_timestamp,
                    allocation_index=allocation_index,
                ),
            )
        )

    if grants is not None:
        grants_addr = dep["grants"]

        async def _grants() -> dict[str, Any]:
            bal = int(await oracle._rpc("eth_getBalance", [grants_addr, "latest"]), 16)
            return await manage_grant_round(
                grants,
                private_key=keeper_key,
                grants_balance_wei=bal,
                round_seconds=int(os.environ.get("GRANT_ROUND_SECONDS", 14 * 24 * 3600)),
                now=chain_timestamp,
            )

        results.append(await _guard("grant_round", _grants))
    results.append(await _guard("radar_alerts", lambda: sync_radar_alerts(storage)))
    return results


async def _run_backfill_mirror() -> dict[str, Any]:
    """Upload every local delta dataset to the public mirror bucket (idempotent)."""
    mirror = SupabaseStorageMirror(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    uploaded: list[str] = []
    for path in sorted((REPO_ROOT / "data" / "deltas").glob("*.jsonl.gz")):
        tx_id = path.name.removesuffix(".jsonl.gz")
        await mirror.put(tx_id, path.read_bytes())
        uploaded.append(tx_id)
    example = mirror.public_url(uploaded[-1]) if uploaded else None
    return {"role": "backfill-mirror", "uploaded": len(uploaded), "example_url": example}


async def _run_monitor(args: argparse.Namespace) -> dict[str, Any]:
    """Check epoch SLOs, wallet balances and fetch health; alert via Telegram when configured."""
    oracle = OracleCommitClient(
        rpc_url=_rpc_url_for_chain(args.chain_id),
        contract_address=_load_oracle_address(args.chain_id),
        chain_id=args.chain_id,
    )
    state = await oracle.read_state()

    balances: dict[str, tuple[str, Decimal]] = {}
    key_envs = {
        "operator": "OPERATOR_PRIVATE_KEY",
        "keeper": "KEEPER_PRIVATE_KEY",
    }
    for role, env_name in key_envs.items():
        raw_key = os.environ.get(env_name)
        if not raw_key:
            continue
        address = Account.from_key(raw_key).address
        wei = int(await oracle._rpc("eth_getBalance", [address, "latest"]), 16)
        balances[role] = (address, Decimal(wei) / Decimal(10**18))

    fetch_pct: float | None = None
    fetch_epoch: int | None = None
    if os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_KEY"):
        storage = SupabaseStorage(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
        latest = await storage.select(
            "fetch_cycles",
            columns="epoch_id,accounts_ok,accounts_failed",
            order="id.desc",
            limit=1,
        )
        if latest:
            fetch_epoch = int(latest[0]["epoch_id"])
            rows = await storage.select(
                "fetch_cycles",
                columns="accounts_ok,accounts_failed",
                filters={"epoch_id": f"eq.{fetch_epoch}"},
            )
            ok = sum(int(r.get("accounts_ok") or 0) for r in rows)
            failed = sum(int(r.get("accounts_failed") or 0) for r in rows)
            fetch_pct = (100.0 * failed / (ok + failed)) if (ok + failed) else 0.0

    notifier = TelegramNotifier(
        os.environ.get("TELEGRAM_BOT_TOKEN", ""), os.environ.get("TELEGRAM_CHAT_ID", "")
    )
    inputs = MonitorInputs(
        now=now_unix(),
        genesis_timestamp=state.genesis_timestamp,
        last_processed_epoch=state.last_processed_epoch,
        latest_final_epoch=state.latest_final_epoch,
        balances_eth=balances,
        fetch_failure_pct=fetch_pct,
        fetch_epoch_id=fetch_epoch,
    )
    result = await run_monitor(
        inputs,
        notifier,
        chain_id=args.chain_id,
        deduper=AlertDeduper(default_state_path(REPO_ROOT)),
    )
    result["telegram_configured"] = bool(
        os.environ.get("TELEGRAM_BOT_TOKEN") and os.environ.get("TELEGRAM_CHAT_ID")
    )
    return result


async def _run_validator(args: argparse.Namespace, cfg: NTIConfig) -> dict[str, Any]:
    oracle_addr = _load_oracle_address(args.chain_id)
    rpc_url = _rpc_url_for_chain(args.chain_id)
    client = OracleCommitClient(
        rpc_url=rpc_url, contract_address=oracle_addr, chain_id=args.chain_id
    )
    state = await client.read_state()
    status_val, committed_at = await client.get_epoch_status(state.last_processed_epoch)
    return {
        "role": "validator",
        "chain_id": args.chain_id,
        "config_version": cfg.version,
        "last_processed_epoch": state.last_processed_epoch,
        "latest_final_epoch": state.latest_final_epoch,
        "last_epoch_status": status_val,
        "last_epoch_committed_at": committed_at,
        "status": "ok",
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="nti_oracle", description="NTI Oracle Node CLI")
    parser.add_argument(
        "--role",
        choices=("operator", "validator", "keeper", "monitor", "backfill-mirror"),
        required=True,
        help="Execution role for this oracle process",
    )
    parser.add_argument("--epoch", type=int, default=None, help="Optional target epoch ID")
    parser.add_argument(
        "--config",
        type=Path,
        default=Path(os.environ.get("NTI_CONFIG_PATH", "config/nti.v1.json")),
        help="Path to NTI protocol config JSON",
    )
    parser.add_argument(
        "--chain-id",
        type=int,
        default=int(os.environ.get("CHAIN_ID", "46630")),
        help="Target EVM chain ID (46630 testnet, 4663 mainnet)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Compute consensus without sending on-chain commit transaction",
    )
    parser.add_argument(
        "--loop",
        type=int,
        default=0,
        metavar="SECONDS",
        help="Operator only: run as a daemon, pausing this long between runs. A run is never "
        "interrupted by a schedule, so a slow commit (classification of a large epoch) can finish.",
    )
    return parser


def _repo_head() -> str:
    import subprocess

    try:
        out = subprocess.run(
            ["git", "-C", str(REPO_ROOT), "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
        return out.stdout.strip()
    except Exception:  # noqa: BLE001
        return ""


def _run_operator_forever(args: argparse.Namespace, cfg: NTIConfig) -> int:
    """Run the operator repeatedly in one process; each run completes before the next starts.

    After a deploy the checkout moves to a new commit. The daemon notices between runs and exits,
    and PM2 restarts it on the new code, so a deploy never interrupts a commit in progress.
    """
    import gc
    import time
    import traceback

    started_at_head = _repo_head()
    while True:
        try:
            res = asyncio.run(_run_operator(args, cfg))
        except Exception as exc:  # noqa: BLE001 - one failed run must not stop the daemon
            traceback.print_exc()
            res = {"role": "operator", "status": "run_failed", "error": str(exc)[:300]}
        print(json.dumps({"at": datetime.now(UTC).isoformat(), **res}), flush=True)
        gc.collect()
        head = _repo_head()
        if started_at_head and head and head != started_at_head:
            print(json.dumps({"role": "operator", "status": "restarting_on_new_code"}), flush=True)
            return 0
        time.sleep(max(30, args.loop))


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    cfg = load_config(_resolve_repo_path(args.config))

    if (
        args.role == "operator"
        and os.environ.get("SUPABASE_URL")
        and os.environ.get("OPERATOR_PRIVATE_KEY")
    ):
        if args.loop > 0:
            return _run_operator_forever(args, cfg)
        res = asyncio.run(_run_operator(args, cfg))
    elif (
        args.role == "keeper"
        and os.environ.get("SUPABASE_URL")
        and (os.environ.get("KEEPER_PRIVATE_KEY") or os.environ.get("OPERATOR_PRIVATE_KEY"))
    ):
        res = asyncio.run(_run_keeper(args))
    elif args.role == "backfill-mirror":
        res = asyncio.run(_run_backfill_mirror())
    elif args.role == "monitor":
        res = asyncio.run(_run_monitor(args))
    elif args.role == "validator" and os.environ.get("RPC_URL_TESTNET"):
        res = asyncio.run(_run_validator(args, cfg))
    else:
        res = {
            "role": args.role,
            "epoch": args.epoch,
            "chain_id": args.chain_id,
            "config_version": cfg.version,
            "config_hash": cfg.config_hash(),
            "status": "ready",
        }
    print(json.dumps(res, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
