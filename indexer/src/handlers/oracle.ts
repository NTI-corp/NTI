import { keccak256, stringToHex } from "viem";
import type { DecodedEventContext, MirrorUpsert } from "../types.js";

export function handleOracleEvent(ctx: DecodedEventContext): MirrorUpsert[] {
  const { eventName, args, txHash, blockNumber } = ctx;
  const nowIso = ctx.blockTimeIso;

  switch (eventName) {
    case "EpochCommitted": {
      const epochId = Number(args.epochId);
      const datasetHash = String(args.datasetHash);
      const reference = String(args.arweaveTx).toLowerCase();
      const local = `local_${epochId}_${datasetHash.slice(2, 18).toLowerCase()}`;
      return [
        {
          table: "epochs",
          conflictColumns: ["epoch_id"],
          fillMissing: /^0x[0-9a-f]{64}$/.test(reference) ? {
            column: "arweave_tx",
            value: keccak256(stringToHex(local)) === reference ? local : null,
            legacyValue: reference,
          } : undefined,
          row: {
            epoch_id: epochId,
            series_id: Number(args.seriesId),
            status: "committed",
            dataset_hash: datasetHash,
            config_hash: args.configHash,
            arweave_tx_bytes32: reference,
            commit_tx: txHash,
            committed_at: nowIso,
            finalized_at: null,
          },
        },
      ];
    }

    case "EpochFinalized":
    case "EpochDisputeResolved":
      return [
        {
          table: "epochs",
          conflictColumns: ["epoch_id"],
          updateOnly: true,
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
          updateOnly: true,
          // A gap has no commit, so OracleCommit.epochSeries returns zero.
          insertDefaults: { series_id: 0 },
          row: {
            epoch_id: Number(args.epochId),
            status: "incomplete",
          },
        },
      ];

    case "EpochDisputed":
      return [{
        table: "epochs",
        conflictColumns: ["epoch_id"],
        updateOnly: true,
        row: { epoch_id: Number(args.epochId), status: "disputed" },
      }];

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
            dispute_id: String(args.disputeId),
            contract_address: ctx.contractAddress,
            epoch_id: Number(args.epochId),
            narrative_id: Number(args.narrativeId),
            challenger: args.challenger,
            claimed_i_bps: Number(args.claimedI),
            evidence_hash: args.evidenceHash,
            status: "open",
            opened_at: nowIso,
            resolved_at: null,
          },
        },
      ];

    case "DisputeResolved":
      return [
        {
          table: "disputes",
          conflictColumns: ["dispute_id"],
          updateOnly: true,
          row: {
            dispute_id: String(args.disputeId),
            contract_address: ctx.contractAddress,
            status: args.challengerWon ? "resolved_challenger" : "resolved_operator",
            resolved_at: nowIso,
          },
        },
      ];

    case "DisputeExpired":
      return [
        {
          table: "disputes",
          conflictColumns: ["dispute_id"],
          updateOnly: true,
          row: {
            dispute_id: String(args.disputeId),
            contract_address: ctx.contractAddress,
            status: "expired",
            resolved_at: nowIso,
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
