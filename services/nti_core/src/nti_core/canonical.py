"""Deterministic canonical JSON/JSONL encoding and Ethereum-compatible keccak256."""

from __future__ import annotations

import json
from collections.abc import Iterable
from decimal import Decimal
from typing import Any

from eth_hash.auto import keccak


def _default(obj: Any) -> Any:
    if isinstance(obj, Decimal):
        return format(obj, "f")
    raise TypeError(f"Object of type {type(obj).__name__} is not canonically serializable")


def canonical_json_bytes(obj: Any) -> bytes:
    """Serialize an object with sorted keys and no whitespace (UTF-8)."""
    return json.dumps(
        obj,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        default=_default,
    ).encode("utf-8")


def canonical_jsonl_bytes(rows: Iterable[Any]) -> bytes:
    """Serialize an ordered sequence of rows to canonical UTF-8 JSONL (LF-terminated)."""
    encoded = [canonical_json_bytes(row) for row in rows]
    if not encoded:
        return b""
    return b"\n".join(encoded) + b"\n"


def keccak256_bytes(data: bytes) -> bytes:
    return bytes(keccak(data))


def keccak256_hex(data: bytes) -> str:
    return "0x" + keccak256_bytes(data).hex()
