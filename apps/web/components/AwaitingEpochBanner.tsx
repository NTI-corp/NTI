import Link from "next/link";

interface AwaitingEpochBannerProps {
  message?: string;
}

export function AwaitingEpochBanner({
  message = "Awaiting first finalized epoch on Robinhood Chain. Displaying deterministic protocol preview layout until Epoch #1 reaches final status (B + 210m).",
}: AwaitingEpochBannerProps) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 border border-[#F59E0B]/35 bg-[#161618] px-4 py-2.5 font-mono text-[11px] text-[#F59E0B]"
    >
      <div className="flex items-center">
        <span>
          <strong className="tracking-[0.08em]">AWAITING FIRST FINALIZED EPOCH</strong>
          <span className="ml-2 font-sans text-xs text-[#A1A1AA]">{message}</span>
        </span>
      </div>
      <Link
        href="/oracle"
        className="border border-[#F59E0B]/40 bg-[#0D0D0E] px-2.5 py-1 text-[10px] uppercase tracking-[0.08em] text-[#F59E0B] transition-colors hover:bg-[#F59E0B]/15"
      >
        View Oracle Timeline →
      </Link>
    </div>
  );
}
