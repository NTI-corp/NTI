import type { DecodedEventContext, EventHandler, MirrorUpsert } from "../types.js";
import { handleOracleEvent } from "./oracle.js";
import { handleStakingEvent } from "./staking.js";
import { handleMarketEvent } from "./market.js";
import { handleBasketEvent } from "./basket.js";
import { handleGrantsEvent } from "./grants.js";
import { handleGovernanceEvent } from "./governance.js";

const DOMAIN_HANDLERS: readonly EventHandler[] = [
  handleOracleEvent,
  handleStakingEvent,
  handleMarketEvent,
  handleBasketEvent,
  handleGrantsEvent,
  handleGovernanceEvent,
];

export function dispatchEventHandlers(ctx: DecodedEventContext): MirrorUpsert[] {
  const out: MirrorUpsert[] = [];
  for (const handler of DOMAIN_HANDLERS) {
    const upserts = handler(ctx);
    if (upserts.length > 0) {
      out.push(...upserts);
    }
  }
  return out;
}

export {
  handleOracleEvent,
  handleStakingEvent,
  handleMarketEvent,
  handleBasketEvent,
  handleGrantsEvent,
  handleGovernanceEvent,
};
