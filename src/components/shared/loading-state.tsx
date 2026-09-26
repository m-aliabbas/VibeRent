export function LoadingState({
  label = "Loading records",
  rows = 5,
}: {
  label?: string;
  rows?: number;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      className="space-y-3"
      aria-live="polite"
    >
      <span className="sr-only">{label}…</span>
      <div className="hidden overflow-hidden rounded-xl border border-[#E4E7EC] bg-white md:block">
        <div className="h-11 animate-pulse border-b border-[#E4E7EC] bg-[#F8FAFC]" />
        {Array.from({ length: rows }, (_, row) => row).map((row) => (
          <div
            key={row}
            className="grid grid-cols-[.8fr_1.7fr_1fr_1fr_1fr] gap-5 border-b border-[#EAECF0] px-4 py-5 last:border-0"
          >
            {[0, 1, 2, 3, 4].map((column) => (
              <span
                key={column}
                className="h-4 animate-pulse rounded bg-[#EEF2F6]"
              />
            ))}
          </div>
        ))}
      </div>
      <div className="space-y-3 md:hidden">
        {[0, 1, 2].map((row) => (
          <div
            key={row}
            className="h-28 animate-pulse rounded-xl border border-[#E4E7EC] bg-white p-4"
          >
            <div className="h-full rounded-lg bg-[#F2F4F7]" />
          </div>
        ))}
      </div>
    </div>
  );
}
