-- Unique keys for governor-scoped mirror upserts
create unique index if not exists idx_governance_proposals_chain_gov_prop
  on public.governance_proposals (chain_id, governor_address, proposal_id);

create unique index if not exists idx_governance_votes_chain_gov_prop_voter
  on public.governance_votes (chain_id, governor_address, proposal_id, voter);

-- Contract provenance columns written by indexer replay & live handlers
alter table public.market_bets add column if not exists contract_address bytea;
alter table public.market_claims add column if not exists contract_address bytea;
alter table public.grant_claims add column if not exists contract_address bytea;
alter table public.disputes add column if not exists contract_address bytea;

notify pgrst, 'reload schema';
