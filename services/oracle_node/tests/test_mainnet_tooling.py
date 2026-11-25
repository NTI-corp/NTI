"""Mainnet tooling that ships as scripts: SDK wiring from the manifest and the cutover helpers."""

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

    marker = "export const PROTOCOL_ADDRESSES"
    protocol_out, protocol_in = out[out.index(marker) :], source[source.index(marker) :]
    assert "[ROBINHOOD_MAINNET_ID]: {\n    registry:" in protocol_out
    assert "ntiToken: null," in protocol_out.split("[ROBINHOOD_TESTNET_ID]")[0]  # unset stays null
    assert '"0x0000000000000000000000000000000000000001"' in protocol_out
    # nothing before the protocol table changes, in particular the external-address table
    assert out[: out.index(marker)] == source[: source.index(marker)]
    # the testnet block is byte for byte what it was
    testnet_out = protocol_out.split("[ROBINHOOD_TESTNET_ID]")[1]
    assert testnet_out == protocol_in.split("[ROBINHOOD_TESTNET_ID]")[1]


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


def test_cutover_clears_chain_tables_and_keeps_the_reusable_ones() -> None:
    cutover = load("cutover_to_mainnet")
    tables = ["epochs", "kols", "posts", "classifications", "chain_events"]
    tables += ["narrative_epoch", "tokens"]
    tables += ["fetch_cycle_runs", "kol_contribution", "markets", "nti_schema_migrations"]
    assert cutover.tables_to_clear(tables) == sorted(
        ["epochs", "chain_events", "narrative_epoch", "tokens", "kol_contribution", "markets"]
    )


def test_cutover_replaces_only_the_wanted_env_keys() -> None:
    cutover = load("cutover_to_mainnet")
    lines = ["CHAIN_ID=46630", "SUPABASE_URL=https://x.supabase.co", "OPERATOR_PRIVATE_KEY=old"]
    before = "\n".join(lines)
    mainnet = {
        "CHAIN_ID": "4663",
        "OPERATOR_PRIVATE_KEY": "new",
        "RPC_URL_MAINNET": "https://rpc",
        "SUPABASE_URL": "ignored",
    }
    after = cutover.parse_env(cutover.apply_env_updates(before, mainnet))
    assert after["CHAIN_ID"] == "4663"
    assert after["OPERATOR_PRIVATE_KEY"] == "new"
    assert after["RPC_URL_MAINNET"] == "https://rpc"
    assert after["SUPABASE_URL"] == "https://x.supabase.co"  # not in the allowlist: untouched


def test_mainnet_env_example_lists_every_variable_the_preflight_requires() -> None:
    example = (REPO / "infra" / "mainnet.env.example").read_text(encoding="utf-8")
    lines = [ln for ln in example.splitlines() if "=" in ln and not ln.startswith("#")]
    keys = {ln.split("=")[0] for ln in lines}
    preflight = load("mainnet_preflight")
    required = set(preflight.ROLE_ENVS) | set(preflight.KEY_FOR_ROLE.values())
    required |= {"CHAIN_ID", "RPC_URL_MAINNET", "INITIAL_CONFIG_HASH"}
    required |= {"NTI_TOKEN_ADDRESS", "INDEXER_START_BLOCK"}
    assert required <= keys, sorted(required - keys)
    assert json.dumps(sorted(keys))  # parses
