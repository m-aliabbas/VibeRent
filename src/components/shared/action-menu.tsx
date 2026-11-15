"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Eye, MoreHorizontal, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment } from "react";
import type React from "react";

export function ActionMenu({
  onView,
  onEdit,
  onDelete,
  archived = false,
}: {
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  archived?: boolean;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="grid h-9 w-9 place-items-center rounded-lg text-[#475467] hover:bg-[#F2F4F7]"
          aria-label="Open row actions"
          onClick={event => event.stopPropagation()}
        >
          <MoreHorizontal size={19} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={5}
          className="z-50 min-w-40 rounded-[10px] border border-[#E4E7EC] bg-white p-1.5 text-sm shadow-[0_12px_24px_rgba(16,24,40,.12)]"
        >
          <DropdownMenu.Item
            onSelect={onView}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 outline-none hover:bg-[#F5F7FA] focus:bg-[#F5F7FA]"
          >
            <Eye size={15} />
            View details
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={onEdit}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 outline-none hover:bg-[#F5F7FA] focus:bg-[#F5F7FA]"
          >
            <Pencil size={15} />
            Edit vehicle
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-[#EAECF0]" />
          <DropdownMenu.Item
            onSelect={onDelete}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-[#B42318] outline-none hover:bg-[#FEF3F2] focus:bg-[#FEF3F2]"
          >
            {archived ? <RotateCcw size={15} /> : <Trash2 size={15} />}
            {archived ? "Restore vehicle" : "Delete vehicle"}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export type MenuItem = { label: string; icon?: React.ReactNode; onSelect?: () => void; href?: string; danger?: boolean; separatorBefore?: boolean; disabled?: boolean };

/** Overflow menu for secondary and destructive actions; keeps them away from the routine path. */
export function OverflowMenu({ items, label = "More actions", trigger }: { items: MenuItem[]; label?: string; trigger?: React.ReactNode }) {
  const router = useRouter();
  if (!items.length) return null;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        {trigger ?? (
          <button
            type="button"
            onClick={event => event.stopPropagation()}
            className="grid h-8 w-8 place-items-center rounded-lg text-[#475467] hover:bg-[#F2F4F7] focus-visible:outline-2 focus-visible:outline-[#006FE6]"
            aria-label={label}
          >
            <MoreHorizontal size={19} />
          </button>
        )}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={5} onClick={event => event.stopPropagation()} className="z-50 min-w-48 rounded-[10px] border border-[#E4E7EC] bg-white p-1.5 text-sm shadow-[0_12px_24px_rgba(16,24,40,.12)]">
          {items.map(item => (
            <Fragment key={item.label}>
              {item.separatorBefore && <DropdownMenu.Separator className="my-1 h-px bg-[#EAECF0]" />}
              <DropdownMenu.Item
                disabled={item.disabled}
                onSelect={() => { if (item.href) router.push(item.href); else item.onSelect?.(); }}
                className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 ${item.danger ? "text-[#B42318] hover:bg-[#FEF3F2] focus:bg-[#FEF3F2]" : "text-[#344054] hover:bg-[#F5F7FA] focus:bg-[#F5F7FA]"}`}
              >
                {item.icon}
                {item.label}
              </DropdownMenu.Item>
            </Fragment>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
