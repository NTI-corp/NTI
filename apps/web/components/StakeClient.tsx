"use client";

import React, { useEffect, useState } from "react";
import { formatEther, formatUnits, parseUnits } from "viem";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import {
  erc20Abi,
  estimateTxGas,
  getActiveChainId,
  getProtocolAddresses,
  governorAbi,
  stakingAbi,
  type GasEstimateDisplay,
} from "@/lib/contracts";
import { formatCompactNumber, getStakerTier, truncateHex } from "@/lib/format";
import { useSiweSession } from "./Providers";
import type { GovernorProposalItem } from "@/lib/types";

const TIERS = [
  { name: "Tier 1", minNti: 100_000, discount: "10%", radar: "Real-time Radar" },
  { name: "Tier 2", minNti: 1_000_000, discount: "25%", radar: "Real-time Radar" },
  { name: "Tier 3", minNti: 5_000_000, discount: "50%", radar: "Real-time Radar + Validator Bond" },
] as const;

export function StakeClient({ proposals }: { proposals: GovernorProposalItem[] }) {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync, isPending } = useWriteContract();
  const { refresh: refreshSiwe } = useSiweSession();

  const addresses = getProtocolAddresses(getActiveChainId());
  const [tab, setTab] = useState<"stake" | "unstake">("stake");
  const [amountInput, setAmountInput] = useState("100000");
  const [gasEst, setGasEst] = useState<GasEstimateDisplay | null>(null);
  const [txMsg, setTxMsg] = useState<string | null>(null);
  const [txErr, setTxErr] = useState<string | null>(null);

  const { data: activeStakeWei } = useReadContract({
    address: addresses.staking ?? undefined,
    abi: stakingAbi,
    functionName: "stakeOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(addresses.staking && address) },
  });

  const { data: cooldownTuple } = useReadContract({
    address: addresses.staking ?? undefined,
    abi: stakingAbi,
    functionName: "cooldownOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(addresses.staking && address) },
  });

  const { data: pendingEthWei } = useReadContract({
    address: addresses.staking ?? undefined,
    abi: stakingAbi,
    functionName: "pendingReward",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(addresses.staking && address) },
  });

  const { data: totalActiveWei } = useReadContract({
    address: addresses.staking ?? undefined,
    abi: stakingAbi,
    functionName: "totalActiveStaked",
    query: { enabled: Boolean(addresses.staking) },
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

  const activeStakeNum = activeStakeWei ? Number(formatUnits(activeStakeWei, 18)) : 0;
  const cooldownAmtNum = cooldownTuple ? Number(formatUnits(cooldownTuple[0], 18)) : 0;
  const cooldownUnlockAt = cooldownTuple ? Number(cooldownTuple[1]) : 0;
  const pendingEth = pendingEthWei ? Number(formatEther(pendingEthWei)) : 0;
  const totalStakedNum = totalActiveWei ? Number(formatUnits(totalActiveWei, 18)) : 0;
  const tier = getStakerTier(activeStakeNum);

  const runAction = async (
    action: "faucet" | "approve" | "stake" | "requestUnstake" | "withdraw" | "claim",
  ) => {
    setTxErr(null);
    setTxMsg(null);
    if (!isConnected) {
      setTxErr("Connect your wallet in the top bar first.");
      return;
    }

    try {
      if (action === "faucet") {
        if (!addresses.ntiToken) throw new Error("NTITestToken address not configured.");
        const hash = await writeContractAsync({
          address: addresses.ntiToken,
          abi: erc20Abi,
          functionName: "faucet",
        });
        setTxMsg(`Faucet minted 10,000 test $NTI: ${hash}`);
        return;
      }

      if (action === "approve") {
        if (!addresses.ntiToken || !addresses.staking) {
          throw new Error("Token or Staking contract address not configured.");
        }
        const hash = await writeContractAsync({
          address: addresses.ntiToken,
          abi: erc20Abi,
          functionName: "approve",
          args: [addresses.staking, parseUnits(amountInput || "0", 18)],
        });
        setTxMsg(`Allowance approved: ${hash}`);
        return;
      }

      if (!addresses.staking) throw new Error("Staking contract address not configured.");

      if (action === "stake") {
        const hash = await writeContractAsync({
          address: addresses.staking,
          abi: stakingAbi,
          functionName: "stake",
          args: [parseUnits(amountInput || "0", 18)],
        });
        setTxMsg(`Stake transaction submitted: ${hash}`);
        void refreshSiwe();
      } else if (action === "requestUnstake") {
        const hash = await writeContractAsync({
          address: addresses.staking,
          abi: stakingAbi,
          functionName: "requestUnstake",
          args: [parseUnits(amountInput || "0", 18)],
        });
        setTxMsg(`7-day unstake cooldown started: ${hash}`);
      } else if (action === "withdraw") {
        const hash = await writeContractAsync({
          address: addresses.staking,
          abi: stakingAbi,
          functionName: "withdraw",
        });
        setTxMsg(`Cooldown withdrawal submitted: ${hash}`);
      } else if (action === "claim") {
        const hash = await writeContractAsync({
          address: addresses.staking,
          abi: stakingAbi,
          functionName: "claim",
        });
        setTxMsg(`ETH rewards claimed: ${hash}`);
      }
    } catch (e) {
      setTxErr(e instanceof Error ? e.message : "Transaction rejected");
    }
  };

  const castGovVote = async (proposalId: string, support: 0 | 1 | 2) => {
    setTxErr(null);
    setTxMsg(null);
    if (!isConnected || !addresses.governor) {
      setTxErr("Connect wallet with NTIGovernor contract configured.");
      return;
    }
    try {
      const hash = await writeContractAsync({
        address: addresses.governor,
        abi: governorAbi,
        functionName: "castVote",
        args: [BigInt(proposalId), support],
      });
      setTxMsg(`Governance vote submitted for #${proposalId}: ${hash}`);
    } catch (e) {
      setTxErr(e instanceof Error ? e.message : "Vote failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#1B2028] pb-4">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#556173]">
            STAKING &amp; GOVERNANCE · IVOTES CHECKPOINTED
          </span>
          <h1 className="mt-1.5 font-display text-2xl font-bold text-[#EDF1F7]">
            Stake $NTI · ETH Yield, Radar Access &amp; Governance
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-[#8A96A8]">
            Stakers earn 30% of protocol fees paid in ETH, unlock zero-delay Radar at 100,000 $NTI, receive up to 50% NarrativeMarket fee discounts, and govern NTIGovernor (4% quorum, 3d vote, 48h Timelock). Unstaking enters a 7-day cooldown (no votes or ETH yield while cooling down).
          </p>
        </div>

        <button
          type="button"
          disabled={isPending}
          onClick={() => void runAction("faucet")}
          className="rounded border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-3 py-2 font-mono text-xs text-[#F59E0B] hover:bg-[#F59E0B]/20 disabled:opacity-50"
        >
          TESTNET FAUCET (+10,000 NTITest)
        </button>
      </div>

      {/* Position Summary Strip */}
      <div className="grid grid-cols-2 gap-3 font-mono tabular-nums lg:grid-cols-4">
        <div className="panel-surface rounded-md p-3.5">
          <div className="text-[10px] text-[#556173]">YOUR ACTIVE STAKE</div>
          <div className="mt-1 text-lg font-semibold text-[#EDF1F7]">
            {Math.floor(activeStakeNum).toLocaleString("en-US")} $NTI
          </div>
          <div className="text-[10px] text-[#10B981]">{tier.tierName}</div>
        </div>

        <div className="panel-surface rounded-md p-3.5">
          <div className="text-[10px] text-[#556173]">COOLDOWN (7-DAY LOCK)</div>
          <div className="mt-1 text-lg font-semibold text-[#F59E0B]">
            {Math.floor(cooldownAmtNum).toLocaleString("en-US")} $NTI
          </div>
          <div className="text-[10px] text-[#8A96A8]">
            {cooldownUnlockAt > 0
              ? `Unlocks ${new Date(cooldownUnlockAt * 1000).toLocaleDateString()}`
              : "No active cooldown"}
          </div>
        </div>

        <div className="panel-surface rounded-md p-3.5">
          <div className="text-[10px] text-[#556173]">CLAIMABLE ETH REWARDS</div>
          <div className="mt-1 text-lg font-semibold text-[#10B981]">
            {pendingEth.toFixed(5)} ETH
          </div>
          <button
            type="button"
            disabled={isPending}
            onClick={() => void runAction("claim")}
            className="mt-1 text-[10px] text-[#38BDF8] hover:underline"
          >
            CLAIM REWARD →
          </button>
        </div>

        <div className="panel-surface rounded-md p-3.5">
          <div className="text-[10px] text-[#556173]">PROTOCOL TOTAL ACTIVE STAKED</div>
          <div className="mt-1 text-lg font-semibold text-[#EDF1F7]">
            {formatCompactNumber(totalStakedNum)} $NTI
          </div>
          <div className="text-[10px] text-[#8A96A8]">30% FeeRouter ETH stream</div>
        </div>
      </div>

      {/* Main Split: Stake / Unstake Form + Tier Ladder */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="panel-surface rounded-md p-4 lg:col-span-5">
          <div className="grid grid-cols-2 gap-1.5 rounded border border-[#1B2028] bg-[#0B0E13] p-1 font-mono text-xs">
            <button
              type="button"
              onClick={() => setTab("stake")}
              className={`rounded py-2 font-semibold ${
                tab === "stake"
                  ? "bg-[#10B981]/15 text-[#10B981]"
                  : "text-[#8A96A8] hover:text-[#EDF1F7]"
              }`}
            >
              STAKE $NTI
            </button>
            <button
              type="button"
              onClick={() => setTab("unstake")}
              className={`rounded py-2 font-semibold ${
                tab === "unstake"
                  ? "bg-[#F59E0B]/15 text-[#F59E0B]"
                  : "text-[#8A96A8] hover:text-[#EDF1F7]"
              }`}
            >
              UNSTAKE / WITHDRAW
            </button>
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <label className="font-mono text-[10px] text-[#8A96A8]">
                AMOUNT ($NTI)
              </label>
              <input
                type="number"
                min="0"
                step="10000"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                className="mt-1.5 w-full rounded border border-[#2A3342] bg-[#090B0E] px-3 py-2 font-mono text-sm text-[#EDF1F7] tabular-nums focus:border-[#38BDF8] focus:outline-none"
              />
              <div className="mt-2 flex gap-1.5 font-mono text-[10px]">
                {["100000", "1000000", "5000000"].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setAmountInput(v)}
                    className="rounded border border-[#1B2028] bg-[#131820] px-2 py-1 text-[#8A96A8] hover:text-[#EDF1F7]"
                  >
                    {Number(v).toLocaleString("en-US")}
                  </button>
                ))}
              </div>
            </div>

            {gasEst && (
              <div className="flex justify-between rounded border border-[#1B2028] bg-[#0B0E13] px-3 py-2 font-mono text-[11px] text-[#8A96A8] tabular-nums">
                <span>Est. gas ({gasEst.gasPriceGwei} gwei)</span>
                <span>~{gasEst.estimatedCostEth} ETH</span>
              </div>
            )}

            {tab === "stake" ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => void runAction("approve")}
                  className="rounded border border-[#2A3342] bg-[#131820] py-2.5 font-mono text-xs font-semibold text-[#EDF1F7] hover:border-[#38BDF8]/50 disabled:opacity-50"
                >
                  1. APPROVE
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => void runAction("stake")}
                  className="rounded border border-[#10B981]/50 bg-[#10B981]/15 py-2.5 font-mono text-xs font-semibold text-[#10B981] hover:bg-[#10B981]/25 disabled:opacity-50"
                >
                  2. STAKE $NTI
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => void runAction("requestUnstake")}
                  className="rounded border border-[#F59E0B]/50 bg-[#F59E0B]/15 py-2.5 font-mono text-xs font-semibold text-[#F59E0B] hover:bg-[#F59E0B]/25 disabled:opacity-50"
                >
                  REQUEST UNSTAKE (7D)
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => void runAction("withdraw")}
                  className="rounded border border-[#38BDF8]/50 bg-[#38BDF8]/15 py-2.5 font-mono text-xs font-semibold text-[#38BDF8] hover:bg-[#38BDF8]/25 disabled:opacity-50"
                >
                  WITHDRAW UNLOCKED
                </button>
              </div>
            )}

            {txErr && (
              <div className="rounded border border-[#EF4444]/40 bg-[#EF4444]/10 px-3 py-2 font-mono text-[11px] text-[#EF4444]">
                {txErr}
              </div>
            )}
            {txMsg && (
              <div className="rounded border border-[#10B981]/40 bg-[#10B981]/10 px-3 py-2 font-mono text-[11px] text-[#10B981]">
                {txMsg}
              </div>
            )}
          </div>
        </div>

        {/* Tier Access & Fee Discount Ladder */}
        <div className="panel-surface rounded-md p-4 lg:col-span-7">
          <h2 className="font-display text-sm font-semibold text-[#EDF1F7]">
            Staker Access &amp; Fee Discount Tiers
          </h2>
          <p className="mt-0.5 font-mono text-[11px] text-[#8A96A8]">
            Fee-on-transfer safe staking (tracks exact received delta). Slashing applies across active + cooldown balances.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {TIERS.map((t) => {
              const unlocked = activeStakeNum >= t.minNti;
              return (
                <div
                  key={t.name}
                  className={`rounded-md border p-3.5 font-mono ${
                    unlocked
                      ? "border-[#10B981]/50 bg-[#10B981]/10"
                      : "border-[#1B2028] bg-[#0B0E13]"
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-[#8A96A8]">{t.name.toUpperCase()}</span>
                    <span className={unlocked ? "text-[#10B981]" : "text-[#556173]"}>
                      {unlocked ? "UNLOCKED" : "LOCKED"}
                    </span>
                  </div>
                  <div className="mt-1.5 text-base font-semibold text-[#EDF1F7] tabular-nums">
                    {formatCompactNumber(t.minNti)} $NTI
                  </div>
                  <div className="mt-2 text-xs text-[#10B981]">{t.discount} Market Fee Discount</div>
                  <div className="mt-0.5 text-[10px] text-[#8A96A8]">{t.radar}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* NTIGovernor Proposals */}
      <section className="panel-surface rounded-md">
        <div className="border-b border-[#1B2028] px-4 py-3">
          <h2 className="font-display text-sm font-semibold text-[#EDF1F7]">
            NTIGovernor Proposals (4% Quorum · 3d Voting · 48h Timelock)
          </h2>
          <p className="font-mono text-[11px] text-[#8A96A8]">
            Controls ConfigRegistry parameters, validator permissionless mode, basket token whitelists, risk caps, and InsuranceFund
          </p>
        </div>

        <div className="divide-y divide-[#1B2028]">
          {proposals.map((p) => {
            const totalVotes = p.forVotesNti + p.againstVotesNti + p.abstainVotesNti;
            const forPct = totalVotes > 0 ? Math.round((p.forVotesNti / totalVotes) * 100) : 0;
            return (
              <div key={p.proposalId} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="max-w-2xl">
                    <div className="flex items-center gap-2 font-mono text-[10px]">
                      <span className="rounded border border-[#2A3342] bg-[#131820] px-1.5 py-0.5 text-[#38BDF8]">
                        {p.category.toUpperCase()}
                      </span>
                      <span
                        className={`rounded border px-1.5 py-0.5 ${
                          p.status === "Active"
                            ? "border-[#10B981]/40 bg-[#10B981]/10 text-[#10B981]"
                            : p.status === "Queued"
                              ? "border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#F59E0B]"
                              : "border-[#2A3342] text-[#8A96A8]"
                        }`}
                      >
                        {p.status.toUpperCase()}
                      </span>
                      <span className="text-[#556173]">
                        ID #{p.proposalId} · By {truncateHex(p.proposer, 6, 4)}
                      </span>
                    </div>
                    <h3 className="mt-1.5 font-display text-sm font-semibold text-[#EDF1F7]">
                      {p.title}
                    </h3>
                    <p className="mt-1 text-xs text-[#8A96A8]">{p.summary}</p>
                  </div>

                  {p.status === "Active" && (
                    <div className="flex items-center gap-1.5 font-mono text-[11px]">
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => void castGovVote(p.proposalId, 1)}
                        className="rounded border border-[#10B981]/50 bg-[#10B981]/15 px-3 py-1.5 text-[#10B981] hover:bg-[#10B981]/25"
                      >
                        FOR
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => void castGovVote(p.proposalId, 0)}
                        className="rounded border border-[#EF4444]/50 bg-[#EF4444]/15 px-3 py-1.5 text-[#EF4444] hover:bg-[#EF4444]/25"
                      >
                        AGAINST
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => void castGovVote(p.proposalId, 2)}
                        className="rounded border border-[#2A3342] bg-[#131820] px-3 py-1.5 text-[#8A96A8] hover:text-[#EDF1F7]"
                      >
                        ABSTAIN
                      </button>
                    </div>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-4 font-mono text-[11px] tabular-nums text-[#8A96A8]">
                  <span className="text-[#10B981]">
                    FOR {formatCompactNumber(p.forVotesNti)} ({forPct}%)
                  </span>
                  <span className="text-[#EF4444]">
                    AGAINST {formatCompactNumber(p.againstVotesNti)}
                  </span>
                  <span>ABSTAIN {formatCompactNumber(p.abstainVotesNti)}</span>
                  <span className="text-[#556173]">
                    Quorum {formatCompactNumber(p.quorumNti)} $NTI
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
