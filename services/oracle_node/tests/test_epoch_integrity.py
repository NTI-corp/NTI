from decimal import Decimal
from pathlib import Path

import httpx
import pytest
from nti_core.config import load_config
from nti_core.types import KolProfile
from nti_engine.calc import run_epoch
from nti_engine.models import (
    EngagementSnapshot,
    EngineKol,
    EnginePost,
    EpochDataset,
    PrevEpochState,
)
from nti_fetcher.storage import SupabaseStorage


def test_observation_cutoff_preserves_true_metric_times_without_admitting_future_posts():
    cfg = load_config(Path(__file__).resolve().parents[3] / "config/nti.v1.json")
    boundary = 100 * cfg.epoch_seconds
    snapshot = EngagementSnapshot(100, 5, 2, 1, boundary + 300)
    past = EnginePost(10, 1, boundary - 100, (snapshot,), {1: Decimal("1")})
    future = EnginePost(11, 1, boundary + 1, (snapshot,), {2: Decimal("1")})
    data = EpochDataset(
        epoch_id=100,
        boundary_unix=boundary,
        series_id=2,
        posts=(past, future),
        kols=(EngineKol(1, 10000),),
        observation_cutoff_unix=boundary + 600,
    )
    result = run_epoch(data, PrevEpochState(1, None, None), cfg)
    assert not result.incomplete
    assert result.i_vector[0] == 10000
    assert result.i_vector[1] == 0
    assert past.engagements[0].fetched_at_unix == boundary + 300


def test_gap_and_series_state_are_derived_from_actual_epoch_history():
    from nti_oracle.inputs import previous_epoch_state

    epochs = [{"epoch_id": i, "series_id": 2, "status": "final"} for i in range(10, 17)]
    epochs[3]["status"] = "incomplete"
    values = [{"epoch_id": ep, "narrative_id": 1, "i_bps": 1000} for ep in (10, 16)]
    state = previous_epoch_state(17, 2, epochs, values, 6)
    assert state.has_incomplete_gap
    assert state.prev_i_bps == {1: 1000}
    assert state.lag_i_bps is None
    assert previous_epoch_state(17, 3, epochs, values, 6).series_id == 2


def test_changed_calculation_provenance_starts_a_new_series():
    from nti_oracle.inputs import calculation_provenance, next_series_id

    old = calculation_provenance("0xabc", "model-a", "v1", "engine-2")
    same = calculation_provenance("0xabc", "model-a", "v1", "engine-2")
    changed = calculation_provenance("0xabc", "model-b", "v1", "engine-2")
    assert next_series_id(4, old, same) == 4
    assert next_series_id(4, old, changed) == 5
    assert next_series_id(1, None, same) == 2


def test_public_archive_carries_observation_time_and_replay_state():
    from nti_oracle.dataset import build_delta_dataset, parse_delta_blob, reconstruct_window

    artifact = build_delta_dataset(
        epoch_id=100,
        boundary_unix=1440000,
        series_id=2,
        config_hash="0x" + "ab" * 32,
        kols=[],
        posts=[],
        observation_cutoff_unix=1440300,
        provenance={"engine_version": "engine-2", "model_version": "model-a"},
        previous_state=PrevEpochState(1, {1: 1000}, None, True),
    )
    header, *_ = parse_delta_blob(artifact.gzipped)
    assert header.observation_cutoff_unix == 1440300
    assert header.provenance["engine_version"] == "engine-2"
    assert header.previous_state.prev_i_bps == {1: 1000}
    data = reconstruct_window(
        [artifact],
        target_epoch_id=100,
        boundary_unix=1440000,
        series_id=2,
    )
    assert data.observation_cutoff_unix == 1440300


def test_rebaseline_does_not_mix_old_series_posts_into_the_new_series():
    from nti_oracle.dataset import build_delta_dataset, reconstruct_window

    old = build_delta_dataset(
        epoch_id=10,
        boundary_unix=144000,
        series_id=1,
        config_hash="0x" + "ab" * 32,
        kols=[EngineKol(1, 10000)],
        posts=[
            EnginePost(
                1,
                1,
                143000,
                (EngagementSnapshot(50, 0, 0, 0, 143500),),
                {1: Decimal(1)},
            )
        ],
    )
    new = build_delta_dataset(
        epoch_id=11,
        boundary_unix=158400,
        series_id=2,
        config_hash="0x" + "ab" * 32,
        kols=[],
        posts=[],
        prev_dataset_hash=old.chain_hash,
    )
    data = reconstruct_window([old, new], target_epoch_id=11, boundary_unix=158400, series_id=2)
    assert data.posts == ()


def test_recover_local_locator_checks_the_onchain_commitment():
    from nti_oracle.archive import recover_local_locator
    from nti_oracle.dataset import tx_id_to_bytes32

    digest = "0x" + "ab" * 32
    locator = "local_42_" + "ab" * 8
    assert recover_local_locator(42, digest, tx_id_to_bytes32(locator)) == locator
    assert recover_local_locator(42, digest, "0x" + "00" * 32) is None


@pytest.mark.asyncio
async def test_live_uploader_refuses_to_publish_an_unavailable_dataset(tmp_path):
    from nti_oracle.dataset import LocalFileUploader, MirroredUploader

    class UnavailableMirror:
        async def put(self, locator, blob):
            raise RuntimeError("mirror unavailable")

    uploader = MirroredUploader(LocalFileUploader(tmp_path), UnavailableMirror(), required=True)
    with pytest.raises(RuntimeError, match="mirror unavailable"):
        await uploader.upload(42, "0x" + "ab" * 32, b"data")


@pytest.mark.asyncio
async def test_live_input_reader_keeps_actual_observation_time_and_filters_model(monkeypatch):
    from datetime import UTC, datetime

    from nti_oracle.__main__ import _ensure_classified_posts

    cfg = load_config(Path(__file__).resolve().parents[3] / "config/nti.v1.json")
    boundary = 100 * cfg.epoch_seconds
    def iso(ts: int) -> str:
        return datetime.fromtimestamp(ts, UTC).isoformat()
    seen = {}

    def serve(request):
        table = request.url.path.split("/")[-1]
        seen[table] = dict(request.url.params)
        if table == "posts":
            return httpx.Response(
                200,
                json=[
                    {
                        "tweet_id": 10,
                        "user_id": 1,
                        "created_at": iso(boundary - 100),
                        "body": "AI agent launch",
                    }
                ],
            )
        if table == "post_engagement":
            return httpx.Response(
                200,
                json=[
                    {
                        "tweet_id": 10,
                        "likes": 20,
                        "reposts": 2,
                        "quotes": 1,
                        "replies": 0,
                        "fetched_at": iso(boundary + 300),
                    }
                ],
            )
        if table == "classifications":
            return httpx.Response(
                200,
                json=[
                    {
                        "tweet_id": 10,
                        "q": {"2": 0.9},
                        "model_version": "model-a",
                    }
                ],
            )
        if table == "fetch_cycles":
            return httpx.Response(200, json=[{"finished_at": iso(boundary + 400)}])
        raise AssertionError(f"Unexpected network call {table}")

    monkeypatch.setenv("MIMO_MODEL", "model-a")
    async with httpx.AsyncClient(transport=httpx.MockTransport(serve)) as client:
        posts, model = await _ensure_classified_posts(
            storage=SupabaseStorage("https://db.invalid", "test", client=client),
            cfg=cfg,
            kols=[KolProfile(1, "kol", 10000)],
            epoch_id=100,
            boundary_unix=boundary,
            observation_cutoff_unix=boundary + 600,
            source=None,
        )
    assert model == "model-a"
    assert len(posts) == 1
    assert posts[0].engagements[0].fetched_at_unix == boundary + 300
    assert "created_at.lt." in seen["posts"]["and"]
    assert "fetched_at.lte." in seen["post_engagement"]["and"]
    assert seen["classifications"]["model_version"] == "eq.model-a"
