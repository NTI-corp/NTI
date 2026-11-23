"""Delta-chained 4-hour canonical dataset builder, gzip codec, reconstructor, and uploaders."""

from __future__ import annotations

import gzip
import json
from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Any, Protocol

import httpx
from nti_core.canonical import canonical_jsonl_bytes, keccak256_bytes, keccak256_hex
from nti_engine.models import (
    EngagementSnapshot,
    EngineKol,
    EnginePost,
    EpochDataset,
    PrevEpochState,
)

ZERO_HASH = "0x" + "00" * 32


class DatasetChainError(ValueError):
    """Raised when delta-chain hashes or linkage fail integrity checks."""


@dataclass(frozen=True, slots=True)
class DeltaHeader:
    epoch_id: int
    boundary_unix: int
    series_id: int
    config_hash: str
    prev_dataset_hash: str
    prev_arweave_tx: str
    a_max: Decimal | None = None
    observation_cutoff_unix: int | None = None
    provenance: dict[str, Any] | None = None
    previous_state: PrevEpochState | None = None


@dataclass(frozen=True, slots=True)
class DeltaArtifact:
    epoch_id: int
    header: DeltaHeader
    raw_jsonl: bytes
    gzipped: bytes
    delta_hash: str
    chain_hash: str
    prev_dataset_hash: str
    prev_arweave_tx: str


def _hex_to_bytes32(hex_hash: str) -> bytes:
    cleaned = hex_hash[2:] if hex_hash.startswith("0x") else hex_hash
    raw = bytes.fromhex(cleaned)
    if len(raw) != 32:
        raise DatasetChainError(f"Expected 32-byte hash, got {len(raw)} bytes")
    return raw


def compute_chain_hash(prev_dataset_hash: str, delta_hash: str) -> str:
    """Rolling chain hash: keccak256(prev_dataset_hash || delta_hash)."""
    return keccak256_hex(_hex_to_bytes32(prev_dataset_hash) + _hex_to_bytes32(delta_hash))


def build_delta_dataset(
    *,
    epoch_id: int,
    boundary_unix: int,
    series_id: int,
    config_hash: str,
    kols: Sequence[EngineKol],
    posts: Sequence[EnginePost],
    prev_dataset_hash: str = ZERO_HASH,
    prev_arweave_tx: str = "",
    a_max: Decimal | None = None,
    observation_cutoff_unix: int | None = None,
    provenance: dict[str, Any] | None = None,
    previous_state: PrevEpochState | None = None,
) -> DeltaArtifact:
    """Build a canonical, sorted, gzip-compressed 4-hour delta dataset with rolling chain hash."""
    rows: list[dict[str, Any]] = [
        {
            "type": "header",
            "epoch_id": epoch_id,
            "boundary_unix": boundary_unix,
            "series_id": series_id,
            "config_hash": config_hash,
            "prev_dataset_hash": prev_dataset_hash,
            "prev_arweave_tx": prev_arweave_tx,
            "a_max": None if a_max is None else format(a_max, "f"),
        }
    ]
    if observation_cutoff_unix is not None:
        rows[0]["observation_cutoff_unix"] = observation_cutoff_unix
    if provenance is not None:
        rows[0]["provenance"] = provenance
    if previous_state is not None:
        rows[0]["previous_state"] = {
            "series_id": previous_state.series_id,
            "prev_i_bps": previous_state.prev_i_bps,
            "lag_i_bps": previous_state.lag_i_bps,
            "has_incomplete_gap": previous_state.has_incomplete_gap,
        }

    for kol in sorted(kols, key=lambda k: k.user_id):
        rows.append(
            {
                "type": "kol",
                "user_id": kol.user_id,
                "followers": kol.followers,
                "h_k": kol.h_k,
                "r_k": format(kol.r_k, "f"),
            }
        )

    for post in sorted(posts, key=lambda p: p.tweet_id):
        sorted_engs = sorted(post.engagements, key=lambda e: e.fetched_at_unix)
        rows.append(
            {
                "type": "post",
                "tweet_id": post.tweet_id,
                "user_id": post.user_id,
                "created_at_unix": post.created_at_unix,
                "engagements": [
                    {
                        "likes": e.likes,
                        "reposts": e.reposts,
                        "quotes": e.quotes,
                        "replies": e.replies,
                        "fetched_at_unix": e.fetched_at_unix,
                    }
                    for e in sorted_engs
                ],
                "q": {str(nid): format(val, "f") for nid, val in sorted(post.q.items())},
            }
        )

    raw_jsonl = canonical_jsonl_bytes(rows)
    gzipped = gzip.compress(raw_jsonl, mtime=0)
    delta_hash = keccak256_hex(raw_jsonl)
    chain_hash = compute_chain_hash(prev_dataset_hash, delta_hash)
    header = DeltaHeader(
        epoch_id=epoch_id,
        boundary_unix=boundary_unix,
        series_id=series_id,
        config_hash=config_hash,
        prev_dataset_hash=prev_dataset_hash,
        prev_arweave_tx=prev_arweave_tx,
        a_max=a_max,
        observation_cutoff_unix=observation_cutoff_unix,
        provenance=provenance,
        previous_state=previous_state,
    )
    return DeltaArtifact(
        epoch_id=epoch_id,
        header=header,
        raw_jsonl=raw_jsonl,
        gzipped=gzipped,
        delta_hash=delta_hash,
        chain_hash=chain_hash,
        prev_dataset_hash=prev_dataset_hash,
        prev_arweave_tx=prev_arweave_tx,
    )


def parse_delta_blob(
    blob: bytes | DeltaArtifact,
) -> tuple[DeltaHeader, list[EngineKol], list[EnginePost], str, str]:
    """Decode raw or gzipped delta JSONL into (header, kols, posts, delta_hash, chain_hash)."""
    if isinstance(blob, DeltaArtifact):
        raw_jsonl = blob.raw_jsonl
    elif blob[:2] == b"\x1f\x8b":
        raw_jsonl = gzip.decompress(blob)
    else:
        raw_jsonl = blob

    lines = [ln for ln in raw_jsonl.decode("utf-8").splitlines() if ln.strip()]
    if not lines:
        raise DatasetChainError("Empty delta JSONL")

    header_row = json.loads(lines[0])
    if header_row.get("type") != "header":
        raise DatasetChainError("First row of delta JSONL must be a header")

    a_max_raw = header_row.get("a_max")
    state_row = header_row.get("previous_state")
    previous_state = None
    if state_row is not None:
        previous_state = PrevEpochState(
            series_id=int(state_row["series_id"]),
            prev_i_bps={int(k): int(v) for k, v in state_row["prev_i_bps"].items()}
            if state_row.get("prev_i_bps") else None,
            lag_i_bps={int(k): int(v) for k, v in state_row["lag_i_bps"].items()}
            if state_row.get("lag_i_bps") else None,
            has_incomplete_gap=bool(state_row.get("has_incomplete_gap")),
        )
    header = DeltaHeader(
        epoch_id=int(header_row["epoch_id"]),
        boundary_unix=int(header_row["boundary_unix"]),
        series_id=int(header_row["series_id"]),
        config_hash=str(header_row["config_hash"]),
        prev_dataset_hash=str(header_row["prev_dataset_hash"]),
        prev_arweave_tx=str(header_row.get("prev_arweave_tx", "")),
        a_max=None if a_max_raw is None else Decimal(str(a_max_raw)),
        observation_cutoff_unix=header_row.get("observation_cutoff_unix"),
        provenance=header_row.get("provenance"),
        previous_state=previous_state,
    )

    kols: list[EngineKol] = []
    posts: list[EnginePost] = []
    for line in lines[1:]:
        row = json.loads(line)
        rtype = row.get("type")
        if rtype == "kol":
            kols.append(
                EngineKol(
                    user_id=int(row["user_id"]),
                    followers=int(row["followers"]),
                    h_k=int(row["h_k"]),
                    r_k=Decimal(str(row["r_k"])),
                )
            )
        elif rtype == "post":
            engs = tuple(
                EngagementSnapshot(
                    likes=int(e["likes"]),
                    reposts=int(e["reposts"]),
                    quotes=int(e["quotes"]),
                    replies=int(e["replies"]),
                    fetched_at_unix=int(e["fetched_at_unix"]),
                )
                for e in row.get("engagements", [])
            )
            q_map = {int(k): Decimal(str(v)) for k, v in row.get("q", {}).items()}
            posts.append(
                EnginePost(
                    tweet_id=int(row["tweet_id"]),
                    user_id=int(row["user_id"]),
                    created_at_unix=int(row["created_at_unix"]),
                    engagements=engs,
                    q=q_map,
                )
            )

    delta_hash = keccak256_hex(raw_jsonl)
    chain_hash = compute_chain_hash(header.prev_dataset_hash, delta_hash)
    return header, kols, posts, delta_hash, chain_hash


def reconstruct_window(
    deltas: Sequence[bytes | DeltaArtifact],
    *,
    target_epoch_id: int,
    boundary_unix: int,
    series_id: int,
    lookback_hours: int = 168,
    max_deltas: int = 42,
) -> EpochDataset:
    """Reconstruct the full 168h EpochDataset from up to 42 chained 4-hour delta epochs."""
    parsed = [parse_delta_blob(d) for d in deltas]
    parsed.sort(key=lambda item: item[0].epoch_id)
    if len(parsed) > max_deltas:
        parsed = parsed[-max_deltas:]

    # Verify rolling hash chain continuity across consecutive cached deltas
    for idx in range(1, len(parsed)):
        prev_chain_hash = parsed[idx - 1][4]
        cur_prev_hash = parsed[idx][0].prev_dataset_hash
        if cur_prev_hash != prev_chain_hash:
            raise DatasetChainError(
                f"Broken delta chain at epoch {parsed[idx][0].epoch_id}: "
                f"expected prev_dataset_hash={prev_chain_hash}, got {cur_prev_hash}"
            )

    lookback_sec = lookback_hours * 3600
    kol_map: dict[int, EngineKol] = {}
    post_engs: dict[int, dict[int, EngagementSnapshot]] = {}
    post_meta: dict[int, tuple[int, int, dict[int, Decimal]]] = {}
    latest_a_max: Decimal | None = None

    for header, kols, posts, _, _ in parsed:
        if header.series_id != series_id:
            continue
        if header.a_max is not None:
            latest_a_max = header.a_max
        for k in kols:
            kol_map[k.user_id] = k
        for p in posts:
            if p.created_at_unix > boundary_unix:
                continue
            if boundary_unix - p.created_at_unix > lookback_sec:
                continue
            eng_by_ts = post_engs.setdefault(p.tweet_id, {})
            for e in p.engagements:
                eng_by_ts[e.fetched_at_unix] = e
            if p.tweet_id not in post_meta or p.q:
                post_meta[p.tweet_id] = (p.user_id, p.created_at_unix, dict(p.q))

    merged_posts = tuple(
        EnginePost(
            tweet_id=tid,
            user_id=post_meta[tid][0],
            created_at_unix=post_meta[tid][1],
            engagements=tuple(post_engs[tid][ts] for ts in sorted(post_engs[tid].keys())),
            q=post_meta[tid][2],
        )
        for tid in sorted(post_meta.keys())
    )
    merged_kols = tuple(kol_map[uid] for uid in sorted(kol_map.keys()))

    return EpochDataset(
        epoch_id=target_epoch_id,
        boundary_unix=boundary_unix,
        series_id=series_id,
        posts=merged_posts,
        kols=merged_kols,
        a_max=latest_a_max,
        observation_cutoff_unix=parsed[-1][0].observation_cutoff_unix if parsed else None,
    )


class DatasetUploader(Protocol):
    async def upload(self, epoch_id: int, chain_hash: str, data: bytes) -> str: ...


class ArweaveTurboUploader:
    """Uploads gzipped delta datasets to Arweave via ArDrive Turbo HTTP endpoint."""

    def __init__(
        self,
        turbo_token: str,
        endpoint: str = "https://upload.ardrive.io/v1/tx",
        client: httpx.AsyncClient | None = None,
        timeout: float = 60.0,
    ) -> None:
        self._turbo_token = turbo_token
        self._endpoint = endpoint
        self._client = client
        self._timeout = timeout

    async def upload(self, epoch_id: int, chain_hash: str, data: bytes) -> str:
        headers = {
            "Authorization": f"Bearer {self._turbo_token}",
            "Content-Type": "application/gzip",
            "X-NTI-Epoch-Id": str(epoch_id),
            "X-NTI-Dataset-Hash": chain_hash,
        }
        if self._client is not None:
            resp = await self._client.post(self._endpoint, content=data, headers=headers)
        else:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(self._endpoint, content=data, headers=headers)
        resp.raise_for_status()
        body = resp.json()
        return str(body.get("id") or body.get("tx_id") or "")


class IpfsUploader:
    """Uploads gzipped delta datasets to an IPFS HTTP API node (/api/v0/add)."""

    def __init__(
        self,
        api_url: str = "http://127.0.0.1:5001",
        client: httpx.AsyncClient | None = None,
        timeout: float = 60.0,
    ) -> None:
        self._api_url = api_url.rstrip("/")
        self._client = client
        self._timeout = timeout

    async def upload(self, epoch_id: int, chain_hash: str, data: bytes) -> str:
        files = {"file": (f"epoch_{epoch_id}.jsonl.gz", data, "application/gzip")}
        url = f"{self._api_url}/api/v0/add"
        if self._client is not None:
            resp = await self._client.post(url, files=files)
        else:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(url, files=files)
        resp.raise_for_status()
        return str(resp.json()["Hash"])


class LocalFileUploader:
    """Deterministic local filesystem uploader for offline testing and local cache."""

    def __init__(self, base_dir: str | Path) -> None:
        self._base_dir = Path(base_dir)
        self._base_dir.mkdir(parents=True, exist_ok=True)

    def upload_sync(self, epoch_id: int, chain_hash: str, data: bytes) -> str:
        short_hash = chain_hash[2:18] if chain_hash.startswith("0x") else chain_hash[:16]
        tx_id = f"local_{epoch_id}_{short_hash}"
        (self._base_dir / f"{tx_id}.jsonl.gz").write_bytes(data)
        return tx_id

    def download_sync(self, tx_id: str) -> bytes:
        return (self._base_dir / f"{tx_id}.jsonl.gz").read_bytes()

    async def upload(self, epoch_id: int, chain_hash: str, data: bytes) -> str:
        return self.upload_sync(epoch_id, chain_hash, data)


class SupabaseStorageMirror:
    """Off-box, publicly readable copy of every delta dataset in a Supabase Storage bucket.

    The VPS disk is the primary store; this mirror keeps the dataset chain recoverable if the disk
    is lost, and the public bucket lets anyone download a dataset and recompute an epoch.
    Datasets hold only ids, engagement counts and classifier scores (never post text).
    Objects are keyed by the same tx id the epoch record carries.
    """

    def __init__(
        self,
        base_url: str,
        service_key: str,
        bucket: str = "nti-datasets",
        client: httpx.AsyncClient | None = None,
        timeout: float = 60.0,
    ) -> None:
        self._base = base_url.rstrip("/") + "/storage/v1"
        self._bucket = bucket
        self._headers = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}
        self._client = client
        self._timeout = timeout
        self._bucket_ready = False

    async def _send(
        self, method: str, url: str, extra_headers: dict[str, str] | None = None, **kwargs: Any
    ) -> httpx.Response:
        headers = {**self._headers, **(extra_headers or {})}
        if self._client is not None:
            return await self._client.request(method, url, headers=headers, **kwargs)
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            return await client.request(method, url, headers=headers, **kwargs)

    async def _ensure_bucket(self) -> None:
        if self._bucket_ready:
            return
        resp = await self._send(
            "POST",
            f"{self._base}/bucket",
            json={"id": self._bucket, "name": self._bucket, "public": True},
        )
        if resp.status_code >= 400:
            if "already exists" not in resp.text.lower():
                resp.raise_for_status()
            # A bucket created earlier may still be private: make it public.
            update = await self._send(
                "PUT", f"{self._base}/bucket/{self._bucket}", json={"public": True}
            )
            update.raise_for_status()
        self._bucket_ready = True

    def public_url(self, tx_id: str) -> str:
        return f"{self._base}/object/public/{self._bucket}/{tx_id}.jsonl.gz"

    async def put(self, tx_id: str, data: bytes) -> None:
        await self._ensure_bucket()
        resp = await self._send(
            "POST",
            f"{self._base}/object/{self._bucket}/{tx_id}.jsonl.gz",
            extra_headers={"x-upsert": "true", "Content-Type": "application/gzip"},
            content=data,
        )
        resp.raise_for_status()

    async def get(self, tx_id: str) -> bytes | None:
        resp = await self._send("GET", f"{self._base}/object/{self._bucket}/{tx_id}.jsonl.gz")
        if resp.status_code in (400, 404):
            return None
        resp.raise_for_status()
        return resp.content


class MirroredUploader:
    """Primary uploader plus a best-effort mirror; a mirror failure never blocks an epoch."""

    def __init__(
        self, primary: DatasetUploader, mirror: SupabaseStorageMirror | None,
        *, required: bool = False,
    ) -> None:
        self._primary = primary
        self._mirror = mirror
        self._required = required
        self.mirror_errors: list[str] = []

    async def upload(self, epoch_id: int, chain_hash: str, data: bytes) -> str:
        tx_id = await self._primary.upload(epoch_id, chain_hash, data)
        if self._mirror is not None:
            try:
                await self._mirror.put(tx_id, data)
            except Exception as exc:  # noqa: BLE001 - mirroring is best effort
                self.mirror_errors.append(f"{tx_id}: {str(exc)[:160]}")
                if self._required:
                    raise
        elif self._required:
            raise DatasetChainError("Live publication requires a public archive mirror")
        return tx_id


def tx_id_to_bytes32(tx_id: str) -> str:
    """Encode an Arweave/IPFS/local tx string deterministically into bytes32 hex for Solidity."""
    return keccak256_hex(tx_id.encode("utf-8")) if tx_id else ZERO_HASH


def verify_delta_chain_hash(blob: bytes | DeltaArtifact, expected_chain_hash: str) -> bool:
    _, _, _, _, chain_hash = parse_delta_blob(blob)
    return keccak256_bytes(chain_hash.encode("ascii")) == keccak256_bytes(
        expected_chain_hash.encode("ascii")
    )
