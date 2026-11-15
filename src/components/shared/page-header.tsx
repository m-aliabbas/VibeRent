import type { ReactNode } from "react";

/** Title + actions. No eyebrow or descriptive sentence: the nav already says where you are. */
export function PageHeader({ title, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold tracking-[-.02em] text-[#19191F]">{title}</h1>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
