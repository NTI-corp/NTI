"""Read-only audit of a deployed NTI suite on mainnet. Sends no transactions and needs no private keys.

Usage (from the repo root):
    uv run --directory services python ../infra/scripts/mainnet_verify.py --env-file ../.env.mainnet [--phase auto|deployed|attached|handed-over]

It reads contracts/deployments/4663.json and the role addresses in the env file, then checks wiring, roles,
frozen timings and, depending on the phase, who holds admin rights:

  deployed     the deployer is still admin everywhere (right after DeployMainnet)
  attached     as deployed, plus the $NTI token is set and the registry is frozen
  handed-over  the Timelock is admin everywhere, the deployer holds nothing, the registry owner is the Safe
  auto         detected from the chain

Exit code 0 only when nothing failed.
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
LOCKED = ("oracleCommit", "dispute", "staking", "narrativeMarket")


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
    parser.add_argument("--phase", choices=("auto", "deployed", "attached", "handed-over"), default="auto")
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

    addr = {k: to_checksum_address(v) for k, v in manifest.items() if isinstance(v, str) and v.startswith("0x") and len(v) == 42}
    deployer = env_address("DEPLOYER_ADDRESS") or addr.get("deployer")
    safe = env_address("SAFE_ADDRESS") or env_address("PAUSER_ADDRESS")
    operator = env_address("OPERATOR_ADDRESS")
    attester = env_address("ATTESTER_ADDRESS")
    keeper = env_address("KEEPER_ADDRESS")
    validators = [env_address(f"VALIDATOR_{i}_ADDRESS") for i in (1, 2, 3)]
    pauser = env_address("PAUSER_ADDRESS")

    print("1. Contracts exist")
    for name in ("registry", *ADMIN_CONTRACTS, "timelock", "governor", "buybackAdapterV3", "buybackAdapterV4"):
        target = addr.get(name)
        code = str(a.rpc("eth_getCode", [target, "latest"])) if target else "0x"
        a.check(code not in ("0x", "0x0"), f"{name} {target}", f"{name} has no bytecode at {target}")

    print("2. Wiring")
    reg = addr["registry"]
    (staking_in_registry,) = a.call(reg, "staking()", [], [], ["address"])
    a.check(to_checksum_address(staking_in_registry) == addr["staking"], "registry.staking is the deployed Staking", "registry.staking differs from the manifest")
    (nti,) = a.call(reg, "nti()", [], [], ["address"])
    (frozen,) = a.call(reg, "frozen()", [], [], ["bool"])
    (owner,) = a.call(reg, "owner()", [], [], ["address"])
    (pending,) = a.call(reg, "pendingOwner()", [], [], ["address"])
    owner, pending = to_checksum_address(owner), to_checksum_address(pending)

    print("3. Oracle roles and timings")
    oc = addr["oracleCommit"]
    if operator:
        a.check(a.has_role(oc, role("OPERATOR_ROLE"), operator), "operator holds OPERATOR_ROLE", "operator is missing OPERATOR_ROLE")
    for i, v in enumerate(validators, 1):
        if v:
            a.check(a.has_role(oc, role("VALIDATOR_ROLE"), v), f"validator {i} holds VALIDATOR_ROLE", f"validator {i} missing VALIDATOR_ROLE")
    if pauser:
        a.check(a.has_role(oc, role("PAUSER_ROLE"), pauser), "the Safe holds PAUSER_ROLE on OracleCommit", "Safe is missing PAUSER_ROLE on OracleCommit")
    a.check(a.has_role(oc, role("DISPUTE_ROLE"), addr["dispute"]), "Dispute holds DISPUTE_ROLE", "Dispute is missing DISPUTE_ROLE")
    for who, label in ((addr["oracleCommit"], "OracleCommit"), (addr["dispute"], "Dispute")):
        a.check(a.has_role(addr["staking"], role("SLASHER_ROLE"), who), f"{label} holds SLASHER_ROLE on Staking", f"{label} is missing SLASHER_ROLE")
    if deployer:
        a.check(not a.has_role(oc, role("OPERATOR_ROLE"), deployer), "the deployer is not an operator", "the deployer holds OPERATOR_ROLE")
    for name in LOCKED:
        (locked,) = a.call(addr[name], "timingsLocked()", [], [], ["bool"])
        a.check(bool(locked), f"{name} timings are locked", f"{name} timings are NOT locked")
    (window,) = a.call(oc, "DISPUTE_WINDOW()", [], [], ["uint64"])
    (delay,) = a.call(oc, "COMMIT_DELAY()", [], [], ["uint64"])
    (cooldown,) = a.call(addr["staking"], "COOLDOWN_DURATION()", [], [], ["uint64"])
    (resolution,) = a.call(addr["dispute"], "RESOLUTION_WINDOW()", [], [], ["uint64"])
    (settle,) = a.call(addr["narrativeMarket"], "SETTLE_TIMEOUT()", [], [], ["uint64"])
    a.check(window == 7200, "dispute window 2h", f"dispute window {window}s (expected 7200)")
    a.check(delay == 3600, "commit delay 1h", f"commit delay {delay}s (expected 3600)")
    a.check(cooldown == 7 * 86400, "unstake cooldown 7d", f"unstake cooldown {cooldown}s (expected 604800)")
    a.check(resolution == 6 * 3600, "dispute resolution window 6h", f"resolution window {resolution}s (expected 21600)")
    a.check(settle == 48 * 3600, "market settle timeout 48h", f"settle timeout {settle}s (expected 172800)")

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
    tl, gov = addr["timelock"], addr["governor"]
    a.check(a.has_role(tl, role("PROPOSER_ROLE"), gov), "Governor is a Timelock proposer", "Governor is not a proposer")
    a.check(a.has_role(tl, role("CANCELLER_ROLE"), gov), "Governor is a Timelock canceller", "Governor is not a canceller")
    (min_delay,) = a.call(tl, "getMinDelay()", [], [], ["uint256"])
    a.check(min_delay == 48 * 3600, "Timelock delay 48h", f"Timelock delay {min_delay}s")

    print("5. Admin rights")
    phase = args.phase
    if phase == "auto":
        timelock_admin = all(a.has_role(addr[n], ADMIN, tl) for n in ADMIN_CONTRACTS)
        phase = "handed-over" if timelock_admin else ("attached" if frozen else "deployed")
        print(f"        detected phase: {phase}")
    if phase == "handed-over":
        for name in ADMIN_CONTRACTS:
            a.check(a.has_role(addr[name], ADMIN, tl), f"{name}: Timelock is admin", f"{name}: Timelock is not admin")
            if deployer:
                a.check(not a.has_role(addr[name], ADMIN, deployer), f"{name}: deployer holds no admin right", f"{name}: deployer is STILL admin")
        if deployer:
            a.check(not a.has_role(tl, ADMIN, deployer), "Timelock: deployer holds no admin right", "Timelock: deployer is STILL admin")
        a.check(owner == safe or pending == safe, "registry ownership is with (or pending for) the Safe", f"registry owner {owner}, pending {pending}, Safe {safe}")
        if pending == safe and owner != safe:
            a.warn("the Safe has not called acceptOwnership() on the registry yet")
    else:
        if deployer:
            for name in ADMIN_CONTRACTS:
                a.check(a.has_role(addr[name], ADMIN, deployer), f"{name}: deployer is admin", f"{name}: deployer is not admin (phase {phase})")
            a.check(owner == deployer, "registry owner is the deployer", f"registry owner is {owner}")
        if phase == "attached":
            a.check(to_checksum_address(nti) != to_checksum_address(ZERO), f"$NTI attached: {nti}", "registry has no $NTI token yet")
            a.check(bool(frozen), "registry is frozen", "registry is not frozen")
        else:
            a.warn("$NTI is not attached yet (run AttachTokenMainnet.s.sol when the CA exists)")

    print(f"\n{a.failures} failure(s), {a.warnings} warning(s)")
    return 1 if a.failures else 0


if __name__ == "__main__":
    sys.exit(main())
