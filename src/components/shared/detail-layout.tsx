import type { ReactNode } from "react";
import Link from "next/link";

export function DetailPanel({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[#E8ECF2] bg-white">
      <div className="flex min-h-14 items-center justify-between border-b border-[#EAECF0] px-5">
        <h2 className="font-bold text-[#101828]">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export type TimelineItem = {
  id: string;
  title: string;
  detail: string;
  time: string;
  icon: ReactNode;
  href?: string;
};
export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol>
      {items.map((item, index) => (
        <li key={item.id} className="relative flex gap-4 pb-6 last:pb-0">
          <span className="relative z-10 mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#EFF8FF] text-[#006FE6]">
            {item.icon}
          </span>
          {index < items.length - 1 && (
            <span
              aria-hidden
              className="absolute left-4 top-8 h-[calc(100%-24px)] w-px bg-[#DDE3EA]"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{item.title}</p>
            <p className="mt-1 text-xs text-[#667085]">{item.detail}</p>
            <p className="mt-1 text-xs font-medium text-[#98A2B3]">
              {item.time}
            </p>
            {item.href && (
              <Link
                href={item.href}
                className="mt-2 inline-flex min-h-9 items-center text-xs font-semibold text-[#006FE6] hover:underline focus:outline-2 focus:outline-offset-2 focus:outline-[#006FE6]"
              >
                View booking
              </Link>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
