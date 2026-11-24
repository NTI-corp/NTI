create table if not exists public.fetch_cycle_runs (
  run_id uuid primary key,
  epoch_id int not null,
  status text not null check (status in ('collecting', 'incomplete')),
  started_at timestamptz not null,
  finished_at timestamptz not null,
  total_eligible int not null check (total_eligible >= 0),
  accounts_ok int not null check (accounts_ok >= 0),
  accounts_failed int not null check (accounts_failed >= 0),
  due_user_ids jsonb not null default '[]'::jsonb,
  omitted_user_ids jsonb not null default '[]'::jsonb,
  failure_types jsonb not null default '{}'::jsonb,
  post_count int not null check (post_count >= 0),
  manifest_sha256 text not null
);

alter table public.fetch_cycle_runs
  add column if not exists failure_types jsonb not null default '{}'::jsonb;

create index if not exists idx_fetch_cycle_runs_epoch_finished
  on public.fetch_cycle_runs (epoch_id, finished_at desc);

alter table public.fetch_cycle_runs enable row level security;

notify pgrst, 'reload schema';
