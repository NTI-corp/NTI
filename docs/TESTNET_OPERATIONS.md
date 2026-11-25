# NTI testnet operations (Robinhood Chain 46630)

How the live testnet pipeline runs, why it is built this way, and what to do when it stops. Everything here
was verified against the running system on 2026-11-25.

## 1. Processes (PM2 on the VPS, `infra/ecosystem.config.cjs`)

| App | Mode | Cadence | Job |
| --- | --- | --- | --- |
| `nti-fetcher` | cron | `0 3,7,11,15,19,23 * * *` WIB = every UTC epoch boundary (00, 04, 08, ...) | Scrape X timelines for the KOLs that are due this epoch, persist posts, engagement and one `fetch_cycle_runs` evidence row |
| `nti-oracle-operator` | **daemon** (`--loop 300`) | one run, then 5 minutes pause | Commit and finalize the oldest mature epoch that has complete fetch evidence |
| `nti-oracle-validators` | cron | every 20 minutes | Dispute watcher |
| `nti-keeper` | cron | every 5 minutes | Settle markets, rebalance baskets, buyback, radar alerts |
| `nti-monitor` | cron | every 30 minutes | Epoch lateness, wallet balances, fetch failures; Telegram alerts with a 6 hour de-dup window |
| `nti-indexer` | daemon | continuous | Chain events to Supabase |
| `nti-discovery` | cron | every 5 minutes | Token discovery for Radar and Heatmap |
| `nti-kol-harvest` | cron | daily | Grow and maintain the KOL universe (see section 3) |
| `nti-purge` | cron | daily | Purge old post bodies |

### Why the operator is a daemon, not a cron job

A commit prepares the whole 7 day window: it reads tens of thousands of posts, classifies the new ones with the
LLM and collects three validator signatures. On a large epoch that takes far longer than the 20 minute cron
slot, and PM2's `cron_restart` kills a process that is still running. The log showed 192 `KeyboardInterrupt`
traces and the oracle stalled three epochs behind.

* `python -m nti_oracle --role operator --loop 300` runs one full operator pass, sleeps, and repeats. A pass is
  never interrupted by a schedule.
* A deploy moves the checkout to a new commit. The daemon notices **between** passes, exits, and PM2
  (`autorestart`) starts it on the new code. `deploy-vps.sh` therefore starts the operator only when it is not
  already online and never kills it mid-commit.
* A failed pass is logged and retried on the next loop; it does not stop the daemon.

### Classification throughput

`live_inputs.prepare_engine_posts` classifies unclassified posts in chunks of 150 (batches of 30 per LLM call).
Chunks are processed by `CLASSIFIER_CONCURRENCY` workers (default 4), each with its own pipeline, and every
finished chunk is upserted immediately. A restart loses at most the chunks in flight. Measured: about 150
posts/minute sequentially, about 600 posts/minute with 4 workers. Raise the value only while the provider
returns no 429s.

Posts whose body was purged cannot be classified. They are excluded from the window (the commit reports them
as `missing_classification`), so a catch-up after downtime commits with a smaller, fully classified post set.

## 2. Fetch capacity and evidence

* 8 X accounts, 3 primary lanes (`secrets/x_accounts.json`), no dedicated validator pool yet. Each account is
  budgeted at about 800 requests/day.
* KOLs are polled by tier: tier 1 every epoch, tier 2 every 2nd, tier 4 every 4th. The retier job caps tier 1
  at 250 KOLs and tier 2 at 400 (ranked by authority) so the daily request budget is never exceeded. Without
  the cap the harvest produced 1,142 tier 1 KOLs and epoch 124691 failed 1,025 of 1,189 fetches with
  `AccountPoolExhaustedError`.
* The operator refuses to commit an epoch unless `fetch_cycle_runs` has a `collecting` run for it with at least
  95% success (`FETCHER_MIN_SUCCESS_RATIO`), no omitted accounts and a finish time inside the epoch freshness
  window. An epoch without such evidence becomes `incomplete` on chain. That is intentional: a thin scrape must
  not publish an official index.

### Automatic fetch recovery

A KOL that fails to fetch (rate-limited or exhausted account) is retried inside the same cycle instead of
costing the epoch. After the first pass each lane waits `FETCHER_RECOVERY_WAIT_SECONDS` (default 960, just over
X's 15 minute window) and retries its failed KOLs, up to `FETCHER_RECOVERY_ROUNDS` times (default 3), and never
past `FETCHER_RECOVERY_DEADLINE_SECONDS` (default 9000, 2.5 hours) from the start of the cycle. The recorded
evidence counts the final result, so a recovered epoch commits normally. Failures that persist (for example a
daily budget that is really spent) still mark the epoch `incomplete`; the tier caps exist to prevent that.

## 3. KOL universe

`nti_discovery.kol_harvest` (daily, guarded to run once per ~20 hours):

1. imports the curated `data/kols.json` into Supabase (one source of truth);
2. refreshes stale profiles (followers, display name, avatar), deactivating accounts that no longer exist;
3. retiers by real posting frequency within the caps above;
4. searches X per narrative and adds new KOLs that pass the numeric gates, at a speed that follows the failure
   ratio of the last fetch cycles (pause above 30%, slow above 10%).

The universe is capped at 1,500 active KOLs.

## 4. Web

Vercel functions run in **hnd1 (Tokyo)**, next to the Supabase database (ap-northeast-1). They previously ran
in iad1 and every page paid a transatlantic round trip per database call: `/oracle` went from 1.8 s to 0.3 s,
`/stake` from 2.3 s to 0.3 s and `/markets` from 1.9 s to 0.5 s (server time to first byte).

## 5. Health and recovery

```bash
uv run --directory services python ../infra/scripts/testnet_healthcheck.py --env-file ../.env --web https://nti-nine.vercel.app
```

| Symptom | Check | Fix |
| --- | --- | --- |
| Oracle behind, operator logs `waiting_for_fresh_fetch_evidence` | `fetch_cycle_runs` for the epoch: status, `accounts_failed`, `failure_types` | If the cycle is `incomplete` the epoch cannot be recovered; the next complete epoch continues the series |
| Operator online for a long time with no output | `classifications` row count is rising | Normal during catch-up; do not restart it |
| `AccountPoolExhaustedError` in fetch failures | accounts in `data/state/accounts.db` (locks per endpoint) | Lower tier caps or add accounts |
| Monitor silent during an incident | `data/state/monitor_alerts.json` | Alerts repeat at most once per 6 hours per problem |

## 6. Known limits (testnet)

* Only 8 X accounts and no validator pool, so independent omission checks stay disabled
  (`VALIDATOR_OMISSION_CHECK=0`). Mainnet needs at least 3 dedicated validator accounts.
* An epoch whose fetch stays below 95% after all recovery rounds is still published as `incomplete`.
* The classifier in production is MiMo (`MIMO_MODEL`); the Gemini adapter exists but is not on the live path.
