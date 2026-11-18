"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Camera, IdCard, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { PersonDocumentOwner, PersonDocumentSlot, PersonDocumentsDto } from "@/server/services/person-document-service";

const slots: Array<{ slot: PersonDocumentSlot; label: string }> = [
  { slot: "cnic_front", label: "CNIC front" },
  { slot: "cnic_back", label: "CNIC back" },
  { slot: "license_front", label: "License front" },
  { slot: "license_back", label: "License back" },
];

type Envelope = { data?: PersonDocumentsDto; error?: { message: string } };

/**
 * CNIC and driving-license images (front and back) of a customer or guarantor. Every slot is
 * optional; a new image replaces that side. `readOnly` shows the images without upload or remove.
 */
export function PersonDocuments({ owner, ownerId, readOnly = false, compact = false, only, onChange }: { owner: PersonDocumentOwner; ownerId: string; readOnly?: boolean; compact?: boolean; only?: PersonDocumentSlot[]; onChange?: (value: PersonDocumentsDto) => void }) {
  const [value, setValue] = useState<PersonDocumentsDto>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<PersonDocumentSlot>();
  const [message, setMessage] = useState("");
  const [removing, setRemoving] = useState<{ slot: PersonDocumentSlot; fileId: string }>();

  useEffect(() => {
    // Callers pass a new `key` when the person changes, so loading starts true for each mount.
    let active = true;
    void fetch(`/api/v1/person-documents?owner=${owner}&id=${encodeURIComponent(ownerId)}`, { cache: "no-store" })
      .then(async response => {
        const payload = await response.json() as Envelope;
        if (!active) return;
        if (response.ok && payload.data) setValue(payload.data); else setMessage(payload.error?.message ?? "Unable to load documents.");
      })
      .catch(() => { if (active) setMessage("Unable to load documents."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [owner, ownerId]);

  function apply(payload: Envelope, response: Response, success: string) {
    if (!response.ok || !payload.data) { setMessage(payload.error?.message ?? "Something went wrong."); return; }
    setValue(payload.data); onChange?.(payload.data); setMessage(success);
  }

  async function upload(slot: PersonDocumentSlot, file: File | undefined) {
    if (!file || busy) return;
    setBusy(slot); setMessage("");
    const form = new FormData();
    form.set("owner", owner); form.set("id", ownerId); form.set("slot", slot); form.set("file", file);
    try { const response = await fetch("/api/v1/person-documents", { method: "POST", body: form }); apply(await response.json() as Envelope, response, `${slots.find(item => item.slot === slot)!.label} saved.`); }
    catch { setMessage("Upload failed. Check the connection and try again."); }
    finally { setBusy(undefined); }
  }

  async function remove() {
    if (!removing) return;
    setBusy(removing.slot); setMessage("");
    try { const response = await fetch(`/api/v1/person-documents?owner=${owner}&id=${encodeURIComponent(ownerId)}&fileId=${encodeURIComponent(removing.fileId)}`, { method: "DELETE" }); apply(await response.json() as Envelope, response, "Image removed."); }
    catch { setMessage("Unable to remove the image."); }
    finally { setBusy(undefined); setRemoving(undefined); }
  }

  const saved = message.endsWith("saved.") || message === "Image removed.";
  return <div>
    {message && <p role="status" className={`mb-3 rounded-lg p-2.5 text-sm ${saved ? "bg-[#ECFDF3] text-[#067647]" : "bg-[#FEF3F2] text-[#B42318]"}`}>{message}</p>}
    <div className={`grid gap-3 ${compact ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 lg:grid-cols-4"}`}>
      {slots.filter(item => !only || only.includes(item.slot)).map(({ slot, label }) => {
        const document = value?.documents[slot];
        return <figure key={slot} className="min-w-0">
          <figcaption className="mb-1.5 text-xs font-semibold text-[#475467]">{label}</figcaption>
          {document
            ? <a href={document.url} target="_blank" rel="noreferrer" className="group relative block aspect-[1.58] overflow-hidden rounded-[10px] border border-[#EAECF0] bg-[#F2F4F7]" aria-label={`Open ${label}`}>
              <Image src={document.url} alt={label} fill unoptimized className="object-cover transition group-hover:scale-[1.02]" />
            </a>
            : <div className="grid aspect-[1.58] place-items-center rounded-[10px] border border-dashed border-[#D0D5DD] bg-[#F8FAFC] text-[#98A2B3]">{loading ? <span className="text-xs">Loading…</span> : <IdCard size={22} aria-label="No image" />}</div>}
          {!readOnly && <div className="mt-1.5 flex gap-1.5">
            <label className={`inline-flex h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[9px] border border-[#D0D5DD] bg-white px-2 text-xs font-semibold text-[#344054] hover:bg-[#F8FAFC] ${busy || loading ? "pointer-events-none opacity-50" : ""}`}>
              <Camera size={14} />{busy === slot ? "Saving…" : document ? "Replace" : "Add"}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={Boolean(busy) || loading} onChange={event => { void upload(slot, event.target.files?.[0]); event.target.value = ""; }} />
            </label>
            {document && <button type="button" disabled={Boolean(busy)} onClick={() => setRemoving({ slot, fileId: document.id })} className="grid h-9 w-9 place-items-center rounded-[9px] border border-[#D0D5DD] bg-white text-[#B42318] hover:bg-[#FEF3F2] disabled:opacity-50" aria-label={`Remove ${label}`}><Trash2 size={14} /></button>}
          </div>}
        </figure>;
      })}
    </div>
    {!readOnly && <p className="mt-2 text-xs text-[#667085]">Optional · JPG, PNG or WebP up to 10 MB · on a phone, Add opens the camera or gallery.</p>}
    <ConfirmDialog open={Boolean(removing)} onOpenChange={next => !next && setRemoving(undefined)} title="Remove this image?" description="The image is removed from this record. You can add a new one at any time." onConfirm={() => void remove()} pending={Boolean(busy)} confirmLabel="Remove image" pendingLabel="Removing…" />
  </div>;
}
