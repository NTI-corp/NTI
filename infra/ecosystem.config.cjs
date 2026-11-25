/**
 * PM2 ecosystem for NTI on the team VPS (ubuntu@43.134.60.117).
 * Sized for ~720 MiB available RAM: cron-driven Python jobs avoid idle daemons,
 * and bootstrap validators share one async runner with isolated keys & X pools.
 */
module.exports = {
  apps: [
    {
      name: "nti-indexer",
      cwd: "/home/ubuntu/apps/nti/indexer",
      script: "/home/ubuntu/apps/nti/infra/scripts/run-with-env.sh",
      args: "node dist/index.js",
      autorestart: true,
      max_memory_restart: "180M",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "nti-fetcher",
      cwd: "/home/ubuntu/apps/nti/services",
      script: "/home/ubuntu/apps/nti/infra/scripts/run-with-env.sh",
      args: "uv run python -m nti_fetcher",
      // Aligned to UTC 4h epoch boundaries (00,04,08,12,16,20 UTC) on WIB (UTC+7) VPS.
      cron_restart: "0 3,7,11,15,19,23 * * *",
      autorestart: false,
      max_memory_restart: "256M",
      env: {
        NODE_ENV: "production",
        PYTHONUNBUFFERED: "1",
      },
    },
    {
      name: "nti-oracle-operator",
      cwd: "/home/ubuntu/apps/nti/services",
      script: "/home/ubuntu/apps/nti/infra/scripts/run-with-env.sh",
      // Daemon, not cron: a commit of a large epoch (thousands of posts to classify plus validator
      // signing) can take longer than any fixed schedule, and a cron restart would kill it mid-run.
      // The loop pauses 5 minutes between runs and is idempotent ("up_to_date" when nothing is due).
      args: "uv run python -m nti_oracle --role operator --loop 300",
      autorestart: true,
      restart_delay: 10000,
      max_memory_restart: "600M",
      env: {
        PYTHONUNBUFFERED: "1",
      },
    },
    {
      name: "nti-oracle-validators",
      cwd: "/home/ubuntu/apps/nti/services",
      script: "/home/ubuntu/apps/nti/infra/scripts/run-with-env.sh",
      args: "uv run python -m nti_oracle --role validator",
      // Idempotent: exits early when already attested. Every 20m keeps attestations timezone-independent.
      cron_restart: "15,35,55 * * * *",
      autorestart: false,
      max_memory_restart: "200M",
      env: {
        PYTHONUNBUFFERED: "1",
      },
    },
    {
      name: "nti-keeper",
      cwd: "/home/ubuntu/apps/nti/services",
      script: "/home/ubuntu/apps/nti/infra/scripts/run-with-env.sh",
      args: "uv run python -m nti_oracle --role keeper",
      cron_restart: "*/5 * * * *",
      autorestart: false,
      max_memory_restart: "128M",
      env: {
        PYTHONUNBUFFERED: "1",
      },
    },
    {
      name: "nti-monitor",
      cwd: "/home/ubuntu/apps/nti/services",
      script: "/home/ubuntu/apps/nti/infra/scripts/run-with-env.sh",
      args: "uv run python -m nti_oracle --role monitor",
      cron_restart: "*/30 * * * *",
      autorestart: false,
      max_memory_restart: "128M",
      env: {
        PYTHONUNBUFFERED: "1",
      },
    },
    {
      // Pons launch/graduation scanner for Radar and Heatmap. Exits "skipped" on chains without Pons
      // (testnet), so it is safe to keep registered everywhere.
      name: "nti-discovery",
      cwd: "/home/ubuntu/apps/nti/services",
      script: "/home/ubuntu/apps/nti/infra/scripts/run-with-env.sh",
      args: "uv run python -m nti_discovery",
      cron_restart: "*/5 * * * *",
      autorestart: false,
      max_memory_restart: "128M",
      env: {
        PYTHONUNBUFFERED: "1",
      },
    },
    {
      // Daily KOL universe growth: searches X per narrative, gates authors numerically and adds the
      // best ones (capped per run) to Supabase. Runs between fetch cycles so scraper accounts are free.
      name: "nti-kol-harvest",
      cwd: "/home/ubuntu/apps/nti/services",
      script: "/home/ubuntu/apps/nti/infra/scripts/run-with-env.sh",
      args: "uv run python -m nti_discovery.kol_harvest",
      cron_restart: "30 2 * * *",
      autorestart: false,
      max_memory_restart: "256M",
      env: {
        PYTHONUNBUFFERED: "1",
      },
    },
    {
      name: "nti-purge",
      cwd: "/home/ubuntu/apps/nti/services",
      script: "/home/ubuntu/apps/nti/infra/scripts/run-with-env.sh",
      args: "uv run python -m nti_fetcher.purge",
      cron_restart: "0 2 * * *",
      autorestart: false,
      max_memory_restart: "128M",
      env: {
        PYTHONUNBUFFERED: "1",
      },
    },
  ],
};
