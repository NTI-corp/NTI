"""TDD tests for nti_oracle: delta datasets, EIP-712, omission, operator/validator, O3 alerts."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path

import pytest
from eth_account import Account
from nti_core.config import load_config
from nti_core.types import KolProfile, RawPost
from nti_engine.calc import run_epoch
from nti_engine.models import (
    EngagementSnapshot,
    EngineKol,
    EnginePost,
    EpochDataset,
    PrevEpochState,
)
from nti_fetcher.adapters import InMemoryMockSource

CONFIG_PATH = Path(__file__).resolve().parents[3] / "config" / "nti.v1.json"


def _sample_kols(n: int = 20) -> list[EngineKol]:
    return [EngineKol(user_id=uid, followers=10_000 + uid * 1000, h_k=1) for uid in range(1, n + 1)]


def _sample_posts(boundary: int, epoch_offset: int = 0) -> list[EnginePost]:
    posts: list[EnginePost] = []
    for uid in range(1, 21):
        nid = ((uid - 1) % 10) + 1
        tid = epoch_offset * 10_000 + uid * 10 + 1
        created = boundary - 3600
        posts.append(
            EnginePost(
                tweet_id=tid,
                user_id=uid,
                created_at_unix=created,
                engagements=(
                    EngagementSnapshot(
                        likes=50 + uid,
                        reposts=10,
                        quotes=2,
                        replies=5,
                        fetched_at_unix=boundary - 60,
                    ),
                ),
                q={nid: Decimal("0.9")},
            )
        )
    return posts


def test_delta_chain_build_gzip_reconstruct_and_recompute_bit_for_bit(tmp_path: Path) -> None:
    from nti_oracle.dataset import (
        ZERO_HASH,
        LocalFileUploader,
        build_delta_dataset,
        reconstruct_window,
    )

    cfg = load_config(CONFIG_PATH)
    kols = _sample_kols(20)
    b1 = 1_760_000_000
    b2 = b1 + cfg.epoch_seconds
    posts_e1 = _sample_posts(b1, epoch_offset=1)
    posts_e2 = _sample_posts(b2, epoch_offset=2)

    uploader = LocalFileUploader(tmp_path / "arweave_local")
    d1 = build_delta_dataset(
        epoch_id=100,
        boundary_unix=b1,
        series_id=1,
        config_hash=cfg.config_hash(),
        kols=kols,
        posts=posts_e1,
        prev_dataset_hash=ZERO_HASH,
        prev_arweave_tx="",
    )
    tx1 = uploader.upload_sync(d1.epoch_id, d1.chain_hash, d1.gzipped)

    d2 = build_delta_dataset(
        epoch_id=101,
        boundary_unix=b2,
        series_id=1,
        config_hash=cfg.config_hash(),
        kols=kols,
        posts=posts_e2,
        prev_dataset_hash=d1.chain_hash,
        prev_arweave_tx=tx1,
    )
    tx2 = uploader.upload_sync(d2.epoch_id, d2.chain_hash, d2.gzipped)

    # Download gzipped bytes and reconstruct full 168h window
    raw_blobs = [uploader.download_sync(tx1), uploader.download_sync(tx2)]
    reconstructed = reconstruct_window(
        deltas=raw_blobs,
        target_epoch_id=101,
        boundary_unix=b2,
        series_id=1,
        lookback_hours=cfg.lookback_hours,
    )
    direct = EpochDataset(
        epoch_id=101,
        boundary_unix=b2,
        series_id=1,
        posts=tuple(posts_e1 + posts_e2),
        kols=tuple(kols),
    )

    prev_state = PrevEpochState(series_id=1, prev_i_bps=None, lag_i_bps=None)
    res_direct = run_epoch(direct, prev_state, cfg)
    res_reconstructed = run_epoch(reconstructed, prev_state, cfg)
    assert res_reconstructed.i_vector == res_direct.i_vector
    assert res_reconstructed.v_vector == res_direct.v_vector
    assert d2.prev_dataset_hash == d1.chain_hash
    assert d2.prev_arweave_tx == tx1


def test_eip712_attestation_sign_recover_and_verify_roundtrip() -> None:
    from nti_oracle.signing import (
        compute_vector_hash,
        recover_attestation_signer,
        sign_attestation,
        verify_attestation,
    )

    acct = Account.create()
    contract_addr = "0x1111111111111111111111111111111111111111"
    chain_id = 46630
    dataset_hash = "0x" + "ab" * 32
    config_hash = "0x" + "cd" * 32
    i_vec = (1000,) * 10
    v_vec = (500, None, -250, 0, 100, 200, 300, 400, 500, 600)

    att = sign_attestation(
        private_key=acct.key.hex(),
        epoch_id=42,
        dataset_hash=dataset_hash,
        config_hash=config_hash,
        i_vector=i_vec,
        v_vector=v_vec,
        chain_id=chain_id,
        verifying_contract=contract_addr,
    )
    assert att.vector_hash == compute_vector_hash(i_vec, v_vec)
    recovered = recover_attestation_signer(att, chain_id=chain_id, verifying_contract=contract_addr)
    assert recovered.lower() == acct.address.lower()
    assert verify_attestation(
        att, acct.address, chain_id=chain_id, verifying_contract=contract_addr
    )
    # Wrong chain_id fails verification
    assert not verify_attestation(
        att, acct.address, chain_id=4663, verifying_contract=contract_addr
    )


@pytest.mark.asyncio
async def test_omission_check_passes_clean_and_catches_injected_omission() -> None:
    from nti_oracle.omission import run_omission_check, select_omission_sample

    boundary_dt = datetime(2026, 11, 19, 12, 0, tzinfo=UTC)
    window_start_dt = boundary_dt - timedelta(hours=4)
    kols = [KolProfile(user_id=uid, handle=f"kol_{uid}", followers=10_000) for uid in range(1, 51)]
    prev_commit = "0x" + "12" * 32

    sample = select_omission_sample(kols, prev_commit, epoch_id=77, sample_fraction=0.10)
    assert len(sample) == 5
    # Deterministic on repeated call
    assert [k.user_id for k in sample] == [
        k.user_id
        for k in select_omission_sample(kols, prev_commit, epoch_id=77, sample_fraction=0.10)
    ]

    # Validator sees 4 posts per KOL in the 4h window
    timelines: dict[int, list[RawPost]] = {}
    all_op_ids: dict[int, set[int]] = {}
    for k in kols:
        posts = [
            RawPost(
                tweet_id=k.user_id * 100 + j,
                user_id=k.user_id,
                handle=k.handle,
                created_at=window_start_dt + timedelta(minutes=30 * (j + 1)),
                text="hello",
                likes=10,
                reposts=1,
                quotes=0,
                replies=1,
                fetched_at=boundary_dt - timedelta(minutes=1),
            )
            for j in range(4)
        ]
        timelines[k.user_id] = posts
        all_op_ids[k.user_id] = {p.tweet_id for p in posts}

    val_source = InMemoryMockSource(name="validator_pool", timelines=timelines)
    clean_report = await run_omission_check(
        kols=kols,
        operator_post_ids_by_kol=all_op_ids,
        validator_source=val_source,
        prev_commit_hash=prev_commit,
        epoch_id=77,
        window_start=window_start_dt,
        boundary=boundary_dt,
    )
    assert clean_report.overlap == pytest.approx(1.0)
    assert clean_report.passed is True

    # Operator omits half the posts from one sampled KOL -> 18/20 = 90% < 95% -> CAUGHT!
    omitted_op_ids = {uid: set(ids) for uid, ids in all_op_ids.items()}
    victim = sample[0].user_id
    omitted_op_ids[victim] = set(sorted(omitted_op_ids[victim])[:2])

    bad_report = await run_omission_check(
        kols=kols,
        operator_post_ids_by_kol=omitted_op_ids,
        validator_source=val_source,
        prev_commit_hash=prev_commit,
        epoch_id=77,
        window_start=window_start_dt,
        boundary=boundary_dt,
    )
    assert bad_report.overlap < 0.95
    assert bad_report.passed is False
    assert len(bad_report.missing_post_ids) == 2


@pytest.mark.asyncio
async def test_operator_and_3_validators_commit_flow_and_o3_alerts(tmp_path: Path) -> None:
    from nti_oracle.dataset import ZERO_HASH, LocalFileUploader
    from nti_oracle.node import DisputeWatcher, OperatorNode, TelegramNotifier, ValidatorNode

    cfg = load_config(CONFIG_PATH)
    contract_addr = "0x2222222222222222222222222222222222222222"
    chain_id = 46630
    b1 = 1_760_000_000
    boundary_dt = datetime.fromtimestamp(b1, tz=UTC)

    kols_engine = _sample_kols(20)
    kols_profile = [
        KolProfile(user_id=k.user_id, handle=f"kol_{k.user_id}", followers=k.followers)
        for k in kols_engine
    ]
    posts_engine = _sample_posts(b1, epoch_offset=1)

    timelines = {
        p.user_id: [
            RawPost(
                tweet_id=p.tweet_id,
                user_id=p.user_id,
                handle=f"kol_{p.user_id}",
                created_at=datetime.fromtimestamp(p.created_at_unix, tz=UTC),
                text="narrative post",
                likes=p.engagements[0].likes,
                reposts=p.engagements[0].reposts,
                quotes=p.engagements[0].quotes,
                replies=p.engagements[0].replies,
                fetched_at=boundary_dt - timedelta(minutes=1),
            )
        ]
        for p in posts_engine
    }
    val_source = InMemoryMockSource(name="val_pool", timelines=timelines)
    uploader = LocalFileUploader(tmp_path / "store")

    val_accounts = [Account.create() for _ in range(3)]
    validators = [
        ValidatorNode(
            private_key=a.key.hex(),
            cfg=cfg,
            chain_id=chain_id,
            verifying_contract=contract_addr,
            validator_source=val_source,
        )
        for a in val_accounts
    ]

    operator = OperatorNode(
        cfg=cfg,
        uploader=uploader,
        chain_id=chain_id,
        verifying_contract=contract_addr,
        registered_validators={a.address for a in val_accounts},
    )

    prev_state = PrevEpochState(series_id=1, prev_i_bps=None, lag_i_bps=None)
    commit = await operator.build_and_collect_commit(
        epoch_id=100,
        boundary_unix=b1,
        series_id=1,
        kols=kols_engine,
        kol_profiles=kols_profile,
        delta_posts=posts_engine,
        prev_deltas=[],
        prev_state=prev_state,
        prev_dataset_hash=ZERO_HASH,
        prev_arweave_tx="",
        prev_commit_hash=ZERO_HASH,
        validators=validators,
    )
    assert len(commit.attestations) == 3
    assert sum(commit.median_i_vector) == 10_000
    assert commit.max_operator_delta_bps == 0

    # O3 Telegram alerting & DisputeWatcher
    sent: list[str] = []
    notifier = TelegramNotifier(bot_token="", chat_id="", sink=sent)
    watcher = DisputeWatcher(notifier=notifier)
    await watcher.check_validator_deviation(
        epoch_id=100, validator=val_accounts[0].address, delta_bps=65
    )
    await watcher.check_eth_balance(role="operator", address="0xabc", balance_eth=Decimal("0.02"))
    await watcher.on_dispute_opened(epoch_id=100, dispute_id=1, narrative_id=2, challenger="0xdef")
    assert len(sent) == 3
    assert "65 bps" in sent[0]
    assert "0.02 ETH" in sent[1]
    assert "Dispute #1" in sent[2]
