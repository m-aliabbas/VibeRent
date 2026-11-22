"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { Fuel, Pencil, Plus, Route, Trash2, X } from "lucide-react";
import { removeBookingChargeAction, saveBookingChargeAction, updateBookingPricingAction } from "@/app/actions/bookings";
import { FormInput, FormSelect } from "@/components/forms/form-controls";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { formatPkr } from "@/lib/utils";
import type { BookingListItem } from "@/server/repositories/contracts";

type ChargeKind = "toll" | "fuel" | "driver" | "parking" | "other";
const chargeOptions: Array<{ label: string; value: ChargeKind }> = [
  { label: "Toll tax", value: "toll" }, { label: "Fuel", value: "fuel" }, { label: "Driver expense", value: "driver" }, { label: "Parking", value: "parking" }, { label: "Other", value: "other" },
];
const chargeLabel = (kind: string) => chargeOptions.find(item => item.value === kind)?.label ?? "Charge";

/**
 * Negotiated price: daily rent, extras, discount and deposit can change before or after the booking.
 * The server recalculates the total; the change is kept in the booking's audit trail.
 */
export function EditPriceDialog({ booking, onClose, onSave }: { booking: BookingListItem; onClose: () => void; onSave: (next: BookingListItem) => void }) {
  const [rate, setRate] = useState(String(booking.dailyRate));
  const [extras, setExtras] = useState(String(booking.extras));
  const [discount, setDiscount] = useState(String(booking.discount));
  const [deposit, setDeposit] = useState(String(booking.deposit));
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const values = { dailyRate: Number(rate), extras: Number(extras), discount: Number(discount), depositRequired: Number(deposit) };
  const validNumbers = Object.values(values).every(value => Number.isSafeInteger(value) && value >= 0);
  const trip = booking.tripCharges ?? 0;
  const preview = values.dailyRate * booking.days + booking.mileageRate * booking.estimatedKm + values.extras + trip - values.discount;
  const changed = values.dailyRate !== booking.dailyRate || values.extras !== booking.extras || values.discount !== booking.discount || values.depositRequired !== booking.deposit;
  async function save() {
    if (!validNumbers || !changed || preview < 0 || pending) return;
    setPending(true); setError("");
    const result = await updateBookingPricingAction(booking.id, { ...values, reason: reason.trim() || undefined, version: booking.version });
    setPending(false);
    if (result.ok) onSave(result.data); else setError(result.error.message);
  }
  return <Sheet title="Edit price" description="Change the agreed rent, extras, discount or deposit. Payments already received stay as they are." onClose={onClose}>
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <FormInput label="Rent per day (PKR)" type="number" min={0} value={rate} onChange={e => setRate(e.target.value)} hint={`${booking.days} day${booking.days === 1 ? "" : "s"} · 0 = not agreed yet`} />
      <FormInput label="Discount (PKR)" type="number" min={0} value={discount} onChange={e => setDiscount(e.target.value)} />
      <FormInput label="Extras (PKR)" type="number" min={0} value={extras} onChange={e => setExtras(e.target.value)} />
      <FormInput label="Deposit (PKR)" type="number" min={0} value={deposit} onChange={e => setDeposit(e.target.value)} hint="Held separately; not part of the total" />
    </div>
    <div className="mt-4"><FormInput label="Note (optional)" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. negotiated with customer on return" /></div>
    <dl className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-[#F8FAFC] p-3 text-sm">
      <div><dt className="text-xs text-[#667085]">Trip charges</dt><dd className="font-semibold">{formatPkr(trip)}</dd></div>
      <div><dt className="text-xs text-[#667085]">New total</dt><dd className={`font-bold ${preview < 0 ? "text-[#B42318]" : "text-[#006FE6]"}`}>{formatPkr(preview)}</dd></div>
      <div><dt className="text-xs text-[#667085]">Balance after</dt><dd className="font-semibold">{formatPkr(preview - booking.paid)}</dd></div>
    </dl>
    {preview < 0 && <p className="mt-2 text-xs text-[#B42318]">The discount is larger than the booking amount.</p>}
    {error && <p role="alert" className="mt-3 rounded-lg bg-[#FEF3F2] p-3 text-sm text-[#B42318]">{error}</p>}
    <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="secondary" disabled={pending} onClick={onClose}>Cancel</Button><Button disabled={!validNumbers || !changed || preview < 0 || pending} onClick={() => void save()}>{pending ? "Saving…" : "Save price"}</Button></div>
  </Sheet>;
}

/** Toll tax, fuel, driver expense and parking billed to the customer; editable before and after the trip. */
export function TripChargesPanel({ booking, onChanged }: { booking: BookingListItem; onChanged: (next: BookingListItem, message: string) => void }) {
  const [editing, setEditing] = useState<{ id?: string; kind: ChargeKind; description: string; amount: string }>();
  const [removing, setRemoving] = useState<string>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const charges = booking.charges ?? [];
  const total = booking.tripCharges ?? 0;
  const editable = !["Cancelled", "No Show"].includes(booking.status);
  async function save() {
    if (!editing || pending) return;
    const amount = Number(editing.amount);
    if (!Number.isSafeInteger(amount) || amount <= 0) { setError("Enter a positive whole amount."); return; }
    setPending(true); setError("");
    const result = await saveBookingChargeAction(booking.id, { id: editing.id, kind: editing.kind, description: editing.description.trim(), amount });
    setPending(false);
    if (!result.ok) { setError(result.error.message); return; }
    setEditing(undefined);
    onChanged(result.data, editing.id ? "Trip charge updated and the total recalculated." : `${chargeLabel(editing.kind)} added to the booking total.`);
  }
  async function remove() {
    if (!removing) return;
    setPending(true);
    const result = await removeBookingChargeAction(booking.id, removing);
    setPending(false); setRemoving(undefined);
    if (result.ok) onChanged(result.data, "Trip charge removed and the total recalculated."); else setError(result.error.message);
  }
  return <section className="rounded-xl border border-[#E8ECF2] bg-white p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#EFF8FF] text-[#006FE6]"><Route size={19} /></span><div><h2 className="font-bold">Trip charges</h2><p className="mt-1 text-xs text-[#667085]">Toll tax, fuel, driver expense and parking billed to the customer. Not shared with vehicle owners.</p></div></div>
      <div className="flex items-center gap-2"><span className="rounded-lg bg-[#F8FAFC] px-3 py-2 text-sm font-semibold tabular-nums">Total {formatPkr(total)}</span>{editable && <Button size="sm" variant="secondary" onClick={() => { setError(""); setEditing({ kind: booking.rentalMode === "with_driver" ? "toll" : "other", description: "", amount: "" }); }}><Plus size={15} />Add charge</Button>}</div>
    </div>
    {charges.length ? <ul className="mt-4 divide-y divide-[#EAECF0] rounded-xl border border-[#EAECF0]">{charges.map(charge => <li key={charge.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
      <Fuel size={16} className="shrink-0 text-[#667085]" />
      <span className="min-w-0 flex-1"><strong>{chargeLabel(charge.kind)}</strong>{charge.description && <span className="text-[#667085]"> · {charge.description}</span>}</span>
      <span className="font-semibold tabular-nums">{formatPkr(charge.amount)}</span>
      {editable && <><button type="button" onClick={() => { setError(""); setEditing({ id: charge.id, kind: charge.kind, description: charge.description, amount: String(charge.amount) }); }} className="grid size-9 place-items-center rounded-lg text-[#475467] hover:bg-[#F2F4F7]" aria-label={`Edit ${chargeLabel(charge.kind)}`}><Pencil size={15} /></button><button type="button" onClick={() => setRemoving(charge.id)} className="grid size-9 place-items-center rounded-lg text-[#B42318] hover:bg-[#FEF3F2]" aria-label={`Remove ${chargeLabel(charge.kind)}`}><Trash2 size={15} /></button></>}
    </li>)}</ul> : <p className="mt-4 rounded-lg border border-dashed border-[#D0D5DD] p-4 text-center text-sm text-[#667085]">No trip charges yet.{booking.rentalMode === "with_driver" ? " Add toll tax, fuel or driver expenses as the trip happens." : ""}</p>}
    {error && !editing && <p role="alert" className="mt-3 text-sm text-[#B42318]">{error}</p>}
    {editing && <Sheet title={editing.id ? "Edit trip charge" : "Add trip charge"} description="It is added to the customer's total. Record the payment from the booking as usual." onClose={() => setEditing(undefined)}>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <FormSelect label="Type" value={editing.kind} onChange={e => setEditing({ ...editing, kind: e.target.value as ChargeKind })} options={chargeOptions} />
        <FormInput label="Amount (PKR)" type="number" min={1} value={editing.amount} onChange={e => setEditing({ ...editing, amount: e.target.value })} autoFocus />
        <div className="sm:col-span-2"><FormInput label="Details (optional)" value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} placeholder="e.g. M-2 toll Lahore → Islamabad" /></div>
      </div>
      {error && <p role="alert" className="mt-3 rounded-lg bg-[#FEF3F2] p-3 text-sm text-[#B42318]">{error}</p>}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="secondary" disabled={pending} onClick={() => setEditing(undefined)}>Cancel</Button><Button disabled={pending} onClick={() => void save()}>{pending ? "Saving…" : editing.id ? "Save charge" : "Add charge"}</Button></div>
    </Sheet>}
    <ConfirmDialog open={Boolean(removing)} onOpenChange={next => !next && setRemoving(undefined)} title="Remove this trip charge?" description="The booking total is reduced by this amount." onConfirm={() => void remove()} pending={pending} confirmLabel="Remove charge" pendingLabel="Removing…" />
  </section>;
}

function Sheet({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: React.ReactNode }) {
  return <Dialog.Root open onOpenChange={open => !open && onClose()}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-[#101828]/45" /><Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-y-auto rounded-t-2xl bg-white p-5 sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[min(480px,92vw)] sm:max-h-none sm:rounded-none sm:rounded-l-2xl">
    <div className="flex items-start justify-between gap-3"><div><Dialog.Title className="text-lg font-bold">{title}</Dialog.Title><Dialog.Description className="mt-1 text-xs text-[#667085]">{description}</Dialog.Description></div><Dialog.Close aria-label="Close" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[#667085] hover:bg-[#F2F4F7]"><X size={18} /></Dialog.Close></div>
    {children}
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
