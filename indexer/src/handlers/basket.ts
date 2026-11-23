import type { DecodedEventContext, MirrorUpsert } from "../types.js";

export function handleBasketEvent(ctx: DecodedEventContext): MirrorUpsert[] {
  const { chainId, eventName, args, blockNumber, contractAddress } = ctx;

  switch (eventName) {
    case "BasketCreated":
      return [
        {
          table: "baskets",
          conflictColumns: ["chain_id", "basket_address"],
          row: {
            chain_id: chainId,
            basket_address: args.basket,
            factory_address: contractAddress,
            narrative_id: Number(args.narrativeId),
            name: String(args.name),
            symbol: String(args.symbol),
            created_block: blockNumber.toString(),
          },
        },
      ];

    case "AllocationSet":
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
            ...(eventName === "Rebalanced" ? { nav_eth: String(args.navAfter), rebalanced_block: blockNumber.toString() } : {}),
          },
        },
        ...basketActivity(ctx),
      ];
    case "TokenWhitelisted":
    case "TokenDelisted":
    case "Deposited":
    case "Redeemed":
    case "ManagementFeeAccrued":
      return basketActivity(ctx);

    default:
      return [];
  }
}

function basketActivity(ctx: DecodedEventContext): MirrorUpsert[] {
  return [{
    table: "basket_events",
    conflictColumns: ["chain_id", "tx_hash", "log_index"],
    row: {
      chain_id: ctx.chainId,
      tx_hash: ctx.txHash,
      log_index: ctx.logIndex,
      block_number: ctx.blockNumber.toString(),
      basket_address: ctx.contractAddress,
      kind: ctx.eventName,
      payload: ctx.args,
    },
  }];
}
