-- Governance identifiers are scoped to the emitting Governor contract.
-- Recover addresses from indexed source events before replacing the legacy keys.
update public.governance_proposals gp
set governor_address = ce.contract_address
from public.chain_events ce
where gp.governor_address is null
  and ce.chain_id = gp.chain_id
  and ce.event_name = 'ProposalCreated'
  and ce.args ->> 'proposalId' = gp.proposal_id::text;

update public.governance_votes gv
set governor_address = ce.contract_address
from public.chain_events ce
where gv.governor_address is null
  and ce.chain_id = gv.chain_id
  and ce.event_name in ('VoteCast', 'VoteCastWithParams')
  and ce.args ->> 'proposalId' = gv.proposal_id::text
  and lower(ce.args ->> 'voter') = '0x' || encode(gv.voter, 'hex');

-- Old mirrors may predate retained chain events. Keep them addressable by a
-- deterministic sentinel while ensuring new rows must carry real provenance.
update public.governance_proposals
set governor_address = decode(repeat('00', 20), 'hex')
where governor_address is null;

update public.governance_votes
set governor_address = decode(repeat('00', 20), 'hex')
where governor_address is null;

alter table public.governance_proposals alter column governor_address set not null;
alter table public.governance_votes alter column governor_address set not null;

drop index if exists public.idx_governance_proposals_chain_gov_prop;
drop index if exists public.idx_governance_votes_chain_gov_prop_voter;

alter table public.governance_proposals
  drop constraint if exists governance_proposals_pkey;
alter table public.governance_proposals
  add constraint governance_proposals_pkey
  primary key (chain_id, governor_address, proposal_id);

alter table public.governance_votes
  drop constraint if exists governance_votes_pkey;
alter table public.governance_votes
  add constraint governance_votes_pkey
  primary key (chain_id, governor_address, proposal_id, voter);

notify pgrst, 'reload schema';
