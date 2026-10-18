"use client";

import { useState } from "react";
import { DatabaseBackup, LoaderCircle, Upload } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

type AgencyPreview = {
  id: string;
  name: string;
  counts: Record<string, number>;
  legacyGuarantors: number;
  missingFiles: number;
  collisions: Record<string, number>;
};

type Preview = {
  valid: boolean;
  sourceAgencies: AgencyPreview[];
  targetAgencyId: string;
  targetCounts: Record<string, number>;
  targetHasBusinessData: boolean;
  fileStorageReady: boolean;
  message: string;
};

type ImportResult = { sourceAgencyId: string; targetAgencyId: string; imported: Record<string, number>; attachments: number };

const important = ["branches", "vehicles", "customers", "booking_drafts", "bookings", "financial_transactions", "expenses", "owner_payouts", "private_files"];

export function WebMigrationPreview({ canPreview }: { canPreview: boolean }) {
  const [result, setResult] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [selectedAgencyId, setSelectedAgencyId] = useState("");
  const [confirmationAgencyId, setConfirmationAgencyId] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [imported, setImported] = useState<ImportResult | null>(null);

  async function inspect(file: File) {
    setResult(null);
    setFile(null);
    setSelectedAgencyId("");
    setConfirmationAgencyId("");
    setImported(null);
    setError("");
    setPending(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/v1/agency-backup/desktop-preview", { method: "POST", body: form });
      const payload = await response.json() as { data?: Preview; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message || "The archive could not be inspected.");
      setResult(payload.data);
      setFile(file);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The archive could not be inspected.");
    } finally {
      setPending(false);
    }
  }

  async function importSelected() {
    if (!file || !result || !selectedAgencyId) return;
    setPending(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("sourceAgencyId", selectedAgencyId);
      form.set("confirmationAgencyId", confirmationAgencyId);
      const response = await fetch("/api/v1/agency-backup/desktop-import", { method: "POST", body: form });
      const payload = await response.json() as { data?: ImportResult; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message || "The selected agency could not be imported.");
      setImported(payload.data);
      setResult(null);
      setFile(null);
      setConfirmOpen(false);
    } catch (cause) {
      setConfirmOpen(false);
      setError(cause instanceof Error ? cause.message : "The selected agency could not be imported.");
    } finally {
      setPending(false);
    }
  }

  const selected = result?.sourceAgencies.find(agency => agency.id === selectedAgencyId);
  const canImport = Boolean(result && selected && file && !pending && !result.targetHasBusinessData
    && selected.missingFiles === 0 && (selected.counts.private_files === 0 || result.fileStorageReady)
    && confirmationAgencyId === result.targetAgencyId);

  return <section className="rounded-xl border bg-white">
    <div className="flex gap-3 border-b p-5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#EFF8FF] text-[#006FE6]"><DatabaseBackup size={19}/></span>
      <div><h2 className="font-bold">Windows data migration</h2><p className="mt-1 text-sm text-[#667085]">Select one agency from a Windows backup and bring its records into this web agency.</p></div>
    </div>
    <div className="space-y-4 p-5">
      <p className="rounded-lg border border-[#FEDF89] bg-[#FFFAEB] p-3 text-sm text-[#93370D]">Import is available for an empty web agency. Existing business records are protected; the importer will stop before changing them. Keep the original Windows backup until you verify the web records and files.</p>
      {!canPreview && <p className="text-sm text-[#667085]">An agency owner must sign in to inspect a migration archive.</p>}
      <label className={`inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#D0D5DD] px-4 py-2 text-sm font-semibold focus-within:ring-2 focus-within:ring-[#006FE6] ${canPreview ? "cursor-pointer hover:bg-[#F8FAFC]" : "cursor-not-allowed opacity-50"}`}>
        {pending ? <LoaderCircle size={16} className="animate-spin"/> : <Upload size={16}/>}
        {pending ? "Checking archive…" : "Inspect Windows backup"}
        <input className="sr-only" type="file" accept=".tgz,application/gzip" disabled={pending || !canPreview} onChange={event => { const file = event.target.files?.[0]; if (file) void inspect(file); event.currentTarget.value = ""; }}/>
      </label>
      {error && <p role="alert" className="rounded-lg border border-[#FECDCA] bg-[#FEF3F2] p-3 text-sm text-[#B42318]">{error}</p>}
      {imported && <div role="status" className="rounded-lg border border-[#ABEFC6] bg-[#ECFDF3] p-4 text-sm text-[#067647]"><p className="font-semibold">Agency imported into this web account.</p><p className="mt-1">{imported.imported.bookings ?? 0} bookings, {imported.imported.vehicles ?? 0} vehicles, {imported.imported.customers ?? 0} customers, and {imported.attachments} attachments transferred.</p><div className="mt-3 flex gap-4"><Link className="underline" href="/bookings">Check bookings</Link><Link className="underline" href="/vehicles">Check vehicles</Link></div></div>}
      {result && <div className="space-y-4" aria-live="polite">
        <p className="text-sm font-semibold text-[#344054]">Database checksum and integrity passed. {result.sourceAgencies.length} {result.sourceAgencies.length === 1 ? "agency" : "agencies"} found. No web records were changed.</p>
        <p className="text-sm text-[#475467]">Choose the Windows agency that belongs to your current web account:</p>
        {result.sourceAgencies.map(agency => <label key={agency.id} className={`block cursor-pointer rounded-lg border p-4 ${selectedAgencyId === agency.id ? "border-[#006FE6] bg-[#F5FAFF]" : "border-[#D0D5DD]"}`}>
          <span className="flex items-center gap-2"><input type="radio" name="sourceAgency" value={agency.id} checked={selectedAgencyId === agency.id} onChange={() => { setSelectedAgencyId(agency.id); setConfirmationAgencyId(""); }} className="h-4 w-4 accent-[#006FE6]"/><span className="font-semibold">{agency.name}</span></span>
          <p className="mt-1 break-all font-mono text-xs text-[#667085]">{agency.id}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            {important.map(table => <p key={table}><span className="text-[#667085]">{table.replaceAll("_", " ")}: </span><strong>{agency.counts[table] ?? 0}</strong></p>)}
          </div>
          {agency.legacyGuarantors > 0 && <p className="mt-3 text-sm text-[#475467]">{agency.legacyGuarantors} retired guarantor record(s) will be preserved as legacy data.</p>}
          {agency.missingFiles > 0 && <p className="mt-3 text-sm text-[#B42318]">{agency.missingFiles} private files are missing from this archive. Import is blocked.</p>}
          {Object.values(agency.collisions).some(count => count > 0) && <p className="mt-3 text-sm text-[#B42318]">Potential web conflicts: {Object.entries(agency.collisions).filter(([,count]) => count > 0).map(([key,count]) => `${count} ${key.replaceAll("_", " ")}`).join(", ")}. These records need a merge decision.</p>}
        </label>)}
        <div className="rounded-lg bg-[#F8FAFC] p-4 text-sm"><p className="font-semibold">Current web agency: <span className="font-mono font-normal">{result.targetAgencyId}</span></p><p className="mt-2 text-[#475467]">Existing web data: {result.targetCounts.bookings} bookings, {result.targetCounts.vehicles} vehicles, {result.targetCounts.customers} customers, {result.targetCounts.private_files} private files.</p></div>
        <p className="text-sm text-[#93370D]">{result.message}</p>
        {selected && !result.targetHasBusinessData && <div className="space-y-3 border-t pt-4">
          {selected.counts.private_files > 0 && !result.fileStorageReady && <p className="text-sm text-[#B42318]">Private-file storage is not configured on this web server. Import cannot start until durable storage is configured.</p>}
          <label className="block text-sm font-semibold" htmlFor="migration-confirmation">Type the current web agency ID to confirm the destination</label>
          <input id="migration-confirmation" value={confirmationAgencyId} onChange={event => setConfirmationAgencyId(event.target.value.trim())} autoComplete="off" className="min-h-11 w-full rounded-lg border border-[#D0D5DD] px-3 font-mono text-sm focus:border-[#006FE6] focus:outline-none focus:ring-2 focus:ring-[#B2DDFF]" placeholder={result.targetAgencyId}/>
          <Button disabled={!canImport} onClick={() => setConfirmOpen(true)}>Import selected agency</Button>
        </div>}
      </div>}
    </div>
    <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen} title={`Import ${selected?.name ?? "selected agency"}?`} description={`Import ${selected?.counts.bookings ?? 0} bookings and ${selected?.counts.private_files ?? 0} private files into this web agency. The existing login remains active. Keep the Windows backup until you check the results.`} confirmLabel="Import agency" confirmVariant="primary" pending={pending} pendingLabel="Importing…" onConfirm={() => void importSelected()}/>
  </section>;
}
