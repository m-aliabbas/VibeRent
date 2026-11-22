"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { CheckCircle2, CircleDashed, PenLine, Stamp, Trash2, Upload } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { BrandingDto, BrandingImageDto, BrandingKind } from "@/server/services/branding-service";

type Envelope = { data?: BrandingDto; error?: { message: string } };

/**
 * Signatures and business stamp. Each account keeps its own signature; the agency owner also sets one
 * agency-wide signature and the stamp. They are printed on agreements, invoices, receipts and ledgers.
 */
export function SignaturesStamp({ onNotice }: { onNotice: (message: string) => void }) {
  const [value, setValue] = useState<BrandingDto>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<BrandingKind>();
  const [removing, setRemoving] = useState<BrandingKind>();

  useEffect(() => {
    let active = true;
    void fetch("/api/v1/settings/branding", { cache: "no-store" }).then(async response => {
      const payload = await response.json() as Envelope;
      if (!active) return;
      if (response.ok && payload.data) setValue(payload.data); else setError(payload.error?.message ?? "Unable to load signatures.");
    }).catch(() => { if (active) setError("Unable to load signatures."); });
    return () => { active = false; };
  }, []);

  async function upload(kind: BrandingKind, file: File | undefined) {
    if (!file || busy) return;
    setBusy(kind); setError("");
    const form = new FormData(); form.set("kind", kind); form.set("file", file);
    try {
      const response = await fetch("/api/v1/settings/branding", { method: "POST", body: form });
      const payload = await response.json() as Envelope;
      if (!response.ok || !payload.data) { setError(payload.error?.message ?? "Upload failed."); return; }
      setValue(payload.data); onNotice(`${title(kind)} saved. It will appear on new documents.`);
    } catch { setError("Upload failed. Check the connection and try again."); }
    finally { setBusy(undefined); }
  }

  async function remove() {
    if (!removing) return;
    const kind = removing;
    setBusy(kind); setError("");
    try {
      const response = await fetch(`/api/v1/settings/branding?kind=${kind}`, { method: "DELETE" });
      const payload = await response.json() as Envelope;
      if (!response.ok || !payload.data) { setError(payload.error?.message ?? "Unable to remove."); return; }
      setValue(payload.data); onNotice(`${title(kind)} removed.`);
    } finally { setBusy(undefined); setRemoving(undefined); }
  }

  return <section className="rounded-xl border bg-white">
    <div className="flex gap-3 border-b p-5"><span className="grid h-10 w-10 place-items-center rounded-lg bg-[#EFF8FF] text-[#006FE6]"><PenLine size={19} /></span><div><h2 className="font-bold">Signatures &amp; business stamp</h2><p className="mt-1 text-xs text-[#667085]">Added automatically to rental agreements, invoices, receipts and ledgers. A document is signed by the staff member who made it; if they have no signature, the agency signature is used.</p></div></div>
    <div className="p-5">
      {error && <p role="alert" className="mb-4 rounded-lg bg-[#FEF3F2] p-3 text-sm text-[#B42318]">{error}</p>}
      {!value ? <p className="text-sm text-[#667085]">Loading…</p> : <div className="grid gap-4 md:grid-cols-3">
        <Slot kind="user_signature" label="My signature" hint="Your own signature, used on documents you create." image={value.mySignature} busy={busy} onUpload={upload} onRemove={setRemoving} />
        <Slot kind="agency_signature" label="Agency signature" hint="Authorised signatory for the whole agency. Used when the staff member has none." image={value.agencySignature} busy={busy} onUpload={upload} onRemove={setRemoving} disabled={!value.canManageAgency} />
        <Slot kind="agency_stamp" label="Business stamp" hint="Your company stamp or seal, printed next to the signature." image={value.agencyStamp} busy={busy} onUpload={upload} onRemove={setRemoving} disabled={!value.canManageAgency} icon={<Stamp size={22} />} />
      </div>}
      {value && !value.canManageAgency && <p className="mt-3 text-xs text-[#667085]">Only the agency owner can change the agency signature and stamp.</p>}
      {value?.canManageAgency && value.team.length > 0 && <div className="mt-6">
        <h3 className="text-sm font-bold text-[#344054]">Team signatures</h3>
        <p className="mt-1 text-xs text-[#667085]">Each person adds their own signature from this page when signed in.</p>
        <ul className="mt-2 divide-y rounded-xl border">{value.team.map(member => <li key={member.userId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm"><span><strong>{member.name}</strong> <span className="text-xs text-[#667085]">{member.role.replaceAll("_", " ")}</span></span>{member.hasSignature ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#067647]"><CheckCircle2 size={14} />Signature saved</span> : <span className="inline-flex items-center gap-1 text-xs text-[#667085]"><CircleDashed size={14} />Uses agency signature</span>}</li>)}</ul>
      </div>}
      <p className="mt-4 text-xs text-[#667085]">Tip: sign on white paper, photograph it, and crop tightly. A PNG with a transparent background looks best. PNG or JPG, up to 4 MB.</p>
    </div>
    <ConfirmDialog open={Boolean(removing)} onOpenChange={next => !next && setRemoving(undefined)} title={`Remove ${removing ? title(removing).toLowerCase() : "image"}?`} description="New documents will no longer show it. Documents already sent are not changed." onConfirm={() => void remove()} pending={Boolean(busy)} confirmLabel="Remove" pendingLabel="Removing…" />
  </section>;
}

function title(kind: BrandingKind) {
  return kind === "user_signature" ? "Your signature" : kind === "agency_signature" ? "Agency signature" : "Business stamp";
}

function Slot({ kind, label, hint, image, busy, onUpload, onRemove, disabled = false, icon }: { kind: BrandingKind; label: string; hint: string; image: BrandingImageDto; busy?: BrandingKind; onUpload: (kind: BrandingKind, file: File | undefined) => void; onRemove: (kind: BrandingKind) => void; disabled?: boolean; icon?: React.ReactNode }) {
  return <figure className="min-w-0 rounded-xl border border-[#E4E7EC] p-3">
    <figcaption className="text-sm font-bold text-[#1D2939]">{label}</figcaption>
    <p className="mt-0.5 min-h-8 text-xs text-[#667085]">{hint}</p>
    <div className="relative mt-2 grid aspect-[2.2] place-items-center overflow-hidden rounded-[10px] border border-dashed border-[#D0D5DD] bg-[repeating-conic-gradient(#F8FAFC_0_25%,#fff_0_50%)] bg-[length:16px_16px]">
      {image ? <Image src={image.url} alt={label} fill unoptimized className="object-contain p-2" /> : <span className="text-[#98A2B3]">{icon ?? <PenLine size={22} />}</span>}
    </div>
    <div className="mt-2 flex gap-1.5">
      <label className={`inline-flex h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[9px] border border-[#D0D5DD] bg-white px-2 text-xs font-semibold text-[#344054] hover:bg-[#F8FAFC] ${disabled || busy ? "pointer-events-none opacity-50" : ""}`} title={disabled ? "Only the agency owner can change this." : undefined}>
        <Upload size={14} />{busy === kind ? "Saving…" : image ? "Replace" : "Upload"}
        <input type="file" accept="image/png,image/jpeg" className="sr-only" disabled={disabled || Boolean(busy)} onChange={event => { onUpload(kind, event.target.files?.[0]); event.target.value = ""; }} />
      </label>
      {image && !disabled && <button type="button" disabled={Boolean(busy)} onClick={() => onRemove(kind)} className="grid h-9 w-9 place-items-center rounded-[9px] border border-[#D0D5DD] bg-white text-[#B42318] hover:bg-[#FEF3F2] disabled:opacity-50" aria-label={`Remove ${label}`}><Trash2 size={14} /></button>}
    </div>
  </figure>;
}
