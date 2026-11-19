import type { DecodedEventContext, MirrorUpsert } from "../types.js";

export function handleBasketEvent(ctx: DecodedEventContext): MirrorUpsert[] {
  const { chainId, eventName, args, txHash, logIndex, blockNumber, contractAddress } = ctx;

  switch (eventName) {
    case "BasketCreated":
      return [
        {
          table: "baskets",
          conflictColumns: ["chain_id", "basket_address"],
          row: {
            chain_id: chainId,
            basket_address: args.basket,
            narrative_id: Number(args.narrativeId),
            name: String(args.name),
            symbol: String(args.symbol),
            created_block: blockNumber.toString(),
          },
        },
      ];

    case "Rebalanced":
      return [
        {
          table: "baskets",
          conflictColumns: ["chain_id", "basket_address"],
          row: {
            chain_id: chainId,
            basket_address: contractAddress,
            tokens: args.tokens,
            weights_bps: args.weightsBps,
            nav_eth: String(args.navAfter),
            rebalanced_block: blockNumber.toString(),
          },
        },
      ];

    case "Deposited":
    case "Redeemed":
    case "ManagementFeeAccrued":
      return [
        {
          table: "basket_events",
          conflictColumns: ["chain_id", "tx_hash", "log_index"],
          row: {
            chain_id: chainId,
            tx_hash: txHash,
            log_index: logIndex,
            block_number: blockNumber.toString(),
            basket_address: contractAddress,
            kind: eventName,
            payload: args,
          },
        },
      ];

    default:
      return [];
  }
}
