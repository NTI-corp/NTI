"""Supabase Storage mirror and the best-effort mirrored uploader."""

from __future__ import annotations

import asyncio
from pathlib import Path

import httpx
from nti_oracle.dataset import LocalFileUploader, MirroredUploader, SupabaseStorageMirror


def make_mirror(handler: httpx.MockTransport) -> SupabaseStorageMirror:
    client = httpx.AsyncClient(transport=handler)
    return SupabaseStorageMirror("https://x.supabase.co", "svc", client=client)


def test_put_creates_bucket_once_and_upserts_object() -> None:
    seen: list[tuple[str, str, dict[str, str]]] = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append((req.method, req.url.path, dict(req.headers)))
        return httpx.Response(200, json={})

    mirror = make_mirror(httpx.MockTransport(handler))
    asyncio.run(mirror.put("local_7_ab", b"data"))
    asyncio.run(mirror.put("local_8_cd", b"data2"))
    paths = [(m, p) for m, p, _ in seen]
    assert paths.count(("POST", "/storage/v1/bucket")) == 1
    assert ("POST", "/storage/v1/object/nti-datasets/local_7_ab.jsonl.gz") in paths
    upload_headers = next(h for m, p, h in seen if p.endswith("local_7_ab.jsonl.gz"))
    assert upload_headers["x-upsert"] == "true" and upload_headers["authorization"] == "Bearer svc"


def test_existing_bucket_is_not_an_error_and_get_handles_missing() -> None:
    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.path.endswith("/bucket"):
            return httpx.Response(400, json={"message": "The resource already exists"})
        if req.method == "GET":
            return httpx.Response(404, json={"message": "not found"})
        return httpx.Response(200, json={})

    mirror = make_mirror(httpx.MockTransport(handler))
    asyncio.run(mirror.put("t", b"x"))
    assert asyncio.run(mirror.get("t")) is None


def test_get_returns_bytes() -> None:
    mirror = make_mirror(httpx.MockTransport(lambda r: httpx.Response(200, content=b"payload")))
    assert asyncio.run(mirror.get("t")) == b"payload"


def test_mirror_failure_never_blocks_the_epoch(tmp_path: Path) -> None:
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom")

    uploader = MirroredUploader(
        LocalFileUploader(tmp_path), make_mirror(httpx.MockTransport(handler))
    )
    tx_id = asyncio.run(uploader.upload(5, "0x" + "ab" * 32, b"gz"))
    assert tx_id.startswith("local_5_")
    assert (tmp_path / f"{tx_id}.jsonl.gz").read_bytes() == b"gz"
    assert len(uploader.mirror_errors) == 1
