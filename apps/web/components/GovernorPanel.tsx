"use client";

import { useEffect, useState } from "react";
import { keccak256, parseEther, stringToHex } from "viem";
import { useAccount } from "wagmi";
import { getActiveChainId, getProtocolAddresses, governorAbi } from "@/lib/contracts";
import { formatCompactNumber, truncateHex } from "@/lib/format";
import { parseGovernanceActions } from "@/lib/governanceInputs";
import { useChainAction } from "@/lib/useChainAction";
import type { GovernorProposalItem } from "@/lib/types";
import { TxStatusBanner } from "./TxStatusBanner";

const ACTION_CLASS = "border border-[#26262A] bg-[#111113] px-3 py-1.5 font-mono text-[11px] text-[#F5F5F7] hover:border-[#CCFF00] disabled:cursor-not-allowed disabled:opacity-45";
const INPUT_CLASS = "mt-1 w-full border border-[#26262A] bg-[#0D0D0E] px-3 py-2 text-xs text-[#F5F5F7]";

function voteCount(votes: number | null): string {
  return votes === null ? "Unavailable" : formatCompactNumber(votes);
}

function deadlineLabel(proposal: GovernorProposalItem): string | null {
  if (!proposal.voteDeadline) return null;
  if (proposal.clockMode === "timestamp") {
    return `Voting deadline ${new Date(Number(proposal.voteDeadline) * 1000).toISOString()}`;
  }
  return `Voting deadline ${proposal.clockMode === "blocknumber" ? "block " : ""}${proposal.voteDeadline}`;
}

export function GovernorPanel({ proposals }: { proposals: GovernorProposalItem[] | null }) {
  const governor = getProtocolAddresses(getActiveChainId()).governor;
  const { isConnected } = useAccount();
  const { execute, isBusy, txState, explorerBase, resetTx } = useChainAction();
  const [description, setDescription] = useState("");
  const [actionsInput, setActionsInput] = useState("");
  const [executionFunding, setExecutionFunding] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, []);

  async function propose() {
    if (!governor) return;
    setError(null);
    const summary = description.trim();
    if (!summary) {
      setError("Enter a proposal title and description.");
      return;
    }

    try {
      const actions = parseGovernanceActions(actionsInput);
      const receipt = await execute("Submit governance proposal", {
        address: governor, abi: governorAbi, functionName: "propose",
        args: [
          actions.map((action) => action.target),
          actions.map((action) => BigInt(action.value)),
          actions.map((action) => action.calldata),
          summary,
        ],
      });
      if (receipt) {
        setDescription("");
        setActionsInput("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enter valid proposal actions.");
    }
  }

  async function vote(proposal: GovernorProposalItem, support: 0 | 1 | 2) {
    if (!governor) return;
    setError(null);
    await execute("Cast governance vote", {
      address: governor, abi: governorAbi, functionName: "castVote", args: [BigInt(proposal.proposalId), support],
    });
  }

  async function advance(proposal: GovernorProposalItem, functionName: "queue" | "execute") {
    if (!governor || !proposal.actions) return;
    setError(null);
    try {
      const funding = executionFunding.trim();
      if (functionName === "execute" && funding && !/^\d+(?:\.\d{1,18})?$/.test(funding)) {
        throw new Error("Execution funding must be a valid ETH amount.");
      }
      const value = functionName === "execute" && funding ? parseEther(funding) : undefined;
      await execute(functionName === "queue" ? "Queue governance proposal" : "Execute governance proposal", {
        address: governor,
        abi: governorAbi,
        functionName,
        args: [
          proposal.actions.map((action) => action.target),
          proposal.actions.map((action) => BigInt(action.value)),
          proposal.actions.map((action) => action.calldata),
          keccak256(stringToHex(proposal.summary)),
        ],
        value,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid execution funding.");
    }
  }

  return (
    <section className="border border-[#26262A] bg-[#161618]">
      <div className="border-b border-[#26262A] px-4 py-3">
        <h2 className="text-sm font-semibold text-[#F5F5F7]">NTIGovernor Proposals</h2>
        <p className="mt-0.5 text-xs text-[#A1A1AA]">Voting power and quorum use on-chain stake checkpoints. Successful proposals queue through the timelock.</p>
      </div>

      <div className="divide-y divide-[#1F1F23]">
        {proposals === null ? (
          <p role="status" className="px-4 py-4 text-xs text-[#F59E0B]">Governance proposal data is unavailable.</p>
        ) : proposals.length === 0 ? (
          <p className="px-4 py-4 text-xs text-[#A1A1AA]">No proposals indexed for this governor.</p>
        ) : proposals.map((proposal) => {
          const readyToExecute = proposal.status === "Queued" && proposal.executeAfter !== null &&
            now >= Date.parse(proposal.executeAfter);
          return (
            <article key={proposal.proposalId} className="space-y-2 p-4">
              <div className="font-mono text-[11px] text-[#A1A1AA]">
                {proposal.status} · #{truncateHex(proposal.proposalId, 10, 6)} · By {truncateHex(proposal.proposer, 6, 4)}
              </div>
              <h3 className="break-words text-sm font-semibold text-[#F5F5F7]">{proposal.title}</h3>
              {proposal.summary !== proposal.title && <p className="whitespace-pre-wrap break-words text-xs text-[#A1A1AA]">{proposal.summary}</p>}
              <div className="flex flex-wrap gap-4 font-mono text-[11px] text-[#A1A1AA]">
                <span className="text-[#4ADE80]">FOR {voteCount(proposal.forVotesNti)}</span>
                <span className="text-[#EF4444]">AGAINST {voteCount(proposal.againstVotesNti)}</span>
                <span>ABSTAIN {voteCount(proposal.abstainVotesNti)}</span>
                <span>QUORUM {voteCount(proposal.quorumNti)}{proposal.quorumNti !== null && " $NTI"}</span>
                <span>{deadlineLabel(proposal)}</span>
              </div>
              {proposal.actions && (
                <details className="text-xs text-[#A1A1AA]">
                  <summary>Proposal actions</summary>
                  <ol className="mt-2 list-decimal space-y-1 pl-5">
                    {proposal.actions.map((action, index) => (
                      <li key={index} className="break-all font-mono">Target {action.target} · Value {action.value} wei · Calldata {action.calldata}</li>
                    ))}
                  </ol>
                </details>
              )}
              {proposal.status === "Active" && (
                <div className="flex flex-wrap gap-2">
                  <button className={ACTION_CLASS} type="button" disabled={isBusy || !isConnected} onClick={() => void vote(proposal, 1)}>FOR</button>
                  <button className={ACTION_CLASS} type="button" disabled={isBusy || !isConnected} onClick={() => void vote(proposal, 0)}>AGAINST</button>
                  <button className={ACTION_CLASS} type="button" disabled={isBusy || !isConnected} onClick={() => void vote(proposal, 2)}>ABSTAIN</button>
                </div>
              )}
              {proposal.status === "Succeeded" && proposal.actions && (
                <button className={ACTION_CLASS} type="button" disabled={isBusy || !isConnected} onClick={() => void advance(proposal, "queue")}>QUEUE PROPOSAL</button>
              )}
              {proposal.status === "Queued" && proposal.actions && (
                <div className="flex flex-wrap items-end gap-2">
                  {readyToExecute ? (
                    <label className="text-[11px] text-[#A1A1AA]">
                      Optional ETH to fund execution
                      <input className={INPUT_CLASS} value={executionFunding} onChange={(event) => setExecutionFunding(event.target.value)} inputMode="decimal" placeholder="0" />
                    </label>
                  ) : (
                    <p className="text-xs text-[#A1A1AA]">Executable after {proposal.executeAfter ?? "the timelock releases it"}.</p>
                  )}
                  <button className={ACTION_CLASS} type="button" disabled={isBusy || !isConnected || !readyToExecute} onClick={() => void advance(proposal, "execute")}>EXECUTE PROPOSAL</button>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {governor && (
        <details className="space-y-3 border-t border-[#26262A] p-4 text-xs text-[#A1A1AA]">
          <summary className="cursor-pointer font-semibold text-[#F5F5F7]">Create a governance proposal</summary>
          <label className="block">
            Title and description
            <textarea className={INPUT_CLASS} value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
          </label>
          <label className="block">
            Actions JSON. Enter each target, value in wei as a string, and hex calldata.
            <textarea className={`${INPUT_CLASS} font-mono`} value={actionsInput} onChange={(event) => setActionsInput(event.target.value)} rows={3} />
          </label>
          <button className={ACTION_CLASS} type="button" disabled={isBusy || !isConnected || !description.trim() || !actionsInput.trim()} onClick={() => void propose()}>SUBMIT PROPOSAL</button>
          {!isConnected && <p>Connect a wallet with voting power to submit a proposal.</p>}
        </details>
      )}
      {(error || txState.status !== "idle") && (
        <div className="space-y-2 border-t border-[#26262A] p-4">
          {error && <p role="alert" className="text-xs text-[#EF4444]">{error}</p>}
          <TxStatusBanner state={txState} explorerBase={explorerBase} onDismiss={resetTx} />
        </div>
      )}
    </section>
  );
}
