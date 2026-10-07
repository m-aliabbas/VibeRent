"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Image from "next/image";
import { useRef } from "react";
import { CheckCircle2, ExternalLink, FileImage, Loader2, RefreshCw, ScanText, UploadCloud, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CnicIntake, CnicIntakeFile } from "@/lib/cnic-intake";

type Props = {
  intake?: CnicIntake;
  loading: boolean;
  uploading: "front" | "back" | null;
  error: string;
  onRefresh: () => void;
  onUpload: (side: "front" | "back", file: File | undefined) => void;
  commandHint?: { bookingNumber: number };
  label?: string;
  subjectLabel?: string;
};

export function CnicDocumentDrawer({ intake, loading, uploading, error, onRefresh, onUpload, commandHint, label = "CNIC documents", subjectLabel = "customer" }: Props) {
  const received = Number(Boolean(intake?.front)) + Number(Boolean(intake?.back));
  const hasExtraction = Boolean(intake && Object.values(intake.extracted).some(Boolean));
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button type="button" className="flex w-full items-center gap-3 rounded-xl border border-[#B2DDFF] bg-[#F5FAFF] p-3 text-left transition hover:border-[#53B1FD] hover:bg-[#EFF8FF] sm:w-auto sm:min-w-64">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-[#006FE6] shadow-sm"><ScanText size={18}/></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-[#1D2939]">{label}</span><span className={`mt-0.5 block text-xs ${received === 2 ? "text-[#067647]" : "text-[#475467]"}`}>{received}/2 received{hasExtraction ? " · fields filled automatically" : ""}</span></span>
          <span className="text-xs font-bold text-[#006FE6]">Open</span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#101828]/45"/>
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 flex max-h-[94dvh] flex-col rounded-t-2xl bg-white shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[min(520px,92vw)] sm:max-h-none sm:rounded-none sm:rounded-l-2xl">
          <header className="flex items-start justify-between gap-3 border-b border-[#EAECF0] p-5">
            <div><Dialog.Title className="text-lg font-bold text-[#19191F]">CNIC front & back</Dialog.Title><Dialog.Description className="mt-1 text-xs leading-5 text-[#667085]">Images are read automatically. Check each image against the editable {subjectLabel} fields before saving.</Dialog.Description></div>
            <Dialog.Close className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#667085] hover:bg-[#F2F4F7]"><X size={18}/><span className="sr-only">Close CNIC documents</span></Dialog.Close>
          </header>
          <div className="flex-1 overflow-y-auto p-5">
            {commandHint && <div className="mb-4 rounded-xl border border-[#B2DDFF] bg-[#F5FAFF] p-3 text-xs leading-5 text-[#344054]">Send images from the configured owner number using <code className="rounded bg-white px-1 py-0.5 font-semibold">/front {commandHint.bookingNumber}</code> and <code className="rounded bg-white px-1 py-0.5 font-semibold">/back {commandHint.bookingNumber}</code>. This drawer updates automatically.</div>}
            <div className="grid gap-4">{(["front", "back"] as const).map(side => <CnicSideCard key={side} side={side} file={intake?.[side] ?? null} pending={uploading === side} disabled={Boolean(uploading)} onUpload={file => onUpload(side, file)}/>)}</div>
            {error && <p role="alert" className="mt-4 rounded-lg border border-[#FECDCA] bg-[#FEF3F2] p-3 text-xs text-[#B42318]">{error}</p>}
            {hasExtraction && <div className="mt-4 flex gap-2 rounded-xl border border-[#ABEFC6] bg-[#ECFDF3] p-3 text-xs text-[#067647]"><CheckCircle2 size={17} className="shrink-0"/><div><p className="font-bold">OCR complete · values applied automatically</p><p className="mt-0.5 leading-5">Review the image and correct any field before saving. Manual edits will not be overwritten by later refreshes.</p></div></div>}
          </div>
          <footer className="flex items-center justify-between gap-3 border-t border-[#EAECF0] p-4"><p className="text-xs text-[#667085]">{loading ? "Checking for new images…" : "Incoming images are checked automatically."}</p><Button type="button" size="sm" variant="secondary" disabled={loading} onClick={onRefresh}>{loading ? <Loader2 size={15} className="animate-spin"/> : <RefreshCw size={15}/>}Refresh</Button></footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function CnicSideCard({ side, file, pending, disabled, onUpload }: { side: "front" | "back"; file: CnicIntakeFile | null; pending: boolean; disabled: boolean; onUpload: (file: File | undefined) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const status = file?.ocrStatus === "complete" ? "OCR complete" : file?.ocrStatus === "waiting_for_pair" ? "Saved · waiting for other side" : file?.ocrStatus === "not_configured" ? "Saved · OCR not configured" : file ? "Saved · OCR needs attention" : "Not received";
  return <article className="overflow-hidden rounded-xl border border-[#D0D5DD] bg-white">
    <input ref={inputRef} type="file" className="sr-only" accept="image/jpeg,image/png,image/webp,image/gif" onChange={event => { onUpload(event.target.files?.[0]); event.currentTarget.value = ""; }}/>
    {file ? <a href={file.previewUrl} target="_blank" rel="noreferrer" className="group relative block aspect-[1.58/1] bg-[#101828]" aria-label={`Open CNIC ${side} image`}><Image src={file.previewUrl} alt={`CNIC ${side} preview`} fill unoptimized className="object-contain"/><span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-[#101828]/80 px-2 py-1 text-[11px] font-semibold text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"><ExternalLink size={12}/>Open image</span></a> : <button type="button" disabled={disabled} onClick={() => inputRef.current?.click()} className="grid aspect-[1.58/1] w-full place-items-center bg-[#FAFCFF] text-center hover:bg-[#F0F7FF]"><span><UploadCloud size={24} className="mx-auto text-[#006FE6]"/><span className="mt-2 block text-sm font-semibold">Upload {side}</span><span className="mt-1 block text-xs text-[#667085]">JPG, PNG, WebP or GIF</span></span></button>}
    <div className="flex items-center gap-2 p-3"><FileImage size={17} className="shrink-0 text-[#006FE6]"/><div className="min-w-0 flex-1"><p className="text-sm font-bold capitalize">CNIC {side}</p><p className={`mt-0.5 truncate text-xs ${file?.ocrStatus === "complete" ? "text-[#067647]" : file ? "text-[#B54708]" : "text-[#667085]"}`}>{pending ? "Uploading and reading…" : status}</p></div><Button type="button" size="sm" variant="secondary" disabled={disabled} onClick={() => inputRef.current?.click()}>{pending ? <Loader2 size={14} className="animate-spin"/> : file ? "Replace" : "Choose"}</Button></div>
  </article>;
}
