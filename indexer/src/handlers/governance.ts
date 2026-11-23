import type { DecodedEventContext, MirrorUpsert } from "../types.js";

export function handleGovernanceEvent(ctx: DecodedEventContext): MirrorUpsert[] {
  const { chainId, contractAddress, eventName, args, txHash, blockNumber } = ctx;
  const proposalKey = ["chain_id", "governor_address", "proposal_id"];

  switch (eventName) {
    case "ProposalCreated":
      return [
        {
          table: "governance_proposals",
          conflictColumns: proposalKey,
          row: {
            chain_id: chainId,
            proposal_id: String(args.proposalId),
            governor_address: contractAddress,
            proposer: args.proposer,
            targets: args.targets,
            values: args.values,
            signatures: args.signatures,
            calldatas: args.calldatas,
            vote_start: String(args.voteStart),
            vote_end: String(args.voteEnd),
            description: String(args.description),
            status: "pending",
            eta_seconds: null,
            created_block: blockNumber.toString(),
          },
        },
      ];

    case "VoteCast":
    case "VoteCastWithParams":
      if (!("proposalId" in args)) return [];
      return [
        {
          table: "governance_votes",
          conflictColumns: [...proposalKey, "voter"],
          row: {
            chain_id: chainId,
            proposal_id: String(args.proposalId),
            voter: args.voter,
            governor_address: contractAddress,
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
          conflictColumns: proposalKey,
          updateOnly: true,
          row: {
            chain_id: chainId,
            governor_address: contractAddress,
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
          conflictColumns: proposalKey,
          updateOnly: true,
          row: {
            chain_id: chainId,
            governor_address: contractAddress,
            proposal_id: String(args.proposalId),
            status: "executed",
          },
        },
      ];

    case "ProposalCanceled":
      return [
        {
          table: "governance_proposals",
          conflictColumns: proposalKey,
          updateOnly: true,
          row: {
            chain_id: chainId,
            governor_address: contractAddress,
            proposal_id: String(args.proposalId),
            status: "canceled",
          },
        },
      ];

    default:
      return [];
  }
}
