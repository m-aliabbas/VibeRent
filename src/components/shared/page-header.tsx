import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="mb-1 text-xs font-bold uppercase tracking-[.16em] text-[#006FE6]">{eyebrow}</p>}
        <h1 className="text-[28px] font-bold tracking-[-.03em] text-[#19191F] sm:text-[32px]">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-[#667085]">{description}</p>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
