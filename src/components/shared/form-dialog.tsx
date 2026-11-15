"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

/** Standard add/edit pop-up: title, scrollable body, footer that stays visible. */
export function FormDialog({ title, description, onClose, children, footer, wide }: { title: string; description?: string; onClose: () => void; children: ReactNode; footer: ReactNode; wide?: boolean }) {
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#101828]/45" />
        <Dialog.Content className={`fixed inset-x-0 bottom-0 z-50 flex max-h-[92vh] flex-col rounded-t-2xl bg-white sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-[calc(100%-32px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl ${wide ? "sm:max-w-2xl" : "sm:max-w-xl"}`}>
          <div className="flex items-start justify-between border-b border-[#EAECF0] px-5 py-4">
            <div>
              <Dialog.Title className="font-bold">{title}</Dialog.Title>
              {description ? <Dialog.Description className="mt-0.5 text-xs text-[#475467]">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
            </div>
            <Dialog.Close aria-label="Close" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-[#F2F4F7]"><X size={18} /></Dialog.Close>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          <div className="flex justify-end gap-2 border-t border-[#EAECF0] px-5 py-3">{footer}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
