# NTI Mainnet Launch Checklist (Robinhood Chain `4663`)

Short list for launch day. **built** means it exists in the repository and has tests; it still has to be run against
mainnet. **yours** needs a wallet, an account or a decision. Procedure: `MAINNET.md`. Reasons:
`docs/MAINNET_DECISIONS.md`.

## Before the deploy
- [ ] **yours** 6 new wallets: deployer (admin and pauser), operator, keeper (and attester), 3 validators. Fund only deployer (~0.003 ETH), operator and keeper (~0.005 ETH each).
- [ ] **yours** Alchemy key upgraded to pay-as-you-go (the free tier cannot serve the indexer: 10 block log range).
- [ ] **yours** `.env.mainnet` filled from `infra/mainnet.env.example`.
- [x] **built** `mainnet_preflight.py --stage deploy`: chain id, external dependencies, distinct funded wallets, key derivation, config hash, genesis.

## Deploy
- [x] **built** `DeployMainnet.s.sol`: no Timelock or Governor, short unlocked windows, `pNTI` prelaunch token, reads the suite back and reverts on any wrong role or timing. Covered by `MainnetScripts.t.sol`.
- [ ] **yours** Simulate, then broadcast; commit `contracts/deployments/4663.json`.
- [x] **built** `mainnet_wire.py` writes the addresses into the SDK; CI fails if they drift.
- [ ] **yours** `mainnet_verify.py` reports no FAIL.

## Cutover
- [x] **built** `cutover_to_mainnet.py`: backup, empty the chain tables, switch the host `.env`, restart PM2.
- [x] **built** Operator starts at the newest mature epoch on a fresh chain.
- [ ] **yours** Run the cutover on the VPS; set `NEXT_PUBLIC_CHAIN_ID=4663` on Vercel and redeploy.
- [ ] **yours** First epoch commits and finalizes on `/oracle`; Telegram stays quiet.
- [x] **built** The deploy script runs `mainnet_preflight.py --stage services` when the host `.env` says `CHAIN_ID=4663`.

## After the launch of $NTI on Pons
- [x] **built** `SwapTokenMainnet.s.sol` (checks decimals and supply, refuses locked stake, optional freeze and buyback adapter).
- [ ] **yours** Everyone unstakes, run the swap, `mainnet_wire.py`, commit the SDK.
- [ ] **yours** Retune `RADAR_MIN_STAKE`, dispute bond, validator minimum stake and tier discounts to the live price.

## Not required (owner decisions)
Independent audit, Timelock, Governor, locked timings, new infrastructure accounts.

## Final gate

```bash
forge test --root contracts
uv run --directory services ruff check .
uv run --directory services pytest -q
pnpm build:sdk && pnpm build:indexer && pnpm indexer:test
pnpm typecheck && node --test apps/web/tests/data-integrity.test.mjs
```
