"""Read-only audit of the deployed NTI suite on mainnet. Sends no transactions and needs no private keys.

Usage (from the repo root):
    uv run --directory services python ../infra/scripts/mainnet_verify.py --env-file ../.env.mainnet

Reads contracts/deployments/4663.json and the role addresses in the env file, then checks wiring, roles, the
config hash, the short launch windows and who administers what. Run it after the deploy and again after the
real token is swapped in. Exit code 0 only when nothing failed.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

import httpx
from eth_abi import decode, encode
from eth_utils import keccak, to_checksum_address
from nti_core.config import load_config

REPO_ROOT = Path(__file__).resolve().parents[2]
CONFIG_FILE = REPO_ROOT / "config" / "nti.v1.json"
ZERO = "0x" + "00" * 20
ADMIN = b"\x00" * 32

ADMIN_CONTRACTS = (
    "staking",
    "configRegistry",
    "oracleCommit",
    "dispute",
    "insuranceFund",
    "grants",
    "feeRouter",
    "narrativeMarket",
    "basketFactory",
    "kolRegistry",
)
# launch windows set by DeployMainnet; a different value is reported, not failed (the admin may tune them)
LAUNCH_WINDOWS = {"disputeWindow": 5, "commitDelay": 3600, "unstakeCooldown": 10}


def selector(sig: str) -> bytes:
    return keccak(text=sig)[:4]


def role(name: str) -> bytes:
    return keccak(text=name)


class Audit:
    def __init__(self, rpc_url: str) -> None:
        self.url = rpc_url
        self.failures = 0
        self.warnings = 0

    def rpc(self, method: str, params: list) -> object:
        resp = httpx.post(
            self.url, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params}, timeout=30
        )
        resp.raise_for_status()
        body = resp.json()
        if body.get("error"):
            raise RuntimeError(f"{method}: {body['error']}")
        return body["result"]

    def call(self, to: str, sig: str, arg_types: list[str], args: list, out_types: list[str]) -> tuple:
        data = selector(sig) + (encode(arg_types, args) if arg_types else b"")
        raw = str(self.rpc("eth_call", [{"to": to, "data": "0x" + data.hex()}, "latest"]))
        return decode(out_types, bytes.fromhex(raw[2:]))

    def has_role(self, contract: str, role_id: bytes, who: str) -> bool:
        return bool(self.call(contract, "hasRole(bytes32,address)", ["bytes32", "address"], [role_id, who], ["bool"])[0])

    def ok(self, msg: str) -> None:
        print(f"  PASS  {msg}")

    def fail(self, msg: str) -> None:
        self.failures += 1
        print(f"  FAIL  {msg}")

    def warn(self, msg: str) -> None:
        self.warnings += 1
        print(f"  WARN  {msg}")

    def check(self, cond: bool, good: str, bad: str) -> bool:
        (self.ok if cond else self.fail)(good if cond else bad)
        return cond


def load_env_file(path: Path) -> None:
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.strip())
        if m:
            os.environ.setdefault(m.group(1), m.group(2).strip().strip("\"'"))


def env_address(name: str) -> str | None:
    raw = os.environ.get(name, "")
    return to_checksum_address(raw) if re.fullmatch(r"0x[0-9a-fA-F]{40}", raw) else None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path)
    parser.add_argument("--manifest", type=Path, default=REPO_ROOT / "contracts" / "deployments" / "4663.json")
    parser.add_argument("--chain-id", type=int, default=4663, help="only for exercising the script on testnet")
    args = parser.parse_args()
    if args.env_file:
        load_env_file(args.env_file)

    rpc_url = os.environ.get("RPC_URL_MAINNET", "").split(",")[0].strip()
    if not rpc_url or not args.manifest.exists():
        print("RPC_URL_MAINNET and a deployment manifest are required", file=sys.stderr)
        return 2
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    a = Audit(rpc_url)
    chain = int(str(a.rpc("eth_chainId", [])), 16)
    if chain != args.chain_id:
        print(f"chainId {chain}, expected {args.chain_id}", file=sys.stderr)
        return 2

    addr = {
        k: to_checksum_address(v)
        for k, v in manifest.items()
        if isinstance(v, str) and v.startswith("0x") and len(v) == 42 and int(v, 16) != 0
    }
    deployer = env_address("DEPLOYER_ADDRESS") or addr.get("deployer")
    operator, attester, keeper = (env_address(n) for n in ("OPERATOR_ADDRESS", "ATTESTER_ADDRESS", "KEEPER_ADDRESS"))
    validators = [env_address(f"VALIDATOR_{i}_ADDRESS") for i in (1, 2, 3)]
    pauser = env_address("PAUSER_ADDRESS")

    print("1. Contracts exist")
    for name in ("registry", "ntiToken", *ADMIN_CONTRACTS, "buybackAdapterV3", "buybackAdapterV4"):
        target = addr.get(name)
        code = str(a.rpc("eth_getCode", [target, "latest"])) if target else "0x"
        a.check(code not in ("0x", "0x0"), f"{name} {target}", f"{name} has no bytecode at {target}")

    print("2. Registry and token")
    reg = addr["registry"]
    (staking_in_registry,) = a.call(reg, "staking()", [], [], ["address"])
    a.check(to_checksum_address(staking_in_registry) == addr["staking"], "registry.staking is the deployed Staking", "registry.staking differs from the manifest")
    (nti,) = a.call(reg, "nti()", [], [], ["address"])
    (frozen,) = a.call(reg, "frozen()", [], [], ["bool"])
    (owner,) = a.call(reg, "owner()", [], [], ["address"])
    nti = to_checksum_address(nti)
    a.check(nti != to_checksum_address(ZERO), f"token set: {nti}", "the registry has no token")
    try:
        (symbol,) = a.call(nti, "symbol()", [], [], ["string"])
        (decimals,) = a.call(nti, "decimals()", [], [], ["uint8"])
        a.check(decimals == 18, f"token {symbol}, 18 decimals", f"token decimals {decimals}")
        print(f"        {'prelaunch token in use: swap it when the real $NTI launches' if symbol == 'pNTI' else 'real token in use'}")
    except (RuntimeError, ValueError):
        a.fail("the token does not answer symbol()/decimals()")
    print(f"        registry frozen: {bool(frozen)}")
    if deployer:
        (a.ok if to_checksum_address(owner) == deployer else a.warn)(f"registry owner {owner}")

    print("3. Oracle roles and windows")
    oc = addr["oracleCommit"]
    if operator:
        a.check(a.has_role(oc, role("OPERATOR_ROLE"), operator), "operator holds OPERATOR_ROLE", "operator is missing OPERATOR_ROLE")
    for i, v in enumerate(validators, 1):
        if v:
            a.check(a.has_role(oc, role("VALIDATOR_ROLE"), v), f"validator {i} holds VALIDATOR_ROLE", f"validator {i} missing VALIDATOR_ROLE")
    if pauser:
        a.check(a.has_role(oc, role("PAUSER_ROLE"), pauser), "the pauser holds PAUSER_ROLE on OracleCommit", "the pauser is missing PAUSER_ROLE on OracleCommit")
    a.check(a.has_role(oc, role("DISPUTE_ROLE"), addr["dispute"]), "Dispute holds DISPUTE_ROLE", "Dispute is missing DISPUTE_ROLE")
    for who, label in ((addr["oracleCommit"], "OracleCommit"), (addr["dispute"], "Dispute")):
        a.check(a.has_role(addr["staking"], role("SLASHER_ROLE"), who), f"{label} holds SLASHER_ROLE on Staking", f"{label} is missing SLASHER_ROLE")
    (window,) = a.call(oc, "DISPUTE_WINDOW()", [], [], ["uint64"])
    (delay,) = a.call(oc, "COMMIT_DELAY()", [], [], ["uint64"])
    (cooldown,) = a.call(addr["staking"], "COOLDOWN_DURATION()", [], [], ["uint64"])
    for label, got, want in (
        ("dispute window", window, LAUNCH_WINDOWS["disputeWindow"]),
        ("commit delay", delay, LAUNCH_WINDOWS["commitDelay"]),
        ("unstake cooldown", cooldown, LAUNCH_WINDOWS["unstakeCooldown"]),
    ):
        (a.ok if got == want else a.warn)(f"{label} {got}s" + ("" if got == want else f" (launch value {want}s; changed by the admin?)"))
    (locked,) = a.call(oc, "timingsLocked()", [], [], ["bool"])
    (a.ok if not locked else a.warn)("OracleCommit timings are adjustable" if not locked else "OracleCommit timings are locked and cannot be changed")

    print("4. Config and other roles")
    cfg_hash = load_config(CONFIG_FILE).config_hash()
    (active_hash, narratives) = a.call(addr["configRegistry"], "active(uint32)", ["uint32"], [1], ["bytes32", "uint8"])
    a.check("0x" + active_hash.hex() == cfg_hash.lower(), "ConfigRegistry holds the canonical config hash", f"ConfigRegistry hash 0x{active_hash.hex()} != {cfg_hash}")
    a.check(narratives == 10, "10 narratives configured", f"{narratives} narratives configured")
    if keeper:
        a.check(a.has_role(addr["feeRouter"], role("KEEPER_ROLE"), keeper), "keeper holds KEEPER_ROLE on FeeRouter", "keeper missing KEEPER_ROLE on FeeRouter")
        a.check(a.has_role(addr["grants"], role("KEEPER_ROLE"), keeper), "keeper holds KEEPER_ROLE on Grants", "keeper missing KEEPER_ROLE on Grants")
    if attester:
        a.check(a.has_role(addr["kolRegistry"], role("ATTESTER_ROLE"), attester), "attester holds ATTESTER_ROLE", "attester missing ATTESTER_ROLE")
    if operator and deployer and operator != deployer:
        a.check(not a.has_role(oc, role("OPERATOR_ROLE"), deployer), "the deployer is not an operator", "the deployer holds OPERATOR_ROLE")

    print("5. Admin")
    if deployer:
        for name in ADMIN_CONTRACTS:
            a.check(a.has_role(addr[name], ADMIN, deployer), f"{name}: the admin wallet administers it", f"{name}: the admin wallet is not admin")

    print(f"\n{a.failures} failure(s), {a.warnings} warning(s)")
    return 1 if a.failures else 0


if __name__ == "__main__":
    sys.exit(main())
