/**
 * PM2 ecosystem for NTI on the team VPS (ubuntu@43.134.60.117).
 * Sized for ~720 MiB available RAM: cron-driven Python jobs avoid idle daemons,
 * and bootstrap validators share one async runner with isolated keys & X pools.
 */
module.exports = {
  apps: [
    {
      name: "nti-fetcher",
      cwd: "/home/ubuntu/apps/nti/services",
      script: "uv",
      args: "run python -m nti_fetcher",
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
      script: "uv",
      args: "run python -m nti_oracle --role operator",
      cron_restart: "25 1,5,9,13,17,21 * * *",
      autorestart: false,
      max_memory_restart: "180M",
      env: {
        PYTHONUNBUFFERED: "1",
      },
    },
    {
      name: "nti-oracle-validators",
      cwd: "/home/ubuntu/apps/nti/services",
      script: "uv",
      args: "run python -m nti_oracle --role validator",
      autorestart: true,
      max_memory_restart: "200M",
      env: {
        PYTHONUNBUFFERED: "1",
      },
    },
    {
      name: "nti-indexer",
      cwd: "/home/ubuntu/apps/nti/indexer",
      script: "dist/index.js",
      autorestart: true,
      max_memory_restart: "180M",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "nti-keeper",
      cwd: "/home/ubuntu/apps/nti/services",
      script: "uv",
      args: "run python -m nti_oracle --role keeper",
      cron_restart: "15 * * * *",
      autorestart: false,
      max_memory_restart: "128M",
      env: {
        PYTHONUNBUFFERED: "1",
      },
    },
    {
      name: "nti-purge",
      cwd: "/home/ubuntu/apps/nti/services",
      script: "uv",
      args: "run python -m nti_fetcher.purge",
      cron_restart: "0 2 * * *",
      autorestart: false,
      max_memory_restart: "128M",
      env: {
        PYTHONUNBUFFERED: "1",
      },
    },
  ],
};
