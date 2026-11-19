-- NTI Core Schema & RLS (T0 / D3 foundation)
-- Follows NTI-Implementation-Plan.md §Model data with default-deny RLS
-- so raw post bodies and LLM run logs are never exposed to anon/authenticated clients.

create type epoch_status as enum (
  'collecting',
  'computed',
  'committed',
  'disputed',
  'final',
  'incomplete'
);

-- Universe & versioned config
create table config_versions (
  version int primary key,
  config_hash bytea unique not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table kols (
  user_id bigint primary key,
  handle text unique not null,
  followers int not null default 0,
  followers_updated_at timestamptz,
  h_k smallint not null default 1 check (h_k in (0, 1)),
  r_k numeric not null default 1 check (r_k >= 0),
  poll_tier smallint not null default 1 check (poll_tier in (1, 2, 4)),
  active boolean not null default true
);

create table kol_narratives (
  user_id bigint not null references kols(user_id) on delete cascade,
  narrative_id smallint not null check (narrative_id > 0),
  primary key (user_id, narrative_id)
);

-- Raw pipeline data (rolling retention; posts.body purged aggressively)
create table fetch_cycles (
  id bigserial primary key,
  epoch_id int not null,
  lane smallint not null,
  source text not null,
  started_at timestamptz,
  finished_at timestamptz,
  accounts_ok int not null default 0,
  accounts_failed int not null default 0,
  post_count int not null default 0,
  manifest_sha256 text
);

create table posts (
  tweet_id bigint primary key,
  user_id bigint not null references kols(user_id),
  created_at timestamptz not null,
  body text,
  first_seen_at timestamptz not null default now()
);
create index idx_posts_created_at on posts (created_at desc);

create table post_engagement (
  tweet_id bigint not null references posts(tweet_id) on delete cascade,
  cycle_id bigint not null references fetch_cycles(id) on delete cascade,
  likes int not null default 0,
  reposts int not null default 0,
  quotes int not null default 0,
  replies int not null default 0,
  fetched_at timestamptz not null,
  primary key (tweet_id, cycle_id)
);

create table classifications (
  tweet_id bigint not null references posts(tweet_id) on delete cascade,
  model_version text not null,
  prompt_version text not null,
  series_id int not null,
  q jsonb not null,
  primary key (tweet_id, model_version, prompt_version)
);

create table llm_runs (
  id bigserial primary key,
  epoch_id int not null,
  provider text not null,
  model_version text not null,
  prompt_version text not null,
  batch_size int not null,
  valid_count int not null,
  failed_count int not null,
  input_tokens int,
  output_tokens int,
  created_at timestamptz not null default now()
);

-- Epoch index results
create table epochs (
  epoch_id int primary key,
  series_id int not null,
  status epoch_status not null,
  dataset_hash bytea,
  arweave_tx text,
  config_hash bytea,
  commit_tx bytea,
  committed_at timestamptz,
  finalized_at timestamptz
);

create table narrative_epoch (
  epoch_id int not null references epochs(epoch_id) on delete cascade,
  narrative_id smallint not null,
  s_n numeric not null,
  m_bps int not null,
  i_bps int not null,
  v_bps int,
  v_flag text check (v_flag is null or v_flag in ('too_small', 'series_break', 'incomplete_gap')),
  weighted_posts numeric not null,
  primary key (epoch_id, narrative_id)
);

create table kol_contribution (
  epoch_id int not null references epochs(epoch_id) on delete cascade,
  narrative_id smallint not null,
  user_id bigint not null references kols(user_id),
  share_bps int not null,
  capped boolean not null default false,
  primary key (epoch_id, narrative_id, user_id)
);

-- Oracle & disputes
create table validators (
  address bytea primary key,
  active boolean not null default true,
  permissionless boolean not null default false,
  added_at timestamptz not null default now()
);

create table attestations (
  epoch_id int not null references epochs(epoch_id) on delete cascade,
  validator bytea not null,
  i_bps int[] not null,
  v_bps int[] not null,
  signature bytea not null,
  created_at timestamptz not null default now(),
  primary key (epoch_id, validator)
);

create table disputes (
  dispute_id bigint primary key,
  epoch_id int not null references epochs(epoch_id),
  narrative_id smallint not null,
  challenger bytea not null,
  claimed_i_bps int not null,
  evidence_hash bytea not null,
  status text not null,
  opened_at timestamptz not null,
  resolved_at timestamptz
);

-- Chain mirror & indexer checkpoint
create table indexer_state (
  chain_id int primary key,
  last_block bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table chain_events (
  chain_id int not null,
  tx_hash bytea not null,
  log_index int not null,
  block_number bigint not null,
  contract_address bytea not null,
  event_name text not null,
  args jsonb not null,
  primary key (chain_id, tx_hash, log_index)
);
create index idx_chain_events_block on chain_events (chain_id, block_number);

-- Product tables
create table tokens (
  address bytea primary key,
  symbol text,
  name text,
  created_at timestamptz,
  source text check (source in ('pons_v1', 'pons_v2', 'uniswap')),
  graduated boolean not null default false,
  pool bytea,
  liquidity_eth numeric,
  narrative_id smallint,
  txs_7d int not null default 0,
  last_activity_at timestamptz
);

create table projects (
  id bigserial primary key,
  name text not null,
  narrative_id smallint not null,
  token_address bytea references tokens(address),
  curated boolean not null default false,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table radar_alerts (
  id bigserial primary key,
  kind text not null check (kind in ('velocity', 'new_token')),
  narrative_id smallint not null,
  v_bps int,
  token bytea,
  detected_at timestamptz not null,
  public_at timestamptz not null
);
create index idx_radar_alerts_public_at on radar_alerts (public_at desc);

create table wallet_registry (
  wallet bytea primary key,
  user_id bigint not null references kols(user_id),
  verified_at timestamptz not null default now()
);

create table wallet_flags (
  id bigserial primary key,
  wallet bytea not null,
  user_id bigint references kols(user_id),
  narrative_id smallint not null,
  reason text not null,
  detected_at timestamptz not null default now()
);

-- Row Level Security: default-deny on all tables; public SELECT only on non-sensitive derived tables.
alter table config_versions enable row level security;
alter table kols enable row level security;
alter table kol_narratives enable row level security;
alter table fetch_cycles enable row level security;
alter table posts enable row level security;
alter table post_engagement enable row level security;
alter table classifications enable row level security;
alter table llm_runs enable row level security;
alter table epochs enable row level security;
alter table narrative_epoch enable row level security;
alter table kol_contribution enable row level security;
alter table validators enable row level security;
alter table attestations enable row level security;
alter table disputes enable row level security;
alter table indexer_state enable row level security;
alter table chain_events enable row level security;
alter table tokens enable row level security;
alter table projects enable row level security;
alter table radar_alerts enable row level security;
alter table wallet_registry enable row level security;
alter table wallet_flags enable row level security;

create policy public_read_config_versions on config_versions for select to anon, authenticated using (true);
create policy public_read_epochs on epochs for select to anon, authenticated using (true);
create policy public_read_narrative_epoch on narrative_epoch for select to anon, authenticated using (true);
create policy public_read_kol_contribution on kol_contribution for select to anon, authenticated using (true);
create policy public_read_validators on validators for select to anon, authenticated using (true);
create policy public_read_attestations on attestations for select to anon, authenticated using (true);
create policy public_read_disputes on disputes for select to anon, authenticated using (true);
create policy public_read_tokens on tokens for select to anon, authenticated using (true);
create policy public_read_projects on projects for select to anon, authenticated using (true);
create policy public_read_wallet_registry on wallet_registry for select to anon, authenticated using (true);
create policy public_read_wallet_flags on wallet_flags for select to anon, authenticated using (true);
-- Public clients only see delayed Radar alerts; real-time alerts are served via gated API route.
create policy public_read_delayed_radar on radar_alerts
  for select to anon, authenticated
  using (public_at <= now());
