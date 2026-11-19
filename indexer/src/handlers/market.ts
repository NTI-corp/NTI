import type { DecodedEventContext, MirrorUpsert } from "../types.js";

export function handleMarketEvent(ctx: DecodedEventContext): MirrorUpsert[] {
  const { chainId, eventName, args, txHash, logIndex, blockNumber } = ctx;

  switch (eventName) {
    case "MarketCreated":
      return [
        {
          table: "markets",
          conflictColumns: ["chain_id", "market_id"],
          row: {
            chain_id: chainId,
            market_id: Number(args.marketId),
            narrative_a: Number(args.narrativeA),
            narrative_b: Number(args.narrativeB),
            base_epoch: Number(args.baseEpoch),
            settle_epoch: Number(args.settleEpoch),
            base_series_id: Number(args.baseSeriesId),
            status: "open",
            created_block: blockNumber.toString(),
          },
        },
      ];

    case "BetPlaced":
      return [
        {
          table: "market_bets",
          conflictColumns: ["chain_id", "tx_hash", "log_index"],
          row: {
            chain_id: chainId,
            tx_hash: txHash,
            log_index: logIndex,
            block_number: blockNumber.toString(),
            market_id: Number(args.marketId),
            bettor: args.bettor,
            side: Number(args.side),
            gross_amount: String(args.grossAmount),
            net_amount: String(args.netAmount),
            fee_amount: String(args.feeAmount),
          },
        },
      ];

    case "MarketSettled": {
      const outcomeNum = Number(args.outcome);
      const outcomeLabel =
        outcomeNum === 0 ? "side_a" : outcomeNum === 1 ? "side_b" : "refund";
      return [
        {
          table: "markets",
          conflictColumns: ["chain_id", "market_id"],
          row: {
            chain_id: chainId,
            market_id: Number(args.marketId),
            status: outcomeLabel === "refund" ? "refunded" : "settled",
            outcome: outcomeLabel,
            fee_routed: String(args.feesSent),
            settled_block: blockNumber.toString(),
          },
        },
      ];
    }

    case "Claimed":
      return [
        {
          table: "market_claims",
          conflictColumns: ["chain_id", "tx_hash", "log_index"],
          row: {
            chain_id: chainId,
            tx_hash: txHash,
            log_index: logIndex,
            block_number: blockNumber.toString(),
            market_id: Number(args.marketId),
            bettor: args.bettor,
            payout: String(args.payout),
          },
        },
      ];

    default:
      return [];
  }
}
