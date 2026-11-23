# Testnet End-to-End Finalization

> Execute continuously using subagent-driven-development, regression tests and independent review.

**Goal:** Make the existing NTI testnet product truthful, reproducible and operational end to end, then deploy and exercise its real user lifecycles.

**Architecture:** Keep the deployed contract suite where it is sound. Repair service boundaries, persistent datasets, indexing, automation and UI data provenance. Version calculation changes explicitly and start a new testnet series rather than rewriting historical oracle truth.

**Tech stack:** Python/uv, Solidity/Foundry, TypeScript/viem, Next.js, Supabase, PM2, GitHub Actions and Vercel.

**Authority:** User explicitly authorized fixes, improvements and full testnet finalization on 2026-11-23. Existing brief/plan inform the product; improvements are authorized. Work in the existing checkout on `fix/testnet-finalization`. No mainnet broadcast, no exposure of credentials, preserve historical chain records and unrelated work.

## Deliverables and acceptance

### 1. Indexer and database integrity
- [ ] Regression tests reproduce missing required fields, lost local dataset IDs, incomplete epoch inserts, and replay persistence using the REST store rather than only InMemoryStore.
- [ ] Preserve off-chain dataset locator when mirroring bytes32 chain references; correctly insert incomplete epochs; persist contract-domain events and dynamic basket addresses.
- [ ] Provide safe replay/backfill and reconcile existing events without deleting historical events.
- [ ] Validate real database rows against chain events after deployment.

### 2. Truthful web and cache freshness
- [ ] Remove fabricated live governance proposals/votes; render honest empty/error states and read real governance state/votes.
- [ ] Repair dataset URLs, official final-index freshness, epoch history gaps and preview provenance. Update incorrect quorum/timeline descriptions.
- [ ] Preserve working wallet flows, gas estimates and all product pages. Add missing user actions needed for complete workflows.
- [ ] Build/typecheck and exercise rendered pages plus wallet flows on testnet.

### 3. Reproducible data and oracle
- [ ] Tests for paginated PostgREST reads, time-bound post/engagement selection, canonical delta reconstruction, model/config/engine series changes and velocity gaps.
- [ ] Remove all silent 1000-row truncation and future engagement timestamp clamping. Persist actual observation times; use a documented observation cutoff before commit.
- [ ] Fetch recent KOL data fairly under account budgets, handle rate limits and avoid duplicate scrapes; make missing coverage visible and incomplete epochs explicit.
- [ ] Maintain chained recoverable datasets with calculation/model/prompt provenance. Feed complete state into validators, isolate omission sources and record verification coverage honestly.
- [ ] Recompute published current-series dataset exactly from public archive and chain state.

### 4. Keeper, discovery and operations
- [ ] Test and implement V3/V4 buyback routing, fee-share redemption and deterministic guarded daily basket rebalancing.
- [ ] Exercise discovery using a testnet launch source; label test assets clearly and produce real token alerts/heatmap from testnet events.
- [ ] Complete monitoring for data freshness, classification, replay/mirror failures and task failures; preserve alert delivery behavior without sending unsolicited messages.
- [ ] Update PM2/health scripts and implement repeatable lifecycle verification.

### 5. Integration, deployment and verification
- [ ] Run all Python tests/lint, contract tests, SDK/indexer builds/tests, TS checks and web build. Add meaningful regressions for each fixed failure.
- [ ] Independent whole-change review, repair material findings.
- [ ] Commit reviewed changes, update testnet VPS and Vercel; apply safe schema migration and backfill. Verify deployment SHA and CI.
- [ ] Execute funded testnet account flows: faucet, stake, access, unstake/withdraw, market creation/bet/settle/claim/refund, basket deposit/rebalance/redeem, grants proposal/vote/finalize/claim, governance lifecycle and oracle dispute.
- [ ] Verify receipts and state, public dataset replay, indexer database and UI. Report exact evidence and any external/time-dependent validation honestly.

## Ownership / interfaces

Indexer implementer owns `indexer/**`, migration and replay tooling specific to indexer; web implementer owns `apps/web/**`; coordinator owns Python data/oracle and configuration. Keeper/discovery work begins with a separate task after an initial implementer is available. Avoid concurrent edits to shared files; coordinate schema/response changes explicitly. All implementers write tests before fixes and do not commit or deploy independently.

## Verification commands

`uv run --directory services pytest`; `uv run --directory services ruff check .`; `forge test --root contracts -vv`; `pnpm build:sdk`; `pnpm build:indexer`; `pnpm indexer:test`; `pnpm typecheck`; `pnpm build:web`. Run build and typecheck sequentially where Next-generated types are involved. Production checks run read-only health and API calls; lifecycle scripts broadcast only on chain 46630.
