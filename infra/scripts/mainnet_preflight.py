"""Read-only mainnet (4663) preflight. Sends no transactions.

Usage (from the repo root):
    uv run --directory services python ../infra/scripts/mainnet_preflight.py --env-file ../.env.mainnet [--stage deploy|services]

Stages
  deploy    before DeployMainnet: network, external dependencies, role wallets, Safe, config hash, token.
  services  before starting the data plane on the VPS: log-capable RPC, Supabase (fresh and migrated),
            X accounts including the validator pool, alerting and secrets. Run on the VPS checkout.
  (default) both.

Exit code 0 only when every blocking check passes. Warnings never block.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

import httpx
from eth_account import Account
from eth_utils import is_address, to_checksum_address
from nti_core.config import load_config

MAINNET_CHAIN_ID = 4663
REPO_ROOT = Path(__file__).resolve().parents[2]
CONFIG_FILE = REPO_ROOT / "config" / "nti.v1.json"

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
# role address env -> private key env that must derive to it (when the key is present in this env)
KEY_FOR_ROLE = {
    "DEPLOYER_ADDRESS": "DEPLOYER_PRIVATE_KEY",
    "OPERATOR_ADDRESS": "OPERATOR_PRIVATE_KEY",
    "KEEPER_ADDRESS": "KEEPER_PRIVATE_KEY",
    "ATTESTER_ADDRESS": "ATTESTER_PRIVATE_KEY",
    "VALIDATOR_1_ADDRESS": "VALIDATOR_PRIVATE_KEY_1",
    "VALIDATOR_2_ADDRESS": "VALIDATOR_PRIVATE_KEY_2",
    "VALIDATOR_3_ADDRESS": "VALIDATOR_PRIVATE_KEY_3",
}
MIN_DEPLOYER_ETH = 0.01
MIN_OPERATIONAL_ETH = 0.01
REQUIRED_TABLES = ("epochs", "kols", "posts", "fetch_cycle_runs", "classifications", "tokens")
LOG_PROBE_RANGES = (10, 100, 500, 2000)


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

    def check(self, cond: bool, good: str, bad: str) -> bool:
        (self.ok if cond else self.fail)(good if cond else bad)
        return cond


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


def has_code(url: str, addr: str) -> bool:
    return str(rpc(url, "eth_getCode", [addr, "latest"])) not in ("0x", "0x0")


# ---------------------------------------------------------------------------------------------- deploy


def stage_deploy(r: Report, rpc_url: str) -> None:
    print("2. External dependencies have bytecode")
    for label, addr in EXTERNALS.items():
        r.check(has_code(rpc_url, addr), f"{label} {addr}", f"{label} {addr} has no bytecode")

    print("3. Role wallets")
    addrs: dict[str, str] = {}
    for name in ROLE_ENVS:
        raw = os.environ.get(name, "")
        if not is_address(raw):
            r.fail(f"{name} missing or invalid")
            continue
        addrs[name] = to_checksum_address(raw)
    if len(addrs) == len(ROLE_ENVS):
        signers = [addrs[n] for n in ROLE_ENVS if n != "PAUSER_ADDRESS"]
        r.check(
            len(set(signers)) == len(signers),
            "deployer, operator, keeper, attester and validators are pairwise distinct",
            "two role wallets share an address; every hot wallet must be its own key",
        )
        pauser = addrs["PAUSER_ADDRESS"]
        if pauser in signers:
            r.fail("PAUSER_ADDRESS equals a hot wallet; it must be the Safe")
        for name, addr in addrs.items():
            if name == "PAUSER_ADDRESS":
                continue
            bal = int(str(rpc(rpc_url, "eth_getBalance", [addr, "latest"])), 16) / 10**18
            floor = MIN_DEPLOYER_ETH if name == "DEPLOYER_ADDRESS" else MIN_OPERATIONAL_ETH
            r.check(bal >= floor, f"{name} balance {bal:.5f} ETH", f"{name} balance {bal:.5f} ETH < {floor}")
        for role, key_env in KEY_FOR_ROLE.items():
            key = os.environ.get(key_env, "")
            if not key or role not in addrs:
                continue
            try:
                derived = Account.from_key(key).address
            except ValueError:
                r.fail(f"{key_env} is not a valid private key")
                continue
            r.check(
                derived == addrs[role],
                f"{key_env} derives to {role}",
                f"{key_env} derives to {derived}, not {addrs[role]}",
            )

    print("4. Safe (PAUSER_ADDRESS)")
    pauser_raw = os.environ.get("PAUSER_ADDRESS", "")
    if is_address(pauser_raw):
        if not has_code(rpc_url, pauser_raw):
            r.fail("PAUSER_ADDRESS is an EOA; deploy a Safe and use its address")
        else:
            try:
                threshold = int(eth_call(rpc_url, pauser_raw, "0xe75235b8"), 16)  # getThreshold()
                owners_raw = eth_call(rpc_url, pauser_raw, "0xa0e67e2b")  # getOwners()
                owners = int(owners_raw[2 + 64 + 64 : 2 + 64 + 64 + 64], 16)
                r.check(threshold >= 2, f"Safe threshold {threshold}/{owners}", f"Safe threshold {threshold} < 2")
                r.check(owners >= 3, f"Safe has {owners} owners", f"Safe has {owners} owners, need at least 3")
            except (RuntimeError, ValueError):
                r.fail("PAUSER_ADDRESS has code but does not answer getThreshold()/getOwners(): not a Safe")
    else:
        r.fail("PAUSER_ADDRESS missing or invalid")

    print("5. Config hash")
    cfg = load_config(CONFIG_FILE)
    expected = cfg.config_hash()
    print(f"        canonical hash of {CONFIG_FILE.name}: {expected}")
    r.check(
        os.environ.get("INITIAL_CONFIG_HASH", "").lower() == expected.lower(),
        "INITIAL_CONFIG_HASH matches the canonical config hash",
        "INITIAL_CONFIG_HASH missing or different from the canonical hash above",
    )
    genesis = os.environ.get("ORACLE_GENESIS_TIMESTAMP", "")
    r.check(
        genesis in ("0",),
        "ORACLE_GENESIS_TIMESTAMP=0 (epochs align with UTC multiples of 4h, like the services assume)",
        f"ORACLE_GENESIS_TIMESTAMP={genesis!r}; the services compute epoch = unix // 14400, keep it 0",
    )

    print("6. $NTI token (optional before launch)")
    token = os.environ.get("NTI_TOKEN_ADDRESS", "")
    if not token:
        r.warn("NTI_TOKEN_ADDRESS not set: deploy without it and run AttachTokenMainnet after launch")
    elif not is_address(token):
        r.fail("NTI_TOKEN_ADDRESS invalid")
    elif not has_code(rpc_url, token):
        r.fail("NTI_TOKEN_ADDRESS has no bytecode")
    else:
        decimals = int(eth_call(rpc_url, token, "0x313ce567"), 16)
        supply = int(eth_call(rpc_url, token, "0x18160ddd"), 16)
        r.check(decimals == 18, "decimals 18", f"decimals {decimals} (expected 18)")
        r.check(
            supply == 10**9 * 10**18,
            "totalSupply 1,000,000,000",
            f"totalSupply {supply / 10**18:,.0f} differs from 1,000,000,000: AttachTokenMainnet will refuse it",
        )
        r.warn("transfer or creator tax cannot be read here: do the small-transfer test after attaching")


# -------------------------------------------------------------------------------------------- services


def stage_services(r: Report, rpc_url: str) -> None:
    print("7. Log-capable RPC (indexer and discovery read historical logs)")
    head = int(str(rpc(rpc_url, "eth_blockNumber", [])), 16)
    best = 0
    for span in LOG_PROBE_RANGES:
        try:
            rpc(
                rpc_url,
                "eth_getLogs",
                [{"fromBlock": hex(max(0, head - span)), "toBlock": hex(head), "address": EXTERNALS["WETH"]}],
            )
            best = span
        except (RuntimeError, httpx.HTTPError):
            break
    wanted = int(os.environ.get("INDEXER_BATCH_BLOCKS", "500"))
    if best == 0:
        r.fail("eth_getLogs failed even for 10 blocks; use a provider that serves logs")
    elif best < wanted:
        r.fail(
            f"eth_getLogs works up to about {best} blocks but INDEXER_BATCH_BLOCKS={wanted}; "
            f"lower it or change provider (blocks are ~0.1s on 4663, so tiny ranges cover seconds)"
        )
    else:
        r.ok(f"eth_getLogs served {best} blocks (INDEXER_BATCH_BLOCKS={wanted})")
    indexer_rpc = os.environ.get("INDEXER_RPC_URL", "")
    r.check(bool(indexer_rpc), "INDEXER_RPC_URL set", "INDEXER_RPC_URL not set (indexer would use the default RPC)")

    print("8. Supabase (separate project, migrated, empty)")
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not url.startswith("https://") or not key:
        r.fail("SUPABASE_URL / SUPABASE_SERVICE_KEY missing")
    else:
        headers = {"apikey": key, "Authorization": f"Bearer {key}", "Prefer": "count=exact"}
        for table in REQUIRED_TABLES:
            resp = httpx.get(f"{url}/rest/v1/{table}?select=*&limit=1", headers=headers, timeout=30)
            if resp.status_code != 200:
                r.fail(f"table {table}: HTTP {resp.status_code} (run infra/scripts/apply_migrations.py)")
                continue
            total = int(resp.headers.get("content-range", "*/0").split("/")[-1] or 0)
            if table == "epochs":
                r.check(total == 0, "epochs is empty (fresh mainnet data plane)", f"epochs has {total} rows: this looks like the testnet database")
            else:
                r.ok(f"table {table} present")
        testnet_env = os.environ.get("TESTNET_SUPABASE_URL", "")
        if testnet_env and testnet_env.rstrip("/") == url:
            r.fail("SUPABASE_URL equals TESTNET_SUPABASE_URL: mainnet must not share the testnet project")

    print("9. X accounts and omission check")
    accounts_path = Path(os.environ.get("X_ACCOUNTS_FILE", "secrets/x_accounts.json"))
    if not accounts_path.is_absolute():
        accounts_path = REPO_ROOT / accounts_path
    if not accounts_path.exists():
        r.fail(f"{accounts_path} not found")
    else:
        data = json.loads(accounts_path.read_text(encoding="utf-8"))
        lanes = data.get("primary_lanes", {})
        lane_count = sum(len(lane.get("accounts", [])) for lane in lanes)
        pool = data.get("validator_pool", [])
        r.check(lane_count >= 6, f"{lane_count} primary lane accounts", f"{lane_count} primary lane accounts, need at least 6")
        r.check(len(pool) >= 3, f"{len(pool)} dedicated validator accounts", f"{len(pool)} validator accounts, need at least 3")
    r.check(
        os.environ.get("VALIDATOR_OMISSION_CHECK") == "1",
        "VALIDATOR_OMISSION_CHECK=1",
        "VALIDATOR_OMISSION_CHECK must be 1 on mainnet (the operator refuses to commit without it)",
    )

    print("10. Alerting, classifier and web secrets")
    r.check(
        bool(os.environ.get("TELEGRAM_BOT_TOKEN")) and bool(os.environ.get("TELEGRAM_CHAT_ID")),
        "Telegram alerts configured",
        "TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID missing: nobody would hear about an incident",
    )
    r.check(bool(os.environ.get("MIMO_API_KEY")), "MIMO_API_KEY set", "MIMO_API_KEY missing (classifier)")
    r.check(
        len(os.environ.get("SIWE_SESSION_SECRET", "")) >= 32,
        "SIWE_SESSION_SECRET is at least 32 characters",
        "SIWE_SESSION_SECRET missing or shorter than 32 characters",
    )
    r.check(os.environ.get("NEXT_PUBLIC_CHAIN_ID") == "4663", "NEXT_PUBLIC_CHAIN_ID=4663", "NEXT_PUBLIC_CHAIN_ID must be 4663")
    r.check(os.environ.get("CHAIN_ID") == "4663", "CHAIN_ID=4663", "CHAIN_ID must be 4663")
    for hot in ("OPERATOR_PRIVATE_KEY", "KEEPER_PRIVATE_KEY", "ATTESTER_PRIVATE_KEY"):
        r.check(bool(os.environ.get(hot)), f"{hot} present", f"{hot} missing on the services host")
    if os.environ.get("DEPLOYER_PRIVATE_KEY"):
        r.warn("DEPLOYER_PRIVATE_KEY is present in the services env; the deployer key belongs on your own machine only")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, help="mainnet env file (kept out of git)")
    parser.add_argument("--stage", choices=("deploy", "services", "all"), default="all")
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
    r.check(chain_id == MAINNET_CHAIN_ID, f"chainId {chain_id}", f"chainId {chain_id} (expected 4663)")
    if chain_id != MAINNET_CHAIN_ID:
        return 1
    if os.environ.get("CHAIN_ID") not in (None, "", "4663"):
        r.fail(f"CHAIN_ID={os.environ['CHAIN_ID']} in env, services would target the wrong chain")

    if args.stage in ("deploy", "all"):
        stage_deploy(r, rpc_url)
    if args.stage in ("services", "all"):
        stage_services(r, rpc_url)

    print(f"\n{r.failures} blocking failure(s), {r.warnings} warning(s)")
    return 1 if r.failures else 0


if __name__ == "__main__":
    sys.exit(main())
