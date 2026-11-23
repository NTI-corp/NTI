import Link from "next/link";

interface AwaitingEpochBannerProps {
  message?: string;
  unavailable?: boolean;
}

export function AwaitingEpochBanner({
  message = "Official index values appear after the first epoch finalizes on Robinhood Chain.",
  unavailable = false,
}: AwaitingEpochBannerProps) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 border border-[#F59E0B]/35 bg-[#161618] px-4 py-2.5 font-mono text-[11px] text-[#F59E0B]"
    >
      <div className="flex items-center">
        <span>
          <strong className="tracking-[0.08em]">{unavailable ? "DATA UNAVAILABLE" : "AWAITING FIRST FINALIZED EPOCH"}</strong>
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
