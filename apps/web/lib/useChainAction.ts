"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BaseError, ContractFunctionRevertedError, type Abi, type Address } from "viem";
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { getActiveChainId, getChain } from "./contracts";

export interface ChainTxParams {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
}

export interface TxActionState {
  status: "idle" | "switching" | "wallet" | "pending" | "confirmed" | "error";
  label: string | null;
  hash: `0x${string}` | null;
  error: string | null;
}

const KNOWN_ERROR_HINTS: Array<[RegExp, string]> = [
  [/AllocationNotConfigured/i, "Vault constituent tokens have not been configured on-chain yet."],
  [/InsufficientStake/i, "Wallet active stake is below the required amount."],
  [/InsufficientProposalStake/i, "Active stake is below this round?s proposal threshold."],
  [/CooldownNotElapsed/i, "The unstake cooldown is still running."],
  [/NothingToWithdraw|NothingToClaim/i, "No unlocked balance or claimable reward available yet."],
  [/FaucetCooldownActive/i, "This wallet?s faucet cooldown is still running."],
  [/BetBelowMinimum/i, "Bet size is below market minimum."],
  [/BettingClosed/i, "Betting window has already closed for this market."],
  [/SettlementNotReady/i, "Market settlement epoch is not finalized yet."],
  [/MarketAlreadySettled/i, "This market has already been settled."],
  [/AlreadyClaimed/i, "Payout has already been claimed by this wallet."],
  [/AlreadyVoted/i, "This wallet has already voted in the active round."],
  [/ExceedsVotingPower/i, "Vote weight exceeds snapshot voting power at the round block."],
  [/RoundNotActive|RoundNotEnded/i, "Grant round state does not allow this action right now."],
  [/DisputeWindowClosed|EpochNotCommitted/i, "Disputes require a committed epoch with an open challenge window."],
  [/DisputeWindowActive/i, "The dispute window must close before finalization."],
  [/ERC20InsufficientAllowance/i, "Token allowance insufficient — approve $NTI first."],
  [/GovernorAlreadyCastVote/i, "This wallet already voted on this proposal."],
  [/GovernorInsufficientProposerVotes/i, "Voting power is below the on-chain proposal threshold."],
  [/GovernorUnexpectedProposalState|TimelockUnexpectedOperationState/i, "The proposal is ineligible for this action at the current block."],
  [/User rejected|User denied/i, "Transaction cancelled in wallet."],
];

export function formatChainError(err: unknown): string {
  const reverted = err instanceof BaseError
    ? err.walk((cause) => cause instanceof ContractFunctionRevertedError)
    : null;
  const raw =
    (reverted instanceof ContractFunctionRevertedError ? reverted.data?.errorName : undefined) ??
    (err as { shortMessage?: string; message?: string } | null)?.shortMessage ??
    (err instanceof Error ? err.message : "Transaction failed.");
  for (const [pattern, friendly] of KNOWN_ERROR_HINTS) {
    if (pattern.test(raw)) return friendly;
  }
  return raw.length > 160 ? `${raw.slice(0, 160)}…` : raw;
}

/**
 * Unified hook for write transactions across NTI:
 * - Enforces target Robinhood Chain (46630/4663) with automatic switchChain attempt
 * - Awaits receipt via publicClient.waitForTransactionReceipt
 * - Calls optional onConfirmed callback + router.refresh()
 */
export function useChainAction(onConfirmed?: () => Promise<void> | void) {
  const router = useRouter();
  const { address, isConnected, chainId: walletChainId } = useAccount();
  const submitting = useRef(false);
  const targetChainId = getActiveChainId();
  const targetChain = getChain(targetChainId);
  const explorerBase =
    targetChain.blockExplorers?.default.url ?? "https://explorer.testnet.chain.robinhood.com";

  const publicClient = usePublicClient({ chainId: targetChainId });
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const [txState, setTxState] = useState<TxActionState>({
    status: "idle",
    label: null,
    hash: null,
    error: null,
  });

  const wrongChain = isConnected && walletChainId !== undefined && walletChainId !== targetChainId;
  const isBusy = useMemo(
    () =>
      txState.status === "switching" ||
      txState.status === "wallet" ||
      txState.status === "pending",
    [txState.status],
  );

  const ensureChain = useCallback(async () => {
    if (!isConnected) {
      throw new Error("Connect an EVM wallet first.");
    }
    if (walletChainId !== targetChainId) {
      setTxState({
        status: "switching",
        label: `Switching wallet to ${targetChain.name} (${targetChainId})...`,
        hash: null,
        error: null,
      });
      await switchChainAsync({ chainId: targetChainId });
    }
  }, [isConnected, walletChainId, targetChainId, targetChain.name, switchChainAsync]);

  const execute = useCallback(
    async (
      label: string,
      txParams: ChainTxParams,
      customSuccessLabel?: string,
    ): Promise<`0x${string}` | null> => {
      if (submitting.current) return null;
      submitting.current = true;
      let hash: `0x${string}` | null = null;
      try {
        if (!address || !publicClient) throw new Error("Connect a wallet and retry when the chain RPC is available.");
        await ensureChain();
        setTxState({ status: "wallet", label: `Checking ${label} on-chain?`, hash: null, error: null });
        await publicClient.simulateContract({ ...txParams, account: address });
        setTxState({
          status: "wallet",
          label: `Confirm ${label} in wallet...`,
          hash: null,
          error: null,
        });

        hash = await writeContractAsync({
          ...txParams,
          chainId: targetChainId,
        } as Parameters<typeof writeContractAsync>[0]);

        setTxState({
          status: "pending",
          label: `${label} submitted — waiting confirmation...`,
          hash,
          error: null,
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") {
          throw new Error(`Transaction reverted on-chain (${receipt.transactionHash.slice(0, 10)}?).`);
        }
        hash = receipt.transactionHash;

        setTxState({
          status: "confirmed",
          label: customSuccessLabel ?? `${label} confirmed on ${targetChain.name}.`,
          hash,
          error: null,
        });

        // A refresh problem cannot invalidate a successful receipt.
        if (onConfirmed) void Promise.resolve().then(onConfirmed).catch(() => {});
        router.refresh();
        return hash;
      } catch (err) {
        setTxState({
          status: "error",
          label: null,
          hash,
          error: formatChainError(err),
        });
        return null;
      } finally {
        submitting.current = false;
      }
    },
    [address, ensureChain, writeContractAsync, targetChainId, publicClient, targetChain.name, onConfirmed, router],
  );

  const resetTx = useCallback(() => {
    setTxState({ status: "idle", label: null, hash: null, error: null });
  }, []);

  return {
    txState,
    isBusy,
    wrongChain,
    targetChainId,
    targetChainName: targetChain.name,
    explorerBase,
    execute,
    ensureChain,
    resetTx,
  };
}
