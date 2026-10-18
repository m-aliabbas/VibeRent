"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type RefObject } from "react";
import {
  Check,
  Clipboard,
  FileImage,
  LoaderCircle,
  RotateCcw,
  ScanText,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";

import { extractCnicAction } from "@/app/actions/cnic-ocr";
import { Button } from "@/components/ui/button";
import type { CnicOcrResult } from "@/server/cnic-ocr/types";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const acceptedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const fields: Array<{ key: keyof CnicOcrResult; label: string }> = [
  { key: "name", label: "Name" },
  { key: "father_name", label: "Father / husband name" },
  { key: "dob", label: "Date of birth" },
  { key: "address", label: "Address" },
  { key: "expiry", label: "ID expiry" },
  { key: "cnic_no", label: "CNIC number" },
];

export function CnicOcrWorkspace() {
  const frontInputRef = useRef<HTMLInputElement>(null);
  const backInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<{ front: File | null; back: File | null }>({ front: null, back: null });
  const [previewUrls, setPreviewUrls] = useState<{ front: string; back: string }>({ front: "", back: "" });
  const [result, setResult] = useState<CnicOcrResult | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [dragging, setDragging] = useState<"front" | "back" | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrls.front) URL.revokeObjectURL(previewUrls.front);
      if (previewUrls.back) URL.revokeObjectURL(previewUrls.back);
    };
  }, [previewUrls]);

  function chooseFile(side: "front" | "back", nextFile: File | undefined) {
    setError("");
    setResult(null);
    setCopied(false);
    if (!nextFile) return;
    if (!acceptedTypes.includes(nextFile.type)) {
      setError("Choose a JPEG, PNG, WEBP, or non-animated GIF image.");
      return;
    }
    if (nextFile.size > MAX_IMAGE_BYTES) {
      setError("The image must be 10 MiB or smaller.");
      return;
    }
    setFiles(current => ({ ...current, [side]: nextFile }));
    setPreviewUrls(current => ({ ...current, [side]: URL.createObjectURL(nextFile) }));
  }

  async function analyze() {
    if (!files.front || !files.back || pending) return;
    setPending(true);
    setError("");
    setResult(null);
    const formData = new FormData();
    formData.set("frontImage", files.front);
    formData.set("backImage", files.back);
    let response;
    try {
      response = await extractCnicAction(formData);
    } catch {
      setError("The images could not be uploaded. Try smaller files or check the connection.");
      setPending(false);
      return;
    }
    setPending(false);
    if (!response.ok) {
      setError(response.error.message);
      return;
    }
    setResult(response.data);
  }

  function reset() {
    setFiles({ front: null, back: null });
    setPreviewUrls({ front: "", back: "" });
    setResult(null);
    setError("");
    setCopied(false);
    if (frontInputRef.current) frontInputRef.current.value = "";
    if (backInputRef.current) backInputRef.current.value = "";
  }

  async function copyResult() {
    if (!result) return;
    await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,.85fr)]">
      <section className="overflow-hidden rounded-xl border border-[#E3E7ED] bg-white shadow-[0_2px_7px_rgba(16,24,40,.055)]">
        <div className="border-b border-[#EAECF0] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-[10px] bg-[#EAF3FF] text-[#006FE6]">
              <UploadCloud size={20} />
            </span>
            <div>
              <h2 className="font-bold text-[#19191F]">Upload both CNIC sides</h2>
              <p className="mt-0.5 text-xs text-[#667085]">Front and back are analyzed together for a more complete result.</p>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <CnicImagePicker side="front" inputRef={frontInputRef} file={files.front} previewUrl={previewUrls.front} pending={pending} dragging={dragging === "front"} onDragging={value => setDragging(value ? "front" : null)} onChoose={file => chooseFile("front", file)} />
            <CnicImagePicker side="back" inputRef={backInputRef} file={files.back} previewUrl={previewUrls.back} pending={pending} dragging={dragging === "back"} onDragging={value => setDragging(value ? "back" : null)} onChoose={file => chooseFile("back", file)} />
          </div>

          {error && <div role="alert" className="mt-4 rounded-lg border border-[#FECDCA] bg-[#FEF3F2] px-4 py-3 text-sm text-[#B42318]">{error}</div>}

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={reset} disabled={(!files.front && !files.back) || pending}><RotateCcw size={16} />Clear</Button>
            <Button type="button" onClick={() => void analyze()} disabled={!files.front || !files.back || pending} className="sm:min-w-36">
              {pending ? <><LoaderCircle size={17} className="animate-spin" />Analyzing…</> : <><ScanText size={17} />Analyze CNIC</>}
            </Button>
          </div>
        </div>
      </section>

      <div className="space-y-5">
        <section className="rounded-xl border border-[#E3E7ED] bg-white p-5 shadow-[0_2px_7px_rgba(16,24,40,.055)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.14em] text-[#006FE6]">Structured output</p>
              <h2 className="mt-1 text-lg font-bold text-[#19191F]">Extracted identity fields</h2>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={() => void copyResult()} disabled={!result}>
              {copied ? <Check size={15} /> : <Clipboard size={15} />}{copied ? "Copied" : "Copy JSON"}
            </Button>
          </div>

          {pending ? (
            <div className="grid min-h-[330px] place-items-center text-center" aria-live="polite">
              <div><LoaderCircle size={30} className="mx-auto animate-spin text-[#006FE6]" /><p className="mt-3 text-sm font-semibold">Reading the CNIC…</p><p className="mt-1 text-xs text-[#667085]">This can take a few seconds.</p></div>
            </div>
          ) : result ? (
            <dl className="mt-5 space-y-3">
              {fields.map(({ key, label }) => <div key={key} className="rounded-xl border border-[#E4E7EC] bg-[#FAFCFF] p-4"><dt className="text-xs font-bold uppercase tracking-wide text-[#667085]">{label}</dt><dd className="mt-1.5 break-words text-[15px] font-semibold text-[#1D2939]">{result[key] ?? <span className="font-normal text-[#98A2B3]">Not readable</span>}</dd><code className="mt-2 block text-[11px] text-[#98A2B3]">{key}</code></div>)}
            </dl>
          ) : (
            <div className="grid min-h-[330px] place-items-center rounded-xl border border-dashed border-[#D0D5DD] bg-[#FAFCFF] px-6 text-center">
              <div><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white text-[#98A2B3] shadow-sm"><ScanText size={23} /></span><p className="mt-3 text-sm font-semibold text-[#344054]">No result yet</p><p className="mt-1 max-w-xs text-xs leading-5 text-[#667085]">Upload both CNIC sides and select Analyze CNIC to see the structured response.</p></div>
            </div>
          )}
        </section>

        <section className="flex gap-3 rounded-xl border border-[#B2DDFF] bg-[#EFF8FF] p-4 text-sm text-[#175CD3]">
          <ShieldCheck size={20} className="mt-0.5 shrink-0" />
          <div><p className="font-bold">Sensitive document handling</p><p className="mt-1 text-xs leading-5">Both images are sent together only when you analyze them. VibeRent does not save these test images or the OCR response to its database.</p></div>
        </section>
      </div>
    </div>
  );
}

function CnicImagePicker({ side, inputRef, file, previewUrl, pending, dragging, onDragging, onChoose }: {
  side: "front" | "back";
  inputRef: RefObject<HTMLInputElement | null>;
  file: File | null;
  previewUrl: string;
  pending: boolean;
  dragging: boolean;
  onDragging: (value: boolean) => void;
  onChoose: (file: File | undefined) => void;
}) {
  return <div className="overflow-hidden rounded-xl border border-[#E4E7EC] bg-[#F8FAFC]">
    <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={event => onChoose(event.target.files?.[0])} />
    {file && previewUrl ? <div className="relative aspect-[1.58/1] bg-[#101828]"><Image src={previewUrl} alt={`Selected CNIC ${side} preview`} fill unoptimized className="object-contain" /></div> : <button type="button" disabled={pending} onClick={() => inputRef.current?.click()} onDragEnter={event => { event.preventDefault(); onDragging(true); }} onDragOver={event => event.preventDefault()} onDragLeave={() => onDragging(false)} onDrop={event => { event.preventDefault(); onDragging(false); onChoose(event.dataTransfer.files[0]); }} className={`grid aspect-[1.58/1] w-full place-items-center border-2 border-dashed text-center transition-colors ${dragging ? "border-[#006FE6] bg-[#EFF8FF]" : "border-transparent hover:bg-[#F0F7FF]"}`}><span><FileImage size={25} className="mx-auto text-[#006FE6]"/><span className="mt-2 block text-sm font-bold capitalize">Choose CNIC {side}</span><span className="mt-1 block text-xs text-[#667085]">or drop the image here</span></span></button>}
    <div className="flex items-center gap-2 p-3"><div className="min-w-0 flex-1"><p className="text-sm font-bold capitalize">CNIC {side}</p><p className="mt-0.5 truncate text-xs text-[#667085]">{file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MiB` : "JPEG, PNG, WEBP or GIF · Max 10 MiB"}</p></div><Button type="button" variant="secondary" size="sm" onClick={() => inputRef.current?.click()} disabled={pending}>{file ? "Replace" : "Choose"}</Button></div>
  </div>;
}
