# Mainnet decisions

What was chosen for the mainnet launch, why, and what would change it. Most of these follow direct instructions
from the owner on 2026-11-25; the rest were decided from the code, the running testnet and provider
documentation (sources at the end).

## 1. One stack, switched over (owner decision)

**Chosen.** The existing VPS, Supabase project, Vercel project, X accounts and Alchemy account move from testnet
to mainnet in one cutover (`infra/scripts/cutover_to_mainnet.py`). Only the wallets are new.

**Consequences, accepted.** The Supabase tables have no `chain_id`, so the chain-specific tables are exported to a
backup folder and emptied; the testnet site stops being served; the VPS (2 GB RAM) runs one stack, not two. Kept,
because they do not depend on the chain: KOLs, posts, engagement, classifications and fetch evidence (reusing them
saves weeks of data and LLM cost).

**Revisit if** a public testnet demo must keep running: that needs a second database and host.

## 2. No Timelock, no Governor, no locked timings (owner decision)

**Chosen.** `DeployMainnet` does not deploy the Timelock or the Governor and does not call `lockTimings`. The
deployer wallet is the admin of every contract and changes parameters directly. Windows are short: dispute window
5 s, dispute resolution 10 min, unstake cooldown 10 s. The 1 hour commit delay stays: it is the time the X scrape
needs before an epoch can be committed, not a safety timer.

**Consequences, accepted.** One key can change parameters and grant roles; there is no
on-chain delay for users to react to a change. The pauser wallet can pause and unpause. A 5 second dispute window
means challenges are practically impossible, so the oracle is trusted rather than optimistic. Protect the deployer
key; consider moving it to a hardware wallet.

## 2b. Upgradeable contracts (owner decision)

**Chosen.** All eleven protocol contracts are UUPS proxies (OpenZeppelin 5.4 upgradeable). A bug or a change is
fixed by deploying new logic and pointing the proxy at it; addresses, storage and integrations stay. Baskets are
beacon proxies created by the factory, so one transaction upgrades all of them. Implementations disable their own
initializers. `UpgradeMainnet.s.sol` performs an upgrade, and the manifest records each implementation.

**Why UUPS.** Upgrade logic lives in the implementation (cheaper proxies, one standard) and is guarded by the admin
role, which `NTIRegistry` ties to its owner. The proxy refuses an implementation that is not itself UUPS-capable, so
a mistaken upgrade cannot lock the proxy forever.

**Consequences, accepted.**
* Whoever holds the admin key can replace any contract's code instantly, including the code that holds staked
  tokens and market pools. Without a Timelock nothing stands between a stolen key and a malicious upgrade.
  The admin key therefore deserves a hardware wallet. Making a contract immutable again later is possible by
  upgrading to a version whose `_authorizeUpgrade` always reverts.
* Storage layout discipline is now a rule for every change (see the upgrade section in `MAINNET.md`).
* Deployment costs a little more (a proxy per contract) and every call pays a small delegatecall overhead.
* The buyback adapters stay plain contracts: they hold no state and are swapped through the registry.

**Testing.** `Upgradeability.t.sol` proves that the admin can upgrade and state survives, nobody else can, an
initialized proxy or a bare implementation cannot be initialized again, an upgrade to a non-UUPS contract is
refused, and an upgrade of the basket beacon changes every basket. All 54 existing tests run against proxies.

## 3. Prelaunch token, swapped at launch (owner decision)

**Chosen.** `NTIPrelaunchToken` (`pNTI`, 1B supply, 10k per day faucet) is deployed and set in the registry; the
registry is not frozen. When the real $NTI launches on Pons, `SwapTokenMainnet` points the registry at it
(optionally freezing it).

**Constraint.** `NTIRegistry.setNti` reverts while stake is locked, so everyone must unstake before the swap. The
cooldown is 10 seconds, so this is quick. Balances of `pNTI` simply stop mattering.

## 4. No audit requirement (owner decision)

Removed as a launch gate. The substitutes remain: 54 Foundry tests including the deploy and swap scripts, the
Slither triage in `MAINNET.md`, and conservative contract caps (5 ETH per market pool, 20 open markets, 50 ETH
global TVL, 10 ETH per basket).

## 5. Oracle configuration: config v1

**Chosen.** `INITIAL_CONFIG_HASH` is the canonical hash of `config/nti.v1.json`
(`0x07acec1d77949027e6ba95a4ec7b43ce380fb70efd317e79d0f024e4afc8c297`); `ORACLE_GENESIS_TIMESTAMP=0` keeps epochs on
UTC multiples of 4 hours, which every service assumes.

**Why.** v1 is what the testnet has run for days. The draft `config/nti.testnet.v2.json` has only unit tests behind
it. Adopt v2 later with `setConfig(hash, 10, effectiveEpoch)` from the admin wallet once it has soaked on testnet.

## 6. RPC: Alchemy now, paid log range needed

**Findings (probed live on 4663 on 2026-11-25).**

| Endpoint | Result |
| --- | --- |
| Alchemy (the existing key) | works on mainnet; free tier allows `eth_getLogs` over 10 blocks only |
| PublicNode `robinhood-rpc.publicnode.com` | plain reads work; `eth_getLogs` beyond 10 blocks returns 403 |
| `rpc.mainnet.chain.robinhood.com` | no response from here (TLS error) |
| Blockscout | behind a Cloudflare challenge for scripted calls |

**Chosen.** Alchemy as primary. Blocks are about 0.1 s, so a 10 block limit is one second of chain: the indexer
would need about a request per second and exhaust the free allowance, never catching up. Upgrade the same key to
pay-as-you-go (no new account, no new key); with `INDEXER_BATCH_BLOCKS=2000` the indexer makes a few requests a
minute. The Python services also accept a comma-separated fallback list (`RPC_URL_MAINNET=primary,fallback`). The
preflight (services stage) probes the real limit and fails with this explanation instead of letting the indexer
fall behind silently.

## 7. Independent omission verification: off until accounts exist

**Chosen.** Optional (`VALIDATOR_OMISSION_CHECK`), not enforced. It needs 3 dedicated validator X accounts and the
existing 8 are all in use for scraping. The 95% fetch-evidence gate still proves coverage; what is missing is a
second pair of eyes on which accounts were scraped. The preflight warns.

## 8. Roles: six wallets

**Chosen.** Deployer (admin and pauser), operator, keeper (also the attester), and three validators. Validators and
the attester only sign messages off-chain (`sign_attestation` never sends a transaction; the operator submits the
attestations), so they need no gas. Deployer, operator and keeper send transactions. The contract needs three
distinct validators, the operator must not share a validator key, and operator and keeper stay separate because
they send at the same time and would collide on nonces. The preflight enforces exactly that and warns when the
pauser is the deployer.

## 9. Cutover mechanics

* The operator on a chain that has never committed starts at the newest mature epoch (otherwise it would scan more
  than a hundred thousand epochs from epoch 1). The contract accepts a first commit at any epoch.
* The host `.env` is changed only for chain-specific keys; the old file is kept beside it.
* `deploy-vps.sh` runs the services preflight automatically when the host `.env` says `CHAIN_ID=4663`.

## Sources

* [Alchemy: Robinhood Chain eth_getLogs](https://www.alchemy.com/docs/chains/robinhood-chain/robinhood-chain-api-endpoints/eth-get-logs.md)
* [Dwellir: Robinhood Chain RPC](https://www.dwellir.com/docs/robinhood.md)
* [Chainstack: Robinhood eth_getLogs](https://docs.chainstack.com/reference/robinhood-eth-getlogs)
* [Bitquery: Robinhood Chain RPC, chain id 4663](https://docs.bitquery.io/docs/blockchain/robinhood/robinhood-chain-rpc-chain-id/)

## Heatmap: curated projects (2026-11-26)

The Builder Heatmap counts indexed tokens (at least 1 ETH liquidity and 10 transactions in 7 days) plus rows of the
`projects` table marked `curated` and `active`. Nothing writes that table automatically, so it was empty.

Only projects that can be proven live on Robinhood Chain 4663 are listed, by bytecode and a read of the contract:

| Narrative | Project | Proof |
|---|---|---|
| 8 DeFi | Uniswap V3 | factory `0x1f7d7550b1b028f7571e69a784071f0205fd2efa` has code (24.5 KB) and creates the basket pools |
| 4 Stablecoins | USDG (Global Dollar) | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` has code, symbol USDG, 6 decimals, 640M supply |

Named by The Block's launch article (2026-07-01) but not listed, because it gives no addresses and does not say they
run on this chain: Lighter (perps), Rialto, 1inch, Arcus, Pleiades (AMMs and stock-token venues), Morpho and Robinhood
Earn (USDG lending), Chainlink (oracle). Add one only after its contract address on 4663 is known and checked.

Narratives with no known project (AI Agents, Perp DEX, Prediction Markets, Privacy / ZK, DePIN, Gaming) show NO PROJECT
DATA and no score, and are left out of "Highest Opportunity", instead of ranking first on a count of zero.

Add a row with the service key, for example `POST /rest/v1/projects` with `{"name": ..., "narrative_id": ..., "curated":
true, "active": true}`.
