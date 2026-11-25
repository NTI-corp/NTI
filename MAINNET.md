# NTI Mainnet Runbook (Robinhood Chain 4663)

Status: **prepared, not deployed.** Nothing here has been broadcast to mainnet. Every step below that spends
ETH or changes on-chain state needs an explicit go-ahead.

## 0. Gates (all must be true before step 3)

| Gate | Evidence |
| --- | --- |
| Testnet soak is clean | Epochs commit and finalize on schedule, `nti-monitor` silent, keeper tasks all `ok` |
| Contract suite green | `forge test --root contracts` passes (43 tests) |
| Data quality claims decided | Classifier agreement, coverage and backtest thresholds from the brief are met, or the public claim is lowered to "measures how loudly a narrative is discussed" |
| Launch facts known | $NTI CA, whether it is Pons v1 or v2, graduated or still on the bonding curve, creator tax |
| Fresh mainnet wallets | Deployer, operator, keeper, attester, 3 validators: new keys, never reused from testnet |
| Pauser | A Safe multisig (Safe 1.4.1 singleton and proxy factory exist on 4663), not an EOA |
| Separate data plane | See "Topology" below |

## 1. Topology (decision needed)

Supabase tables (`epochs`, `kols`, `posts`, ...) have no `chain_id` column, and PM2 app names are fixed, so a
mainnet pipeline **must not share** the testnet Supabase project or the testnet VPS directory.

Recommended: a second Supabase project (apply `supabase/migrations/*` in order), a second checkout on the VPS
(`APP_DIR=/home/ubuntu/apps/nti-mainnet`, PM2 apps renamed with a `-mainnet` suffix), and a second Vercel
project with `NEXT_PUBLIC_CHAIN_ID=4663`. The testnet stack stays up as the public demo.

## 2. Environment

Copy `infra/mainnet.env.example` to a file outside git (for example `.env.mainnet`) and fill it in. Then:

```powershell
uv run --directory services python ../infra/scripts/mainnet_preflight.py --env-file ../.env.mainnet
```

The preflight is read-only. It checks chain id, bytecode at every external dependency, role-address
hygiene, ETH balances, the canonical config hash and, once set, the $NTI token (decimals, supply).
The canonical hash of `config/nti.v1.json` today is
`0x07acec1d77949027e6ba95a4ec7b43ce380fb70efd317e79d0f024e4afc8c297` and must be passed as
`INITIAL_CONFIG_HASH` (the deploy script refuses to run without it).

## 3. Deploy

`contracts/script/DeployMainnet.s.sol` refuses to run unless the chain is 4663, the broadcaster equals
`DEPLOYER_ADDRESS`, and every external dependency has bytecode. It never deploys `NTITestToken`.

```powershell
$env:PATH = "$HOME\.foundry\bin;$env:PATH"
# 1) simulate first (no --broadcast); review gas and the printed addresses
forge script contracts/script/DeployMainnet.s.sol:DeployMainnet --root contracts --rpc-url $env:RPC_URL_MAINNET --sender $env:DEPLOYER_ADDRESS
# 2) broadcast only after sign-off
forge script contracts/script/DeployMainnet.s.sol:DeployMainnet --root contracts --rpc-url $env:RPC_URL_MAINNET --private-key $env:DEPLOYER_PRIVATE_KEY --broadcast --slow
```

A simulation writes a throwaway `contracts/deployments/4663.json`; delete it before the real run.
Estimated cost from the last simulation: about 0.0015 ETH at 0.04 gwei.

## 4. Wire and verify

1. Commit `contracts/deployments/4663.json`; add the same addresses to `PROTOCOL_ADDRESSES[4663]` in
   `packages/sdk/src/addresses.ts`; run `pnpm build:sdk`.
2. Role audit on-chain: slasher roles on Staking, dispute role on OracleCommit, operator/validators, keeper on
   FeeRouter and Grants, attester on KOLRegistry, pauser everywhere. The testnet check script pattern in this
   repo's history (`hasRole` reads) is enough.
3. Conservative caps stay at their defaults: market pool 5 ETH, 20 open markets, global TVL 50 ETH, basket TVL 10 ETH.
   Raise only through governance after weeks without incidents.
4. **Safety windows are frozen at deploy.** `DeployMainnet` locks the timings at the production defaults
   (2h dispute window, 6h resolution window, 7d unstake cooldown, 48h settle timeout, 6/42-epoch market horizons)
   with `lockTimings()` on OracleCommit, Dispute, Staking and NarrativeMarket. Testnet keeps them unlocked and short
   (5 second dispute window, 10 second unstake cooldown; the 60 minute commit delay stays on testnet too) so every flow can be exercised in minutes. Verify on mainnet that
   `timingsLocked()` is `true` on all four before announcing anything.
5. Governor voting period is **21,600 blocks** (about 3 days on the 12s parent-chain clock that
   `block.number` returns on this chain). Do not reuse the old 259,200 value.

## 5. Token attach (when the CA exists)

1. Check it on the explorer: ERC-20, 18 decimals, 1B supply, Pons version, graduation phase, creator tax.
2. Transfer a small amount in and out to detect a transfer tax. Staking and Dispute already measure
   balance deltas, so a tax does not break accounting.
3. `registry.setNti(CA)`, then `registry.freeze()`. `setNti` reverts if any stake is locked.
4. Buyback: only when the pool is live. v1 token or graduated v2: `registry.setBuybackAdapter(V3 or V4)` and try
   0.01 ETH first. A v2 token still on the curve keeps the 40% share parked in FeeRouter.
5. Retune thresholds to price: `RADAR_MIN_STAKE`, dispute bond, validator minimum stake, tier discounts.
6. Run one small end-to-end pass with real $NTI: stake, unstake request, one tiny market, one grant round.

## 6. Services

Point the mainnet checkout at its own Supabase and RPC, set `CHAIN_ID=4663`, then start the same PM2 set
(fetcher, operator, keeper, monitor, indexer, purge). Operator and keeper are idempotent and run every 20 minutes.
Validators and operator keys must be different wallets. Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` so the
monitor can alert. Its low-ETH default threshold on mainnet is 0.05 ETH.

## 7. Hand-over

After several weeks without incidents and with enough stake for the 4% governor quorum, move
`DEFAULT_ADMIN_ROLE` on each contract to the Timelock (48 hour delay) and renounce the deployer's roles.
This is irreversible: confirm the Timelock proposer and canceller are the Governor first.

## Known gaps to decide, not hide

* **Log-capable RPC is a mainnet blocker.** Alchemy's free tier limits `eth_getLogs` to 10 blocks and
  PublicNode refuses historical logs on 4663 (blocks are ~0.1s, so 10 blocks is one second). The indexer and
  the Pons listener both need a paid or dedicated endpoint (set `INDEXER_RPC_URL`, `DISCOVERY_RPC_URL`, and
  `DISCOVERY_LOG_RANGE` / `INDEXER_BATCH_BLOCKS` to what it allows).
* Token discovery (`python -m nti_discovery`) scans Pons V2 `TokenLaunched` / `PoolGraduated` logs, resolves each
  token through `getLaunchedToken`, and enriches liquidity and 24h activity from DexScreener (ETH depth = USD
  liquidity / WETH price, because Pons pairs are not always against WETH). Pons v1 tokens are not covered.
  `txs_7d` is currently a 24h lower bound. Run `python -m nti_discovery --dry-run` first to see what it would write.
* Dataset hashes are stored locally; Arweave (Turbo) or IPFS upload is not wired, so `arweave_tx` is a local id.
* The KOL universe reaches 1,500 accounts on testnet through the daily harvest (`nti_discovery.kol_harvest`),
  which also refreshes profiles and retiers by posting frequency. Mainnet needs governance-approved universe
  changes, and the fetch capacity (8 X accounts, no dedicated validator pool) is the real limit: per-epoch
  coverage depends on the tier caps and on how many healthy accounts are available.
* The oracle operator runs as a PM2 daemon (`--loop 300`) and classifies posts with `CLASSIFIER_CONCURRENCY`
  workers (default 4). A cron-restarted operator would be killed mid-commit on large epochs.
* No independent audit. The brief's substitute is tests, fork tests and the conservative caps above.

## Static analysis triage (Slither, medium and above, CI run on 2026-11-20)

17 results, none actionable; reviewed by hand:

| Detector | Where | Verdict |
| --- | --- | --- |
| arbitrary-send-eth | `BuybackAdapterV4._executeRouter` | ETH goes to the immutable Universal Router set at deploy; not user-controlled |
| reentrancy-balance (x14) | `BuybackAdapterV3/V4.swapExactInput` | Intentional before/after balance deltas; the function is `nonReentrant` and callable only through FeeRouter's keeper path |
| locked-ether | `Staking.notifyReward` | Received ETH is credited to `rewardPerShare` and paid out by `claim()`; Slither cannot see that path |
| uninitialized-local | `BuybackAdapterV4._buildPath.nextCurrency` | Assigned in every non-reverting branch |
| unused-return | V3 `exactInputSingle`, V4 `getSlot0` | Output is verified through balance deltas / only the price is needed |

The `ERROR:Slither:Failed to resolved name` lines in the log are a known compiler-ID mapping quirk with
OpenZeppelin 5.x and do not affect results. This is a tooling pass, not an audit.
