import type { RecentLaunchItem } from "@/lib/types";

function age(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 3600) return `${Math.max(1, Math.floor(seconds / 60))}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

/** Real Pons launches the discovery job found on chain. They become Radar alerts at 1 ETH of liquidity. */
export function RecentLaunches({ launches }: { launches: RecentLaunchItem[] }) {
  if (launches.length === 0) return null;
  return (
    <div className="border border-[#26262A] bg-[#161618]">
      <div className="flex items-center justify-between border-b border-[#1F1F23] bg-[#111113] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.12em]">
        <span className="text-[#F5F5F7]">Recent launches · watching</span>
        <span className="text-[#71717A]">Alert at 1 ETH liquidity</span>
      </div>
      <div className="divide-y divide-[#1F1F23]">
        {launches.map((t) => (
          <div key={t.address} className="flex items-center justify-between gap-3 px-4 py-2 font-mono text-[11px]">
            <div className="min-w-0">
              <span className="font-semibold text-[#F5F5F7]">${t.symbol}</span>{" "}
              <span className="truncate text-[#8A8A93]">{t.name}</span>
            </div>
            <div className="flex shrink-0 items-center gap-4 tabular-nums text-[#A1A1AA]">
              <span>{t.narrativeLabel ?? "unclassified"}</span>
              <span>{t.graduated ? "graduated" : "bonding curve"}</span>
              <span>{t.liquidityEth.toFixed(4)} ETH</span>
              <span className="text-[#71717A]">{age(t.createdAt)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
