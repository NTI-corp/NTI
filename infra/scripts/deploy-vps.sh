#!/usr/bin/env bash
# Sync the checkout and (re)register the PM2 apps. One stack: after the cutover the same host, database and
# project simply run against mainnet (CHAIN_ID=4663 in the host .env); see MAINNET.md.
set -euo pipefail

export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

APP_DIR="${APP_DIR:-/home/ubuntu/apps/nti}"
REPO_URL="${REPO_URL:-https://github.com/NTI-corp/NTI.git}"
BRANCH="${BRANCH:-main}"
ENV_EXAMPLE="infra/.env.example"
export APP_DIR

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

# On mainnet, check the host before starting anything: a log-capable RPC, Supabase, secrets.
if grep -qE '^CHAIN_ID=4663$' "$APP_DIR/.env" 2>/dev/null; then
  if ! (cd "$APP_DIR/services" && uv run python ../infra/scripts/mainnet_preflight.py         --env-file ../.env --stage services); then
    echo "Mainnet services preflight failed; PM2 apps were not started or reloaded." >&2
    exit 1
  fi
fi

APP_FILE="$APP_DIR/infra/ecosystem.config.cjs"
OP="nti-oracle-operator"

if command -v pm2 >/dev/null 2>&1 && grep -qE '^SUPABASE_URL=https://' "$APP_DIR/.env"; then
  # Indexer daemon: restart gracefully if present.
  if pm2 describe "nti-indexer" >/dev/null 2>&1; then
    pm2 restart "nti-indexer" --update-env
  else
    pm2 start "$APP_FILE" --only "nti-indexer" --update-env
  fi
  # Ensure the fetcher cron is registered without interrupting an in-flight 4h scrape.
  if ! pm2 describe "nti-fetcher" >/dev/null 2>&1; then
    pm2 start "$APP_FILE" --only "nti-fetcher" --update-env
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
    app="$base"
    pm2 delete "$app" >/dev/null 2>&1 || true
    pm2 start "$APP_FILE" --only "$app" --update-env
  done
  pm2 save
fi

echo "NTI sync complete at $APP_DIR"
