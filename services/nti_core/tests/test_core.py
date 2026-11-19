from decimal import Decimal
from pathlib import Path

from nti_core import canonical_json_bytes, keccak256_hex, load_config


def test_load_v1_config_and_deterministic_hash() -> None:
    cfg_path = Path(__file__).resolve().parents[3] / "config" / "nti.v1.json"
    cfg = load_config(cfg_path)
    assert cfg.version == 1
    assert cfg.epoch_seconds == 14400
    assert cfg.alpha == Decimal("0.3")
    assert cfg.kol_cap == Decimal("0.10")
    assert cfg.kol_active_min_q == Decimal("0.05")
    assert len(cfg.narratives) == 10
    h1 = cfg.config_hash()
    h2 = cfg.config_hash()
    assert h1 == h2
    assert h1.startswith("0x") and len(h1) == 66


def test_canonical_json_key_order_independent() -> None:
    a = {"b": 1, "a": 2}
    b = {"a": 2, "b": 1}
    assert canonical_json_bytes(a) == canonical_json_bytes(b)
    assert keccak256_hex(canonical_json_bytes(a)) == keccak256_hex(canonical_json_bytes(b))
