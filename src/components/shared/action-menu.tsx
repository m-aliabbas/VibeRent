"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Archive, Eye, MoreHorizontal, Pencil, RotateCcw } from "lucide-react";

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
          className="grid h-9 w-9 place-items-center rounded-lg text-[#667085] hover:bg-[#F2F4F7]"
          aria-label="Open row actions"
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
            {archived ? <RotateCcw size={15} /> : <Archive size={15} />}
            {archived ? "Restore vehicle" : "Archive vehicle"}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
