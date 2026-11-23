"""Recover and verify the canonical archive chain; never silently restart a lost chain."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import httpx

from nti_oracle.dataset import (
    ZERO_HASH,
    DatasetChainError,
    DeltaHeader,
    SupabaseStorageMirror,
    parse_delta_blob,
    tx_id_to_bytes32,
)


def normalize_hash(value: str | None) -> str:
    return str(value or "").replace("\\x", "0x")


def recover_local_locator(epoch_id: int, dataset_hash: str, reference: str) -> str | None:
    digest = normalize_hash(dataset_hash)
    if not re.fullmatch(r"0x[0-9a-fA-F]{64}", digest):
        return None
    locator = f"local_{epoch_id}_{digest[2:18].lower()}"
    if (
        reference == locator
        or tx_id_to_bytes32(locator).lower() == normalize_hash(reference).lower()
    ):
        return locator
    return None


async def load_archive_chain(
    row: dict[str, Any],
    cache_dir: Path,
    mirror: SupabaseStorageMirror,
    *,
    max_deltas: int = 42,
) -> tuple[list[bytes], DeltaHeader, str, str]:
    expected_hash = normalize_hash(row["dataset_hash"])
    locator = recover_local_locator(
        int(row["epoch_id"]),
        expected_hash,
        str(row.get("arweave_tx") or ""),
    ) or str(row.get("arweave_tx") or "")
    first_locator = locator
    first_hash = expected_hash
    blobs: list[bytes] = []
    newest: DeltaHeader | None = None
    seen: set[str] = set()
    cache_dir.mkdir(parents=True, exist_ok=True)
    for _ in range(max_deltas):
        if not locator or locator in seen:
            raise DatasetChainError("Missing or cyclic dataset archive pointer")
        seen.add(locator)
        if re.fullmatch(r"local_\d+_[0-9a-f]{16}", locator):
            path = cache_dir / f"{locator}.jsonl.gz"
            blob = path.read_bytes() if path.exists() else await mirror.get(locator)
            if blob is None:
                raise DatasetChainError(f"Canonical archive unavailable: {locator}")
            if not path.exists():
                path.write_bytes(blob)
        elif re.fullmatch(r"[A-Za-z0-9_-]{43}", locator):
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.get(f"https://arweave.net/{locator}")
                response.raise_for_status()
                blob = response.content
        else:
            raise DatasetChainError(
                "Dataset locator is neither a verified local ID nor an Arweave ID"
            )
        header, _, _, _, actual_hash = parse_delta_blob(blob)
        if actual_hash.lower() != expected_hash.lower():
            raise DatasetChainError(f"Archive hash mismatch at epoch {header.epoch_id}")
        newest = newest or header
        blobs.append(blob)
        if header.prev_dataset_hash == ZERO_HASH:
            break
        locator = header.prev_arweave_tx
        expected_hash = header.prev_dataset_hash
    if newest is None:
        raise DatasetChainError("Empty canonical archive")
    return list(reversed(blobs)), newest, first_locator, first_hash
