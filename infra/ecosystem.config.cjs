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
      cron_restart: "0 */4 * * *",
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
      args: "uv run python -m nti_oracle --role operator",
      // Idempotent: exits "up_to_date" when the due epoch is already committed. Running every 20 minutes
      // (instead of fixed hours) keeps commit latency independent of the VPS timezone.
      cron_restart: "10,30,50 * * * *",
      autorestart: false,
      max_memory_restart: "180M",
      env: {
        PYTHONUNBUFFERED: "1",
      },
    },
    {
      name: "nti-oracle-validators",
      cwd: "/home/ubuntu/apps/nti/services",
      script: "/home/ubuntu/apps/nti/infra/scripts/run-with-env.sh",
      args: "uv run python -m nti_oracle --role validator",
      cron_restart: "28 1,5,9,13,17,21 * * *",
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
      cron_restart: "5,25,45 * * * *",
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
