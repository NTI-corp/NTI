# NTI — Narrative Mindshare Index

Full-product monorepo for the NTI narrative mindshare index and on-chain product suite on **Robinhood Chain** (Mainnet `4663` / Testnet `46630`).

## Architecture

```text
NTI/
  config/               Versioned protocol parameters (nti.v1.json)
  contracts/            Foundry (Solidity 0.8.26, OpenZeppelin v5, forge-std)
  services/             Python 3.12+ (uv workspace)
    nti_core/           Shared config, canonical JSON/keccak256, domain types
    fetcher/            X timeline multi-lane scraper + failover adapters
    classifier/         LLM adapter (Gemini Flash-Lite primary, MiMo fallback)
    engine/             Pure deterministic Decimal(40) index engine
    oracle_node/        Operator & validator EIP-712 runner + dispute watcher
    discovery/          KOL & new token discovery for Radar / Heatmap
  indexer/              TypeScript + viem event mirror to Supabase
  apps/web/             Next.js App Router + wagmi + viem + Tailwind
  packages/sdk/         @nti/sdk: chains, live-verified external addresses, narratives, ABIs
  supabase/migrations/  Postgres schema & default-deny RLS policies
  infra/                .env.example, PM2 ecosystem, VPS sync script
  data/fixtures/        Golden deterministic fixtures for engine & simulations
```

## Quick Verification

```bash
# Smart contracts
forge test --root contracts -vv

# Python services
uv sync --directory services --all-packages
uv run --directory services ruff check .
uv run --directory services pytest

# TypeScript & Web
pnpm install
pnpm build:sdk
pnpm typecheck
pnpm build:web
```

## Testnet status (Robinhood Chain Testnet 46630)

Live and automated: contracts (`contracts/deployments/46630.json`), fetcher, operator, keeper, monitor and indexer on
the VPS (PM2), Supabase, and the web app on Vercel. Contract waits are short on testnet (5 s dispute window, 10 s
unstake cooldown; the 60 minute commit delay stays because it is the window X scraping needs under its rate limits) and frozen at production values on mainnet; the only remaining wait is the 4 hour
epoch cadence.

```bash
# read-only health check: wiring, oracle freshness, keeper backlog, indexer lag (add --web <url> for the API)
uv run --directory services python ../infra/scripts/testnet_healthcheck.py

# full economic lifecycle on a throwaway sandbox suite, about 5 minutes
bash infra/scripts/run_lifecycle_e2e.sh

# challenger-wins dispute path on a sandbox suite
forge script contracts/script/DisputeE2ETestnet.s.sol:DisputeE2ETestnet --root contracts --rpc-url $RPC_URL_TESTNET --broadcast
```

Mainnet is prepared but not deployed: see `MAINNET.md`.
