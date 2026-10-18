"use client";

import { useState } from "react";
import { DatabaseBackup, LoaderCircle, Upload } from "lucide-react";

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
  importAvailable: false;
  message: string;
};

const important = ["branches", "vehicles", "customers", "booking_drafts", "bookings", "financial_transactions", "expenses", "owner_payouts", "private_files"];

export function WebMigrationPreview({ canPreview }: { canPreview: boolean }) {
  const [result, setResult] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function inspect(file: File) {
    setResult(null);
    setError("");
    setPending(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/v1/agency-backup/desktop-preview", { method: "POST", body: form });
      const payload = await response.json() as { data?: Preview; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message || "The archive could not be inspected.");
      setResult(payload.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The archive could not be inspected.");
    } finally {
      setPending(false);
    }
  }

  return <section className="rounded-xl border bg-white">
    <div className="flex gap-3 border-b p-5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#EFF8FF] text-[#006FE6]"><DatabaseBackup size={19}/></span>
      <div><h2 className="font-bold">Windows data migration</h2><p className="mt-1 text-sm text-[#667085]">Inspect a Windows backup before merging its data into this web agency.</p></div>
    </div>
    <div className="space-y-4 p-5">
      <p className="rounded-lg border border-[#FEDF89] bg-[#FFFAEB] p-3 text-sm text-[#93370D]">The Windows restore file cannot be applied directly to the web database. This check reads the archive and compares record counts; it does not import or change data.</p>
      {!canPreview && <p className="text-sm text-[#667085]">An agency owner must sign in to inspect a migration archive.</p>}
      <label className={`inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#D0D5DD] px-4 py-2 text-sm font-semibold focus-within:ring-2 focus-within:ring-[#006FE6] ${canPreview ? "cursor-pointer hover:bg-[#F8FAFC]" : "cursor-not-allowed opacity-50"}`}>
        {pending ? <LoaderCircle size={16} className="animate-spin"/> : <Upload size={16}/>}
        {pending ? "Checking archive…" : "Inspect Windows backup"}
        <input className="sr-only" type="file" accept=".tgz,application/gzip" disabled={pending || !canPreview} onChange={event => { const file = event.target.files?.[0]; if (file) void inspect(file); event.currentTarget.value = ""; }}/>
      </label>
      {error && <p role="alert" className="rounded-lg border border-[#FECDCA] bg-[#FEF3F2] p-3 text-sm text-[#B42318]">{error}</p>}
      {result && <div className="space-y-4" aria-live="polite">
        <p className="text-sm font-semibold text-[#344054]">Database checksum and integrity passed. {result.sourceAgencies.length} {result.sourceAgencies.length === 1 ? "agency" : "agencies"} found. No web records were changed.</p>
        {result.sourceAgencies.map(agency => <div key={agency.id} className="rounded-lg border p-4">
          <h3 className="font-semibold">{agency.name}</h3>
          <p className="mt-1 break-all font-mono text-xs text-[#667085]">{agency.id}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            {important.map(table => <p key={table}><span className="text-[#667085]">{table.replaceAll("_", " ")}: </span><strong>{agency.counts[table] ?? 0}</strong></p>)}
          </div>
          {(agency.legacyGuarantors > 0 || agency.missingFiles > 0) && <p className="mt-3 text-sm text-[#B42318]">Additional checks needed: {agency.legacyGuarantors} legacy guarantor records; {agency.missingFiles} missing private files.</p>}
          {Object.values(agency.collisions).some(count => count > 0) && <p className="mt-3 text-sm text-[#B42318]">Potential web conflicts: {Object.entries(agency.collisions).filter(([,count]) => count > 0).map(([key,count]) => `${count} ${key.replaceAll("_", " ")}`).join(", ")}. These records need a merge decision.</p>}
        </div>)}
        <div className="rounded-lg bg-[#F8FAFC] p-4 text-sm"><p className="font-semibold">Current web agency: <span className="font-mono font-normal">{result.targetAgencyId}</span></p><p className="mt-2 text-[#475467]">Existing web data: {result.targetCounts.bookings} bookings, {result.targetCounts.vehicles} vehicles, {result.targetCounts.customers} customers, {result.targetCounts.private_files} private files.</p></div>
        <p className="text-sm text-[#93370D]">{result.message}</p>
      </div>}
    </div>
  </section>;
}
