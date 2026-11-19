import type { DecodedEventContext, MirrorUpsert } from "../types.js";

export function handleGovernanceEvent(ctx: DecodedEventContext): MirrorUpsert[] {
  const { chainId, eventName, args, txHash, blockNumber } = ctx;

  switch (eventName) {
    case "ProposalCreated":
      return [
        {
          table: "governance_proposals",
          conflictColumns: ["chain_id", "proposal_id"],
          row: {
            chain_id: chainId,
            proposal_id: String(args.proposalId),
            proposer: args.proposer,
            targets: args.targets,
            values: args.values,
            signatures: args.signatures,
            calldatas: args.calldatas,
            vote_start: String(args.voteStart),
            vote_end: String(args.voteEnd),
            description: String(args.description),
            status: "active",
            created_block: blockNumber.toString(),
          },
        },
      ];

    case "VoteCast":
      if (!("proposalId" in args)) return [];
      return [
        {
          table: "governance_votes",
          conflictColumns: ["chain_id", "proposal_id", "voter"],
          row: {
            chain_id: chainId,
            proposal_id: String(args.proposalId),
            voter: args.voter,
            support: Number(args.support),
            weight: String(args.weight),
            reason: String(args.reason ?? ""),
            tx_hash: txHash,
            block_number: blockNumber.toString(),
          },
        },
      ];

    case "ProposalQueued":
      return [
        {
          table: "governance_proposals",
          conflictColumns: ["chain_id", "proposal_id"],
          row: {
            chain_id: chainId,
            proposal_id: String(args.proposalId),
            status: "queued",
            eta_seconds: String(args.etaSeconds),
          },
        },
      ];

    case "ProposalExecuted":
      return [
        {
          table: "governance_proposals",
          conflictColumns: ["chain_id", "proposal_id"],
          row: {
            chain_id: chainId,
            proposal_id: String(args.proposalId),
            status: "executed",
          },
        },
      ];

    case "ProposalCanceled":
      return [
        {
          table: "governance_proposals",
          conflictColumns: ["chain_id", "proposal_id"],
          row: {
            chain_id: chainId,
            proposal_id: String(args.proposalId),
            status: "canceled",
          },
        },
      ];

    default:
      return [];
  }
}
