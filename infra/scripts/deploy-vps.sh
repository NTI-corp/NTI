#!/usr/bin/env bash
# Sync the checkout and (re)register the PM2 apps for one network.
#
#   testnet (default):  bash infra/scripts/deploy-vps.sh
#   mainnet:            NTI_NETWORK=mainnet bash infra/scripts/deploy-vps.sh
#
# Mainnet differs in three ways: it lives in its own checkout and .env, its PM2 apps carry a "-mainnet"
# suffix, and it refuses to start anything until the services preflight passes.
set -euo pipefail

export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

NETWORK="${NTI_NETWORK:-testnet}"
case "$NETWORK" in
  testnet) SUFFIX=""; DEFAULT_DIR="/home/ubuntu/apps/nti"; ENV_EXAMPLE="infra/.env.example" ;;
  mainnet) SUFFIX="-mainnet"; DEFAULT_DIR="/home/ubuntu/apps/nti-mainnet"; ENV_EXAMPLE="infra/mainnet.env.example" ;;
  *) echo "NTI_NETWORK must be testnet or mainnet (got '$NETWORK')" >&2; exit 2 ;;
esac

APP_DIR="${APP_DIR:-$DEFAULT_DIR}"
REPO_URL="${REPO_URL:-https://github.com/NTI-corp/NTI.git}"
BRANCH="${BRANCH:-main}"
export NTI_NETWORK="$NETWORK" APP_DIR

mkdir -p "$(dirname "$APP_DIR")"

if [ ! -d "$APP_DIR/.git" ]; then
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
else
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
fi

chmod +x "$APP_DIR/infra/scripts/deploy-vps.sh" "$APP_DIR/infra/scripts/run-with-env.sh"

mkdir -p "$APP_DIR/secrets" "$APP_DIR/data/snapshots" "$APP_DIR/data/state"
chmod 700 "$APP_DIR/secrets"

if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/$ENV_EXAMPLE" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  echo "Created $APP_DIR/.env from $ENV_EXAMPLE; fill the secrets before starting PM2."
fi

if command -v pnpm >/dev/null 2>&1; then
  (cd "$APP_DIR" && (pnpm install --frozen-lockfile || pnpm install))
  (cd "$APP_DIR" && pnpm build:sdk && pnpm build:indexer)
fi

if command -v uv >/dev/null 2>&1; then
  (cd "$APP_DIR/services" && uv sync --all-packages)
fi

if [ "$NETWORK" = "mainnet" ]; then
  # Fail closed: nothing mainnet starts on an environment that has not passed the preflight.
  if ! (cd "$APP_DIR/services" && uv run python ../infra/scripts/mainnet_preflight.py \
        --env-file ../.env --stage services); then
    echo "Mainnet services preflight failed; PM2 apps were not started or reloaded." >&2
    exit 1
  fi
  if [ ! -f "$APP_DIR/contracts/deployments/4663.json" ]; then
    echo "contracts/deployments/4663.json is missing: deploy the contracts and commit the manifest first." >&2
    exit 1
  fi
fi

APP_FILE="$APP_DIR/infra/ecosystem.config.cjs"
OP="nti-oracle-operator${SUFFIX}"

if command -v pm2 >/dev/null 2>&1 && grep -qE '^SUPABASE_URL=https://' "$APP_DIR/.env"; then
  # Indexer daemon: restart gracefully if present.
  if pm2 describe "nti-indexer${SUFFIX}" >/dev/null 2>&1; then
    pm2 restart "nti-indexer${SUFFIX}" --update-env
  else
    pm2 start "$APP_FILE" --only "nti-indexer${SUFFIX}" --update-env
  fi
  # Ensure the fetcher cron is registered without interrupting an in-flight 4h scrape.
  if ! pm2 describe "nti-fetcher${SUFFIX}" >/dev/null 2>&1; then
    pm2 start "$APP_FILE" --only "nti-fetcher${SUFFIX}" --update-env
  fi
  # The operator is a daemon that restarts itself between runs when the checkout moves to a new commit,
  # so a deploy must not kill it while it is committing an epoch. Start it only when it is not running.
  if ! pm2 describe "$OP" 2>/dev/null | grep -q "status.*online"; then
    pm2 delete "$OP" >/dev/null 2>&1 || true
    pm2 start "$APP_FILE" --only "$OP" --update-env
  fi
  # Cron-driven jobs: re-register so schedule changes in the ecosystem file take effect. They are
  # idempotent (they exit early when there is nothing to do), so the immediate first run is harmless.
  for base in nti-oracle-validators nti-keeper nti-monitor nti-discovery nti-kol-harvest nti-purge; do
    app="${base}${SUFFIX}"
    pm2 delete "$app" >/dev/null 2>&1 || true
    pm2 start "$APP_FILE" --only "$app" --update-env
  done
  pm2 save
fi

echo "NTI $NETWORK sync complete at $APP_DIR"
