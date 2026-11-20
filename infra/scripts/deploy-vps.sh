#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

APP_DIR="${APP_DIR:-/home/ubuntu/apps/nti}"
REPO_URL="${REPO_URL:-https://github.com/NTI-corp/NTI.git}"
BRANCH="${BRANCH:-main}"

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
  cp "$APP_DIR/infra/.env.example" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  echo "Created $APP_DIR/.env from example — fill secrets before starting PM2."
fi

if command -v pnpm >/dev/null 2>&1; then
  (cd "$APP_DIR" && (pnpm install --frozen-lockfile || pnpm install))
  (cd "$APP_DIR" && pnpm build:sdk && pnpm build:indexer)
fi

if command -v uv >/dev/null 2>&1; then
  (cd "$APP_DIR/services" && uv sync --all-packages)
fi

if command -v pm2 >/dev/null 2>&1 && grep -qE '^SUPABASE_URL=https://' "$APP_DIR/.env"; then
  # Start nti-indexer daemon if not already running; reload gracefully if present.
  if pm2 describe nti-indexer >/dev/null 2>&1; then
    pm2 restart nti-indexer --update-env
  else
    pm2 start "$APP_DIR/infra/ecosystem.config.cjs" --only nti-indexer --update-env
  fi
  # Cron-driven jobs: re-register so schedule changes in ecosystem.config.cjs take effect. These three are
  # idempotent (they exit early when there is nothing to do), so the immediate first run is harmless.
  for app in nti-oracle-operator nti-keeper nti-monitor; do
    pm2 delete "$app" >/dev/null 2>&1 || true
    pm2 start "$APP_DIR/infra/ecosystem.config.cjs" --only "$app" --update-env
  done
  pm2 save
fi

echo "NTI VPS sync complete at $APP_DIR"
