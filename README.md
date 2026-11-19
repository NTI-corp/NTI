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
