import type { DecodedEventContext, MirrorUpsert } from "../types.js";

export function handleStakingEvent(ctx: DecodedEventContext): MirrorUpsert[] {
  const { chainId, eventName, args, txHash, logIndex, blockNumber } = ctx;

  switch (eventName) {
    case "Staked":
    case "UnstakeRequested":
    case "Withdrawn":
    case "RewardClaimed":
    case "Slashed":
      return [
        {
          table: "staking_events",
          conflictColumns: ["chain_id", "tx_hash", "log_index"],
          row: {
            chain_id: chainId,
            tx_hash: txHash,
            log_index: logIndex,
            block_number: blockNumber.toString(),
            account: args.account,
            kind: eventName,
            amount: String(
              args.receivedAmount ??
                args.amount ??
                args.ethReward ??
                args.actualSlashed ??
                "0",
            ),
            metadata: args,
          },
        },
      ];

    case "RewardNotified":
    case "FeesDistributed":
    case "BuybackExecuted":
      return [
        {
          table: "fee_router_events",
          conflictColumns: ["chain_id", "tx_hash", "log_index"],
          row: {
            chain_id: chainId,
            tx_hash: txHash,
            log_index: logIndex,
            block_number: blockNumber.toString(),
            kind: eventName,
            payload: args,
          },
        },
      ];

    case "TiersUpdated":
      return [
        {
          table: "staking_tiers",
          conflictColumns: ["chain_id"],
          row: {
            chain_id: chainId,
            radar_min_stake: String(args.radarMin),
            tier1_stake: String(args.t1Stake),
            tier2_stake: String(args.t2Stake),
            tier3_stake: String(args.t3Stake),
            tier1_discount_bps: Number(args.t1Bps),
            tier2_discount_bps: Number(args.t2Bps),
            tier3_discount_bps: Number(args.t3Bps),
            updated_block: blockNumber.toString(),
          },
        },
      ];

    default:
      return [];
  }
}
