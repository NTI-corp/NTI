# NTI Mainnet Runbook (Robinhood Chain 4663)

Status: **code complete, not deployed.** Nothing here has been broadcast to mainnet. Why each choice was made:
`docs/MAINNET_DECISIONS.md`. Evidence list: `docs/MAINNET_LAUNCH_CHECKLIST.md`. How the pipeline behaves and how
to recover it: `docs/TESTNET_OPERATIONS.md`.

Launch shape: the **existing** VPS, Supabase project, Vercel project, X accounts and Alchemy account switch from
testnet to mainnet in one cutover. Only the wallets are new. There is no Timelock, no Governor and no locked
timing; the admin wallet adjusts everything directly. The token is a prelaunch stand-in (`pNTI`) until the real
$NTI launches on Pons.

## What you prepare

| Item | Notes |
| --- | --- |
| 6 new wallets | **deployer** (also admin and pauser), **operator**, **keeper** (also attester), **validators 1 to 3**. Only the first three send transactions and need gas: about 0.003 ETH on the deployer (the whole suite costs roughly 0.0006 ETH to deploy at today's 0.02 gwei, from `eth_estimateGas` on mainnet), 0.01 ETH on the operator and 0.005 ETH on the keeper (normal use is about 0.0001 ETH a day for both; the extra is margin for a spike in Ethereum data fees). Keep operator and keeper separate: they send transactions at the same time and would collide on nonces |
| Alchemy plan | The existing key already serves mainnet, but the free tier allows `eth_getLogs` over only 10 blocks (about 1 second). The indexer cannot keep up on that. Upgrade the same key to pay-as-you-go before the cutover |
| `.env.mainnet` | Copy `infra/mainnet.env.example`, fill the wallets and the Alchemy URL |

## 1. Check, simulate, deploy

```powershell
uv run --directory services python ../infra/scripts/mainnet_preflight.py --env-file ../.env.mainnet --stage deploy
$env:PATH = "$HOME\.foundry\bin;$env:PATH"
# simulate first (no --broadcast); review addresses and gas
forge script contracts/script/DeployMainnet.s.sol:DeployMainnet --root contracts --rpc-url $env:RPC_URL_MAINNET --sender $env:DEPLOYER_ADDRESS
# broadcast
forge script contracts/script/DeployMainnet.s.sol:DeployMainnet --root contracts --rpc-url $env:RPC_URL_MAINNET --private-key $env:DEPLOYER_PRIVATE_KEY --broadcast --slow
```

The preflight checks the chain id, bytecode at every external dependency, the role wallets (distinct, funded,
keys derive to their addresses), the config hash and `ORACLE_GENESIS_TIMESTAMP=0`. `DeployMainnet` refuses to run
unless the chain is 4663 and the broadcaster is `DEPLOYER_ADDRESS`. It deploys the suite, creates the `pNTI`
prelaunch token when `NTI_TOKEN_ADDRESS` is empty, sets the short windows (dispute window 5 s, dispute resolution
10 min, unstake cooldown 10 s; the 1 hour commit delay stays because the X scrape needs it), reads everything back
and reverts if a role or timing is wrong, then writes `contracts/deployments/4663.json` with `deployedAtBlock`.
A simulation also writes that file: delete it before the real run.

## 2. Wire the manifest and audit it

```powershell
python infra/scripts/mainnet_wire.py     # rewrites packages/sdk/src/addresses.ts, prints INDEXER_START_BLOCK
pnpm build:sdk
uv run --directory services python ../infra/scripts/mainnet_verify.py --env-file ../.env.mainnet
```

Put `INDEXER_START_BLOCK` in `.env.mainnet`. Commit `contracts/deployments/4663.json` and the SDK change and push
(CI runs `mainnet_wire.py --check`, so the SDK cannot drift from the manifest). `mainnet_verify.py` must show no
FAIL: roles, config hash, the launch windows and that the admin wallet administers every contract.

## 3. Cutover (VPS, Supabase, Vercel)

On the VPS, once the manifest is pulled (the normal deploy does it):

```bash
cd /home/ubuntu/apps/nti
uv run --directory services --with "psycopg[binary]" python ../infra/scripts/cutover_to_mainnet.py --mainnet-env /path/to/.env.mainnet --dry-run
uv run --directory services --with "psycopg[binary]" python ../infra/scripts/cutover_to_mainnet.py --mainnet-env /path/to/.env.mainnet
```

It stops the PM2 apps, exports every chain-specific table to `data/state/cutover-backup-<time>/`, empties them
(epochs, chain events, markets, baskets, grants, attestations and so on), keeps the data that does not depend on
the chain (KOLs, posts, engagement, classifications, fetch evidence), copies the mainnet keys and RPC settings into
the host `.env` (the previous file is kept as `.env.testnet-<time>`) and restarts PM2. The next deploy runs
`mainnet_preflight.py --stage services` on the host automatically because the `.env` now says `CHAIN_ID=4663`.

The operator starts at the newest mature epoch, so the first mainnet epoch commits one hour after its boundary and
finalizes within seconds.

Vercel: switch the existing project to mainnet and redeploy.

```powershell
cd apps/web
echo 4663 | npx vercel env add NEXT_PUBLIC_CHAIN_ID production --force
npx vercel --prod
```

The testnet site stops being served by that project; the testnet contracts keep existing on chain.

## 4. Use it

The app shows a "Prelaunch token" banner. Staking and markets work with `pNTI`, which anyone can claim from the
faucet on the Stake page (10,000 per day). Watch the first epochs on Telegram and `/oracle`.

## 5. Swap in the real $NTI (when it launches on Pons)

Check it on the explorer first: ERC-20, 18 decimals, 1B supply, graduation phase, creator tax. Everyone must
unstake first, because the registry only accepts a new token while nothing is staked (the cooldown is seconds).

```powershell
$env:NTI_TOKEN_ADDRESS = "0x..."
$env:FREEZE = "1"                      # optional: the token can never change again
# $env:BUYBACK_ADAPTER = <V3 or V4 adapter from the manifest>   once the token's pool is live
forge script contracts/script/SwapTokenMainnet.s.sol:SwapTokenMainnet --root contracts --rpc-url $env:RPC_URL_MAINNET --private-key $env:DEPLOYER_PRIVATE_KEY --broadcast
python infra/scripts/mainnet_wire.py   # then commit the SDK change
```

The script refuses a token that is not 18 decimals with the expected supply, a registry that is already frozen, a
token that is already set, locked stake, or a buyback adapter that is not in the manifest. A v2 token still on its
bonding curve keeps the 40% buyback share parked in FeeRouter until `registry.setBuybackAdapter` is called later.
Retune `RADAR_MIN_STAKE`, the dispute bond, the validator minimum stake and the tier discounts to the live price.

## Operations

* Pause and unpause: the pauser wallet calls `pause()` / `unpause()` on the contract that misbehaves.
* Parameter changes (timings, config, roles): the deployer wallet, directly. Keep that key safe: it is the admin.
* Routine checks: `mainnet_verify.py` from anywhere, `mainnet_preflight.py --stage services` on the host.

## Known limits

* No independent audit, no Timelock and no on-chain governance by choice: the admin wallet can change parameters
  at once. Protect the deployer key accordingly.
* Switching the token needs everyone to unstake first (a registry rule).
* The indexer needs a log-capable RPC: the Alchemy free tier (10 blocks) is not enough.
* Independent omission verification stays off without 3 dedicated validator X accounts (`VALIDATOR_OMISSION_CHECK`).
* Pons v1 tokens are not covered by discovery; `txs_7d` is a 24 hour lower bound.
* Fetch capacity is bounded by 8 X accounts at about 800 requests a day each; the tier caps keep the load below it.

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
