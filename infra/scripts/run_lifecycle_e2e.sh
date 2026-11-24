#!/usr/bin/env bash
# Runs the sandbox economic lifecycle on Robinhood Testnet (about 5 minutes end to end).
# Usage: infra/scripts/run_lifecycle_e2e.sh [env-file]   (default: .env at the repo root)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${1:-$ROOT/.env}"
export PATH="$HOME/.foundry/bin:$PATH"

get() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '\r"'"'"; }
hexkey() { local v; v="$(get "$1")"; case "$v" in 0x*) echo "$v" ;; *) echo "0x$v" ;; esac; }

RPC="$(get RPC_URL_TESTNET)"
export DEPLOYER_PRIVATE_KEY="$(hexkey DEPLOYER_PRIVATE_KEY)" OPERATOR_PRIVATE_KEY="$(hexkey OPERATOR_PRIVATE_KEY)" \
  KEEPER_PRIVATE_KEY="$(hexkey KEEPER_PRIVATE_KEY)" VALIDATOR_PRIVATE_KEY_1="$(hexkey VALIDATOR_PRIVATE_KEY_1)" \
  VALIDATOR_PRIVATE_KEY_2="$(hexkey VALIDATOR_PRIVATE_KEY_2)" VALIDATOR_PRIVATE_KEY_3="$(hexkey VALIDATOR_PRIVATE_KEY_3)"

phase() {
  local log
  log="$(mktemp)"
  echo "== phase $1"
  if (cd "$ROOT/contracts" && forge script script/LifecycleE2ETestnet.s.sol:LifecycleE2ETestnet \
      --sig "$1()" --rpc-url "$RPC" --broadcast --slow) >"$log" 2>&1; then
    tail -n 20 "$log"
    rm -f "$log"
  else
    local status=$?
    cat "$log" >&2
    rm -f "$log"
    echo "Lifecycle phase $1 failed (forge exit $status)" >&2
    return "$status"
  fi
}

phase p1
sleep 8
phase p2
ORACLE="$(grep -o '"oracle": *"0x[0-9a-fA-F]*"' "$ROOT/contracts/deployments/46630.lifecycle-e2e.json" | grep -o '0x[0-9a-fA-F]*')"
BOUNDARY="$(cast call "$ORACLE" 'epochBoundary(uint32)(uint64)' 3 --rpc-url "$RPC" | awk '{print $1}')"
echo "== waiting for epoch 3 boundary ($BOUNDARY)"
while [ "$(date +%s)" -lt $((BOUNDARY + 4)) ]; do sleep 3; done
phase p3
sleep 8
phase p4
test -s "$ROOT/contracts/deployments/46630.lifecycle-e2e.json"
grep -q '"oracle"' "$ROOT/contracts/deployments/46630.lifecycle-e2e.json"
grep -q '"market"' "$ROOT/contracts/deployments/46630.lifecycle-e2e.json"
echo "== done: $ROOT/contracts/deployments/46630.lifecycle-e2e.json"
