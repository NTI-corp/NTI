"""Mainnet tooling that ships as scripts: SDK wiring from the manifest and the migration planner."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from types import ModuleType

import pytest

REPO = Path(__file__).resolve().parents[3]
SCRIPTS = REPO / "infra" / "scripts"


def load(name: str) -> ModuleType:
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def fake_manifest() -> dict[str, object]:
    manifest: dict[str, object] = {}
    for i, field in enumerate(load("mainnet_wire").FIELDS):
        manifest[field] = "0x" + f"{i + 1:040x}"
    manifest["ntiToken"] = "0x" + "00" * 20
    manifest["chainId"] = 4663
    manifest["deployedAtBlock"] = 123
    return manifest


def test_wire_replaces_the_empty_mainnet_entry_and_keeps_testnet_intact() -> None:
    wire = load("mainnet_wire")
    source = (REPO / "packages/sdk/src/addresses.ts").read_text(encoding="utf-8")
    out = wire.rewrite(source, fake_manifest())

    assert "[ROBINHOOD_MAINNET_ID]: {\n    registry:" in out
    assert "ntiToken: null," in out.split("[ROBINHOOD_TESTNET_ID]")[0]  # unset token stays null
    assert '"0x0000000000000000000000000000000000000001"' in out
    # the testnet block is byte for byte what it was
    assert out.split("[ROBINHOOD_TESTNET_ID]")[1] == source.split("[ROBINHOOD_TESTNET_ID]")[1]


def test_wire_is_idempotent_so_check_mode_can_run_in_ci() -> None:
    wire = load("mainnet_wire")
    source = (REPO / "packages/sdk/src/addresses.ts").read_text(encoding="utf-8")
    once = wire.rewrite(source, fake_manifest())
    assert wire.rewrite(once, fake_manifest()) == once


def test_wire_rejects_a_manifest_with_a_malformed_address() -> None:
    wire = load("mainnet_wire")
    bad = fake_manifest()
    bad["staking"] = "0x1234"
    source = (REPO / "packages/sdk/src/addresses.ts").read_text(encoding="utf-8")
    with pytest.raises(ValueError):
        wire.rewrite(source, bad)


def test_migration_plan_orders_pending_and_flags_changed_files(tmp_path: Path) -> None:
    mig = load("apply_migrations")
    (tmp_path / "20260101_a.sql").write_text("select 1;")
    (tmp_path / "20260102_b.sql").write_text("select 2;")
    (tmp_path / "20260103_c.sql").write_text("select 3;")
    files = mig.migration_files(tmp_path)
    assert [f.name for f in files] == ["20260101_a.sql", "20260102_b.sql", "20260103_c.sql"]

    applied = {"20260101_a.sql": mig.digest(files[0]), "20260102_b.sql": "stale-hash"}
    pending, changed = mig.plan(files, applied)
    assert [p.name for p in pending] == ["20260103_c.sql"]
    assert changed == ["20260102_b.sql"]


def test_repository_migrations_have_unique_sortable_names() -> None:
    mig = load("apply_migrations")
    names = [p.name for p in mig.migration_files()]
    assert names == sorted(names) and len(names) == len(set(names)) and names


def test_mainnet_env_example_lists_every_variable_the_preflight_requires() -> None:
    example = (REPO / "infra" / "mainnet.env.example").read_text(encoding="utf-8")
    lines = [ln for ln in example.splitlines() if "=" in ln and not ln.startswith("#")]
    keys = {ln.split("=")[0] for ln in lines}
    preflight = load("mainnet_preflight")
    required = set(preflight.ROLE_ENVS) | set(preflight.KEY_FOR_ROLE.values())
    required |= {"RPC_URL_MAINNET", "SUPABASE_URL", "SUPABASE_SERVICE_KEY"}
    required |= {"VALIDATOR_OMISSION_CHECK"}
    required |= {"SIWE_SESSION_SECRET", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "MIMO_API_KEY"}
    assert required <= keys, sorted(required - keys)
    assert json.dumps(sorted(keys))  # parses
