"""Read-only mainnet (4663) preflight. Sends no transactions and needs no private keys.

Usage (from repo root):
    uv run --directory services python ../infra/scripts/mainnet_preflight.py --env-file ../.env.mainnet

Exit code 0 only when every blocking check passes. Warnings never block.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

import httpx
from eth_utils import is_address, to_checksum_address
from nti_core.config import load_config

MAINNET_CHAIN_ID = 4663
REPO_ROOT = Path(__file__).resolve().parents[2]

EXTERNALS = {
    "WETH": "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
    "Uniswap V3 factory": "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA",
    "Uniswap V3 SwapRouter02": "0xCaf681a66D020601342297493863E78C959E5cb2",
    "Universal Router": "0x8876789976dEcBfCbBbe364623C63652db8C0904",
    "Permit2": "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    "V4 StateView": "0xF3334192D15450CdD385c8B70e03f9A6bD9E673b",
    "Pons V2 meme hook": "0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044",
}
ROLE_ENVS = [
    "DEPLOYER_ADDRESS",
    "OPERATOR_ADDRESS",
    "KEEPER_ADDRESS",
    "ATTESTER_ADDRESS",
    "PAUSER_ADDRESS",
    "VALIDATOR_1_ADDRESS",
    "VALIDATOR_2_ADDRESS",
    "VALIDATOR_3_ADDRESS",
]
MIN_DEPLOYER_ETH = 0.01
MIN_OPERATIONAL_ETH = 0.01


class Report:
    def __init__(self) -> None:
        self.failures = 0
        self.warnings = 0

    def ok(self, msg: str) -> None:
        print(f"  PASS  {msg}")

    def fail(self, msg: str) -> None:
        self.failures += 1
        print(f"  FAIL  {msg}")

    def warn(self, msg: str) -> None:
        self.warnings += 1
        print(f"  WARN  {msg}")


def load_env_file(path: Path) -> None:
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.strip())
        if m:
            os.environ.setdefault(m.group(1), m.group(2).strip().strip("\"'"))


def rpc(url: str, method: str, params: list) -> object:
    resp = httpx.post(
        url, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params}, timeout=30
    )
    resp.raise_for_status()
    body = resp.json()
    if body.get("error"):
        raise RuntimeError(f"{method}: {body['error']}")
    return body["result"]


def eth_call(url: str, to: str, data: str) -> str:
    return str(rpc(url, "eth_call", [{"to": to, "data": data}, "latest"]))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, help="mainnet env file (kept out of git)")
    args = parser.parse_args()
    if args.env_file:
        load_env_file(args.env_file)

    r = Report()
    rpc_url = os.environ.get("RPC_URL_MAINNET", "")
    print("1. Network")
    if not rpc_url:
        r.fail("RPC_URL_MAINNET is not set")
        return 1
    chain_id = int(str(rpc(rpc_url, "eth_chainId", [])), 16)
    (r.ok if chain_id == MAINNET_CHAIN_ID else r.fail)(f"chainId {chain_id} (expected 4663)")
    if chain_id != MAINNET_CHAIN_ID:
        return 1
    if os.environ.get("CHAIN_ID") not in (None, "", "4663"):
        r.fail(f"CHAIN_ID={os.environ['CHAIN_ID']} in env, services would target the wrong chain")

    print("2. External dependencies have bytecode")
    for label, addr in EXTERNALS.items():
        code = str(rpc(rpc_url, "eth_getCode", [addr, "latest"]))
        (r.ok if code not in ("0x", "0x0") else r.fail)(f"{label} {addr}")

    print("3. Role addresses")
    addrs: dict[str, str] = {}
    for name in ROLE_ENVS:
        raw = os.environ.get(name, "")
        if not is_address(raw):
            r.fail(f"{name} missing or invalid")
            continue
        addrs[name] = to_checksum_address(raw)
    if len(addrs) == len(ROLE_ENVS):
        signers = [addrs[n] for n in ROLE_ENVS if n != "PAUSER_ADDRESS"]
        (r.ok if len(set(signers)) == len(signers) else r.fail)(
            "deployer/operator/keeper/attester/validators are pairwise distinct"
        )
        if addrs["PAUSER_ADDRESS"] == addrs["DEPLOYER_ADDRESS"]:
            r.warn("PAUSER_ADDRESS equals the deployer; use a multisig (Safe) for production")
        pauser_code = str(rpc(rpc_url, "eth_getCode", [addrs["PAUSER_ADDRESS"], "latest"]))
        if pauser_code in ("0x", "0x0"):
            r.warn("PAUSER_ADDRESS is an EOA, not a contract/multisig")
    for name, addr in addrs.items():
        bal = int(str(rpc(rpc_url, "eth_getBalance", [addr, "latest"])), 16) / 10**18
        floor = MIN_DEPLOYER_ETH if name == "DEPLOYER_ADDRESS" else MIN_OPERATIONAL_ETH
        if name == "PAUSER_ADDRESS":
            continue
        (r.ok if bal >= floor else r.fail)(f"{name} balance {bal:.5f} ETH (min {floor})")

    print("4. Config hash")
    cfg = load_config(REPO_ROOT / "config" / "nti.v1.json")
    expected = cfg.config_hash()
    provided = os.environ.get("INITIAL_CONFIG_HASH", "")
    print(f"        canonical hash of config/nti.v1.json: {expected}")
    if provided.lower() == expected.lower():
        r.ok("INITIAL_CONFIG_HASH matches the canonical config hash")
    else:
        r.fail("INITIAL_CONFIG_HASH missing or different from the canonical hash above")

    print("5. $NTI token (optional before launch)")
    token = os.environ.get("NTI_TOKEN_ADDRESS", "")
    if not token:
        r.warn("NTI_TOKEN_ADDRESS not set: deploy with nti=0 and call setNti(CA) after launch")
    elif not is_address(token):
        r.fail("NTI_TOKEN_ADDRESS invalid")
    else:
        code = str(rpc(rpc_url, "eth_getCode", [token, "latest"]))
        if code in ("0x", "0x0"):
            r.fail("NTI_TOKEN_ADDRESS has no bytecode")
        else:
            decimals = int(eth_call(rpc_url, token, "0x313ce567"), 16)
            supply = int(eth_call(rpc_url, token, "0x18160ddd"), 16)
            (r.ok if decimals == 18 else r.fail)(f"decimals {decimals} (expected 18)")
            (r.ok if supply == 10**9 * 10**18 else r.warn)(
                f"totalSupply {supply / 10**18:,.0f} (plan expects 1,000,000,000)"
            )
            r.warn("transfer tax / creator tax cannot be read here: run the small-transfer test")

    print(f"\n{r.failures} blocking failure(s), {r.warnings} warning(s)")
    return 1 if r.failures else 0


if __name__ == "__main__":
    sys.exit(main())
