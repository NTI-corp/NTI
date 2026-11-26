-- Off-chain stake-weighted polls. A vote counts the voter's stake at the poll's snapshot block (read from the
-- Staking checkpoints by the server), so moving tokens after the snapshot changes nothing. Results are advisory:
-- the protocol admin decides whether to act on them. Reads are public; writes go through the server with the
-- service key only.

create table if not exists polls (
  id bigserial primary key,
  title text not null check (char_length(title) between 3 and 140),
  description text not null default '' check (char_length(description) <= 2000),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6),
  snapshot_block bigint not null check (snapshot_block > 0),
  created_by text not null,
  created_at timestamptz not null default now(),
  ends_at timestamptz not null
);

create table if not exists poll_votes (
  poll_id bigint not null references polls(id) on delete cascade,
  voter text not null,
  option_index smallint not null check (option_index between 0 and 5),
  weight numeric not null check (weight > 0),
  voted_at timestamptz not null default now(),
  primary key (poll_id, voter)
);

create index if not exists idx_poll_votes_poll on poll_votes (poll_id);
create index if not exists idx_polls_ends_at on polls (ends_at desc);

alter table polls enable row level security;
alter table poll_votes enable row level security;
create policy public_read_polls on polls for select to anon, authenticated using (true);
create policy public_read_poll_votes on poll_votes for select to anon, authenticated using (true);
