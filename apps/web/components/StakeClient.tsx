"use client";

import React, { useEffect, useState } from "react";
import { formatEther, formatUnits, parseUnits } from "viem";
import { useAccount, usePublicClient, useReadContract } from "wagmi";
import { TxStatusBanner } from "@/components/TxStatusBanner";
import {
  ROBINHOOD_TESTNET_ID,
  erc20Abi,
  estimateTxGas,
  getActiveChainId,
  getProtocolAddresses,
  governorAbi,
  stakingAbi,
  type GasEstimateDisplay,
} from "@/lib/contracts";
import { formatCompactNumber, getStakerTier, truncateHex } from "@/lib/format";
import { useChainAction } from "@/lib/useChainAction";
import { useSiweSession } from "./Providers";
import type { GovernorProposalItem } from "@/lib/types";
import { TierLadder } from "@/components/ui/Visuals";

const TIERS = [
  { name: "Tier 1", minNti: 100_000, discount: "10%", radar: "Real-time Radar" },
  { name: "Tier 2", minNti: 1_000_000, discount: "25%", radar: "Real-time Radar" },
  { name: "Tier 3", minNti: 5_000_000, discount: "50%", radar: "Real-time Radar + Validator Bond" },
] as const;

const FAUCET_COOLDOWN_SEC = 86_400;

function safeParseNti(raw: string): bigint | null {
  const clean = raw.trim();
  if (!clean || !/^\d+(\.\d{1,18})?$/.test(clean)) return null;
  try {
    return parseUnits(clean, 18);
  } catch {
    return null;
  }
}

export function StakeClient({ proposals }: { proposals: GovernorProposalItem[] }) {
  const { address, isConnected } = useAccount();
  const activeChainId = getActiveChainId();
  const isTestnet = activeChainId === ROBINHOOD_TESTNET_ID;
  const publicClient = usePublicClient({ chainId: activeChainId });
  const { refresh: refreshSiwe } = useSiweSession();
  const addresses = getProtocolAddresses(activeChainId);

  const [tab, setTab] = useState<"stake" | "unstake">("stake");
  const [amountInput, setAmountInput] = useState("100000");
  const [gasEst, setGasEst] = useState<GasEstimateDisplay | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const id = window.setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const { data: ntiBalanceWei, refetch: refetchBalance } = useReadContract({
    address: addresses.ntiToken ?? undefined,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: activeChainId,
    query: { enabled: Boolean(addresses.ntiToken && address) },
  });

  const { data: allowanceWei, refetch: refetchAllowance } = useReadContract({
    address: addresses.ntiToken ?? undefined,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && addresses.staking ? [address, addresses.staking] : undefined,
    chainId: activeChainId,
    query: { enabled: Boolean(addresses.ntiToken && addresses.staking && address) },
  });

  const { data: lastFaucetClaimRaw, refetch: refetchFaucet } = useReadContract({
    address: addresses.ntiToken ?? undefined,
    abi: erc20Abi,
    functionName: "lastFaucetClaim",
    args: address ? [address] : undefined,
    chainId: activeChainId,
    query: { enabled: Boolean(isTestnet && addresses.ntiToken && address) },
  });

  const { data: activeStakeWei, refetch: refetchStake } = useReadContract({
    address: addresses.staking ?? undefined,
    abi: stakingAbi,
    functionName: "stakeOf",
    args: address ? [address] : undefined,
    chainId: activeChainId,
    query: { enabled: Boolean(addresses.staking && address) },
  });

  const { data: cooldownTuple, refetch: refetchCooldown } = useReadContract({
    address: addresses.staking ?? undefined,
    abi: stakingAbi,
    functionName: "cooldownOf",
    args: address ? [address] : undefined,
    chainId: activeChainId,
    query: { enabled: Boolean(addresses.staking && address) },
  });

  const { data: pendingEthWei, refetch: refetchReward } = useReadContract({
    address: addresses.staking ?? undefined,
    abi: stakingAbi,
    functionName: "pendingReward",
    args: address ? [address] : undefined,
    chainId: activeChainId,
    query: { enabled: Boolean(addresses.staking && address) },
  });

  const { data: totalActiveWei, refetch: refetchTotal } = useReadContract({
    address: addresses.staking ?? undefined,
    abi: stakingAbi,
    functionName: "totalActiveStaked",
    chainId: activeChainId,
    query: { enabled: Boolean(addresses.staking) },
  });

  const { txState, isBusy, wrongChain, targetChainId, explorerBase, execute, resetTx } =
    useChainAction(async () => {
      await Promise.all([
        refetchBalance(),
        refetchAllowance(),
        refetchFaucet(),
        refetchStake(),
        refetchCooldown(),
        refetchReward(),
        refetchTotal(),
      ]);
      await refreshSiwe();
    });

  useEffect(() => {
    let active = true;
    void estimateTxGas(publicClient, {
      account: address,
      to: addresses.staking,
      fallbackGasLimit: 190_000n,
    }).then((g) => {
      if (active) setGasEst(g);
    });
    return () => {
      active = false;
    };
  }, [publicClient, address, addresses.staking, tab]);

  const walletBalanceWei = (ntiBalanceWei as bigint | undefined) ?? 0n;
  const currentAllowanceWei = (allowanceWei as bigint | undefined) ?? 0n;
  const stakeWei = (activeStakeWei as bigint | undefined) ?? 0n;
  const cooldownAmountWei = cooldownTuple ? cooldownTuple[0] : 0n;
  const cooldownUnlockAt = cooldownTuple ? Number(cooldownTuple[1]) : 0;
  const rewardWei = (pendingEthWei as bigint | undefined) ?? 0n;
  const totalWei = (totalActiveWei as bigint | undefined) ?? 0n;
  const lastClaimSec = lastFaucetClaimRaw ? Number(lastFaucetClaimRaw) : 0;

  const faucetUnlockSec = lastClaimSec > 0 ? lastClaimSec + FAUCET_COOLDOWN_SEC : 0;
  const faucetCooldownRemaining = Math.max(0, faucetUnlockSec - nowSec);
  const faucetOnCooldown = isConnected && lastClaimSec > 0 && faucetCooldownRemaining > 0;

  const walletBalanceNum = Number(formatUnits(walletBalanceWei, 18));
  const activeStakeNum = Number(formatUnits(stakeWei, 18));
  const cooldownAmtNum = Number(formatUnits(cooldownAmountWei, 18));
  const pendingEth = Number(formatEther(rewardWei));
  const totalStakedNum = Number(formatUnits(totalWei, 18));
  const tier = getStakerTier(activeStakeNum);

  const parsedAmountWei = safeParseNti(amountInput);
  const hasValidAmount = parsedAmountWei !== null && parsedAmountWei > 0n;
  const needsApproval = hasValidAmount && currentAllowanceWei < parsedAmountWei;
  const insufficientWalletBalance =
    tab === "stake" && isConnected && hasValidAmount && parsedAmountWei > walletBalanceWei;
  const insufficientStakedBalance =
    tab === "unstake" && isConnected && hasValidAmount && parsedAmountWei > stakeWei;
  const withdrawUnlocked = cooldownAmountWei > 0n && nowSec >= cooldownUnlockAt;

  const runAction = async (
    action: "faucet" | "approve" | "stake" | "requestUnstake" | "withdraw" | "claim",
  ) => {
    setValidationError(null);
    if (!isConnected || !address) {
      setValidationError("Connect your wallet in the top bar first.");
      return;
    }

    if (action === "faucet") {
      if (!addresses.ntiToken) {
        setValidationError("NTITestToken contract address not configured.");
        return;
      }
      if (faucetOnCooldown) {
        const hrs = Math.ceil(faucetCooldownRemaining / 3600);
        setValidationError(`Faucet cooldown active (~${hrs}h remaining).`);
        return;
      }
      await execute(
        "Mint 10,000 tNTI from faucet",
        {
          address: addresses.ntiToken,
          abi: erc20Abi,
          functionName: "faucet",
        },
        "Minted 10,000 test $NTI.",
      );
      return;
    }

    if (action === "approve") {
      if (!addresses.ntiToken || !addresses.staking) {
        setValidationError("Token or Staking contract address not configured.");
        return;
      }
      if (!parsedAmountWei || parsedAmountWei <= 0n) {
        setValidationError("Enter a valid positive $NTI amount to approve.");
        return;
      }
      await execute(
        `Approve ${Number(formatUnits(parsedAmountWei, 18)).toLocaleString("en-US")} $NTI`,
        {
          address: addresses.ntiToken,
          abi: erc20Abi,
          functionName: "approve",
          args: [addresses.staking, parsedAmountWei],
        },
        "Staking allowance approved.",
      );
      return;
    }

    if (!addresses.staking) {
      setValidationError("Staking contract address not configured.");
      return;
    }

    if (action === "stake") {
      if (!parsedAmountWei || parsedAmountWei <= 0n) {
        setValidationError("Enter a valid positive $NTI amount to stake.");
        return;
      }
      if (parsedAmountWei > walletBalanceWei) {
        setValidationError("Insufficient $NTI wallet balance.");
        return;
      }
      if (needsApproval) {
        setValidationError("Approve $NTI allowance for Staking contract first.");
        return;
      }
      await execute(
        `Stake ${Number(formatUnits(parsedAmountWei, 18)).toLocaleString("en-US")} $NTI`,
        {
          address: addresses.staking,
          abi: stakingAbi,
          functionName: "stake",
          args: [parsedAmountWei],
        },
        "$NTI staked & SIWE tier refreshed.",
      );
      return;
    }

    if (action === "requestUnstake") {
      if (!parsedAmountWei || parsedAmountWei <= 0n) {
        setValidationError("Enter a valid positive $NTI amount to unstake.");
        return;
      }
      if (parsedAmountWei > stakeWei) {
        setValidationError("Amount exceeds your active staked balance.");
        return;
      }
      await execute(
        `Request unstake of ${Number(formatUnits(parsedAmountWei, 18)).toLocaleString("en-US")} $NTI`,
        {
          address: addresses.staking,
          abi: stakingAbi,
          functionName: "requestUnstake",
          args: [parsedAmountWei],
        },
        "7-day unstake cooldown started.",
      );
      return;
    }

    if (action === "withdraw") {
      if (!withdrawUnlocked) {
        setValidationError("No unlocked cooldown balance ready to withdraw yet.");
        return;
      }
      await execute(
        "Withdraw unlocked $NTI",
        {
          address: addresses.staking,
          abi: stakingAbi,
          functionName: "withdraw",
        },
        "Unlocked $NTI withdrawn to wallet.",
      );
      return;
    }

    if (rewardWei <= 0n) {
      setValidationError("No claimable ETH rewards available yet.");
      return;
    }
    await execute(
      "Claim ETH staking rewards",
      {
        address: addresses.staking,
        abi: stakingAbi,
        functionName: "claim",
      },
      "ETH staking rewards claimed.",
    );
  };

  const castGovVote = async (proposalId: string, support: 0 | 1 | 2) => {
    setValidationError(null);
    if (!isConnected || !addresses.governor) {
      setValidationError("Connect wallet with NTIGovernor contract configured.");
      return;
    }
    await execute(
      `Cast governance vote on #${proposalId}`,
      {
        address: addresses.governor,
        abi: governorAbi,
        functionName: "castVote",
        args: [BigInt(proposalId), support],
      },
      `Governance vote recorded on proposal #${proposalId}.`,
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#232325] pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#71717A]">
              Staking &amp; Governance · IVotes Checkpointed
            </span>
            {wrongChain && (
              <span className="rounded border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-2 py-0.5 font-mono text-[10px] text-[#F59E0B]">
                AUTO-SWITCHES TO CHAIN {targetChainId} ON TX
              </span>
            )}
          </div>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-[#F4F4F5]">
            Stake $NTI
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-[#A1A1AA]">
            Stakers earn 30% of protocol fees paid in ETH, unlock zero-delay Radar at 100,000 $NTI, receive up to 50% NarrativeMarket fee discounts, and govern NTIGovernor (4% quorum, 3d vote, 48h Timelock).
          </p>
        </div>

        {isTestnet && (
          <button
            type="button"
            disabled={isBusy || faucetOnCooldown}
            onClick={() => void runAction("faucet")}
            className="rounded-md border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-3 py-2 font-mono text-xs font-medium text-[#F59E0B] transition-colors hover:bg-[#F59E0B]/20 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {faucetOnCooldown
              ? `FAUCET COOLDOWN (${Math.ceil(faucetCooldownRemaining / 3600)}H)`
              : "TESTNET FAUCET (+10,000 tNTI)"}
          </button>
        )}
      </div>

      {/* Position Summary Strip */}
      <div className="grid grid-cols-2 gap-3 font-mono tabular-nums lg:grid-cols-5">
        <div className="rounded-lg border border-[#232325] bg-[#0E0E0F] p-3.5">
          <div className="font-sans text-[11px] font-medium uppercase tracking-wider text-[#71717A]">
            Wallet $NTI
          </div>
          <div className="mt-1 text-lg font-semibold text-[#F4F4F5]">
            {isConnected ? `${Math.floor(walletBalanceNum).toLocaleString("en-US")}` : "—"}
          </div>
          <div className="mt-0.5 font-sans text-[11px] text-[#A1A1AA]">Liquid balance</div>
        </div>

        <div className="rounded-lg border border-[#232325] bg-[#0E0E0F] p-3.5">
          <div className="font-sans text-[11px] font-medium uppercase tracking-wider text-[#71717A]">
            Your Active Stake
          </div>
          <div className="mt-1 text-lg font-semibold text-[#F4F4F5]">
            {Math.floor(activeStakeNum).toLocaleString("en-US")} $NTI
          </div>
          <div className="mt-0.5 font-sans text-[11px] text-[#22C55E]">{tier.tierName}</div>
        </div>

        <div className="rounded-lg border border-[#232325] bg-[#0E0E0F] p-3.5">
          <div className="font-sans text-[11px] font-medium uppercase tracking-wider text-[#71717A]">
            Cooldown (7-Day Lock)
          </div>
          <div className="mt-1 text-lg font-semibold text-[#F59E0B]">
            {Math.floor(cooldownAmtNum).toLocaleString("en-US")} $NTI
          </div>
          <div className="mt-0.5 font-sans text-[11px] text-[#A1A1AA]">
            {cooldownUnlockAt > 0
              ? withdrawUnlocked
                ? "Unlocked — ready to withdraw"
                : `Unlocks ${new Date(cooldownUnlockAt * 1000).toLocaleDateString()}`
              : "No active cooldown"}
          </div>
        </div>

        <div className="rounded-lg border border-[#232325] bg-[#0E0E0F] p-3.5">
          <div className="font-sans text-[11px] font-medium uppercase tracking-wider text-[#71717A]">
            Claimable ETH Rewards
          </div>
          <div className="mt-1 text-lg font-semibold text-[#22C55E]">
            {pendingEth.toFixed(5)} ETH
          </div>
          <button
            type="button"
            disabled={isBusy || rewardWei <= 0n}
            onClick={() => void runAction("claim")}
            className="mt-0.5 text-[11px] text-[#CCFF00] hover:underline disabled:cursor-not-allowed disabled:opacity-40"
          >
            CLAIM REWARD →
          </button>
        </div>

        <div className="col-span-2 rounded-lg border border-[#232325] bg-[#0E0E0F] p-3.5 lg:col-span-1">
          <div className="font-sans text-[11px] font-medium uppercase tracking-wider text-[#71717A]">
            Protocol Total Staked
          </div>
          <div className="mt-1 text-lg font-semibold text-[#F4F4F5]">
            {formatCompactNumber(totalStakedNum)} $NTI
          </div>
          <div className="mt-0.5 font-sans text-[11px] text-[#A1A1AA]">
            30% FeeRouter ETH stream
          </div>
        </div>
      </div>

      {/* Main Split: Stake / Unstake Form + Tier Ladder */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-lg border border-[#232325] bg-[#0E0E0F] p-4 lg:col-span-5">
          <div className="grid grid-cols-2 gap-1 rounded-md border border-[#232325] bg-[#090909] p-1 font-mono text-xs">
            <button
              type="button"
              onClick={() => {
                setTab("stake");
                setValidationError(null);
              }}
              className={`rounded py-2 font-semibold transition-colors ${
                tab === "stake"
                  ? "bg-[#22C55E]/15 text-[#22C55E]"
                  : "text-[#A1A1AA] hover:text-[#F4F4F5]"
              }`}
            >
              STAKE $NTI
            </button>
            <button
              type="button"
              onClick={() => {
                setTab("unstake");
                setValidationError(null);
              }}
              className={`rounded py-2 font-semibold transition-colors ${
                tab === "unstake"
                  ? "bg-[#F59E0B]/15 text-[#F59E0B]"
                  : "text-[#A1A1AA] hover:text-[#F4F4F5]"
              }`}
            >
              UNSTAKE / WITHDRAW
            </button>
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <div className="flex items-center justify-between font-mono text-[10px] text-[#A1A1AA]">
                <label>AMOUNT ($NTI)</label>
                <button
                  type="button"
                  onClick={() =>
                    setAmountInput(
                      tab === "stake"
                        ? formatUnits(walletBalanceWei, 18)
                        : formatUnits(stakeWei, 18),
                    )
                  }
                  className="text-[#CCFF00] hover:underline tabular-nums"
                >
                  MAX:{" "}
                  {tab === "stake"
                    ? `${Math.floor(walletBalanceNum).toLocaleString("en-US")}`
                    : `${Math.floor(activeStakeNum).toLocaleString("en-US")}`}
                </button>
              </div>
              <input
                type="number"
                min="0"
                step="10000"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-[#232325] bg-[#090909] px-3 py-2 font-mono text-sm text-[#F4F4F5] tabular-nums focus:border-[#CCFF00] focus:outline-none"
              />
              <div className="mt-2 flex flex-wrap gap-1.5 font-mono text-[10px]">
                {["10000", "100000", "1000000", "5000000"].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setAmountInput(v)}
                    className="rounded border border-[#232325] bg-[#131314] px-2 py-1 text-[#A1A1AA] hover:text-[#F4F4F5]"
                  >
                    {Number(v).toLocaleString("en-US")}
                  </button>
                ))}
              </div>
            </div>

            {gasEst && (
              <div className="flex justify-between rounded-md border border-[#232325] bg-[#090909] px-3 py-2 font-mono text-[11px] text-[#A1A1AA] tabular-nums">
                <span>Est. gas ({gasEst.gasPriceGwei} gwei)</span>
                <span>~{gasEst.estimatedCostEth} ETH</span>
              </div>
            )}

            {tab === "stake" ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={
                    isBusy ||
                    !isConnected ||
                    !hasValidAmount ||
                    insufficientWalletBalance ||
                    !needsApproval
                  }
                  onClick={() => void runAction("approve")}
                  className="rounded-md border border-[#232325] bg-[#131314] py-2.5 font-mono text-xs font-semibold text-[#F4F4F5] transition-colors hover:border-[#CCFF00]/50 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {!needsApproval && hasValidAmount ? "1. APPROVED ✓" : "1. APPROVE"}
                </button>
                <button
                  type="button"
                  disabled={
                    isBusy ||
                    !isConnected ||
                    !hasValidAmount ||
                    insufficientWalletBalance ||
                    needsApproval
                  }
                  onClick={() => void runAction("stake")}
                  className="rounded-md bg-[#22C55E] py-2.5 font-mono text-xs font-semibold text-[#090909] transition-colors hover:bg-[#16A34A] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {insufficientWalletBalance ? "INSUFFICIENT $NTI" : "2. STAKE $NTI"}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={
                    isBusy || !isConnected || !hasValidAmount || insufficientStakedBalance
                  }
                  onClick={() => void runAction("requestUnstake")}
                  className="rounded-md border border-[#F59E0B]/50 bg-[#F59E0B]/15 py-2.5 font-mono text-xs font-semibold text-[#F59E0B] transition-colors hover:bg-[#F59E0B]/25 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  REQUEST UNSTAKE (7D)
                </button>
                <button
                  type="button"
                  disabled={isBusy || !isConnected || !withdrawUnlocked}
                  onClick={() => void runAction("withdraw")}
                  className="rounded-md border border-[#CCFF00]/50 bg-[#CCFF00]/12 py-2.5 font-mono text-xs font-semibold text-[#CCFF00] transition-colors hover:bg-[#CCFF00]/22 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  WITHDRAW UNLOCKED
                </button>
              </div>
            )}

            {validationError && (
              <div className="rounded-md border border-[#EF4444]/40 bg-[#EF4444]/10 px-3 py-2 text-xs text-[#F87171]">
                {validationError}
              </div>
            )}

            <TxStatusBanner state={txState} explorerBase={explorerBase} onDismiss={resetTx} />
          </div>
        </div>

        {/* Tier Access & Fee Discount Ladder */}
        <div className="rounded-lg border border-[#232325] bg-[#0E0E0F] p-4 lg:col-span-7">
          <h2 className="text-sm font-semibold text-[#F4F4F5]">
            Staker Access &amp; Fee Discount Tiers
          </h2>
          <p className="mt-0.5 text-xs text-[#A1A1AA]">
            Fee-on-transfer safe staking (tracks exact received delta). Slashing applies across active + cooldown balances.
          </p>

          <TierLadder stake={activeStakeNum} tiers={TIERS} />

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {TIERS.map((t) => {
              const unlocked = activeStakeNum >= t.minNti;
              return (
                <div
                  key={t.name}
                  className={`rounded-md border p-3.5 font-mono ${
                    unlocked
                      ? "border-[#22C55E]/50 bg-[#22C55E]/10"
                      : "border-[#232325] bg-[#090909]"
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-[#A1A1AA]">{t.name.toUpperCase()}</span>
                    <span className={unlocked ? "text-[#22C55E]" : "text-[#71717A]"}>
                      {unlocked ? "UNLOCKED" : "LOCKED"}
                    </span>
                  </div>
                  <div className="mt-1.5 text-base font-semibold text-[#F4F4F5] tabular-nums">
                    {formatCompactNumber(t.minNti)} $NTI
                  </div>
                  <div className="mt-2 font-sans text-xs font-medium text-[#22C55E]">
                    {t.discount} Market Fee Discount
                  </div>
                  <div className="mt-0.5 font-sans text-[11px] text-[#A1A1AA]">{t.radar}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* NTIGovernor Proposals */}
      <section className="rounded-lg border border-[#232325] bg-[#0E0E0F]">
        <div className="border-b border-[#232325] px-4 py-3">
          <h2 className="text-sm font-semibold text-[#F4F4F5]">
            NTIGovernor Proposals (4% Quorum · 3d Voting · 48h Timelock)
          </h2>
          <p className="mt-0.5 text-xs text-[#A1A1AA]">
            Controls ConfigRegistry parameters, validator permissionless mode, basket token whitelists, risk caps, and InsuranceFund.
          </p>
        </div>

        {proposals.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-[#A1A1AA]">
            No NTIGovernor proposals indexed yet. Submit on-chain proposals once governance voting weights reach quorum.
          </div>
        ) : (
          <div className="divide-y divide-[#232325]">
            {proposals.map((p) => {
              const totalVotes = p.forVotesNti + p.againstVotesNti + p.abstainVotesNti;
              const forPct =
                totalVotes > 0 ? Math.round((p.forVotesNti / totalVotes) * 100) : 0;
              return (
                <div key={p.proposalId} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="max-w-2xl">
                      <div className="flex flex-wrap items-center gap-2 font-mono text-[10px]">
                        <span className="rounded border border-[#232325] bg-[#131314] px-1.5 py-0.5 text-[#CCFF00]">
                          {p.category.toUpperCase()}
                        </span>
                        <span
                          className={`rounded border px-1.5 py-0.5 ${
                            p.status === "Active"
                              ? "border-[#22C55E]/40 bg-[#22C55E]/10 text-[#22C55E]"
                              : p.status === "Queued"
                                ? "border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#F59E0B]"
                                : "border-[#232325] text-[#A1A1AA]"
                          }`}
                        >
                          {p.status.toUpperCase()}
                        </span>
                        <span className="text-[#71717A]">
                          ID #{p.proposalId} · By {truncateHex(p.proposer, 6, 4)}
                        </span>
                      </div>
                      <h3 className="mt-1.5 text-sm font-semibold text-[#F4F4F5]">{p.title}</h3>
                      <p className="mt-1 text-xs text-[#A1A1AA]">{p.summary}</p>
                    </div>

                    {p.status === "Active" && (
                      <div className="flex items-center gap-1.5 font-mono text-[11px]">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void castGovVote(p.proposalId, 1)}
                          className="rounded-md border border-[#22C55E]/50 bg-[#22C55E]/15 px-3 py-1.5 text-[#22C55E] hover:bg-[#22C55E]/25 disabled:opacity-45"
                        >
                          FOR
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void castGovVote(p.proposalId, 0)}
                          className="rounded-md border border-[#EF4444]/50 bg-[#EF4444]/15 px-3 py-1.5 text-[#F87171] hover:bg-[#EF4444]/25 disabled:opacity-45"
                        >
                          AGAINST
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void castGovVote(p.proposalId, 2)}
                          className="rounded-md border border-[#232325] bg-[#131314] px-3 py-1.5 text-[#A1A1AA] hover:text-[#F4F4F5] disabled:opacity-45"
                        >
                          ABSTAIN
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-4 font-mono text-[11px] text-[#A1A1AA] tabular-nums">
                    <span className="text-[#22C55E]">
                      FOR {formatCompactNumber(p.forVotesNti)} ({forPct}%)
                    </span>
                    <span className="text-[#F87171]">
                      AGAINST {formatCompactNumber(p.againstVotesNti)}
                    </span>
                    <span>ABSTAIN {formatCompactNumber(p.abstainVotesNti)}</span>
                    <span className="text-[#71717A]">
                      Quorum {formatCompactNumber(p.quorumNti)} $NTI
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
