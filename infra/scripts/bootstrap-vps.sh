#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 22.04/24.04 host for an NTI stack (used for the dedicated mainnet VPS).
#
#   ssh ubuntu@<host> 'bash -s' < infra/scripts/bootstrap-vps.sh
#
# Installs git, build tools, Node 22, pnpm 9.15, uv, PM2 (with systemd startup) and a 2 GB swap file. It is
# idempotent: running it again only fills in what is missing. It does not create any secrets.
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -y
sudo apt-get install -y git curl ca-certificates build-essential python3 python3-venv unzip ufw

# Swap: the Python stack peaks above the RAM of small hosts during classification.
if ! swapon --show | grep -q "/swapfile"; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q "/swapfile" /etc/fstab || echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab >/dev/null
fi

# Node 22
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# pnpm and PM2
sudo npm install -g pnpm@9.15.0 pm2@latest

# uv (Python toolchain)
if ! command -v uv >/dev/null 2>&1 && [ ! -x "$HOME/.local/bin/uv" ]; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
fi
export PATH="$HOME/.local/bin:$PATH"

# PM2 starts at boot
sudo env PATH="$PATH" pm2 startup systemd -u "$USER" --hp "$HOME" >/dev/null 2>&1 || true

# Firewall: SSH only. The services make outbound calls and expose nothing.
sudo ufw allow OpenSSH >/dev/null
sudo ufw --force enable >/dev/null

echo "node $(node -v), pnpm $(pnpm -v), uv $(uv --version), pm2 $(pm2 -v)"
echo "Next: run the 'Deploy NTI mainnet services' workflow, or clone the repo to ~/apps/nti-mainnet and run"
echo "      NTI_NETWORK=mainnet bash infra/scripts/deploy-vps.sh"
