/** Instant skeleton shown while a dashboard renders on the server, so tab switches never feel frozen. */
export default function AppLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <div>
        <div className="h-3 w-40 rounded bg-[#151516]" />
        <div className="mt-3 h-11 w-[min(520px,80%)] rounded bg-[#151516]" />
        <div className="mt-4 h-3 w-[min(640px,90%)] rounded bg-[#111112]" />
      </div>

      <div className="grid grid-cols-2 border border-[#232325] bg-[#0C0C0D] lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="border-r border-[#232325] p-5 last:border-r-0">
            <div className="h-2.5 w-24 rounded bg-[#151516]" />
            <div className="mt-3 h-7 w-28 rounded bg-[#1A1A1C]" />
            <div className="mt-3 h-2.5 w-32 rounded bg-[#111112]" />
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-12">
        <div className="h-72 rounded-xl border border-[#232325] bg-[#0C0C0D] xl:col-span-8" />
        <div className="h-72 rounded-xl border border-[#232325] bg-[#0C0C0D] xl:col-span-4" />
      </div>
    </div>
  );
}
