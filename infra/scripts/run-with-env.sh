#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/home/ubuntu/apps/nti}"
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

if [ -f "$APP_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$APP_DIR/.env"
  set +a
fi

exec "$@"
