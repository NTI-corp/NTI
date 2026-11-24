"""Read-only end-to-end health check for the Robinhood Testnet (46630) deployment.

    uv run --directory services python ../infra/scripts/testnet_healthcheck.py [--env-file ../.env] [--web URL]

Checks wiring (registry, roles, buyback), oracle freshness, indexer lag, keeper backlog and, when ``--web`` is
given, the public API. Exit code 0 only when nothing failed. No transactions are sent.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path

import httpx
from eth_abi import decode, encode
from eth_utils import keccak

REPO = Path(__file__).resolve().parents[2]
EPOCH_SECONDS = 14_400
DEFAULT_RPC = "https://robinhood-sepolia-rpc.publicnode.com"


class Checker:
    def __init__(self) -> None:
        self.failed = 0

    def ok(self, msg: str) -> None:
        print(f"  PASS  {msg}")

    def bad(self, msg: str) -> None:
        self.failed += 1
        print(f"  FAIL  {msg}")

    def check(self, cond: bool, good: str, bad: str) -> None:
        (self.ok if cond else self.bad)(good if cond else bad)


def load_env(path: Path) -> None:
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.strip())
        if m:
            os.environ.setdefault(m.group(1), m.group(2).strip().strip("\"'"))


class Chain:
    def __init__(self, url: str) -> None:
        self.url = url

    def rpc(self, method: str, params: list) -> object:
        r = httpx.post(
            self.url, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params}, timeout=30
        )
        r.raise_for_status()
        body = r.json()
        if body.get("error"):
            raise RuntimeError(str(body["error"])[:160])
        return body["result"]

    def call(self, to: str, sig: str, types: list[str], args: list, out: list[str]) -> tuple:
        data = keccak(text=sig)[:4] + (encode(types, args) if types else b"")
        raw = str(self.rpc("eth_call", [{"to": to, "data": "0x" + data.hex()}, "latest"]))
        return decode(out, bytes.fromhex(raw[2:]))


def role(name: str) -> bytes:
    return keccak(text=name)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--env-file", type=Path, default=REPO / ".env")
    ap.add_argument("--web", help="base URL of the deployed web app, e.g. https://example.vercel.app")
    args = ap.parse_args()
    if args.env_file.exists():
        load_env(args.env_file)

    dep = json.loads((REPO / "contracts" / "deployments" / "46630.json").read_text())
    chain = Chain(os.environ.get("INDEXER_RPC_URL") or os.environ.get("RPC_URL_TESTNET") or DEFAULT_RPC)
    c = Checker()
    now = int(time.time())

    print("1. Chain and wiring")
    c.check(int(str(chain.rpc("eth_chainId", [])), 16) == 46630, "chainId 46630", "wrong chain")
    for name, addr in dep.items():
        if int(addr, 16) == 0:
            continue
        code = str(chain.rpc("eth_getCode", [addr, "latest"]))
        c.check(code not in ("0x", "0x0"), f"{name} has bytecode", f"{name} has NO bytecode at {addr}")
    (nti,) = chain.call(dep["registry"], "nti()", [], [], ["address"])
    c.check(nti.lower() == dep["ntiToken"].lower(), "registry.nti == test token", f"registry.nti={nti}")
    (ready,) = chain.call(dep["registry"], "buybackReady()", [], [], ["bool"])
    c.check(ready, "buyback adapter wired", "buybackReady() is false")
    oracle = dep["oracleCommit"]
    slasher = role("SLASHER_ROLE")
    for target in ("oracleCommit", "dispute"):
        (has,) = chain.call(
            dep["staking"], "hasRole(bytes32,address)", ["bytes32", "address"], [slasher, dep[target]], ["bool"]
        )
        c.check(has, f"{target} holds SLASHER_ROLE on Staking", f"{target} lacks SLASHER_ROLE")

    print("2. Oracle freshness")
    genesis = chain.call(oracle, "genesisTimestamp()", [], [], ["uint64"])[0]
    last = chain.call(oracle, "lastProcessedEpoch()", [], [], ["uint32"])[0]
    final = chain.call(oracle, "latestFinalEpoch()", [], [], ["uint32"])[0]
    current = (now - genesis) // EPOCH_SECONDS
    c.check(current - last <= 1, f"last committed epoch {last} (current {current})",
            f"oracle is {current - last} epochs behind (last {last}, current {current})")
    c.check(current - final <= 3, f"latest final epoch {final}", f"finalization lags: final {final}, current {current}")

    print("3. Keeper backlog")
    next_market = chain.call(dep["narrativeMarket"], "nextMarketId()", [], [], ["uint256"])[0]
    settle_timeout = chain.call(dep["narrativeMarket"], "SETTLE_TIMEOUT()", [], [], ["uint64"])[0]
    backlog = 0
    for mid in range(1, next_market):
        fields = chain.call(
            dep["narrativeMarket"], "markets(uint256)", ["uint256"], [mid],
            ["uint8", "uint8", "uint32", "uint32", "uint32", "uint256", "uint256", "uint256", "uint256",
             "uint256", "uint8", "bool"],
        )
        if fields[11]:
            continue
        epoch_status = chain.call(
            oracle, "epochStatus(uint32)", ["uint32"], [fields[3]], ["uint8"]
        )[0]
        settle_at = chain.call(
            oracle, "epochBoundary(uint32)", ["uint32"], [fields[3]], ["uint64"]
        )[0]
        if epoch_status in (3, 4) or now > settle_at + settle_timeout:
            backlog += 1
    c.check(
        backlog == 0,
        f"{next_market - 1} market(s), none waiting to settle",
        f"{backlog} settle-ready market(s) unsettled",
    )
    undistributed = chain.call(dep["feeRouter"], "undistributedBalance()", [], [], ["uint256"])[0]
    c.check(undistributed < 10**13, "fee router has no large undistributed balance", f"{undistributed} wei undistributed")

    print("4. Database and indexer")
    sb_url, sb_key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")
    if not (sb_url and sb_key):
        c.bad("SUPABASE_URL / SUPABASE_SERVICE_KEY not set")
    else:
        hdr = {"apikey": sb_key, "Authorization": f"Bearer {sb_key}"}

        def q(path: str) -> list[dict]:
            r = httpx.get(f"{sb_url}/rest/v1/{path}", headers=hdr, timeout=30)
            r.raise_for_status()
            return r.json()

        head = int(str(chain.rpc("eth_blockNumber", [])), 16)
        state = q("indexer_state?chain_id=eq.46630&select=last_block")
        lag = head - int(state[0]["last_block"]) if state else 10**9
        c.check(lag < 5_000, f"indexer lag {lag} blocks", f"indexer is {lag} blocks behind head")
        epochs = q("epochs?select=epoch_id,status&order=epoch_id.desc&limit=1")
        c.check(bool(epochs) and int(epochs[0]["epoch_id"]) >= last, f"database has epoch {epochs[0]['epoch_id']}" if epochs else "",
                "database epoch is behind the chain")
        runs = q(
            f"fetch_cycle_runs?select=epoch_id,status,finished_at,total_eligible,accounts_ok,"
            f"accounts_failed,omitted_user_ids&epoch_id=eq.{last}&order=finished_at.desc&limit=1"
        )
        fetch_ok = False
        if runs:
            run = runs[0]
            eligible = int(run["total_eligible"])
            successes = int(run["accounts_ok"])
            failed = int(run["accounts_failed"])
            omitted = run.get("omitted_user_ids") or []
            finished = int(
                datetime.fromisoformat(str(run["finished_at"]).replace("Z", "+00:00")).timestamp()
            )
            fetch_ok = (
                run.get("status") == "collecting"
                and not omitted
                and eligible == successes + failed
                and (successes / eligible if eligible else 1.0) >= 0.95
                and 0 <= now - finished <= EPOCH_SECONDS
            )
        c.check(
            fetch_ok,
            f"epoch {last} has a fresh complete fetch cycle",
            f"epoch {last} lacks fresh complete fetch evidence",
        )

    if args.web:
        print("5. Web API")
        for path in ("/api/health", "/api/indexes", "/api/markets", "/api/baskets", "/api/grants"):
            try:
                r = httpx.get(args.web.rstrip("/") + path, timeout=45, follow_redirects=True)
                c.check(r.status_code == 200, f"{path} 200", f"{path} returned {r.status_code}")
            except httpx.HTTPError as exc:
                c.bad(f"{path} unreachable: {exc}")

    print(f"\n{c.failed} failure(s)")
    return 1 if c.failed else 0


if __name__ == "__main__":
    sys.exit(main())
