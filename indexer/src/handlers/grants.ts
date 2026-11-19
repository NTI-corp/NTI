import type { DecodedEventContext, MirrorUpsert } from "../types.js";

export function handleGrantsEvent(ctx: DecodedEventContext): MirrorUpsert[] {
  const { chainId, eventName, args, txHash, logIndex, blockNumber } = ctx;

  switch (eventName) {
    case "RoundStarted":
      return [
        {
          table: "grant_rounds",
          conflictColumns: ["chain_id", "round_id"],
          row: {
            chain_id: chainId,
            round_id: Number(args.roundId),
            budget_eth: String(args.budget),
            snapshot_block: String(args.snapshotBlock),
            vote_end: new Date(Number(args.endsAt) * 1000).toISOString(),
            status: "active",
            started_block: blockNumber.toString(),
          },
        },
      ];

    case "ProposalSubmitted":
      return [
        {
          table: "grant_proposals",
          conflictColumns: ["chain_id", "round_id", "proposal_id"],
          row: {
            chain_id: chainId,
            round_id: Number(args.roundId),
            proposal_id: Number(args.proposalId),
            proposer: args.proposer,
            recipient: args.recipient,
            metadata_hash: args.metadataHash,
            submitted_block: blockNumber.toString(),
          },
        },
      ];

    case "Voted":
      return [
        {
          table: "grant_votes",
          conflictColumns: ["chain_id", "round_id", "voter"],
          row: {
            chain_id: chainId,
            round_id: Number(args.roundId),
            voter: args.voter,
            proposal_ids: args.ids,
            weights: args.weights,
            tx_hash: txHash,
            block_number: blockNumber.toString(),
          },
        },
      ];

    case "RoundFinalized":
      return [
        {
          table: "grant_rounds",
          conflictColumns: ["chain_id", "round_id"],
          row: {
            chain_id: chainId,
            round_id: Number(args.roundId),
            total_awarded: String(args.totalAllocated),
            quorum_met: Boolean(args.quorumMet),
            status: "finalized",
            finalized_block: blockNumber.toString(),
          },
        },
      ];

    case "GrantClaimed":
      return [
        {
          table: "grant_claims",
          conflictColumns: ["chain_id", "tx_hash", "log_index"],
          row: {
            chain_id: chainId,
            tx_hash: txHash,
            log_index: logIndex,
            round_id: Number(args.roundId),
            proposal_id: Number(args.proposalId),
            recipient: args.recipient,
            amount: String(args.amount),
            block_number: blockNumber.toString(),
          },
        },
      ];

    default:
      return [];
  }
}
