/** Route-level skeleton: shown instantly on navigation so a click never looks ignored. */
export function PageSkeleton({ label, tiles = 4, rows = 6 }: { label: string; tiles?: number; rows?: number }) {
  return (
    <div role="status" aria-live="polite" aria-label={label} className="space-y-5">
      <span className="sr-only">{label}…</span>
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-2"><div className="h-7 w-48 animate-pulse rounded bg-[#E4E7EC]" /><div className="h-4 w-72 animate-pulse rounded bg-[#EEF2F6]" /></div>
        <div className="h-10 w-36 animate-pulse rounded-[10px] bg-[#E4E7EC]" />
      </div>
      {tiles > 0 && <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: tiles }, (_, i) => <div key={i} className="h-[92px] animate-pulse rounded-xl border border-[#E8ECF2] bg-white" />)}</div>}
      <div className="overflow-hidden rounded-xl border border-[#E4E7EC] bg-white">
        <div className="h-10 border-b border-[#E4E7EC] bg-[#F8FAFC]" />
        {Array.from({ length: rows }, (_, i) => <div key={i} className="grid grid-cols-[1fr_2fr_1fr_1fr] gap-5 border-b border-[#EAECF0] px-4 py-3.5 last:border-0">{[0, 1, 2, 3].map(c => <span key={c} className="h-4 animate-pulse rounded bg-[#EEF2F6]" />)}</div>)}
      </div>
    </div>
  );
}
