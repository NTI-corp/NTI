# NTI Mainnet Launch Readiness Checklist (Robinhood Chain `4663`)

Concrete pre-flight checklist before switching from Robinhood Chain Testnet (`46630`) to Mainnet (`4663`). Every item below must have observed evidence before mainnet broadcast.

---

## 1. Smart Contract Security & Ownership
- [ ] **External Audit & Slither / Mythril Gate**: Complete independent audit of `OracleCommit`, `Dispute`, `NarrativeMarket`, `NarrativeBasket`, `NTIStaking`, `FeeRouter`, `BuybackAdapterV3/V4`, `Grants`, `NTIGovernor`, and `KOLRegistry`.
- [ ] **Gnosis Safe Multisig (3-of-5)**: Deploy hardware-backed multisig for `Timelock` proposer/canceller, `Emergency Guardian` (pause-only), and initial `DEFAULT_ADMIN_ROLE`.
- [ ] **Production Timings Lock**: Verify default production timings (`4h` epochs, `2h` dispute window, `7d` staking unstake cooldown, `24h` / `7d` market horizons, `2` epoch betting cutoff) and call `lockTimings()` after mainnet smoke verification.
- [ ] **No Testnet Mocks on Mainnet**: Confirm `TestnetLaunchFactory` (`TestnetDiscovery.sol`) and `TestnetMockToken` are NOT deployed on `4663` (already enforced by `require(block.chainid == 46630)`).
- [ ] **Renounce Deployer Privileges**: Transfer all admin roles from deployer EOA to `Timelock` / Multisig and verify zero deployer admin permissions via `cast call`.

## 2. Oracle & X Data Pipeline (Zero Single Point of Failure)
- [ ] **Dedicated Validator X Pool**: Provision at least **3 isolated X accounts** in `secrets/x_accounts.json` under `validator_pool` (separate from primary lanes `lane_0` / `lane_1` / `lane_2`).
- [ ] **Enable Independent Omission Check**: Set `VALIDATOR_OMISSION_CHECK=1` in VPS `.env` once `validator_pool` has `>= 3` funded/active accounts.
- [ ] **Permanent Arweave / Irys Archive**: Configure `IRYS_PRIVATE_KEY` / `ARWEAVE_UPLOADER=irys` so epoch delta blobs are permanently pinned to Arweave in addition to Supabase Storage mirror.
- [ ] **24-Hour Continuous Testnet Proof**: Confirm `>= 6` consecutive `final` epochs in Series #2 on `46630` with `0%` fetch failures (`fetch_cycle_runs.status = 'collecting'`), populated 24H `V_n`, and `28/28 PASS` on `infra/scripts/testnet_healthcheck.py`.
- [ ] **MiMo Token Plan Billing & Alerting**: Verify `MIMO_API_KEY` production quota and Telegram alert delivery (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) on `nti-monitor`.

## 3. Mainnet RPC, Indexer & Discovery
- [ ] **Primary + Fallback Mainnet RPC**: Configure `CHAIN_ID=4663`, `RPC_URL_MAINNET`, and `NEXT_PUBLIC_CHAIN_ID=4663` in VPS `.env` and Vercel Environment Variables.
- [ ] **Pons Mainnet Discovery**: Confirm `PONS_FACTORY_ADDRESS` and `WETH_ADDRESS` point to real Robinhood Chain `4663` deployments; verify `nti-discovery` scans live launches and DexScreener liquidity.
- [ ] **Fresh Mainnet Database / Schema**: Run all migrations in `supabase/migrations/` in chronological order (`20261119000000` through `20261124000100`) on production Supabase and confirm `SCHEMA_READY: 200`.
- [ ] **Indexer Reorg Buffer**: Confirm `nti-indexer` runs with 50-block finality buffer and `--replay-stored` passes with zero errors.

## 4. Web Production & Public Access
- [ ] **Disable Vercel Deployment Protection** on production domain and bind custom domain (`nti.xyz` / `app.nti.xyz`) with HTTPS.
- [ ] **SIWE Origin Binding**: Update `NEXT_PUBLIC_APP_URL` / `SIWE_DOMAIN` and verify SIWE rejects cross-origin and wrong-chain signatures.
- [ ] **Final Pre-Deploy Gate**:
  ```bash
  forge test --root contracts --summary
  uv run --directory services ruff check .
  uv run --directory services pytest -q
  pnpm build:sdk && pnpm build:indexer && pnpm --filter @nti/indexer test
  pnpm typecheck && node --test apps/web/tests/data-integrity.test.mjs
  ```
