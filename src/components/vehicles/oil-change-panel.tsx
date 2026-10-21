"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import { Droplets, Gauge, Pencil, Plus, Trash2, X } from "lucide-react";
import { getOilChangeOverviewAction, recordOilChangeAction, setOilChangeIntervalAction, voidOilChangeAction } from "@/app/actions/vehicles";
import { DetailPanel } from "@/components/shared/detail-layout";
import { InlineError } from "@/components/shared/inline-error";
import { LoadingState } from "@/components/shared/loading-state";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/forms/form-controls";
import { formatPkr } from "@/lib/utils";
import { dueSoonThreshold, oilChangeLabels, type OilChangeState, type OilChangeSummary } from "@/lib/oil-change";
import type { OilChangeOverview, OilChangeRecordDto } from "@/server/services/oil-change-service";

const stateTone: Record<OilChangeState, string> = {
  not_recorded: "bg-[#F2F4F7] text-[#475467] ring-[#D0D5DD]",
  ok: "bg-[#ECFDF3] text-[#067647] ring-[#ABEFC6]",
  due_soon: "bg-[#FFFAEB] text-[#B54708] ring-[#FEDF89]",
  overdue: "bg-[#FEF3F2] text-[#B42318] ring-[#FECDCA]",
};

export function OilChangeBadge({ summary }: { summary?: OilChangeSummary }) {
  if (!summary) return null;
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${stateTone[summary.state]}`}><Droplets size={13} aria-hidden />{oilChangeLabels[summary.state]}</span>;
}

const km = (value: number) => `${value.toLocaleString("en-PK")} km`;

export function OilChangePanel({ vehicleId, vehicleLabel, archived, onChanged }: { vehicleId: string; vehicleLabel: string; archived: boolean; onChanged: (summary: OilChangeSummary, message: string) => void }) {
  const [overview, setOverview] = useState<OilChangeOverview>();
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [recording, setRecording] = useState(false);
  const [editingInterval, setEditingInterval] = useState(false);
  const [removing, setRemoving] = useState<OilChangeRecordDto>();

  useEffect(() => {
    let active = true;
    void getOilChangeOverviewAction(vehicleId).then(result => {
      if (!active) return;
      if (result.ok) { setOverview(result.data); setError(""); } else setError(result.error.message);
    });
    return () => { active = false; };
  }, [vehicleId, reload]);

  function changed(next: OilChangeOverview, message: string) {
    setOverview(next);
    const { state, intervalKm, lastOdometer, currentOdometer, nextDueKm, remainingKm } = next;
    onChanged({ state, intervalKm, lastOdometer, currentOdometer, nextDueKm, remainingKm }, message);
  }

  if (error && !overview) return <DetailPanel title="Oil changes"><InlineError message={error} onRetry={() => { setError(""); setReload(value => value + 1); }} /></DetailPanel>;
  if (!overview) return <DetailPanel title="Oil changes"><LoadingState /></DetailPanel>;

  const progress = overview.lastOdometer !== undefined && overview.currentOdometer !== undefined
    ? Math.min(100, Math.max(0, ((overview.currentOdometer - overview.lastOdometer) / overview.intervalKm) * 100))
    : 0;

  return <DetailPanel title="Oil changes" action={<Button size="sm" disabled={archived} title={archived ? "Restore the vehicle to record maintenance" : undefined} onClick={() => setRecording(true)}><Plus size={15} />Record oil change</Button>}>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-[10px] border border-[#EAECF0] p-4 sm:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-[#667085]">Status</p><OilChangeBadge summary={overview} /></div>
        {overview.state === "not_recorded"
          ? <p className="mt-3 text-sm text-[#475467]">Record the most recent oil change to start tracking when the next one is due.</p>
          : <>
            <p className="mt-3 text-lg font-bold">{overview.remainingKm! > 0 ? `${km(overview.remainingKm!)} remaining` : `${km(-overview.remainingKm!)} overdue`}</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#F2F4F7]" role="progressbar" aria-label="Distance used since last oil change" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><div className={`h-full rounded-full ${overview.state === "overdue" ? "bg-[#D92D20]" : overview.state === "due_soon" ? "bg-[#F79009]" : "bg-[#12B76A]"}`} style={{ width: `${progress}%` }} /></div>
            <p className="mt-2 text-xs text-[#667085]">Next change due at {km(overview.nextDueKm!)} · warning from {km(dueSoonThreshold(overview.intervalKm))} before</p>
          </>}
      </div>
      <Fact icon={<Gauge size={16} />} label="Latest odometer" value={overview.currentOdometer !== undefined ? km(overview.currentOdometer) : "Not recorded"} detail="From check-outs, check-ins and oil changes" />
      <div className="rounded-[10px] border border-[#EAECF0] p-4">
        <div className="flex items-center justify-between gap-2"><p className="text-xs text-[#667085]">Change every</p><button type="button" disabled={archived} onClick={() => setEditingInterval(true)} className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold text-[#006FE6] hover:bg-[#EFF8FF] disabled:text-[#98A2B3]"><Pencil size={13} />Edit</button></div>
        <p className="mt-2 text-lg font-bold">{km(overview.intervalKm)}</p>
      </div>
    </div>
    <h3 className="mt-6 text-sm font-bold text-[#344054]">History</h3>
    {overview.history.length ? <div className="mt-3 space-y-2">{overview.history.map((item, index) => <div key={item.id} className="grid gap-2 rounded-[10px] border border-[#EAECF0] p-4 sm:grid-cols-[110px_1fr_auto_auto] sm:items-center">
      <p className="text-xs text-[#667085]">{formatDay(item.servicedOn)}</p>
      <div className="min-w-0"><p className="text-sm font-semibold">{km(item.odometer)} · {item.workshop}{index === 0 && <span className="ml-2 rounded-full bg-[#EFF8FF] px-2 py-0.5 text-[11px] font-semibold text-[#175CD3]">Latest</span>}</p><p className="mt-0.5 text-xs text-[#667085]">{[item.notes, item.expenseId ? `Expense ${item.expenseId}` : "", item.recordedBy ? `by ${item.recordedBy}` : ""].filter(Boolean).join(" · ") || "No notes"}</p></div>
      <p className="text-sm font-bold">{item.cost ? formatPkr(item.cost) : "No cost"}</p>
      <Button size="sm" variant="ghost" aria-label={`Remove oil change at ${km(item.odometer)}`} onClick={() => setRemoving(item)}><Trash2 size={15} />Remove</Button>
    </div>)}</div> : <div className="mt-3 rounded-[10px] border border-dashed p-8 text-center text-sm text-[#667085]">No oil changes recorded for {vehicleLabel} yet.</div>}
    {recording && <RecordOilChangeDialog vehicleId={vehicleId} vehicleLabel={vehicleLabel} overview={overview} onClose={() => setRecording(false)} onSaved={(next, message) => { setRecording(false); changed(next, message); }} />}
    {editingInterval && <IntervalDialog vehicleId={vehicleId} intervalKm={overview.intervalKm} onClose={() => setEditingInterval(false)} onSaved={next => { setEditingInterval(false); changed(next, `Oil change interval set to ${km(next.intervalKm)}.`); }} />}
    {removing && <RemoveDialog vehicleId={vehicleId} record={removing} onClose={() => setRemoving(undefined)} onSaved={next => { setRemoving(undefined); changed(next, "Oil change record removed."); }} />}
  </DetailPanel>;
}

function Fact({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return <div className="rounded-[10px] border border-[#EAECF0] p-4"><p className="flex items-center gap-1.5 text-xs text-[#667085]">{icon}{label}</p><p className="mt-2 text-lg font-bold">{value}</p><p className="mt-1 text-xs text-[#667085]">{detail}</p></div>;
}

function RecordOilChangeDialog({ vehicleId, vehicleLabel, overview, onClose, onSaved }: { vehicleId: string; vehicleLabel: string; overview: OilChangeOverview; onClose: () => void; onSaved: (next: OilChangeOverview, message: string) => void }) {
  const [servicedOn, setServicedOn] = useState(() => today());
  const [odometer, setOdometer] = useState(overview.currentOdometer !== undefined ? String(overview.currentOdometer) : "");
  const [cost, setCost] = useState("");
  const [workshop, setWorkshop] = useState(overview.history[0]?.workshop ?? "");
  const [notes, setNotes] = useState("");
  const [addExpense, setAddExpense] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const reading = Number(odometer);
  const costValue = cost === "" ? 0 : Number(cost);
  const lowReading = overview.currentOdometer !== undefined && odometer !== "" && reading < overview.currentOdometer;
  const localErrors: Record<string, string> = {};
  if (odometer === "" || !Number.isInteger(reading) || reading < 0) localErrors.odometer = "Enter the odometer reading at the oil change.";
  if (!Number.isInteger(costValue) || costValue < 0) localErrors.cost = "Enter a whole PKR amount.";
  else if (addExpense && costValue === 0) localErrors.cost = "Enter the cost to add it as an expense.";
  if (workshop.trim().length < 2) localErrors.workshop = "Enter the workshop name.";
  if (!servicedOn || servicedOn > today()) localErrors.servicedOn = "Choose today or an earlier date.";
  const valid = !Object.keys(localErrors).length;

  async function save() {
    if (!valid || pending) return;
    setPending(true); setError(""); setFieldErrors({});
    const result = await recordOilChangeAction(vehicleId, { servicedOn, odometer: reading, cost: costValue, workshop: workshop.trim(), notes: notes.trim(), addExpense });
    setPending(false);
    if (!result.ok) { setError(result.error.message); setFieldErrors(result.error.fieldErrors); return; }
    onSaved(result.data, `Oil change at ${km(reading)} recorded.${addExpense ? " A Maintenance expense was submitted for approval." : ""}`);
  }

  return <Shell title="Record oil change" description={`${vehicleLabel} · next due is calculated from this reading plus the ${km(overview.intervalKm)} interval.`} onClose={onClose}>
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <FormInput label="Service date" type="date" max={today()} value={servicedOn} required error={fieldErrors.servicedOn ?? (servicedOn ? localErrors.servicedOn : undefined)} onChange={event => setServicedOn(event.target.value)} />
      <FormInput label="Odometer (km)" type="number" min={0} value={odometer} required error={fieldErrors.odometer ?? (odometer !== "" ? localErrors.odometer : undefined)} hint={lowReading ? `Below the latest reading (${km(overview.currentOdometer!)}). Fine for an older record.` : overview.currentOdometer !== undefined ? `Latest reading: ${km(overview.currentOdometer)}` : undefined} onChange={event => setOdometer(event.target.value)} />
      <FormInput label="Cost (PKR)" type="number" min={0} value={cost} placeholder="0" error={fieldErrors.cost ?? (cost !== "" || addExpense ? localErrors.cost : undefined)} onChange={event => setCost(event.target.value)} />
      <FormInput label="Workshop" value={workshop} required placeholder="e.g. Pak Motors, Gulberg" error={fieldErrors.workshop ?? (workshop ? localErrors.workshop : undefined)} onChange={event => setWorkshop(event.target.value)} />
      <label className="text-sm font-semibold text-[#344054] sm:col-span-2">Notes (optional)<textarea className="mt-1.5 min-h-20 w-full rounded-[9px] border border-[#D0D5DD] p-3 text-sm font-normal outline-none focus:border-[#006FE6] focus:ring-2 focus:ring-[#006FE6]/10" value={notes} maxLength={500} placeholder="Oil grade, filter changed, etc." onChange={event => setNotes(event.target.value)} /></label>
      <label className="flex items-start gap-3 rounded-lg border border-[#B2DDFF] bg-[#F5FAFF] p-3 sm:col-span-2"><input type="checkbox" className="mt-1" checked={addExpense} onChange={event => setAddExpense(event.target.checked)} /><span><span className="block text-sm font-bold text-[#344054]">Also add the cost as a Maintenance expense</span><span className="mt-1 block text-xs text-[#667085]">The expense is linked to this vehicle and submitted for approval like any other expense.</span></span></label>
    </div>
    {error && <p role="alert" className="mt-4 rounded-lg bg-[#FEF3F2] p-3 text-sm text-[#B42318]">{error}</p>}
    <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="secondary" disabled={pending} onClick={onClose}>Cancel</Button><Button disabled={!valid || pending} onClick={() => void save()}>{pending ? "Saving…" : "Save oil change"}</Button></div>
  </Shell>;
}

function IntervalDialog({ vehicleId, intervalKm, onClose, onSaved }: { vehicleId: string; intervalKm: number; onClose: () => void; onSaved: (next: OilChangeOverview) => void }) {
  const [value, setValue] = useState(String(intervalKm));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const parsed = Number(value);
  const valid = Number.isInteger(parsed) && parsed >= 500 && parsed <= 50_000;
  async function save() {
    if (!valid || pending) return;
    setPending(true); setError("");
    const result = await setOilChangeIntervalAction(vehicleId, parsed);
    setPending(false);
    if (result.ok) onSaved(result.data); else setError(result.error.message);
  }
  return <Shell title="Oil change interval" description="How many kilometres this vehicle can run between oil changes." onClose={onClose}>
    <div className="mt-5"><FormInput label="Interval (km)" type="number" min={500} max={50000} step={500} value={value} error={value && !valid ? "Use a whole number between 500 and 50,000 km." : undefined} hint="Common intervals are 5,000 km (mineral oil) and 10,000 km (synthetic)." onChange={event => setValue(event.target.value)} /></div>
    <div className="mt-3 flex flex-wrap gap-2">{[3000, 5000, 7500, 10000].map(option => <button key={option} type="button" onClick={() => setValue(String(option))} className={`min-h-9 rounded-full border px-3 text-xs font-semibold ${parsed === option ? "border-[#006FE6] bg-[#EFF8FF] text-[#175CD3]" : "border-[#D0D5DD] text-[#475467]"}`}>{km(option)}</button>)}</div>
    {error && <p role="alert" className="mt-4 rounded-lg bg-[#FEF3F2] p-3 text-sm text-[#B42318]">{error}</p>}
    <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="secondary" disabled={pending} onClick={onClose}>Cancel</Button><Button disabled={!valid || pending} onClick={() => void save()}>{pending ? "Saving…" : "Save interval"}</Button></div>
  </Shell>;
}

function RemoveDialog({ vehicleId, record, onClose, onSaved }: { vehicleId: string; record: OilChangeRecordDto; onClose: () => void; onSaved: (next: OilChangeOverview) => void }) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    if (reason.trim().length < 3 || pending) return;
    setPending(true); setError("");
    const result = await voidOilChangeAction(vehicleId, record.id, reason);
    setPending(false);
    if (result.ok) onSaved(result.data); else setError(result.error.message);
  }
  return <Shell title="Remove oil change record" description={`${formatDay(record.servicedOn)} · ${km(record.odometer)} · ${record.workshop}. It will no longer count towards the schedule; the audit trail keeps it.`} onClose={onClose}>
    {record.expenseId && <p className="mt-5 rounded-lg border border-[#FEDF89] bg-[#FFFAEB] p-3 text-sm text-[#93370D]">Linked expense {record.expenseId} is not changed. Reject it from Expenses if it was also a mistake.</p>}
    <label className="mt-5 block text-sm font-semibold text-[#344054]">Reason<textarea autoFocus className="mt-1.5 min-h-20 w-full rounded-[9px] border border-[#D0D5DD] p-3 text-sm font-normal outline-none focus:border-[#006FE6]" value={reason} placeholder="e.g. Wrong odometer entered" onChange={event => setReason(event.target.value)} /></label>
    {error && <p role="alert" className="mt-4 rounded-lg bg-[#FEF3F2] p-3 text-sm text-[#B42318]">{error}</p>}
    <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="secondary" disabled={pending} onClick={onClose}>Keep record</Button><Button variant="danger" disabled={reason.trim().length < 3 || pending} onClick={() => void remove()}>{pending ? "Removing…" : "Remove record"}</Button></div>
  </Shell>;
}

function Shell({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: React.ReactNode }) {
  return <Dialog.Root open onOpenChange={open => !open && onClose()}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-[#101828]/45" /><Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-y-auto rounded-t-2xl bg-white p-5 sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-[calc(100%-32px)] sm:max-w-xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"><div className="flex justify-between gap-3"><div><Dialog.Title className="font-bold">{title}</Dialog.Title><Dialog.Description className="mt-1 text-xs text-[#667085]">{description}</Dialog.Description></div><Dialog.Close aria-label="Close dialog" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg"><X /></Dialog.Close></div>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}
