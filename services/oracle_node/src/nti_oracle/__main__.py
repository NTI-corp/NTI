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
from nti_classifier.adapters import GeminiAdapter
from nti_classifier.pipeline import ClassifierPipeline, load_prompt_spec
from nti_classifier.protocol import PostIn
from nti_core.config import NTIConfig, load_config
from nti_core.types import KolProfile
from nti_engine.models import EngagementSnapshot, EngineKol, EnginePost, PrevEpochState
from nti_fetcher.accounts import AccountPool
from nti_fetcher.adapters import TwscrapeSource
from nti_fetcher.runner import FetchRunner
from nti_fetcher.storage import SupabaseStorage

from nti_oracle.chain import OracleCommitClient
from nti_oracle.dataset import ZERO_HASH, LocalFileUploader, tx_id_to_bytes32
from nti_oracle.keeper_tasks import (
    _guard,
    distribute_fees,
    manage_grant_round,
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
from nti_oracle.node import OperatorNode, TelegramNotifier, ValidatorNode

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


async def _load_active_kols(storage: SupabaseStorage) -> list[KolProfile]:
    rows = await storage.select(
        "kols",
        columns="user_id,handle,followers,h_k,poll_tier,active",
        filters={"active": "eq.true"},
        order="user_id.asc",
    )
    return [
        KolProfile(
            user_id=int(r["user_id"]),
            handle=str(r["handle"]),
            followers=int(r.get("followers", 0)),
            h_k=int(r.get("h_k", 1)),
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
    source: TwscrapeSource,
) -> tuple[list[EnginePost], str]:
    lookback_start_iso = datetime.fromtimestamp(
        boundary_unix - cfg.lookback_hours * 3600, tz=UTC
    ).isoformat()

    kol_ids = {k.user_id for k in kols}
    post_rows = await storage.select(
        "posts",
        columns="tweet_id,user_id,created_at,body",
        filters={"created_at": f"gte.{lookback_start_iso}"},
        order="created_at.desc",
        limit=2000,
    )
    post_rows = [
        r
        for r in post_rows
        if int(r["user_id"]) in kol_ids and _parse_dt_unix(str(r["created_at"])) <= boundary_unix
    ]

    # Bootstrap live fetch if no posts in window yet
    if not post_rows:
        runner = FetchRunner(
            primary=source,
            output_dir=REPO_ROOT / "data" / "snapshots",
            lock_path=REPO_ROOT / "data" / "state" / "oracle_fetch.lock",
        )
        fetch_res = await runner.run_cycle(
            epoch_id=epoch_id,
            boundary=datetime.fromtimestamp(boundary_unix, tz=UTC),
            kols=kols,
        )
        if fetch_res.posts:
            cycle_rows = [
                {
                    "epoch_id": epoch_id,
                    "lane": lane.lane,
                    "source": lane.source,
                    "started_at": lane.started_at,
                    "finished_at": lane.finished_at,
                    "accounts_ok": lane.accounts_ok,
                    "accounts_failed": lane.accounts_failed,
                    "post_count": lane.post_count,
                    "manifest_sha256": lane.sha256,
                }
                for lane in fetch_res.lanes
            ]
            inserted = await storage.insert_returning("fetch_cycles", cycle_rows)
            cid = int(inserted[0]["id"]) if inserted else 1
            await storage.upsert_posts(
                [
                    {
                        "tweet_id": p.tweet_id,
                        "user_id": p.user_id,
                        "created_at": p.created_at.astimezone(UTC).isoformat(),
                        "body": p.text,
                    }
                    for p in fetch_res.posts
                ]
            )
            await storage.upsert_post_engagement(
                [
                    {
                        "tweet_id": p.tweet_id,
                        "cycle_id": cid,
                        "likes": p.likes,
                        "reposts": p.reposts,
                        "quotes": p.quotes,
                        "replies": p.replies,
                        "fetched_at": p.fetched_at.astimezone(UTC).isoformat(),
                    }
                    for p in fetch_res.posts
                ]
            )
            post_rows = [
                {
                    "tweet_id": p.tweet_id,
                    "user_id": p.user_id,
                    "created_at": p.created_at.astimezone(UTC).isoformat(),
                    "body": p.text,
                }
                for p in fetch_res.posts
            ]

    if not post_rows:
        return [], os.environ.get("GEMINI_MODEL", "gemini-3.5-flash-lite")

    eng_rows = await storage.select(
        "post_engagement",
        columns="tweet_id,likes,reposts,quotes,replies,fetched_at",
        filters={"fetched_at": f"gte.{lookback_start_iso}"},
        order="fetched_at.desc",
        limit=5000,
    )
    engs_by_tid: dict[int, list[EngagementSnapshot]] = {}
    fallback_engs_by_tid: dict[int, list[EngagementSnapshot]] = {}
    for er in eng_rows:
        f_unix = _parse_dt_unix(str(er["fetched_at"]))
        tid = int(er["tweet_id"])
        snap_raw = EngagementSnapshot(
            likes=int(er.get("likes", 0)),
            reposts=int(er.get("reposts", 0)),
            quotes=int(er.get("quotes", 0)),
            replies=int(er.get("replies", 0)),
            fetched_at_unix=min(f_unix, boundary_unix),
        )
        if f_unix <= boundary_unix:
            engs_by_tid.setdefault(tid, []).append(snap_raw)
        else:
            fallback_engs_by_tid.setdefault(tid, []).append(snap_raw)

    for tid, snaps in fallback_engs_by_tid.items():
        if tid not in engs_by_tid:
            engs_by_tid[tid] = snaps[:1]

    cls_rows = await storage.select(
        "classifications",
        columns="tweet_id,q,model_version",
        filters={"prompt_version": "eq.v1"},
        order="tweet_id.desc",
        limit=5000,
    )
    q_by_tid: dict[int, dict[int, Decimal]] = {}
    for cr in cls_rows:
        tid = int(cr["tweet_id"])
        raw_q = cr.get("q") or {}
        q_by_tid[tid] = {int(k): Decimal(str(v)) for k, v in raw_q.items()}

    handle_by_uid = {k.user_id: k.handle for k in kols}
    unclassified = [
        PostIn(
            tweet_id=int(r["tweet_id"]),
            handle=handle_by_uid.get(int(r["user_id"]), str(r["user_id"])),
            text=str(r.get("body") or ""),
        )
        for r in post_rows
        if int(r["tweet_id"]) not in q_by_tid and r.get("body")
    ]

    model_name = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash-lite")
    fallback_model = os.environ.get("GEMINI_FALLBACK_MODEL", "gemini-3.1-flash-lite")
    if unclassified:
        gemini_key = os.environ.get("GEMINI_API_KEY", "")
        primary = GeminiAdapter(api_key=gemini_key, model=model_name)
        fallback = GeminiAdapter(api_key=gemini_key, model=fallback_model)
        eff_batch = min(cfg.classifier.batch_size, 40)
        pipeline = ClassifierPipeline(
            primary=primary,
            fallback=fallback,
            batch_size=eff_batch,
        )
        spec = load_prompt_spec(
            "v1",
            prompts_dir=REPO_ROOT / "services" / "classifier" / "prompts",
            narratives=cfg.narratives,
        )
        cls_out = await pipeline.run(unclassified, spec)
        await storage.upsert_classifications(
            [
                {
                    "tweet_id": item.tweet_id,
                    "model_version": cls_out.run_record.model_version,
                    "prompt_version": spec.version,
                    "series_id": 1,
                    "q": {str(k): v for k, v in item.q.items()},
                }
                for item in cls_out.results
            ]
        )
        await storage.upsert_llm_runs(
            [
                {
                    "epoch_id": epoch_id,
                    "provider": "gemini",
                    "model_version": cls_out.run_record.model_version,
                    "prompt_version": spec.version,
                    "batch_size": cfg.classifier.batch_size,
                    "valid_count": cls_out.run_record.succeeded_posts,
                    "failed_count": cls_out.run_record.fallback_zero_count,
                }
            ]
        )
        for item in cls_out.results:
            q_by_tid[item.tweet_id] = {int(k): Decimal(str(v)) for k, v in item.q.items()}

    engine_posts = [
        EnginePost(
            tweet_id=int(r["tweet_id"]),
            user_id=int(r["user_id"]),
            created_at_unix=_parse_dt_unix(str(r["created_at"])),
            engagements=tuple(
                sorted(engs_by_tid.get(int(r["tweet_id"]), []), key=lambda e: e.fetched_at_unix)
            ),
            q=q_by_tid.get(int(r["tweet_id"]), {}),
        )
        for r in post_rows
        if engs_by_tid.get(int(r["tweet_id"]))
    ]
    return engine_posts, model_name


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

    target_epoch = (
        args.epoch
        if args.epoch is not None
        else (state.block_timestamp - state.genesis_timestamp - 3600) // cfg.epoch_seconds
    )
    if target_epoch <= state.last_processed_epoch:
        return {
            "role": "operator",
            "status": "up_to_date",
            "target_epoch": target_epoch,
            "last_processed_epoch": state.last_processed_epoch,
            "latest_final_epoch": state.latest_final_epoch,
        }

    boundary_unix = state.genesis_timestamp + target_epoch * cfg.epoch_seconds
    kols = await _load_active_kols(storage)
    accounts_path = _resolve_repo_path(os.environ.get("X_ACCOUNTS_FILE", "secrets/x_accounts.json"))
    pool = AccountPool.from_file(accounts_path) if accounts_path.exists() else None
    db_path = _resolve_repo_path(os.environ.get("TWSCRAPE_DB_PATH", "data/state/accounts.db"))
    x_source = TwscrapeSource(db_path=db_path, account_pool=pool)

    delta_posts, model_name = await _ensure_classified_posts(
        storage=storage,
        cfg=cfg,
        kols=kols,
        epoch_id=target_epoch,
        boundary_unix=boundary_unix,
        source=x_source,
    )
    if not delta_posts:
        return {"role": "operator", "status": "no_posts", "epoch_id": target_epoch}

    # Previous epoch EMA + lag baseline from latest final epoch
    prev_i_bps: dict[int, int] | None = None
    lag_i_bps: dict[int, int] | None = None
    series_id = 1
    prev_dataset_hash = ZERO_HASH
    prev_arweave_tx = ""
    prev_commit_hash = ZERO_HASH

    ep_rows = await storage.select(
        "epochs",
        columns="epoch_id,series_id,dataset_hash,arweave_tx,commit_tx,status",
        order="epoch_id.desc",
        limit=1,
    )
    if ep_rows:
        last_ep = ep_rows[0]
        series_id = int(last_ep.get("series_id", 1))
        raw_dh = str(last_ep.get("dataset_hash") or "").replace("\\x", "")
        if len(raw_dh) == 64:
            prev_dataset_hash = f"0x{raw_dh}"
        prev_arweave_tx = str(last_ep.get("arweave_tx") or "")
        raw_ct = str(last_ep.get("commit_tx") or "").replace("\\x", "")
        if len(raw_ct) == 64:
            prev_commit_hash = f"0x{raw_ct}"

    if state.latest_final_epoch > 0:
        final_rows = await storage.select(
            "narrative_epoch",
            columns="narrative_id,i_bps",
            filters={"epoch_id": f"eq.{state.latest_final_epoch}"},
        )
        if final_rows:
            prev_i_bps = {int(r["narrative_id"]): int(r["i_bps"]) for r in final_rows}

    lag_epoch = target_epoch - cfg.v_lag_epochs
    if lag_epoch > 0:
        lag_rows = await storage.select(
            "narrative_epoch",
            columns="narrative_id,i_bps",
            filters={"epoch_id": f"eq.{lag_epoch}"},
        )
        if lag_rows:
            lag_i_bps = {int(r["narrative_id"]): int(r["i_bps"]) for r in lag_rows}

    val_keys = [
        os.environ.get(f"VALIDATOR_PRIVATE_KEY_{idx}", "")
        for idx in (1, 2, 3)
        if os.environ.get(f"VALIDATOR_PRIVATE_KEY_{idx}", "")
    ]
    if len(val_keys) < 3:
        raise RuntimeError("VALIDATOR_PRIVATE_KEY_1..3 are required for operator consensus")

    validators = [
        ValidatorNode(
            private_key=pk,
            cfg=cfg,
            chain_id=args.chain_id,
            verifying_contract=oracle_addr,
            validator_source=x_source,
        )
        for pk in val_keys
    ]
    uploader = LocalFileUploader(REPO_ROOT / "data" / "deltas")
    operator_node = OperatorNode(
        cfg=cfg,
        uploader=uploader,
        chain_id=args.chain_id,
        verifying_contract=oracle_addr,
        registered_validators={Account.from_key(pk).address for pk in val_keys},
        min_validators=3,
    )
    engine_kols = [
        EngineKol(user_id=k.user_id, followers=k.followers, h_k=k.h_k, r_k=Decimal("1"))
        for k in kols
    ]

    # Bootstrap fresh chain link from current dataset when no local delta archive exists yet
    prev_deltas: list[bytes] = []
    if prev_arweave_tx.startswith("local_"):
        candidate = REPO_ROOT / "data" / "deltas" / f"{prev_arweave_tx}.jsonl.gz"
        if candidate.exists():
            prev_deltas.append(candidate.read_bytes())
        else:
            prev_dataset_hash = ZERO_HASH
            prev_arweave_tx = ""
    else:
        prev_dataset_hash = ZERO_HASH
        prev_arweave_tx = ""

    payload = await operator_node.build_and_collect_commit(
        epoch_id=target_epoch,
        boundary_unix=boundary_unix,
        series_id=series_id,
        kols=engine_kols,
        kol_profiles=kols,
        delta_posts=delta_posts,
        prev_deltas=prev_deltas,
        prev_state=PrevEpochState(
            series_id=series_id,
            prev_i_bps=prev_i_bps,
            lag_i_bps=lag_i_bps,
        ),
        prev_dataset_hash=prev_dataset_hash,
        prev_arweave_tx=prev_arweave_tx,
        prev_commit_hash=prev_commit_hash,
        validators=validators,
    )

    if args.dry_run:
        return {
            "role": "operator",
            "status": "dry_run",
            "epoch_id": target_epoch,
            "model": model_name,
            "post_count": len(delta_posts),
            "dataset_hash": payload.dataset_hash,
            "i_vector": list(payload.median_i_vector),
        }

    op_key = os.environ["OPERATOR_PRIVATE_KEY"]
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

    return {
        "role": "operator",
        "status": "committed",
        "epoch_id": payload.epoch_id,
        "tx_hash": tx_hash,
        "post_count": len(delta_posts),
        "dataset_hash": payload.dataset_hash,
        "i_vector": list(payload.median_i_vector),
    }


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
    """Market settlement, fee split, buyback, grant rounds and Radar alerts (each isolated)."""
    dep = _load_deployment(args.chain_id)
    rpc_url = _rpc_url_for_chain(args.chain_id)

    def at(name: str) -> OracleCommitClient | None:
        addr = dep.get(name, "")
        if not addr or int(addr, 16) == 0:
            return None
        return OracleCommitClient(rpc_url=rpc_url, contract_address=addr, chain_id=args.chain_id)

    market, fee_router, registry, grants = (
        at("narrativeMarket"), at("feeRouter"), at("registry"), at("grants"),
    )
    results: list[dict[str, Any]] = []

    if market is not None:
        results.append(
            await _guard(
                "settle_markets",
                lambda: settle_markets(market, oracle, private_key=keeper_key),
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
                    lambda: run_buyback(fee_router, registry, private_key=keeper_key),
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
            )

        results.append(await _guard("grant_round", _grants))
    results.append(await _guard("radar_alerts", lambda: sync_radar_alerts(storage)))
    return results


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
        "validator-1": "VALIDATOR_PRIVATE_KEY_1",
        "validator-2": "VALIDATOR_PRIVATE_KEY_2",
        "validator-3": "VALIDATOR_PRIVATE_KEY_3",
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
        choices=("operator", "validator", "keeper", "monitor"),
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
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    cfg = load_config(_resolve_repo_path(args.config))

    if (
        args.role == "operator"
        and os.environ.get("SUPABASE_URL")
        and os.environ.get("OPERATOR_PRIVATE_KEY")
    ):
        res = asyncio.run(_run_operator(args, cfg))
    elif args.role == "keeper" and os.environ.get("SUPABASE_URL") and (
        os.environ.get("KEEPER_PRIVATE_KEY") or os.environ.get("OPERATOR_PRIVATE_KEY")
    ):
        res = asyncio.run(_run_keeper(args))
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
