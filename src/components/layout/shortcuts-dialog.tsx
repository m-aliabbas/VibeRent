"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";

export const goShortcuts = [
  { combo: "g d", label: "Dashboard", href: "/" },
  { combo: "g b", label: "Bookings", href: "/bookings" },
  { combo: "g v", label: "Vehicles", href: "/vehicles" },
  { combo: "g c", label: "Customers", href: "/customers" },
  { combo: "g e", label: "Expenses", href: "/expenses" },
  { combo: "g o", label: "Owners", href: "/owners" },
  { combo: "g r", label: "Reports", href: "/reports" },
  { combo: "g s", label: "Settings", href: "/settings" },
] as const;

const groups: Array<{ title: string; items: Array<[string, string]> }> = [
  { title: "Anywhere", items: [["mod+k", "Search everything"], ["/", "Search this page"], ["?", "Show this list"], ["Esc", "Close dialog or menu"]] },
  { title: "Go to", items: goShortcuts.map(item => [item.combo, item.label] as [string, string]) },
  { title: "Lists", items: [["n", "New record (booking, vehicle, customer…)"], ["↓", "Next row (or J)"], ["↑", "Previous row (or K)"], ["Enter", "Open selected row"]] },
  { title: "Booking", items: [["o", "Start rental (check out)"], ["i", "Check in (return)"], ["p", "Record payment"], ["x", "Extend rental"], ["a", "Agreement menu"]] },
  { title: "Forms", items: [["alt+1", "Jump to section 1 (2, 3, 4…)"], ["mod+enter", "Save / confirm"], ["Tab", "Next field"]] },
];

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#101828]/45" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[calc(100%-32px)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
          <div className="flex items-start justify-between">
            <div>
              <Dialog.Title className="text-lg font-bold">Keyboard shortcuts</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-[#475467]">Keys are also shown on the buttons they trigger. Single keys don’t fire while you type in a field.</Dialog.Description>
            </div>
            <Dialog.Close className="grid h-10 w-10 place-items-center rounded-lg hover:bg-[#F2F4F7]" aria-label="Close shortcuts"><X size={18} /></Dialog.Close>
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            {groups.map(group => (
              <section key={group.title}>
                <h3 className="text-xs font-bold uppercase tracking-wide text-[#475467]">{group.title}</h3>
                <dl className="mt-2 divide-y divide-[#EAECF0]">
                  {group.items.map(([combo, label]) => (
                    <div key={combo + label} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <dt className="text-[#344054]">{label}</dt>
                      <dd>{/^[a-z?/]$|^(mod|alt|shift|g )/i.test(combo) ? <Kbd combo={combo} className="!inline-flex" /> : <kbd className="rounded-[5px] border border-[#D0D5DD] bg-[#F8FAFC] px-1.5 py-0.5 font-sans text-xs font-semibold text-[#475467]">{combo}</kbd>}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
