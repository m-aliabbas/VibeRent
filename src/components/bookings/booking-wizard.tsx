"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Check, ShieldAlert } from "lucide-react";
import { confirmBookingAction } from "@/app/actions/bookings";
import { FormInput, FormSelect } from "@/components/forms/form-controls";
import { Button } from "@/components/ui/button";
import { fleetOptions, getVehicleConflicts } from "@/lib/booking-data";
import { customers } from "@/lib/operations-data";
import { formatPkr } from "@/lib/utils";

type Draft = {
  city: string;
  from: string;
  to: string;
  vehicleId: string;
  customerId: string;
  dailyRate: number;
  extras: number;
  discount: number;
  deposit: number;
  notes: string;
};

const initial: Draft = {
  city: "Lahore",
  from: "2026-10-04T09:00",
  to: "2026-10-07T18:00",
  vehicleId: "",
  customerId: "",
  dailyRate: 0,
  extras: 0,
  discount: 0,
  deposit: 25000,
  notes: "",
};
const steps = ["Schedule", "Vehicle", "Customer", "Pricing", "Review"];

export function BookingWizard() {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(initial);
  const [confirmed, setConfirmed] = useState("");
  const [conflictMode, setConflictMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    const saved = sessionStorage.getItem("viberent-booking-draft");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as Partial<Draft>;
      window.setTimeout(() => setDraft((current) => ({ ...current, ...parsed })), 0);
    } catch {
      sessionStorage.removeItem("viberent-booking-draft");
    }
  }, []);
  useEffect(() => {
    if (!confirmed) sessionStorage.setItem("viberent-booking-draft", JSON.stringify(draft));
  }, [draft, confirmed]);

  const vehicle = fleetOptions.find((item) => item.id === draft.vehicleId);
  const days = Math.max(1, Math.ceil((new Date(draft.to).getTime() - new Date(draft.from).getTime()) / 86_400_000));
  const total = draft.dailyRate * days + draft.extras - draft.discount;
  const eligibleVehicles = fleetOptions
    .filter((item) => item.city === draft.city)
    .map((item) => ({ ...item, conflicts: getVehicleConflicts(item.id, draft.from, draft.to) }));
  const canContinue = [
    Boolean(draft.from && draft.to && new Date(draft.to) > new Date(draft.from)),
    Boolean(vehicle && getVehicleConflicts(vehicle.id, draft.from, draft.to).length === 0),
    Boolean(draft.customerId),
    draft.dailyRate > 0 && draft.discount <= draft.dailyRate * days + draft.extras,
    true,
  ][step];

  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (!vehicle || !draft.customerId || submitting) return;
    setSubmitting(true);
    setSubmitError("");
    const result = await confirmBookingAction({
      vehicleId: vehicle.id,
      customerId: draft.customerId,
      pickupAt: draft.from,
      returnAt: draft.to,
      extras: draft.extras,
      discount: draft.discount,
      depositRequired: draft.deposit,
      source: "counter",
      notes: draft.notes,
    });
    setSubmitting(false);
    if (!result.ok) {
      setSubmitError(result.error.message);
      if (result.error.code === "BOOKING_CONFLICT") {
        setConflictMode(true);
        setStep(1);
      }
      return;
    }
    sessionStorage.removeItem("viberent-booking-draft");
    setConfirmed(result.data.id);
  }

  if (confirmed) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-[#ABEFC6] bg-white p-8 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#ECFDF3] text-[#067647]"><Check size={28} /></span>
        <h1 className="mt-4 text-2xl font-bold">Booking confirmed</h1>
        <p className="mt-2 text-sm text-[#667085]">{confirmed} now persistently blocks {vehicle?.plate} for the selected interval.</p>
        <div className="mt-6 flex justify-center gap-2"><Button asChild><Link href="/bookings">View bookings</Link></Button></div>
      </div>
    );
  }

  return (
    <form onSubmit={confirm} className="space-y-6">
      <Link href="/bookings" className="inline-flex items-center gap-2 text-sm font-semibold text-[#475467]"><ArrowLeft size={17} />Bookings</Link>
      <div><p className="text-xs font-bold uppercase tracking-wider text-[#006FE6]">New booking</p><h1 className="mt-1 text-2xl font-bold">Create a reservation</h1><p className="mt-1 text-sm text-[#667085]">Your progress is preserved in this browser session.</p></div>
      <ol className="grid grid-cols-5 gap-1" aria-label="Booking steps">
        {steps.map((label, index) => <li key={label} className={`rounded-lg px-2 py-2 text-center text-[11px] font-semibold sm:text-xs ${index === step ? "bg-[#006FE6] text-white" : index < step ? "bg-[#EAF4FF] text-[#0058B8]" : "bg-[#F2F4F7] text-[#667085]"}`}>{index + 1}. {label}</li>)}
      </ol>
      <section className="rounded-xl border border-[#E4E7EC] bg-white p-5">
        {step === 0 && <ScheduleStep draft={draft} setDraft={setDraft} />}
        {step === 1 && <VehicleStep draft={draft} setDraft={setDraft} vehicles={eligibleVehicles} conflictMode={conflictMode} clearConflict={() => setConflictMode(false)} />}
        {step === 2 && <CustomerStep draft={draft} setDraft={setDraft} />}
        {step === 3 && <PricingStep draft={draft} setDraft={setDraft} days={days} total={total} />}
        {step === 4 && <Review draft={draft} days={days} total={total} />}
      </section>
      {submitError && <p role="alert" className="rounded-lg border border-[#FDA29B] bg-[#FEF3F2] p-3 text-sm text-[#B42318]">{submitError}</p>}
      <div className="flex justify-between">
        <Button type="button" variant="secondary" disabled={step === 0 || submitting} onClick={() => setStep(step - 1)}>Back</Button>
        {step < 4 ? <Button type="button" disabled={!canContinue} onClick={() => setStep(step + 1)}>Continue</Button> : <Button type="submit" disabled={submitting}>{submitting ? "Confirming…" : "Confirm booking"}</Button>}
      </div>
    </form>
  );
}

function ScheduleStep({ draft, setDraft }: { draft: Draft; setDraft: (value: Draft) => void }) {
  return <div className="grid gap-4 sm:grid-cols-2"><FormSelect label="Pickup city" value={draft.city} onChange={(event) => setDraft({ ...draft, city: event.target.value, vehicleId: "" })} options={["Lahore", "Islamabad", "Rawalpindi", "Karachi"]} /><div /><FormInput label="Pickup" type="datetime-local" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} /><FormInput label="Return" type="datetime-local" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} /></div>;
}

function VehicleStep({ draft, setDraft, vehicles, conflictMode, clearConflict }: { draft: Draft; setDraft: (value: Draft) => void; vehicles: Array<(typeof fleetOptions)[number] & { conflicts: ReturnType<typeof getVehicleConflicts> }>; conflictMode: boolean; clearConflict: () => void }) {
  return <div><h2 className="font-bold">Available vehicles</h2><p className="mt-1 text-xs text-[#667085]">Only vehicles assigned to {draft.city} are shown. Availability is checked again on confirmation.</p>{conflictMode && <div role="alert" className="mt-4 rounded-lg border border-[#FDA29B] bg-[#FEF3F2] p-3 text-sm text-[#B42318]"><strong className="flex gap-2"><ShieldAlert size={17} />Availability changed</strong><p className="mt-1 text-xs">We kept every other field. Choose an alternative vehicle to continue.</p></div>}<div className="mt-4 grid gap-3 sm:grid-cols-2">{vehicles.map((item) => <button type="button" key={item.id} disabled={item.conflicts.length > 0} onClick={() => { setDraft({ ...draft, vehicleId: item.id, dailyRate: item.rate }); clearConflict(); }} className={`rounded-xl border p-4 text-left disabled:cursor-not-allowed disabled:opacity-55 ${draft.vehicleId === item.id ? "border-[#006FE6] bg-[#EFF8FF]" : "border-[#E4E7EC]"}`}><strong className="text-sm">{item.label}</strong><p className="mt-1 text-xs text-[#667085]">{item.plate} · {formatPkr(item.rate)}/day</p><p className={`mt-3 text-xs font-semibold ${item.conflicts.length ? "text-[#B42318]" : "text-[#067647]"}`}>{item.conflicts.length ? item.conflicts[0].reason : "Available"}</p></button>)}</div></div>;
}

function CustomerStep({ draft, setDraft }: { draft: Draft; setDraft: (value: Draft) => void }) {
  const selected = customers.find((item) => item.id === draft.customerId);
  return <div><h2 className="font-bold">Customer</h2><p className="mt-1 text-xs text-[#667085]">Choose a verified customer record. New-customer persistence is the next backend increment.</p><div className="mt-4"><FormSelect label="Existing customer" value={draft.customerId} onChange={(event) => setDraft({ ...draft, customerId: event.target.value })} options={["", ...customers.map((item) => item.id)]} />{selected && <div className={`mt-3 rounded-lg border p-3 text-sm ${selected.status === "Review" ? "border-[#FEDF89] bg-[#FFFAEB] text-[#93370D]" : "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]"}`}><strong>{selected.name} · {selected.status}</strong><p className="mt-1 text-xs">License verified · CNIC on file{selected.status === "Review" ? " · Manager review required" : ""}</p></div>}</div></div>;
}

function PricingStep({ draft, setDraft, days, total }: { draft: Draft; setDraft: (value: Draft) => void; days: number; total: number }) {
  return <div className="grid gap-4 sm:grid-cols-2"><FormInput label="Daily rate" type="number" value={draft.dailyRate} disabled /><FormInput label="Deposit required" type="number" value={draft.deposit} onChange={(event) => setDraft({ ...draft, deposit: Number(event.target.value) })} /><FormInput label="Extras" type="number" value={draft.extras} onChange={(event) => setDraft({ ...draft, extras: Number(event.target.value) })} /><FormInput label="Discount" type="number" value={draft.discount} onChange={(event) => setDraft({ ...draft, discount: Number(event.target.value) })} /><FormInput label="Notes" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /><div className="rounded-lg bg-[#F8FAFC] p-4"><p className="text-xs text-[#667085]">{days} rental days · rate verified by server</p><p className="mt-1 text-xl font-bold">{formatPkr(total)}</p></div></div>;
}

function Review({ draft, days, total }: { draft: Draft; days: number; total: number }) {
  const vehicle = fleetOptions.find((item) => item.id === draft.vehicleId);
  const customer = customers.find((item) => item.id === draft.customerId)?.name;
  const details = [["Schedule", `${new Date(draft.from).toLocaleString("en-PK")} – ${new Date(draft.to).toLocaleString("en-PK")}`], ["Vehicle", `${vehicle?.label} · ${vehicle?.plate}`], ["Customer", customer], ["Price", `${formatPkr(total)} · ${days} days`], ["Deposit", formatPkr(draft.deposit)], ["Final availability", "Checked transactionally on confirmation"]];
  return <div><h2 className="font-bold">Review and confirm</h2><dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">{details.map(([label, value]) => <div key={label} className="rounded-lg bg-[#F8FAFC] p-3"><dt className="text-xs text-[#667085]">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>)}</dl></div>;
}
