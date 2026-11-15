"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CarFront, CircleDollarSign, FileText, Keyboard, UserPlus } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { useHotkey } from "@/lib/hotkeys";

/** Daily actions, each with a visible key. */
const actions = [
  { title: "Add customer", icon: UserPlus, href: "/customers?new=1", combo: "shift+c" },
  { title: "Add vehicle", icon: CarFront, href: "/vehicles?new=1", combo: "shift+v" },
  { title: "Add external income", icon: CircleDollarSign, href: "/legacy-entry?entry=income", combo: "shift+i" },
  { title: "Legacy data entry", icon: FileText, href: "/legacy-entry", combo: "shift+l" },
] as const;

function ActionShortcut({ combo, href }: { combo: string; href: string }) {
  const router = useRouter();
  useHotkey(combo, () => router.push(href));
  return null;
}

export function QuickActions({ onShowAll }: { onShowAll?: () => void }) {
  return (
    <section className="rounded-xl border border-[#E4E7EC] bg-white p-3">
      <div className="mb-1 flex items-center justify-between px-1">
        <h2 className="font-bold">Add</h2>
        <button type="button" onClick={() => { onShowAll?.(); document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "?", shiftKey: true, bubbles: true })); }} aria-label="Show all keyboard shortcuts" className="inline-flex items-center gap-1 text-xs font-semibold text-[#0058B8] hover:underline"><Keyboard size={14} />All <Kbd combo="?" /></button>
      </div>
      <div className="divide-y divide-[#EAECF0]">
        {actions.map(action => {
          const Icon = action.icon;
          return (
            <Link key={action.title} href={action.href} aria-keyshortcuts={action.combo.replace(" ", "+").toUpperCase()} className="flex items-center gap-3 rounded-lg px-1 py-2 hover:bg-[#FAFCFF] focus-visible:outline-2 focus-visible:outline-[#006FE6]">
              <span className="grid h-8 w-8 place-items-center rounded-[8px] bg-[#EAF3FF] text-[#0058B8]"><Icon size={17} /></span>
              <span className="flex-1 text-sm font-semibold">{action.title}</span>
              <Kbd combo={action.combo} className="!inline-flex" />
              <ActionShortcut combo={action.combo} href={action.href} />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
