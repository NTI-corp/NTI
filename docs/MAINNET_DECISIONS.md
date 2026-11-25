# Mainnet decisions

Each decision names what was chosen, why, and what would change it. They were made on 2026-11-25 from the
code, the running testnet and the provider documentation linked at the end. Where a choice is a trade-off the
alternative is stated so it can be revisited without re-deriving it.

## 1. Topology: a separate stack, on its own host

**Chosen.** Mainnet gets its own Supabase project, its own checkout (`/home/ubuntu/apps/nti-mainnet`), its own
PM2 apps (`*-mainnet` suffix), its own Vercel project and its own X accounts. The recommended host is a new VPS
with at least 2 vCPU and 4 GB RAM.

**Why.** The Supabase tables have no `chain_id` column, so a shared database would mix testnet and mainnet
epochs. The testnet VPS has 2 GB of RAM at 73% use with the operator alone allowed 600 MB; a second stack
would push it into swap during classification. Separate hosts also keep mainnet hot keys away from a machine
that runs experimental code.

**Revisit if** cost matters more than isolation: `NTI_NETWORK=mainnet` and `APP_DIR` already allow two stacks
on one larger host.

## 2. Oracle configuration: launch on config v1

**Chosen.** `INITIAL_CONFIG_HASH` is the canonical hash of `config/nti.v1.json`
(`0x07acec1d77949027e6ba95a4ec7b43ce380fb70efd317e79d0f024e4afc8c297`) and `ORACLE_GENESIS_TIMESTAMP=0`.

**Why.** v1 is what the live testnet has run for days (final epochs 124687 to 124693 and later). The draft
`config/nti.testnet.v2.json` (observation window, new engine version) has only unit tests behind it. A
mainnet index must be produced by calculation that has already survived real data. Genesis 0 keeps epochs on
UTC multiples of 4 hours, which every service assumes (`epoch = unix // 14400`).

**Revisit.** Soak v2 on testnet; once accepted, adopt it on mainnet by governance (`setConfig(hash, 10,
effectiveEpoch)`), which starts a new series with provenance.

## 3. Roles and keys

**Chosen.** Eight distinct addresses: deployer, operator, keeper, attester, three validators, and the pauser
(a Safe, 2 of 3 minimum, 3 owners minimum). The preflight refuses duplicates, an EOA pauser, a Safe below 2/3
and a private key that does not derive to its role address. The deployer key never goes to the VPS.

**Why.** A shared key turns one compromise into several roles. The Safe can pause and unpause but cannot
change parameters, so a lost Safe cannot rewrite the protocol (the worst case is a frozen or unfrozen contract).

## 4. Admin rights end up with the Timelock, after a soak

**Chosen.** `DeployMainnet` leaves the deployer as admin everywhere and freezes the safety timings in the same
transaction batch. `HandoverMainnet` later moves `DEFAULT_ADMIN_ROLE` on ten contracts to the 48 hour Timelock,
removes the deployer from the Timelock, and starts a two-step transfer of the registry to the Safe.

**Why not at deploy.** After the handover nobody can fix anything except through a passed governance proposal
(4% quorum of staked $NTI, 3 day vote). Until enough stake exists that path is not available, so the deployer
keeps the keys for the soak and the script enforces the preconditions: token attached, registry frozen, all
four timings locked, governor registered as proposer and canceller.

**Revisit.** Hand over once quorum is reachable, and keep the 48 hour delay: it is the window users have to
react to a proposal.

## 5. Safety windows and caps

**Chosen.** Timings are frozen at deploy at the production values: 2 hour dispute window, 1 hour commit delay,
6 hour dispute resolution, 7 day unstake cooldown, 48 hour market settle timeout. Caps stay at the contract
defaults (5 ETH per market pool, 20 open markets, 50 ETH global TVL, 10 ETH per basket) and are raised only by
governance after weeks without incident.

**Why.** Testnet shows that short windows are what made fast iteration possible, and exactly why they must not
survive to mainnet: a frozen window cannot be shortened by a compromised key.

## 6. RPC: paid primary, second provider, public endpoint last

**Chosen.** `RPC_URL_MAINNET` is an ordered, comma-separated list: a paid primary, a second paid provider,
then the official public endpoint `https://rpc.mainnet.chain.robinhood.com`. The Python services fall over to
the next URL on timeouts, 5xx and rate limits; a JSON-RPC error (for example a revert) is never retried.
`INDEXER_RPC_URL` must be a provider that serves `eth_getLogs`, and `INDEXER_BATCH_BLOCKS` defaults to 500.

**Why.** Blocks on 4663 are about 0.1 s, so a 10 block log limit covers one second. Provider documentation:
Alchemy's free tier is capped at 10 blocks and paid plans are not; Dwellir allows 500 blocks on Developer and
10,000 on Growth; the public endpoint is rate limited and documented as not for production. The preflight
probes `eth_getLogs` at 10, 100, 500 and 2000 blocks and fails when the indexer batch size does not fit.

**Recommended.** Alchemy pay-as-you-go as primary, Chainstack or Dwellir as second. Confirm the plan limits
in the provider dashboard before buying: the documentation does not state every number.

## 6b. The indexer starts at the deploy block

`DeployMainnet` records `deployedAtBlock` in the manifest and `mainnet_wire.py` prints it as
`INDEXER_START_BLOCK`, so a fresh indexer never scans history that cannot contain NTI events.

## 7. Independent omission verification is mandatory

**Chosen.** On chain 4663 the operator refuses to prepare a commit unless `VALIDATOR_OMISSION_CHECK=1`, and the
preflight requires at least 6 primary lane accounts and 3 dedicated validator accounts.

**Why.** Without it the operator alone decides which accounts were scraped. The evidence gate (95% of due KOLs)
proves coverage, not honesty; the validators' own re-fetch of a sample is what lets someone other than the
operator catch a biased scrape. Testnet keeps it off because it has no spare accounts.

## 8. KOL universe: seeded from testnet, then maintained automatically

**Chosen.** `infra/scripts/copy_kol_universe.py` copies active KOLs (profile, tier, narratives) into the
mainnet database once. The daily `nti-kol-harvest` job then runs exactly as on testnet: profile refresh,
retiering with the tier caps (250 tier 1, 400 tier 2) and growth up to 1,500.

**Why.** Building 1,500 KOLs from empty takes about ten days at 150 per day, and those days would produce a
thin index. The membership of every epoch is recorded in its fetch evidence and dataset, so the universe is
auditable even though it changes.

**Revisit.** If the community wants membership decided by governance, `ConfigRegistry.setKolSetHash` already
exists; the harvest would then propose instead of write.

## 9. Classifier and data storage

**Chosen.** MiMo (`mimo-v2.6-pro`) as on testnet, 4 concurrent workers. Datasets are mirrored to a public
Supabase Storage bucket in the mainnet project (zero cost, public URL, hash-addressed).

**Why.** It is what the live system uses and what its parameters were tuned on. Permanent storage (Irys or
Arweave) stays a launch-checklist item: the hash on chain already makes the dataset verifiable, and the bucket
makes it retrievable; permanence is added without changing the format.

## 10. Alerts

**Chosen.** Telegram is required (the preflight fails without it) and the monitor's low-ETH threshold on
mainnet is 0.05 ETH. The monitor already alerts on late epochs, fetch failures and low balances, de-duplicated
over six hours.

## 11. Deployment responsibilities

| What | Where it runs | Why |
| --- | --- | --- |
| Contracts (deploy, attach token, handover) | Your machine, `forge script` | The deployer key never touches CI or a server |
| Data plane | Mainnet VPS, via the manual workflow `Deploy NTI mainnet services` | Gated by a GitHub environment and by the on-host preflight |
| Web | Separate Vercel project, `NEXT_PUBLIC_CHAIN_ID=4663`, region `hnd1` | Same code, different environment; Tokyo matches the database |
| Checks | `mainnet_preflight.py`, `mainnet_verify.py`, `mainnet_wire.py --check` in CI | Read-only |

## Sources

* [Alchemy: Robinhood Chain eth_getLogs](https://www.alchemy.com/docs/chains/robinhood-chain/robinhood-chain-api-endpoints/eth-get-logs.md)
* [Dwellir: Robinhood Chain RPC](https://www.dwellir.com/docs/robinhood.md)
* [Chainstack: Robinhood eth_getLogs](https://docs.chainstack.com/reference/robinhood-eth-getlogs)
* [Bitquery: Robinhood Chain RPC, chain id 4663](https://docs.bitquery.io/docs/blockchain/robinhood/robinhood-chain-rpc-chain-id/)
