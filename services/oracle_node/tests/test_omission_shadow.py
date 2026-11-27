"""Shadow omission mode: measure and record the overlap, but never block a commit."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from eth_account import Account
from nti_core.config import load_config
from nti_core.types import KolProfile
from nti_engine.models import PrevEpochState
from nti_fetcher.accounts import AccountPoolExhaustedError
from nti_fetcher.adapters import InMemoryMockSource
from nti_fetcher.protocol import PostSource, RawPost
from nti_oracle.dataset import ZERO_HASH, LocalFileUploader
from nti_oracle.node import ConsensusError, OperatorNode, ValidatorNode
from test_oracle import CONFIG_PATH, _sample_kols, _sample_posts

CONTRACT = "0x2222222222222222222222222222222222222222"
BOUNDARY = 1_760_000_000


async def commit(
    tmp_path: Path,
    *,
    enforce: bool,
    log: Path | None,
    source: PostSource | None = None,
) -> None:
    cfg = load_config(CONFIG_PATH)
    boundary_dt = datetime.fromtimestamp(BOUNDARY, tz=UTC)
    kols = _sample_kols(20)
    profiles = [
        KolProfile(user_id=k.user_id, handle=f"kol_{k.user_id}", followers=k.followers)
        for k in kols
    ]
    posts = _sample_posts(BOUNDARY, epoch_offset=1)
    # The validator's own pool sees every post; the operator hands over only half of them.
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
        for p in posts
    }
    validator_source = source or InMemoryMockSource(name="val_pool", timelines=timelines)
    accounts = [Account.create() for _ in range(3)]
    validators = [
        ValidatorNode(
            private_key=a.key.hex(),
            cfg=cfg,
            chain_id=46630,
            verifying_contract=CONTRACT,
            validator_source=validator_source if enforce or idx == 0 else None,
            omission_enforce=enforce,
            omission_fraction=1.0,
            omission_log=log,
        )
        for idx, a in enumerate(accounts)
    ]
    operator = OperatorNode(
        cfg=cfg,
        uploader=LocalFileUploader(tmp_path / "store"),
        chain_id=46630,
        verifying_contract=CONTRACT,
        registered_validators={a.address for a in accounts},
    )
    await operator.build_and_collect_commit(
        epoch_id=100,
        boundary_unix=BOUNDARY,
        series_id=1,
        kols=kols,
        kol_profiles=profiles,
        delta_posts=posts[: len(posts) // 2],
        prev_deltas=[],
        prev_state=PrevEpochState(series_id=1, prev_i_bps=None, lag_i_bps=None),
        prev_dataset_hash=ZERO_HASH,
        prev_arweave_tx="",
        prev_commit_hash=ZERO_HASH,
        validators=validators,
    )


@pytest.mark.asyncio
async def test_shadow_mode_records_the_gap_but_the_epoch_still_commits(tmp_path: Path) -> None:
    log = tmp_path / "omission.jsonl"
    await commit(tmp_path, enforce=False, log=log)
    rows = [json.loads(line) for line in log.read_text().splitlines()]
    assert rows and all(r["epoch_id"] == 100 and r["enforced"] is False for r in rows)
    assert all(r["passed"] is False and r["missing"] > 0 and r["overlap"] < 0.95 for r in rows)


@pytest.mark.asyncio
async def test_enforce_mode_blocks_the_same_commit(tmp_path: Path) -> None:
    with pytest.raises(ConsensusError):
        await commit(tmp_path, enforce=True, log=tmp_path / "omission.jsonl")


@pytest.mark.asyncio
async def test_shadow_mode_does_not_block_when_validator_source_fails(tmp_path: Path) -> None:
    class UnavailableSource:
        name = "validator_pool"

        async def user_timeline(self, user_id: int, since_id: int | None, limit: int = 20):
            raise AccountPoolExhaustedError("All accounts exhausted in pool validator_0")

    log = tmp_path / "omission.jsonl"
    await commit(tmp_path, enforce=False, log=log, source=UnavailableSource())
    rows = [json.loads(line) for line in log.read_text().splitlines()]
    assert len(rows) == 1
    assert rows[0]["epoch_id"] == 100
    assert rows[0]["status"] == "error"
    assert rows[0]["error_type"] == "AccountPoolExhaustedError"
    assert rows[0]["error"] == "All accounts exhausted in pool validator_0"
    assert rows[0]["enforced"] is False


@pytest.mark.asyncio
async def test_enforce_mode_still_fails_closed_when_validator_source_fails(tmp_path: Path) -> None:
    class UnavailableSource:
        name = "validator_pool"

        async def user_timeline(self, user_id: int, since_id: int | None, limit: int = 20):
            raise AccountPoolExhaustedError("All accounts exhausted in pool validator_0")

    with pytest.raises(AccountPoolExhaustedError):
        await commit(
            tmp_path,
            enforce=True,
            log=tmp_path / "omission.jsonl",
            source=UnavailableSource(),
        )
