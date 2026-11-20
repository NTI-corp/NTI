import type { DecodedEventContext, MirrorUpsert } from "../types.js";

export function handleOracleEvent(ctx: DecodedEventContext): MirrorUpsert[] {
  const { eventName, args, txHash, blockNumber } = ctx;
  const nowIso = ctx.blockTimeIso;

  switch (eventName) {
    case "EpochCommitted":
      return [
        {
          table: "epochs",
          conflictColumns: ["epoch_id"],
          row: {
            epoch_id: Number(args.epochId),
            series_id: Number(args.seriesId),
            status: "committed",
            dataset_hash: args.datasetHash,
            config_hash: args.configHash,
            arweave_tx: String(args.arweaveTx),
            commit_tx: txHash,
            committed_at: nowIso,
          },
        },
      ];

    case "EpochFinalized":
      return [
        {
          table: "epochs",
          conflictColumns: ["epoch_id"],
          row: {
            epoch_id: Number(args.epochId),
            status: "final",
            finalized_at: nowIso,
          },
        },
      ];

    case "EpochMarkedIncomplete":
      return [
        {
          table: "epochs",
          conflictColumns: ["epoch_id"],
          row: {
            epoch_id: Number(args.epochId),
            status: "incomplete",
          },
        },
      ];

    case "ValidatorJoined":
      return [
        {
          table: "validators",
          conflictColumns: ["address"],
          row: {
            address: args.validator,
            active: true,
            permissionless: true,
            added_at: nowIso,
          },
        },
      ];

    case "DisputeOpened":
      return [
        {
          table: "disputes",
          conflictColumns: ["dispute_id"],
          row: {
            dispute_id: Number(args.disputeId),
            epoch_id: Number(args.epochId),
            narrative_id: Number(args.narrativeId),
            challenger: args.challenger,
            claimed_i_bps: Number(args.claimedI),
            evidence_hash: args.evidenceHash,
            status: "open",
            opened_at: nowIso,
          },
        },
        {
          table: "epochs",
          conflictColumns: ["epoch_id"],
          row: {
            epoch_id: Number(args.epochId),
            status: "disputed",
          },
        },
      ];

    case "DisputeResolved":
      return [
        {
          table: "disputes",
          conflictColumns: ["dispute_id"],
          row: {
            dispute_id: Number(args.disputeId),
            epoch_id: Number(args.epochId),
            status: args.challengerWon ? "resolved_challenger" : "resolved_operator",
            resolved_at: nowIso,
          },
        },
        {
          table: "epochs",
          conflictColumns: ["epoch_id"],
          row: {
            epoch_id: Number(args.epochId),
            status: "final",
            finalized_at: nowIso,
          },
        },
      ];

    case "DisputeExpired":
      return [
        {
          table: "disputes",
          conflictColumns: ["dispute_id"],
          row: {
            dispute_id: Number(args.disputeId),
            epoch_id: Number(args.epochId),
            status: "expired",
            resolved_at: nowIso,
          },
        },
        {
          table: "epochs",
          conflictColumns: ["epoch_id"],
          row: {
            epoch_id: Number(args.epochId),
            status: "incomplete",
          },
        },
      ];

    case "RegistryFrozen":
    case "NtiUpdated":
    case "StakingUpdated":
    case "BuybackAdapterUpdated":
      return [
        {
          table: "registry_state",
          conflictColumns: ["chain_id"],
          row: {
            chain_id: ctx.chainId,
            last_event: eventName,
            last_block: blockNumber.toString(),
            ...(eventName === "RegistryFrozen"
              ? { frozen: true, nti_token: args.ntiToken }
              : eventName === "NtiUpdated"
                ? { nti_token: args.token }
                : eventName === "StakingUpdated"
                  ? { staking: args.stakingContract }
                  : { buyback_adapter: args.adapter }),
          },
        },
      ];

    case "KOLRegistered":
      return [
        {
          table: "kol_wallet_attestations",
          conflictColumns: ["wallet"],
          row: {
            wallet: args.wallet,
            handle_hash: args.handleHash,
            active: true,
            block_number: blockNumber.toString(),
          },
        },
      ];

    case "KOLUnregistered":
      return [
        {
          table: "kol_wallet_attestations",
          conflictColumns: ["wallet"],
          row: {
            wallet: args.wallet,
            active: false,
            block_number: blockNumber.toString(),
          },
        },
      ];

    default:
      return [];
  }
}
