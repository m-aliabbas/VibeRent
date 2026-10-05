"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
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
  { key: "cnic", label: "CNIC" },
  { key: "dob", label: "Date of birth" },
  { key: "id_expiry", label: "ID expiry" },
];

export function CnicOcrWorkspace() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [result, setResult] = useState<CnicOcrResult | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function chooseFile(nextFile: File | undefined) {
    setError("");
    setResult(null);
    setCopied(false);
    if (!nextFile) return;
    if (!acceptedTypes.includes(nextFile.type)) {
      setFile(null);
      setPreviewUrl("");
      setError("Choose a JPEG, PNG, WEBP, or non-animated GIF image.");
      return;
    }
    if (nextFile.size > MAX_IMAGE_BYTES) {
      setFile(null);
      setPreviewUrl("");
      setError("The image must be 10 MiB or smaller.");
      return;
    }
    setFile(nextFile);
    setPreviewUrl(URL.createObjectURL(nextFile));
  }

  async function analyze() {
    if (!file || pending) return;
    setPending(true);
    setError("");
    setResult(null);
    const formData = new FormData();
    formData.set("image", file);
    const response = await extractCnicAction(formData);
    setPending(false);
    if (!response.ok) {
      setError(response.error.message);
      return;
    }
    setResult(response.data);
  }

  function reset() {
    setFile(null);
    setPreviewUrl("");
    setResult(null);
    setError("");
    setCopied(false);
    if (inputRef.current) inputRef.current.value = "";
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
              <h2 className="font-bold text-[#19191F]">Upload CNIC image</h2>
              <p className="mt-0.5 text-xs text-[#667085]">Front side with clear, readable text works best.</p>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            onChange={(event) => chooseFile(event.target.files?.[0])}
          />

          {!file ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                chooseFile(event.dataTransfer.files[0]);
              }}
              className={`flex min-h-[360px] w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 text-center transition-colors ${dragging ? "border-[#006FE6] bg-[#EFF8FF]" : "border-[#CBD5E1] bg-[#FAFCFF] hover:border-[#84CAFF] hover:bg-[#F5FAFF]"}`}
            >
              <span className="grid h-14 w-14 place-items-center rounded-full bg-[#EAF3FF] text-[#006FE6]">
                <FileImage size={27} />
              </span>
              <span className="mt-4 text-base font-bold text-[#1D2939]">Drop a CNIC image here</span>
              <span className="mt-1 text-sm text-[#667085]">or click to browse your device</span>
              <span className="mt-4 rounded-full bg-white px-3 py-1 text-xs font-medium text-[#475467] shadow-sm ring-1 ring-[#E4E7EC]">JPEG, PNG, WEBP or GIF · Max 10 MiB</span>
            </button>
          ) : (
            <div className="space-y-4">
              <div className="relative min-h-[360px] overflow-hidden rounded-xl bg-[#101828]">
                {previewUrl ? <Image
                  src={previewUrl}
                  alt="Selected CNIC preview"
                  fill
                  unoptimized
                  className="object-contain"
                /> : <div className="grid min-h-[360px] place-items-center"><LoaderCircle className="animate-spin text-white" /></div>}
              </div>
              <div className="flex flex-col gap-3 rounded-xl border border-[#E4E7EC] bg-[#F8FAFC] p-3 sm:flex-row sm:items-center">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-[#006FE6] shadow-sm"><FileImage size={18} /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#344054]">{file.name}</p>
                  <p className="mt-0.5 text-xs text-[#667085]">{(file.size / 1024 / 1024).toFixed(2)} MiB</p>
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={() => inputRef.current?.click()} disabled={pending}>Replace</Button>
              </div>
            </div>
          )}

          {error && <div role="alert" className="mt-4 rounded-lg border border-[#FECDCA] bg-[#FEF3F2] px-4 py-3 text-sm text-[#B42318]">{error}</div>}

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={reset} disabled={!file || pending}><RotateCcw size={16} />Clear</Button>
            <Button type="button" onClick={() => void analyze()} disabled={!file || pending} className="sm:min-w-36">
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
              <div><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white text-[#98A2B3] shadow-sm"><ScanText size={23} /></span><p className="mt-3 text-sm font-semibold text-[#344054]">No result yet</p><p className="mt-1 max-w-xs text-xs leading-5 text-[#667085]">Upload a CNIC image and select Analyze CNIC to see the structured response.</p></div>
            </div>
          )}
        </section>

        <section className="flex gap-3 rounded-xl border border-[#B2DDFF] bg-[#EFF8FF] p-4 text-sm text-[#175CD3]">
          <ShieldCheck size={20} className="mt-0.5 shrink-0" />
          <div><p className="font-bold">Sensitive document handling</p><p className="mt-1 text-xs leading-5">The image is sent only when you analyze it. VibeRent does not save the image or OCR response to its database.</p></div>
        </section>
      </div>
    </div>
  );
}
