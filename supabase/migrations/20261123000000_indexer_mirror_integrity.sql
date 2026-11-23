-- Archive locators and their commitment have different formats and consumers.
alter table public.epochs add column if not exists arweave_tx_bytes32 bytea;
alter table public.chain_events add column if not exists block_time timestamptz;

-- Testnet has had multiple factories and governors. Retain event provenance in the mirrors.
alter table public.baskets add column if not exists factory_address bytea;
alter table public.governance_proposals add column if not exists governor_address bytea;
alter table public.governance_votes add column if not exists governor_address bytea;

create index if not exists idx_chain_events_replay
  on public.chain_events (chain_id, block_number, log_index, tx_hash);

notify pgrst, 'reload schema';
