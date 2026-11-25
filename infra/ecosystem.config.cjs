/**
 * PM2 ecosystem for NTI. One file serves both networks:
 *
 *   testnet (default)   apps named nti-*          checkout /home/ubuntu/apps/nti
 *   NTI_NETWORK=mainnet apps named nti-*-mainnet  checkout /home/ubuntu/apps/nti-mainnet
 *
 * APP_DIR overrides the checkout path. Mainnet must run from its own checkout with its own .env, Supabase
 * project and X accounts (see docs/MAINNET_DECISIONS.md); a dedicated VPS is recommended, but the suffix and
 * directory keep two stacks apart if they ever share a host.
 *
 * Cron times are written for UTC epoch boundaries (00, 04, 08, 12, 16, 20 UTC) and shifted by the server's own
 * timezone, because PM2 evaluates cron expressions in local time. A WIB (UTC+7) host gets 3,7,11,15,19,23.
 */
const NETWORK = process.env.NTI_NETWORK === "mainnet" ? "mainnet" : "testnet";
const SUFFIX = NETWORK === "mainnet" ? "-mainnet" : "";
const APP_DIR =
  process.env.APP_DIR || (NETWORK === "mainnet" ? "/home/ubuntu/apps/nti-mainnet" : "/home/ubuntu/apps/nti");
const UTC_OFFSET_HOURS = -new Date().getTimezoneOffset() / 60;
const EPOCH_HOURS = [0, 4, 8, 12, 16, 20]
  .map((h) => (((h + UTC_OFFSET_HOURS) % 24) + 24) % 24)
  .sort((a, b) => a - b)
  .join(",");

const RUN = `${APP_DIR}/infra/scripts/run-with-env.sh`;

function app(name, dir, args, extra = {}) {
  return {
    name: `${name}${SUFFIX}`,
    cwd: `${APP_DIR}/${dir}`,
    script: RUN,
    args,
    autorestart: false,
    env: { APP_DIR, PYTHONUNBUFFERED: "1", NODE_ENV: "production" },
    ...extra,
  };
}

module.exports = {
  apps: [
    app("nti-indexer", "indexer", "node dist/index.js", {
      autorestart: true,
      max_memory_restart: "180M",
    }),
    app("nti-fetcher", "services", "uv run python -m nti_fetcher", {
      cron_restart: `0 ${EPOCH_HOURS} * * *`,
      max_memory_restart: "256M",
    }),
    // Daemon, not cron: a commit of a large epoch (thousands of posts to classify plus validator signing)
    // can take longer than any fixed schedule, and a cron restart would kill it mid-run. The loop pauses
    // 5 minutes between runs and is idempotent ("up_to_date" when nothing is due).
    app("nti-oracle-operator", "services", "uv run python -m nti_oracle --role operator --loop 300", {
      autorestart: true,
      restart_delay: 10000,
      max_memory_restart: "600M",
    }),
    // Idempotent: exits early when already attested. Every 20 minutes keeps attestations timezone-independent.
    app("nti-oracle-validators", "services", "uv run python -m nti_oracle --role validator", {
      cron_restart: "15,35,55 * * * *",
      max_memory_restart: "200M",
    }),
    app("nti-keeper", "services", "uv run python -m nti_oracle --role keeper", {
      cron_restart: "*/5 * * * *",
      max_memory_restart: "128M",
    }),
    app("nti-monitor", "services", "uv run python -m nti_oracle --role monitor", {
      cron_restart: "*/30 * * * *",
      max_memory_restart: "128M",
    }),
    // Pons launch/graduation scanner for Radar and Heatmap. Exits "skipped" on chains without Pons
    // (testnet), so it is safe to keep registered everywhere.
    app("nti-discovery", "services", "uv run python -m nti_discovery", {
      cron_restart: "*/5 * * * *",
      max_memory_restart: "128M",
    }),
    // Daily KOL universe upkeep: seed import, profile refresh, retiering and growth. Runs between fetch cycles
    // so scraper accounts are free. The 02:30 slot is in server-local time, between the 00 and 04 UTC cycles.
    app("nti-kol-harvest", "services", "uv run python -m nti_discovery.kol_harvest", {
      cron_restart: "30 2 * * *",
      max_memory_restart: "256M",
    }),
    app("nti-purge", "services", "uv run python -m nti_fetcher.purge", {
      cron_restart: "0 2 * * *",
      max_memory_restart: "128M",
    }),
  ],
};
