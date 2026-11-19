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
      className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#F59E0B]/35 bg-[#F59E0B]/8 px-4 py-2.5 font-mono text-xs text-[#F59E0B]"
    >
      <div className="flex items-center gap-2.5">
        <span className="h-2 w-2 shrink-0 rounded-full bg-[#F59E0B] animate-pulse" />
        <span>
          <strong className="tracking-wider">AWAITING FIRST FINALIZED EPOCH</strong>
          <span className="ml-2 text-[#F59E0B]/85">{message}</span>
        </span>
      </div>
      <Link
        href="/oracle"
        className="rounded border border-[#F59E0B]/40 px-2.5 py-1 text-[11px] hover:bg-[#F59E0B]/15"
      >
        VIEW ORACLE TIMELINE →
      </Link>
    </div>
  );
}
