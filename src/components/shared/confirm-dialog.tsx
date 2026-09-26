"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ConfirmDialog({ open, onOpenChange, title, description, onConfirm, pending = false }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; onConfirm: () => void; pending?: boolean }) {
  return <Dialog.Root open={open} onOpenChange={(nextOpen) => !pending && onOpenChange(nextOpen)}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-[#101828]/45 backdrop-blur-[1px]"/><Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl"><Dialog.Close disabled={pending} className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-lg text-[#667085] hover:bg-[#F2F4F7] disabled:opacity-50"><X size={18}/><span className="sr-only">Close</span></Dialog.Close><span className="grid h-11 w-11 place-items-center rounded-full bg-[#FEF3F2] text-[#D92D20]"><AlertTriangle size={22}/></span><Dialog.Title className="mt-4 text-lg font-bold">{title}</Dialog.Title><Dialog.Description className="mt-2 text-sm leading-6 text-[#667085]">{description}</Dialog.Description><div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="secondary" disabled={pending} onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="danger" disabled={pending} onClick={onConfirm}>{pending && <LoaderCircle className="animate-spin" size={17}/>} {pending ? "Removing…" : "Remove vehicle"}</Button></div></Dialog.Content></Dialog.Portal></Dialog.Root>;
}
