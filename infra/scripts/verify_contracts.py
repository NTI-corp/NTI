"""Verify every contract of a Foundry broadcast on Sourcify and Blockscout and insist on an exact match.

Usage (from the repo root, after the contracts are deployed):
    python infra/scripts/verify_contracts.py --chain 4663 \
        --broadcast contracts/broadcast/DeployMainnet.s.sol/4663/run-latest.json \
        [--blockscout https://robinhoodchain.blockscout.com] [--no-blockscout]

For each CREATE in the broadcast it
  1. finds the compiled artifact and rebuilds the constructor arguments from the creation transaction,
  2. submits the source to Sourcify and polls until Sourcify reports `exact_match` for both the creation and the
     runtime bytecode (a partial match counts as a failure: it means the build is not reproducible),
  3. tries Blockscout through its API; Blockscout instances behind a bot challenge refuse scripts, in which case the
     script writes a Standard JSON input per contract to contracts/verify/<chain>/ for the explorer's
     "Standard JSON input" upload form, and says so.

Exact matches need the build used for the deploy: same compiler, settings, sources and the metadata hash in the
bytecode (contracts/foundry.toml has `bytecode_hash = "ipfs"`). Run it from the same commit that deployed.
Exit code 0 only when every contract is an exact match on Sourcify.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

import httpx

REPO = Path(__file__).resolve().parents[2]
CONTRACTS = REPO / "contracts"
SOURCIFY = "https://sourcify.dev/server"
FORGE = "forge"


def artifact_for(name: str) -> tuple[Path, str]:
    """Return (artifact json path, 'path/File.sol:Name') for a contract name, preferring src/ over lib/."""
    matches = sorted((CONTRACTS / "out").glob(f"*/{name}.json"))
    if not matches:
        raise FileNotFoundError(f"no artifact for {name}: run `forge build --root contracts`")
    best = None
    for m in matches:
        meta = json.loads(m.read_text(encoding="utf-8"))
        src = meta.get("metadata", {}).get("settings", {}).get("compilationTarget", {})
        for path, contract in src.items():
            if contract == name and (best is None or path.startswith("src/")):
                best = (m, f"{path}:{name}")
    if best is None:
        raise FileNotFoundError(f"artifact for {name} has no compilation target")
    return best


def constructor_args(artifact: Path, creation_input: str) -> str:
    bytecode = json.loads(artifact.read_text(encoding="utf-8"))["bytecode"]["object"]
    initcode = creation_input.removeprefix("0x")
    base = bytecode.removeprefix("0x")
    # Library placeholders and metadata can differ in length only if the build changed; fail loudly then.
    if not initcode.startswith(base[:200]):
        raise ValueError("the creation transaction does not start with the compiled bytecode: different build")
    return initcode[len(base):]


def run(cmd: list[str]) -> tuple[int, str]:
    proc = subprocess.run(cmd, capture_output=True, text=True, cwd=REPO, check=False)
    return proc.returncode, (proc.stdout + proc.stderr).strip()


def forge_verify(address: str, ident: str, chain: int, args_hex: str, verifier: str, url: str | None) -> tuple[int, str]:
    cmd = [
        FORGE, "verify-contract", address, ident,
        "--root", str(CONTRACTS), "--chain", str(chain), "--verifier", verifier,
        "--compiler-version", "0.8.26", "--num-of-optimizations", "200", "--watch",
    ]
    if url:
        cmd += ["--verifier-url", url]
    if args_hex:
        cmd += ["--constructor-args", args_hex]
    return run(cmd)


def sourcify_status(chain: int, address: str) -> tuple[str, str]:
    resp = httpx.get(f"{SOURCIFY}/v2/contract/{chain}/{address}", timeout=60)
    if resp.status_code != 200:
        return "not_verified", "not_verified"
    body = resp.json()
    return str(body.get("creationMatch")), str(body.get("runtimeMatch"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chain", type=int, required=True)
    parser.add_argument("--broadcast", type=Path, required=True)
    parser.add_argument("--blockscout", default="", help="explorer base URL, e.g. https://robinhoodchain.blockscout.com")
    parser.add_argument("--no-blockscout", action="store_true")
    parser.add_argument("--retries", type=int, default=3)
    args = parser.parse_args()

    data = json.loads(args.broadcast.read_text(encoding="utf-8"))
    creates = [t for t in data["transactions"] if t.get("transactionType") == "CREATE" and t.get("contractAddress")]
    print(f"{len(creates)} contracts to verify on chain {args.chain}")

    out_dir = CONTRACTS / "verify" / str(args.chain)
    out_dir.mkdir(parents=True, exist_ok=True)
    rows: list[tuple[str, str, str, str]] = []
    failed = 0
    blockscout_blocked = False

    for t in creates:
        name, address = t["contractName"], t["contractAddress"]
        artifact, ident = artifact_for(name)
        args_hex = constructor_args(artifact, t["transaction"]["input"])

        status = ("not_verified", "not_verified")
        for attempt in range(args.retries):
            code, log = forge_verify(address, ident, args.chain, args_hex, "sourcify", None)
            time.sleep(4)
            status = sourcify_status(args.chain, address)
            if status == ("exact_match", "exact_match"):
                break
            if attempt == args.retries - 1:
                print(f"--- {name} {address}: {log[-400:]}")
        exact = status == ("exact_match", "exact_match")
        failed += 0 if exact else 1

        scout = "skipped"
        if not args.no_blockscout and args.blockscout:
            code, log = forge_verify(address, ident, args.chain, args_hex, "blockscout", args.blockscout.rstrip("/") + "/api/")
            if code == 0 and "verified" in log.lower():
                scout = "verified"
            else:
                scout = "blocked-or-failed"
                blockscout_blocked = True
        std = out_dir / f"{name}.standard-json.json"
        if not std.exists():
            code, log = run([FORGE, "verify-contract", address, ident, "--root", str(CONTRACTS), "--chain", str(args.chain),
                             "--show-standard-json-input"])
            if code == 0 and log.startswith("{"):
                std.write_text(log, encoding="utf-8")
        rows.append((name, address, f"{status[0]}/{status[1]}", scout))

    print()
    print(f"{'contract':28} {'address':44} {'sourcify (creation/runtime)':30} blockscout")
    for name, address, sourcify, scout in rows:
        print(f"{name:28} {address:44} {sourcify:30} {scout}")
    if blockscout_blocked:
        print(
            f"\nBlockscout refused the API (likely a bot challenge). Upload the Standard JSON files in {out_dir} through the "
            "explorer's Verify & Publish > Standard JSON input form (compiler 0.8.26, EVM cancun, optimizer 200 runs), "
            "or rely on its Sourcify import if the explorer has it enabled."
        )
    print(f"\n{'ALL EXACT MATCH on Sourcify' if not failed else str(failed) + ' contract(s) are not an exact match on Sourcify'}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
