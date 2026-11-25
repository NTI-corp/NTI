# NTI Mainnet Launch Readiness Checklist (Robinhood Chain `4663`)

Evidence list for the day mainnet is switched on. Items marked **built** exist in the repository and are covered
by tests; they still need to be run against mainnet with real wallets. Items marked **yours** need an account,
a key, money or a decision that only you can provide. Procedure: `MAINNET.md`. Reasons: `docs/MAINNET_DECISIONS.md`.

## 1. Contracts and ownership
- [x] **built** Deploy script that checks itself: `DeployMainnet.s.sol` reads the suite back (roles, locked timings, wiring) and reverts before writing the manifest. Covered by `MainnetScripts.t.sol`.
- [x] **built** Timings frozen at deploy: 2 h dispute window, 1 h commit delay, 6 h resolution, 7 d cooldown, 48 h settle timeout.
- [x] **built** `AttachTokenMainnet.s.sol` (checks 18 decimals and supply, refuses a frozen registry or an unknown adapter) and `HandoverMainnet.s.sol` (confirmation phrase, preconditions, ends with the Timelock as admin and the deployer holding nothing).
- [x] **built** No test token on mainnet: `NTITestToken` and `TestnetLaunchFactory` are never deployed (chain id guards).
- [ ] **yours** Independent audit of `OracleCommit`, `Dispute`, `NarrativeMarket`, `Basket`, `Staking`, `FeeRouter`, `Buyback*`, `Grants`, `NTIGovernor`, `KOLRegistry`.
- [ ] **yours** Safe (2 of 3 minimum, 3 owners minimum) with hardware-backed signers.
- [ ] **yours** `mainnet_verify.py --phase deployed` reports 0 failures after the deploy.
- [ ] **yours** After the soak and enough stake for quorum: handover, then `mainnet_verify.py --phase handed-over` shows no deployer rights and the Safe has accepted registry ownership.

## 2. Oracle and X data pipeline
- [x] **built** Operator daemon: a commit is never killed by a schedule; classification runs with concurrent workers; failed KOL fetches are retried within the cycle.
- [x] **built** The operator refuses to commit on 4663 without `VALIDATOR_OMISSION_CHECK=1`.
- [x] **built** RPC fallback chain for the Python services (comma-separated URLs).
- [ ] **yours** At least 6 primary lane accounts and 3 dedicated validator accounts in `secrets/x_accounts.json` (the services preflight enforces it).
- [ ] **yours** 24 hour proof on mainnet: at least 6 consecutive `final` epochs with 0 fetch failures and `mainnet_verify.py` clean.
- [ ] **yours** MiMo plan and quota confirmed; Telegram delivery tested from the monitor.
- [ ] optional Permanent archive (Irys or Arweave) in addition to the public Supabase bucket.

## 3. RPC, indexer and discovery
- [x] **built** `mainnet_preflight.py --stage services` probes `eth_getLogs` and fails when `INDEXER_BATCH_BLOCKS` does not fit the provider.
- [x] **built** `deployedAtBlock` in the manifest feeds `INDEXER_START_BLOCK`.
- [ ] **yours** Paid RPC primary and a second provider; `RPC_URL_MAINNET`, `INDEXER_RPC_URL`, `DISCOVERY_RPC_URL` set.
- [x] **built** Migrations runner with a ledger (`apply_migrations.py`) and KOL seed copy (`copy_kol_universe.py`).
- [ ] **yours** New Supabase project migrated and empty (the preflight fails if `epochs` has rows).
- [ ] **yours** Pons discovery shows live launches and DexScreener liquidity after the stack starts.

## 4. Web
- [x] **built** Chain-gated UI: faucet and test-only flows are testnet-only; mainnet shows "Pre-freeze registry" until the registry is frozen; Vercel functions in `hnd1`.
- [x] **built** SDK wiring from the manifest (`mainnet_wire.py`) with a CI drift check.
- [ ] **yours** Separate Vercel project, custom domain with HTTPS, Deployment Protection off for the public domain.
- [ ] **yours** `SIWE_SESSION_SECRET` (32+ characters), SIWE origin check against the real domain, WalletConnect project id.
- [ ] **yours** Wallet flows (connect, stake, bet, basket, grants) clicked once with a real wallet after attach.

## 5. Final gate

```bash
forge test --root contracts
uv run --directory services ruff check .
uv run --directory services pytest -q
pnpm build:sdk && pnpm build:indexer && pnpm indexer:test
pnpm typecheck && node --test apps/web/tests/data-integrity.test.mjs
uv run --directory services python ../infra/scripts/mainnet_preflight.py --env-file ../.env.mainnet
```
