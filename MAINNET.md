# NTI Mainnet Runbook (Robinhood Chain 4663)

Status: **code complete, not deployed.** Nothing here has been broadcast to mainnet. The contracts, scripts,
checks, services configuration and web are ready; what remains is yours: the wallets and gas, the Safe, the
accounts and keys, the hosts, and the go-ahead. Why each choice was made: `docs/MAINNET_DECISIONS.md`. Evidence
required before launch: `docs/MAINNET_LAUNCH_CHECKLIST.md`. How the live pipeline behaves and how to recover it:
`docs/TESTNET_OPERATIONS.md`.

## What you prepare

| Item | Notes |
| --- | --- |
| 8 addresses | deployer, operator, keeper, attester, validators 1 to 3 (fresh keys, never reused from testnet), and the **Safe** (2 of 3 minimum, 3 owners minimum) as pauser. Fund deployer with at least 0.01 ETH and every hot wallet with at least 0.01 ETH (alerts fire at 0.05 on mainnet) |
| Mainnet VPS | Ubuntu 22.04 or 24.04, 2 vCPU, 4 GB RAM. `ssh ubuntu@host 'bash -s' < infra/scripts/bootstrap-vps.sh` installs everything |
| Supabase project (new) | Never the testnet project. Copy URL, anon key, service key and the database URL |
| Vercel project (new) | Root `apps/web`, env `NEXT_PUBLIC_CHAIN_ID=4663` and the secrets from `infra/mainnet.env.example` |
| RPC | Paid primary (Alchemy pay-as-you-go is the recommendation), a second provider, and the public endpoint as last fallback |
| X accounts | At least 6 primary lane accounts and 3 dedicated validator accounts in `secrets/x_accounts.json` on the VPS |
| Keys and tokens | MiMo, Telegram bot and chat id, WalletConnect project id, a 32+ character `SIWE_SESSION_SECRET` |
| GitHub | Secrets `MAINNET_VPS_HOST`, `MAINNET_VPS_USER`, `MAINNET_VPS_SSH_KEY`; an Environment named `mainnet` with required reviewers |
| $NTI contract address | Only needed at step 7 |

## 1. Environment

Copy `infra/mainnet.env.example` to `.env.mainnet` on your machine (outside git) and fill it in. Print the
canonical config hash and check everything that does not need the services host:

```powershell
uv run --directory services python ../infra/scripts/mainnet_preflight.py --env-file ../.env.mainnet --stage deploy
```

It checks the chain id, bytecode at every external dependency, the eight role wallets (distinct, funded, keys
derive to addresses), the Safe (threshold and owners), the config hash, `ORACLE_GENESIS_TIMESTAMP=0` and the
token if already known. Fix every FAIL.

## 2. Simulate, then deploy the contracts

`DeployMainnet.s.sol` refuses to run unless the chain is 4663, the broadcaster equals `DEPLOYER_ADDRESS` and
every external dependency has bytecode. It never deploys the test token, freezes the safety timings, reads the
whole suite back and reverts if any role, timing or wiring is wrong, and only then writes
`contracts/deployments/4663.json` (including `deployedAtBlock`).

```powershell
$env:PATH = "$HOME\.foundry\bin;$env:PATH"
# simulate (no --broadcast); review the printed addresses and gas
forge script contracts/script/DeployMainnet.s.sol:DeployMainnet --root contracts --rpc-url $env:RPC_URL_MAINNET --sender $env:DEPLOYER_ADDRESS
# broadcast after sign-off
forge script contracts/script/DeployMainnet.s.sol:DeployMainnet --root contracts --rpc-url $env:RPC_URL_MAINNET --private-key $env:DEPLOYER_PRIVATE_KEY --broadcast --slow
```

A simulation also writes the manifest: delete `contracts/deployments/4663.json` before the real run.

## 3. Wire the manifest into the SDK and audit it

```powershell
python infra/scripts/mainnet_wire.py          # rewrites packages/sdk/src/addresses.ts, prints INDEXER_START_BLOCK
pnpm build:sdk
uv run --directory services python ../infra/scripts/mainnet_verify.py --env-file ../.env.mainnet --phase deployed
```

Commit `contracts/deployments/4663.json` and the SDK change, then push. CI runs `mainnet_wire.py --check`, so the
SDK can never drift from the manifest. `mainnet_verify.py` must report 0 failures: roles, locked timings
(2 h dispute window, 1 h commit delay, 7 d cooldown, 6 h resolution, 48 h settle timeout), config hash, Timelock
delay and who holds admin rights.

## 4. Data plane

On your machine, against the mainnet Supabase project:

```powershell
uv run --directory services --with "psycopg[binary]" python ../infra/scripts/apply_migrations.py --database-url $env:DATABASE_URL
# seed the KOL universe from testnet (configuration only: no posts, no epochs)
python infra/scripts/copy_kol_universe.py
```

Copy `.env` (from the services section of the template, without the deployer key) and `secrets/x_accounts.json`
to `/home/ubuntu/apps/nti-mainnet` on the VPS, set `INDEXER_START_BLOCK` and `RPC_URL_MAINNET` (comma-separated
fallbacks are allowed here). Then run the GitHub workflow **Deploy NTI mainnet services** (type
`DEPLOY_MAINNET_SERVICES`). The deploy script runs the services preflight on the host and starts nothing when it
fails; it checks a log-capable RPC, a migrated and empty database, the X pool including the validator accounts,
alerting and secrets.

Result: `nti-*-mainnet` PM2 apps (indexer, fetcher, operator daemon, validators, keeper, monitor, discovery,
KOL harvest, purge) run beside nothing else. The operator refuses to commit unless
`VALIDATOR_OMISSION_CHECK=1`.

## 5. Web

Deploy the separate Vercel project with `NEXT_PUBLIC_CHAIN_ID=4663`, `SUPABASE_*`, `SIWE_SESSION_SECRET`, the
WalletConnect id and `RPC_URL_MAINNET`. Until the registry is frozen the app shows a "Pre-freeze registry"
banner and staking, markets and disputes stay closed.

## 6. Soak

Watch Telegram and the first epochs: commits and finalization on schedule, `nti-monitor` silent, the keeper
tasks `ok`. The checklist asks for at least 6 consecutive final epochs with no fetch failures before anything is
announced. Conservative caps stay at their defaults.

## 7. Attach $NTI (when the contract address exists)

Check it on the explorer first: ERC-20, 18 decimals, 1B supply, Pons version, graduation phase, creator tax.
Send a small amount in and out to detect a transfer tax (Staking and Dispute measure balance deltas, so a tax
does not break accounting). Then:

```powershell
$env:NTI_TOKEN_ADDRESS = "0x..."
# optional, only when the token's pool is live: $env:BUYBACK_ADAPTER = <V3 or V4 adapter from the manifest>
forge script contracts/script/AttachTokenMainnet.s.sol:AttachTokenMainnet --root contracts --rpc-url $env:RPC_URL_MAINNET --private-key $env:DEPLOYER_PRIVATE_KEY --broadcast
uv run --directory services python ../infra/scripts/mainnet_verify.py --env-file ../.env.mainnet --phase attached
```

The script refuses a token that is not 18 decimals with the expected supply, a registry that is already
frozen, or a buyback adapter that is not in the manifest. It sets the token, optionally the adapter, and
freezes the registry. A v2 token still on its bonding curve keeps the 40% buyback share parked in FeeRouter
until you set an adapter later (`registry.setBuybackAdapter`, no freeze needed). Retune `RADAR_MIN_STAKE`, the
dispute bond, the validator minimum stake and the tier discounts to the live price, then do one small
end-to-end pass with real $NTI: stake, unstake request, one tiny market, one grant round.

## 8. Hand over (after weeks without incidents, and enough stake for the 4% quorum)

**Irreversible.** Read `docs/MAINNET_DECISIONS.md` section 4 first.

```powershell
$env:HANDOVER_CONFIRM = "TRANSFER_ADMIN_TO_TIMELOCK"
$env:SAFE_ADDRESS = "0x..."
forge script contracts/script/HandoverMainnet.s.sol:HandoverMainnet --root contracts --rpc-url $env:RPC_URL_MAINNET --private-key $env:DEPLOYER_PRIVATE_KEY --broadcast
```

The script checks that the token is attached, the registry frozen, all four timings locked and the Governor
registered as proposer and canceller. It then moves admin rights on ten contracts to the Timelock, removes the
deployer from the Timelock and starts the registry transfer. The Safe must call `acceptOwnership()` on the
registry. Finish with `mainnet_verify.py --phase handed-over`: the deployer must hold nothing.

## Operations on mainnet

* Operator, keeper and validators use their own wallets; the monitor alerts below 0.05 ETH.
* Safe: `pause()` and `unpause()` on the contract that misbehaves (both need `PAUSER_ROLE`, which the Safe holds). Changing who holds it needs the Timelock after the handover.
* The testnet stack stays up as the public demo.
* Routine checks: `mainnet_preflight.py --stage services` on the host and `mainnet_verify.py` from anywhere.

## Known limits

* No independent audit yet. The substitutes are 54 Foundry tests including the mainnet scripts, fork-style
  tests, the Slither triage below and the conservative caps.
* Pons v1 tokens are not covered by discovery; `txs_7d` is a 24 hour lower bound.
* Dataset hashes live on chain and the files in the public Supabase bucket; permanent storage (Irys or Arweave)
  is optional and tracked in the checklist.
* Fetch capacity is bounded by X accounts. Each account is budgeted at about 800 requests per day; the tier
  caps keep the load below it (see `docs/TESTNET_OPERATIONS.md`).

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
