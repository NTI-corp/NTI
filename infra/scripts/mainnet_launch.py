"""One command from funded wallets to a running mainnet. No manual step in between.

Usage (from the repo root, after the six wallets are funded and .env.mainnet is filled):
    python infra/scripts/mainnet_launch.py            # rehearsal: preflight and a deploy simulation, sends nothing
    python infra/scripts/mainnet_launch.py --go       # the real launch
    python infra/scripts/mainnet_launch.py --go --from baskets   # resume at a step after a failure

Steps, in order (each is idempotent, so a rerun skips what is already done):
  preflight  every blocking check on chain, wallets, config hash, token
  deploy     DeployMainnet broadcast (skipped when contracts/deployments/4663.json already points at live code)
  wire       SDK addresses + INDEXER_START_BLOCK in .env.mainnet from the manifest
  audit      mainnet_verify.py: proxies, roles, windows, config hash
  baskets    SetupBasketsMainnet: creates the RWA basket and whitelists every token that passes the contract checks
  sources    verify_contracts.py: Sourcify exact match, Blockscout where the explorer allows scripts
  publish    commit and push the manifest, SDK addresses and verification files (CI deploys the VPS)
  cutover    on the VPS: pull, switch the database and host .env to mainnet, restart PM2, seed token discovery
  web        Vercel: NEXT_PUBLIC_CHAIN_ID=4663 and a production deploy
  final      audit again
The VPS is reached over SSH with LAUNCH_VPS (default ubuntu@43.134.60.117) and LAUNCH_VPS_KEY (default ~/.ssh/hadeh.pem).
Nothing here prints a private key.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ENV_FILE = REPO / ".env.mainnet"
CONTRACTS = REPO / "contracts"
MANIFEST = CONTRACTS / "deployments" / "4663.json"
APP_DIR = "/home/ubuntu/apps/nti"
STEPS = ("preflight", "deploy", "wire", "audit", "baskets", "sources", "publish", "cutover", "web", "final")
EXPLORER = "https://robinhoodchain.blockscout.com"
SEED_LOOKBACK_BLOCKS = 2_000_000  # about two days at 0.1 s blocks; Pons launches older than that are not tradable seeds


def parse_env(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.strip())
        if m:
            out[m.group(1)] = m.group(2).strip().strip("\"'")
    return out


def sh(cmd: list[str] | str, *, env: dict[str, str] | None = None, cwd: Path = REPO, check: bool = True) -> int:
    shown = cmd if isinstance(cmd, str) else " ".join(shlex.quote(c) for c in cmd)
    shown = re.sub(r"0x[0-9a-fA-F]{64}", "<key>", shown)
    shown = re.sub(r"(https?://[^\s/]+/v2/)\S+", r"\1<key>", shown)
    print(f"\n$ {shown}", flush=True)
    merged = {**os.environ, **(env or {})}
    if not isinstance(cmd, str):
        # Windows resolves the executable against this process's PATH, not the child's, so resolve it here.
        found = shutil.which(cmd[0], path=merged.get("PATH"))
        cmd = [found or cmd[0], *cmd[1:]]
    proc = subprocess.run(cmd, cwd=cwd, env=merged, shell=isinstance(cmd, str), check=False)
    if check and proc.returncode != 0:
        raise SystemExit(f"step failed (exit {proc.returncode}); fix the cause and rerun with --from <step>")
    return proc.returncode


def uv(script: str, *extra: str, with_pkg: str | None = None) -> list[str]:
    cmd = ["uv", "run", "--directory", "services"]
    if with_pkg:
        cmd += ["--with", with_pkg]
    return [*cmd, "python", f"../infra/scripts/{script}", *extra]


def forge_env(env: dict[str, str]) -> dict[str, str]:
    path = f"{Path.home() / '.foundry' / 'bin'}{os.pathsep}{os.environ.get('PATH', '')}"
    return {**env, "PATH": path, "FOUNDRY_DISABLE_NIGHTLY_WARNING": "1"}


def deployed(env: dict[str, str]) -> bool:
    if not MANIFEST.exists():
        return False
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if int(data.get("chainId", 0)) != 4663 or not data.get("registry"):
        return False
    import httpx

    rpc = env["RPC_URL_MAINNET"].split(",")[0]
    body = {"jsonrpc": "2.0", "id": 1, "method": "eth_getCode", "params": [data["registry"], "latest"]}
    return str(httpx.post(rpc, json=body, timeout=30).json().get("result", "0x")) not in ("0x", "0x0")


def vps(command: str, key: str, host: str) -> int:
    return sh(["ssh", "-i", key, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", host, command])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--go", action="store_true", help="really broadcast and switch the stack; without it nothing is sent")
    parser.add_argument("--from", dest="start", choices=STEPS, default="preflight")
    args = parser.parse_args()

    env = parse_env(ENV_FILE)
    if env.get("CHAIN_ID") != "4663":
        print(".env.mainnet must set CHAIN_ID=4663", file=sys.stderr)
        return 2
    rpc = env["RPC_URL_MAINNET"].split(",")[0]
    forge = forge_env({**env, "DEPLOY_MANIFEST": "deployments/4663.json", "BASKETS_CONFIG": "../config/mainnet_baskets.json"})
    vps_host = os.environ.get("LAUNCH_VPS", "ubuntu@43.134.60.117")
    vps_key = os.environ.get("LAUNCH_VPS_KEY", str(Path.home() / ".ssh" / "hadeh.pem"))
    todo = STEPS[STEPS.index(args.start):]
    print(f"mode: {'LAUNCH' if args.go else 'rehearsal (nothing is sent)'}; steps: {', '.join(todo)}")

    if "preflight" in todo:
        sh(uv("mainnet_preflight.py", "--env-file", "../.env.mainnet", "--stage", "deploy"))

    if "deploy" in todo:
        if deployed(env):
            print("deploy: the manifest already points at live contracts, skipping")
        else:
            cmd = ["forge", "script", "script/DeployMainnet.s.sol:DeployMainnet", "--rpc-url", rpc, "--slow"]
            if args.go:
                cmd += ["--broadcast", "--private-key", env["DEPLOYER_PRIVATE_KEY"]]
            else:
                cmd += ["--sender", env["DEPLOYER_ADDRESS"]]
                print("rehearsal: simulating the deploy only")
            sh(cmd, env=forge, cwd=CONTRACTS)
            if not args.go:
                print("\nRehearsal finished. Run again with --go to launch.")
                return 0

    if not args.go:
        print("\nRehearsal finished. Run again with --go to launch.")
        return 0

    if "wire" in todo:
        sh([sys.executable, "infra/scripts/mainnet_wire.py"])
        block = json.loads(MANIFEST.read_text(encoding="utf-8")).get("deployedAtBlock")
        if block:
            text = ENV_FILE.read_text(encoding="utf-8")
            text = re.sub(r"^INDEXER_START_BLOCK=.*$", f"INDEXER_START_BLOCK={block}", text, flags=re.M)
            ENV_FILE.write_text(text, encoding="utf-8")
            print(f"INDEXER_START_BLOCK={block}")

    if "audit" in todo:
        sh(uv("mainnet_verify.py", "--env-file", "../.env.mainnet"))

    if "baskets" in todo:
        sh(
            ["forge", "script", "script/SetupBasketsMainnet.s.sol:SetupBasketsMainnet", "--rpc-url", rpc, "--broadcast",
             "--private-key", env["DEPLOYER_PRIVATE_KEY"]],
            env=forge,
            cwd=CONTRACTS,
        )

    if "sources" in todo:
        sh(["forge", "build"], env=forge, cwd=CONTRACTS)
        sh(
            [sys.executable, "infra/scripts/verify_contracts.py", "--chain", "4663", "--broadcast",
             "contracts/broadcast/DeployMainnet.s.sol/4663/run-latest.json", "--blockscout", EXPLORER],
            env=forge,
        )

    if "publish" in todo:
        paths = ["contracts/deployments/4663.json", "packages/sdk/src/addresses.ts"]
        sh(["git", "add", "--", *[p for p in paths if (REPO / p).exists()]])
        if subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=REPO, check=False).returncode != 0:
            sh(["git", "commit", "-m", "chore(mainnet): record the deployed contract suite and verification sources"])
        sh(["git", "push", "origin", "main"])

    if "cutover" in todo:
        remote_env = "/home/ubuntu/.nti-mainnet.env"
        sh(["scp", "-i", vps_key, "-o", "BatchMode=yes", str(ENV_FILE), f"{vps_host}:{remote_env}"])
        script = (
            f"set -e; export PATH=\"$HOME/.local/bin:/usr/local/bin:$PATH\"; cd {APP_DIR}; chmod 600 {remote_env}; git pull --ff-only origin main; "
            f"if ! grep -q '^CHAIN_ID=4663$' .env; then "
            f"uv run --directory services --with 'psycopg[binary]' python ../infra/scripts/cutover_to_mainnet.py "
            f"--mainnet-env {remote_env} --yes; fi; "
            f"bash infra/scripts/deploy-vps.sh; "
            f"uv run --directory services python -m nti_discovery --lookback {SEED_LOOKBACK_BLOCKS} || true; "
            f"shred -u {remote_env} 2>/dev/null || rm -f {remote_env}"
        )
        vps(script, vps_key, vps_host)

    if "web" in todo:
        web = REPO / "apps" / "web"
        sh(f'echo 4663 | npx vercel env add NEXT_PUBLIC_CHAIN_ID production --force', cwd=web)
        sh("npx vercel --prod --yes", cwd=web)

    if "final" in todo:
        time.sleep(5)
        sh(uv("mainnet_verify.py", "--env-file", "../.env.mainnet"))
        print("\nMAINNET IS LIVE. Operator, keeper, validators and discovery run on the VPS; the site serves chain 4663.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
