-- Chain mirror tables written by indexer/src/handlers/* (markets, baskets, grants, governance, staking, fee router).
-- Additive and idempotent: safe to re-run. Public read via RLS, writes only through the service role.

create table if not exists markets (
  chain_id int not null,
  market_id bigint not null,
  narrative_a smallint,
  narrative_b smallint,
  base_epoch int,
  settle_epoch int,
  base_series_id int,
  status text,
  outcome text,
  fee_routed numeric,
  created_block bigint,
  settled_block bigint,
  primary key (chain_id, market_id)
);

create table if not exists market_bets (
  chain_id int not null,
  tx_hash bytea not null,
  log_index int not null,
  block_number bigint not null,
  market_id bigint not null,
  bettor bytea not null,
  side smallint not null,
  gross_amount numeric not null,
  net_amount numeric not null,
  fee_amount numeric not null,
  primary key (chain_id, tx_hash, log_index)
);
create index if not exists idx_market_bets_market on market_bets (chain_id, market_id);

create table if not exists market_claims (
  chain_id int not null,
  tx_hash bytea not null,
  log_index int not null,
  block_number bigint not null,
  market_id bigint not null,
  bettor bytea not null,
  payout numeric not null,
  primary key (chain_id, tx_hash, log_index)
);

create table if not exists baskets (
  chain_id int not null,
  basket_address bytea not null,
  narrative_id smallint,
  name text,
  symbol text,
  tokens jsonb,
  weights_bps jsonb,
  nav_eth numeric,
  created_block bigint,
  rebalanced_block bigint,
  primary key (chain_id, basket_address)
);

create table if not exists basket_events (
  chain_id int not null,
  tx_hash bytea not null,
  log_index int not null,
  block_number bigint not null,
  basket_address bytea not null,
  kind text not null,
  payload jsonb,
  primary key (chain_id, tx_hash, log_index)
);

create table if not exists grant_rounds (
  chain_id int not null,
  round_id bigint not null,
  budget_eth numeric,
  snapshot_block numeric,
  vote_end timestamptz,
  total_awarded numeric,
  quorum_met boolean,
  status text,
  started_block bigint,
  finalized_block bigint,
  primary key (chain_id, round_id)
);

create table if not exists grant_proposals (
  chain_id int not null,
  round_id bigint not null,
  proposal_id bigint not null,
  proposer bytea,
  recipient bytea,
  metadata_hash bytea,
  submitted_block bigint,
  primary key (chain_id, round_id, proposal_id)
);

create table if not exists grant_votes (
  chain_id int not null,
  round_id bigint not null,
  voter bytea not null,
  proposal_ids jsonb,
  weights jsonb,
  tx_hash bytea,
  block_number bigint,
  primary key (chain_id, round_id, voter)
);

create table if not exists grant_claims (
  chain_id int not null,
  tx_hash bytea not null,
  log_index int not null,
  block_number bigint,
  round_id bigint not null,
  proposal_id bigint not null,
  recipient bytea,
  amount numeric,
  primary key (chain_id, tx_hash, log_index)
);

create table if not exists governance_proposals (
  chain_id int not null,
  proposal_id numeric not null,
  proposer bytea,
  targets jsonb,
  "values" jsonb,
  signatures jsonb,
  calldatas jsonb,
  vote_start numeric,
  vote_end numeric,
  description text,
  status text,
  eta_seconds numeric,
  created_block bigint,
  primary key (chain_id, proposal_id)
);

create table if not exists governance_votes (
  chain_id int not null,
  proposal_id numeric not null,
  voter bytea not null,
  support smallint,
  weight numeric,
  reason text,
  tx_hash bytea,
  block_number bigint,
  primary key (chain_id, proposal_id, voter)
);

create table if not exists staking_events (
  chain_id int not null,
  tx_hash bytea not null,
  log_index int not null,
  block_number bigint not null,
  account bytea,
  kind text not null,
  amount numeric,
  metadata jsonb,
  primary key (chain_id, tx_hash, log_index)
);
create index if not exists idx_staking_events_account on staking_events (chain_id, account);

create table if not exists fee_router_events (
  chain_id int not null,
  tx_hash bytea not null,
  log_index int not null,
  block_number bigint not null,
  kind text not null,
  payload jsonb,
  primary key (chain_id, tx_hash, log_index)
);

create table if not exists staking_tiers (
  chain_id int primary key,
  radar_min_stake numeric,
  tier1_stake numeric,
  tier2_stake numeric,
  tier3_stake numeric,
  tier1_discount_bps int,
  tier2_discount_bps int,
  tier3_discount_bps int,
  updated_block bigint
);

alter table markets enable row level security;
alter table market_bets enable row level security;
alter table market_claims enable row level security;
alter table baskets enable row level security;
alter table basket_events enable row level security;
alter table grant_rounds enable row level security;
alter table grant_proposals enable row level security;
alter table grant_votes enable row level security;
alter table grant_claims enable row level security;
alter table governance_proposals enable row level security;
alter table governance_votes enable row level security;
alter table staking_events enable row level security;
alter table fee_router_events enable row level security;
alter table staking_tiers enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'markets','market_bets','market_claims','baskets','basket_events','grant_rounds','grant_proposals',
    'grant_votes','grant_claims','governance_proposals','governance_votes','staking_events',
    'fee_router_events','staking_tiers'
  ] loop
    if not exists (select 1 from pg_policies where tablename = t and policyname = 'public read ' || t) then
      execute format('create policy %I on %I for select using (true)', 'public read ' || t, t);
    end if;
  end loop;
end $$;

-- Tables referenced by indexer/src/handlers/oracle.ts
create table if not exists registry_state (
  chain_id int primary key,
  last_event text,
  last_block bigint,
  frozen boolean not null default false,
  nti_token bytea,
  staking bytea,
  buyback_adapter bytea
);

create table if not exists kol_wallet_attestations (
  wallet bytea primary key,
  handle_hash bytea,
  active boolean not null default true,
  block_number bigint
);

alter table registry_state enable row level security;
alter table kol_wallet_attestations enable row level security;
do $$
declare t text;
begin
  foreach t in array array['registry_state','kol_wallet_attestations'] loop
    if not exists (select 1 from pg_policies where tablename = t and policyname = 'public read ' || t) then
      execute format('create policy %I on %I for select using (true)', 'public read ' || t, t);
    end if;
  end loop;
end $$;
