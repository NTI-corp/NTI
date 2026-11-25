# NTI Mainnet Runbook (Robinhood Chain 4663)

Status: **deployed on mainnet (chain 4663) on 2026-11-25**; addresses in `contracts/deployments/4663.json`. The indexer and discovery run on the free dRPC endpoint (see "What you prepare"). Why each choice was made:
`docs/MAINNET_DECISIONS.md`. Evidence list: `docs/MAINNET_LAUNCH_CHECKLIST.md`. How the pipeline behaves and how
to recover it: `docs/TESTNET_OPERATIONS.md`.

Launch shape: the **existing** VPS, Supabase project, Vercel project, X accounts and Alchemy account switch from
testnet to mainnet in one cutover. Only the wallets are new. There is no Timelock, no Governor and no locked
timing; the admin wallet adjusts everything directly. The token is a prelaunch stand-in (`pNTI`) until the real
$NTI launches on Pons.

## Launch in one command

Once the wallets are funded and `.env.mainnet` is filled, nothing else is manual:

```powershell
uv run --directory services python ../infra/scripts/mainnet_launch.py        # rehearsal: preflight + deploy simulation
uv run --directory services python ../infra/scripts/mainnet_launch.py --go   # the launch
```

`--go` runs preflight, deploy, SDK wiring (plus `INDEXER_START_BLOCK`), the on-chain audit, basket setup, Sourcify
and Blockscout verification, commit and push of the manifest, the VPS cutover (database switch, `.env` switch, PM2
restart, token discovery seeded over the last 2 million blocks) and the Vercel switch, then audits again. Every step
is idempotent: after a failure fix the cause and resume with `--go --from <step>`. Sections 1 to 3 below describe
what each step does and how to run it alone.

What goes live with it: the oracle, staking, the Heatmap and Radar (token discovery runs by itself), narrative
markets (anyone can open one once an epoch is final), grants (the keeper opens rounds when fees fund them) and the
**RWA and Memecoin baskets** (`SetupBasketsMainnet`, config in `config/mainnet_baskets.json`: it keeps only tokens whose Uniswap V3 WETH pool passes the basket's own liquidity and TWAP checks, and a basket is not created with fewer than three). Checked on a mainnet fork: RWA holds 8 tokenized stocks (NVDA, SPY, COIN, SPCX, META, GOOGL, AAPL, TSLA), Memecoin holds PONS (40%), Artificial Inu (30%) and PEPE (30%), capped at 0.5 ETH of TVL because two of those pools hold only about 3 ETH on the WETH side (A Meme Coin, 0.5 ETH deep, was taken out; the on-chain `minPoolLiquidity` compares raw pool liquidity units, not ETH, so depth is shown per token on the basket page and judged by hand); deposits and redeems round-trip through the real pools (about 1% lost to fees and slippage). Most Pons meme tokens trade on Uniswap v4, which has no built-in price oracle, so they cannot enter a basket until the contract supports a v4 price source (an upgrade, not a redeploy). Baskets for other narratives are added by listing tokens in that file and rerunning `--from baskets`. KOL wallet registration is hidden on mainnet: it needs a verified X handle and no automated proof exists yet, so it stays a testnet feature.

## What you prepare

| Item | Notes |
| --- | --- |
| 6 new wallets | **deployer** (also admin and pauser), **operator**, **keeper** (also attester), **validators 1 to 3**. Only the first three send transactions and need gas: about 0.002 ETH on the deployer (the whole suite costs roughly 0.0006 ETH to deploy at today's 0.02 gwei, from `eth_estimateGas` on mainnet), 0.003 ETH on the operator (normal use is about 0.0002 ETH a day, so a couple of weeks) and 0.001 ETH on the keeper. About 0.006 ETH in total; Telegram alerts at 0.001 ETH, refill then. A spike in Ethereum data fees would drain the operator faster. Keep operator and keeper separate: they send transactions at the same time and would collide on nonces |
| RPC for logs | Free is enough. The Alchemy free tier allows `eth_getLogs` over only 10 blocks, so the indexer and discovery read logs through `https://robinhood.drpc.org` (public, no key, 100 blocks per call, about 1.3 calls per second): `INDEXER_RPC_URL`, `DISCOVERY_RPC_URL`, `INDEXER_BATCH_BLOCKS=90`, `DISCOVERY_LOG_RANGE=90`. Plain reads stay on the Alchemy key. At 10 blocks per second the indexer needs one call every 10 seconds, so a free tier is not the limit. A paid plan only makes the first catch-up faster |
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

## 2b. Verify the source (Sourcify exact match, Blockscout)

Right after the deploy, from the same commit that deployed:

```powershell
python infra/scripts/verify_contracts.py --chain 4663 --broadcast contracts/broadcast/DeployMainnet.s.sol/4663/run-latest.json --blockscout https://robinhoodchain.blockscout.com
```

It verifies every contract of the deploy (each implementation, each proxy, the basket implementation, the token and
both buyback adapters) on **Sourcify** and only passes when Sourcify reports `exact_match` for both the creation and
the runtime bytecode. For **Blockscout** it tries the API; Blockscout instances sit behind a bot challenge that
refuses scripts, so it also writes a Standard JSON input per contract to `contracts/verify/4663/` for the explorer's
"Verify & Publish > Standard JSON input" form (compiler 0.8.26, EVM cancun, optimizer on, 200 runs). Blockscout also
recognises ERC-1967 proxies by itself, so once the implementation is verified the proxy shows the real ABI.

Exact matches rest on a reproducible build, which is set in `contracts/foundry.toml`: solc 0.8.26, optimizer 200 runs,
`via_ir`, EVM cancun, the metadata hash kept in the bytecode (`bytecode_hash = "ipfs"`), and OpenZeppelin 5.4.0
vendored under `contracts/lib` so source paths are clean. Do not change any of it between the deploy and the
verification, and verify upgrades the same way (the script reads any broadcast file). The upgrade flow was proven
this way on testnet: implementation, proxy and the upgraded implementation all reported `exact_match` on Sourcify.

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

## Upgrades (fix or change a contract without redeploying it)

Every protocol contract is an ERC-1967 proxy with UUPS upgrade logic: the address, the storage (stakes, markets,
roles) and every integration stay as they are while the code behind them is replaced. Baskets are beacon proxies:
one call upgrades all of them. The manifest lists the proxies (the addresses everything uses) and, next to them, the
current implementations (`stakingImpl`, ...). Only the admin wallet can upgrade, and there is no delay.

```powershell
$env:UPGRADE_TARGET = "staking"                 # or registry, oracleCommit, dispute, ..., or "baskets"
$env:UPGRADE_ARTIFACT = "Staking.sol:Staking"   # the new code, after you edit contracts/src
# optional: $env:UPGRADE_CALLDATA = "0x..."     # a reinitializer for new storage
forge script contracts/script/UpgradeMainnet.s.sol:UpgradeMainnet --root contracts --rpc-url $env:RPC_URL_MAINNET --private-key $env:DEPLOYER_PRIVATE_KEY --broadcast
uv run --directory services python ../infra/scripts/mainnet_verify.py --env-file ../.env.mainnet   # warns that an implementation changed
```

Rules that keep an upgrade safe:
* **Never reorder, retype or delete a storage variable.** Add new variables at the end (each contract reserves a
  50 slot gap for that) and run `forge inspect <Contract> storage-layout` on the old and new versions.
* The new code must still be a UUPS implementation (`proxiableUUID`): the proxy refuses an upgrade to anything else,
  so a typo cannot brick it. It must keep the `_authorizeUpgrade` function, otherwise the next upgrade is impossible.
* Test the new version on testnet first by deploying it there the same way (`DeployTestnet`) and upgrading.
* After upgrading, update the ABIs the web and indexer use if functions or events changed, and redeploy them.

The buyback adapters are not proxies (they hold no state): to change one, deploy the new adapter and call
`registry.setBuybackAdapter`.

## Operations

* Pause and unpause: the pauser wallet calls `pause()` / `unpause()` on the contract that misbehaves.
* Parameter changes (timings, config, roles) and **contract upgrades**: the deployer wallet, directly. Keep that key safe: whoever holds it can replace any contract's code.
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
