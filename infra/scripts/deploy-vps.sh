#!/usr/bin/env bash
set -euo pipefail

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

mkdir -p "$APP_DIR/secrets" "$APP_DIR/data/snapshots" "$APP_DIR/data/state"
chmod 700 "$APP_DIR/secrets"

if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/infra/.env.example" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  echo "Created $APP_DIR/.env from example — fill secrets before starting PM2."
fi

if command -v pnpm >/dev/null 2>&1; then
  (cd "$APP_DIR" && pnpm install --frozen-lockfile || pnpm install)
  (cd "$APP_DIR" && pnpm build:sdk && pnpm build:indexer)
fi

if command -v uv >/dev/null 2>&1; then
  (cd "$APP_DIR/services" && uv sync --all-packages)
fi

echo "NTI VPS sync complete at $APP_DIR"
