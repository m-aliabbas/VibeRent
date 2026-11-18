"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CalendarPlus, Download, FileText, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { archiveQuotationAction, saveQuotationAction, sendQuotationAction, setQuotationStatusAction } from "@/app/actions/quotations";
import { FormCombobox } from "@/components/forms/form-combobox";
import { FormInput } from "@/components/forms/form-controls";
import { SegmentedControl } from "@/components/forms/segmented-control";
import { OverflowMenu } from "@/components/shared/action-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, FilterSelect } from "@/components/shared/filter-bar";
import { FormDialog } from "@/components/shared/form-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Toast } from "@/components/shared/toast";
import { Button } from "@/components/ui/button";
import { downloadFromUrl } from "@/lib/download";
import { formatInZone, isoToZonedInput, toWallInput, zonedDayKey, zonedNow, zonedWallTimeToIso } from "@/lib/timezone";
import { formatPhone, formatPkr } from "@/lib/utils";
import type { QuotationDto, QuotationInput } from "@/server/services/quotation-service";

type CustomerOption = { id: string; name: string; phone: string };
type VehicleOption = { id: string; label: string; dailyRate: number; withDriverRate: number; city: string };
type Form = {
  id?: string; customerId: string; customerName: string; customerPhone: string; vehicleId: string; vehicleLabel: string;
  rentalMode: "self_drive" | "with_driver"; destinationCity: string; from: string; to: string;
  dailyRate: string; extras: string; discount: string; depositRequired: string; validUntil: string; notes: string;
};

const label = (status: QuotationDto["status"]) => status[0].toUpperCase() + status.slice(1);
const when = (value: string) => formatInZone(value, { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" });
const amount = (value: string) => value.trim() === "" ? 0 : Number(value);

function addDays(day: string, count: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

function blankForm(): Form {
  const pickup = zonedNow(); pickup.setDate(pickup.getDate() + 1); pickup.setHours(9, 0, 0, 0);
  const returned = new Date(pickup); returned.setDate(returned.getDate() + 1);
  return { customerId: "", customerName: "", customerPhone: "", vehicleId: "", vehicleLabel: "", rentalMode: "self_drive", destinationCity: "", from: toWallInput(pickup), to: toWallInput(returned), dailyRate: "", extras: "", discount: "", depositRequired: "", validUntil: addDays(zonedDayKey(), 7), notes: "" };
}

function formFrom(quote: QuotationDto): Form {
  return { id: quote.id, customerId: quote.customerId ?? "", customerName: quote.customerName, customerPhone: quote.customerPhone, vehicleId: quote.vehicleId ?? "", vehicleLabel: quote.vehicleLabel, rentalMode: quote.rentalMode, destinationCity: quote.destinationCity, from: isoToZonedInput(quote.pickupAt), to: isoToZonedInput(quote.returnAt), dailyRate: String(quote.dailyRate), extras: quote.extras ? String(quote.extras) : "", discount: quote.discount ? String(quote.discount) : "", depositRequired: quote.depositRequired ? String(quote.depositRequired) : "", validUntil: quote.validUntil, notes: quote.notes ?? "" };
}

/** Quotations: price offers before a booking, with a PDF, WhatsApp sending, and "Create booking". */
export function QuotationsWorkspace({ initial, customers, vehicles, canEdit }: { initial: QuotationDto[]; customers: CustomerOption[]; vehicles: VehicleOption[]; canEdit: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [form, setForm] = useState<Form>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [notice, setNotice] = useState("");
  const [removing, setRemoving] = useState<QuotationDto>();

  const upsert = (quote: QuotationDto) => setItems(current => [quote, ...current.filter(item => item.id !== quote.id)].sort((a, b) => b.publicNumber - a.publicNumber));
  const query = search.trim().toLowerCase(), digits = search.replace(/\D/g, "");
  const rows = items.filter(item => (!status || item.status === status) && (!query || `${item.reference} ${item.customerName} ${item.vehicleLabel} ${item.destinationCity}`.toLowerCase().includes(query) || (digits.length > 2 && item.customerPhone.includes(digits))));

  const vehicle = vehicles.find(item => item.id === form?.vehicleId);
  const days = form ? Math.max(1, Math.ceil((Date.parse(zonedWallTimeToIso(form.to)) - Date.parse(zonedWallTimeToIso(form.from))) / 86_400_000) || 1) : 1;
  const rate = form ? amount(form.dailyRate) : 0;
  const total = form ? rate * days + amount(form.extras) - amount(form.discount) : 0;
  const customerOptions = useMemo(() => customers.map(item => ({ value: item.id, label: item.name, keywords: item.phone })), [customers]);
  const vehicleOptions = useMemo(() => vehicles.map(item => ({ value: item.id, label: item.label, keywords: item.city })), [vehicles]);

  function pickVehicle(id: string, mode = form?.rentalMode) {
    const next = vehicles.find(item => item.id === id);
    setForm(current => current && ({ ...current, vehicleId: id, rentalMode: mode ?? current.rentalMode, dailyRate: next ? String(mode === "with_driver" ? next.withDriverRate : next.dailyRate) : current.dailyRate }));
  }

  async function save() {
    if (!form || saving) return;
    setSaving(true); setErrors({});
    const input: QuotationInput = {
      id: form.id, customerId: form.customerId || null, customerName: form.customerName, customerPhone: form.customerPhone,
      vehicleId: form.vehicleId || null, vehicleLabel: form.vehicleLabel, rentalMode: form.rentalMode, destinationCity: form.destinationCity,
      pickupAt: zonedWallTimeToIso(form.from), returnAt: zonedWallTimeToIso(form.to), dailyRate: form.dailyRate.trim() ? Number(form.dailyRate) : undefined,
      extras: amount(form.extras), discount: amount(form.discount), depositRequired: amount(form.depositRequired), validUntil: form.validUntil, notes: form.notes,
    };
    const result = await saveQuotationAction(input);
    setSaving(false);
    if (!result.ok) { setErrors(result.error.fieldErrors); setNotice(result.error.message); return; }
    upsert(result.data); setForm(undefined); setNotice(`${result.data.reference} saved for ${formatPkr(result.data.totalAmount)}.`);
  }

  async function run(id: string, work: () => Promise<{ ok: true; data: QuotationDto } | { ok: false; error: { message: string } }>, success: (quote: QuotationDto) => string) {
    setBusy(id);
    const result = await work();
    setBusy(undefined);
    if (!result.ok) { setNotice(result.error.message); return; }
    upsert(result.data); setNotice(success(result.data));
  }

  async function send(quote: QuotationDto) {
    setBusy(quote.id);
    const result = await sendQuotationAction(quote.id);
    setBusy(undefined);
    if (!result.ok) { setNotice(result.error.message); return; }
    upsert(result.data.quote); setNotice(result.data.notificationDelivery.message);
  }

  async function download(quote: QuotationDto) {
    setBusy(quote.id);
    try { await downloadFromUrl(`/api/v1/quotations/${encodeURIComponent(quote.id)}/pdf`, `quotation-${quote.reference}.pdf`); }
    catch (error) { setNotice(error instanceof Error ? error.message : "PDF download failed."); }
    finally { setBusy(undefined); }
  }

  /** Opens the booking wizard filled from the quote; confirming the booking links it back and marks the quote accepted. */
  function createBooking(quote: QuotationDto) {
    sessionStorage.removeItem("viberent-booking-reference");
    sessionStorage.setItem("viberent-booking-draft", JSON.stringify({
      bookingMode: "reservation", fulfillmentType: "fleet", quotationId: quote.id, customerId: quote.customerId ?? "", vehicleId: quote.vehicleId ?? "",
      city: quote.destinationCity || vehicles.find(item => item.id === quote.vehicleId)?.city || "", from: isoToZonedInput(quote.pickupAt), to: isoToZonedInput(quote.returnAt),
      rentalMode: quote.rentalMode, dailyRate: quote.dailyRate, extras: quote.extras, discount: quote.discount, deposit: quote.depositRequired,
      overrideReason: `Quoted in ${quote.reference}`, notes: `From quotation ${quote.reference}${quote.customerId ? "" : ` for ${quote.customerName}${quote.customerPhone ? ` (${quote.customerPhone})` : ""}`}`,
    }));
    router.push("/bookings/new");
  }

  async function remove() {
    if (!removing) return;
    setBusy(removing.id);
    const result = await archiveQuotationAction(removing.id);
    setBusy(undefined);
    if (!result.ok) { setNotice(result.error.message); return; }
    setItems(current => current.filter(item => item.id !== removing.id)); setNotice(`${removing.reference} deleted.`); setRemoving(undefined);
  }

  return <div className="space-y-6">
    <Toast message={notice} onDismiss={() => setNotice("")} />
    <PageHeader eyebrow="Daily work" title="Quotations" description="Price quotes before a booking. A quote never blocks a car." actions={canEdit ? <Button shortcut="n" onClick={() => { setErrors({}); setForm(blankForm()); }}><Plus size={16} />New quotation</Button> : undefined} />
    <FilterBar search={search} onSearch={setSearch} placeholder="Search quote, customer, car or phone…" hasFilters={Boolean(search || status)} onClear={() => { setSearch(""); setStatus(""); }} summary={`${rows.length} quotation${rows.length === 1 ? "" : "s"}`}>
      <FilterSelect label="Status" value={status} onChange={setStatus} options={["draft", "sent", "accepted", "declined", "expired"].map(value => ({ value, label: label(value as QuotationDto["status"]) }))} />
    </FilterBar>
    {rows.length ? <section className="divide-y overflow-hidden rounded-xl border border-[#E8ECF2] bg-white">{rows.map(item => <article key={item.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
      <span className="hidden h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#EFF8FF] text-[#006FE6] sm:grid"><FileText size={18} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><strong className="tabular-nums">{item.reference}</strong><StatusBadge status={label(item.status)} />{item.bookingId && <Link href={`/bookings/${item.bookingId}`} className="text-xs font-semibold text-[#006FE6] hover:underline">Booking #{item.bookingNumber ?? item.bookingId}</Link>}</div>
        <p className="mt-0.5 truncate text-sm">{item.customerId ? <Link href={`/customers/${item.customerId}`} className="font-semibold hover:text-[#006FE6]">{item.customerName}</Link> : <span className="font-semibold">{item.customerName}</span>}{item.customerPhone && <span className="text-[#667085]"> · {formatPhone(item.customerPhone)}</span>}</p>
        <p className="truncate text-xs text-[#667085]">{item.vehicleLabel} · {when(item.pickupAt)} – {when(item.returnAt)} · {item.days} day{item.days === 1 ? "" : "s"}{item.destinationCity ? ` · ${item.destinationCity}` : ""}</p>
      </div>
      <div className="flex items-center justify-between gap-3 lg:justify-end">
        <div className="text-left lg:text-right"><p className="font-bold tabular-nums">{formatPkr(item.totalAmount)}</p><p className="text-xs text-[#667085]">Valid until {new Intl.DateTimeFormat("en-PK", { day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(`${item.validUntil}T00:00:00Z`))}</p></div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="secondary" disabled={busy === item.id} onClick={() => void download(item)} aria-label={`Download ${item.reference} PDF`}><Download size={15} /><span className="hidden sm:inline">PDF</span></Button>
          {canEdit && !item.bookingId && <Button size="sm" variant="secondary" disabled={busy === item.id || !item.customerPhone} title={item.customerPhone ? undefined : "Add a customer phone number to send on WhatsApp."} onClick={() => void send(item)}><Send size={15} /><span className="hidden sm:inline">Send</span></Button>}
          {canEdit && !item.bookingId && item.vehicleId && item.status !== "declined" && <Button size="sm" onClick={() => createBooking(item)}><CalendarPlus size={15} /><span className="hidden sm:inline">Create booking</span></Button>}
          {canEdit && !item.bookingId && <OverflowMenu label={`More actions for ${item.reference}`} items={[
            { label: "Edit quotation", icon: <Pencil size={15} />, onSelect: () => { setErrors({}); setForm(formFrom(item)); } },
            { label: "Mark accepted", disabled: item.status === "accepted", onSelect: () => void run(item.id, () => setQuotationStatusAction(item.id, "accepted"), quote => `${quote.reference} marked accepted.`) },
            { label: "Mark declined", disabled: item.status === "declined", onSelect: () => void run(item.id, () => setQuotationStatusAction(item.id, "declined"), quote => `${quote.reference} marked declined.`) },
            { label: "Delete quotation…", icon: <Trash2 size={15} />, danger: true, separatorBefore: true, onSelect: () => setRemoving(item) },
          ]} />}
        </div>
      </div>
    </article>)}</section> : <EmptyState filtered={Boolean(search || status)} icon={<FileText size={22} />} title={search || status ? "No matching quotations" : "No quotations yet"} description={search || status ? "Clear the filters to see every quotation." : "Create a quotation to send a customer a price before they book."} />}

    {form && <FormDialog wide title={form.id ? "Edit quotation" : "New quotation"} description="Customer and car details are copied onto the quote. Nothing is reserved until a booking is confirmed." onClose={() => setForm(undefined)} footer={<><Button variant="secondary" onClick={() => setForm(undefined)}>Cancel</Button><Button shortcut="mod+enter" shortcutInInput disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : `Save · ${formatPkr(Math.max(0, total))}`}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><FormCombobox label="Customer" value={form.customerId} onValueChange={value => setForm({ ...form, customerId: value })} options={customerOptions} placeholder="Choose a saved customer, or type a walk-in name below" error={errors.customerId} /></div>
        {!form.customerId ? <>
          <FormInput label="Walk-in name" value={form.customerName} onChange={event => setForm({ ...form, customerName: event.target.value })} error={errors.customerName} placeholder="Name for the quote" />
          <FormInput label="Phone (for WhatsApp)" inputMode="tel" value={form.customerPhone} onChange={event => setForm({ ...form, customerPhone: event.target.value })} error={errors.customerPhone} placeholder="0300 1234567" />
        </> : <p className="text-xs text-[#667085] sm:col-span-2"><button type="button" className="font-semibold text-[#006FE6] hover:underline" onClick={() => setForm({ ...form, customerId: "" })}>Use a walk-in name instead</button></p>}
        <div className="sm:col-span-2"><SegmentedControl label="Rental type" value={form.rentalMode} onChange={value => form.vehicleId ? pickVehicle(form.vehicleId, value) : setForm({ ...form, rentalMode: value })} options={[{ value: "self_drive", label: "Self drive" }, { value: "with_driver", label: "With driver" }]} /></div>
        <div className="sm:col-span-2"><FormCombobox label="Vehicle" value={form.vehicleId} onValueChange={value => pickVehicle(value)} options={vehicleOptions} placeholder="Choose a car from the fleet" error={errors.vehicleId} /></div>
        {!form.vehicleId && <div className="sm:col-span-2"><FormInput label="Or describe the car" value={form.vehicleLabel} onChange={event => setForm({ ...form, vehicleLabel: event.target.value })} error={errors.vehicleLabel} placeholder="e.g. Toyota Corolla or similar" hint="Choose a fleet car to create a booking from this quote later." /></div>}
        <FormInput label="Pickup" type="datetime-local" value={form.from} onChange={event => setForm({ ...form, from: event.target.value })} error={errors.pickupAt} />
        <FormInput label="Return" type="datetime-local" value={form.to} onChange={event => setForm({ ...form, to: event.target.value })} error={errors.returnAt} />
        <FormInput label="Destination city (optional)" value={form.destinationCity} onChange={event => setForm({ ...form, destinationCity: event.target.value })} />
        <FormInput label="Daily rate (PKR)" type="number" min={1} value={form.dailyRate} onChange={event => setForm({ ...form, dailyRate: event.target.value })} error={errors.dailyRate} hint={vehicle ? `Standard rate ${formatPkr(form.rentalMode === "with_driver" ? vehicle.withDriverRate : vehicle.dailyRate)}` : undefined} />
        <FormInput label="Extras (PKR)" type="number" min={0} value={form.extras} placeholder="0" onChange={event => setForm({ ...form, extras: event.target.value })} error={errors.extras} />
        <FormInput label="Discount (PKR)" type="number" min={0} value={form.discount} placeholder="0" onChange={event => setForm({ ...form, discount: event.target.value })} error={errors.discount} />
        <FormInput label="Security deposit (PKR)" type="number" min={0} value={form.depositRequired} placeholder="0" onChange={event => setForm({ ...form, depositRequired: event.target.value })} error={errors.depositRequired} />
        <FormInput label="Valid until" type="date" value={form.validUntil} onChange={event => setForm({ ...form, validUntil: event.target.value })} error={errors.validUntil} />
        <label className="text-sm font-semibold text-[#344054] sm:col-span-2">Notes (shown on the quote)<textarea className="mt-1.5 min-h-20 w-full rounded-[9px] border border-[#D0D5DD] bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[#006FE6] focus:ring-2 focus:ring-[#006FE6]/10" value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} />{errors.notes && <span className="mt-1 block text-xs font-normal text-[#B42318]">{errors.notes}</span>}</label>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-2 rounded-[10px] bg-[#F8FAFC] p-3 text-sm sm:grid-cols-4">
        <div><dt className="text-xs text-[#667085]">Rent</dt><dd className="font-semibold tabular-nums">{days} × {formatPkr(rate)}</dd></div>
        <div><dt className="text-xs text-[#667085]">Extras</dt><dd className="font-semibold tabular-nums">{formatPkr(amount(form.extras))}</dd></div>
        <div><dt className="text-xs text-[#667085]">Discount</dt><dd className="font-semibold tabular-nums text-[#067647]">− {formatPkr(amount(form.discount))}</dd></div>
        <div><dt className="text-xs text-[#667085]">Quoted total</dt><dd className={`font-bold tabular-nums ${total < 0 ? "text-[#B42318]" : ""}`}>{formatPkr(total)}</dd></div>
      </dl>
    </FormDialog>}
    <ConfirmDialog open={Boolean(removing)} onOpenChange={next => !next && setRemoving(undefined)} title={`Delete ${removing?.reference ?? "quotation"}?`} description="The quotation is removed from the list. Bookings are not affected." onConfirm={() => void remove()} pending={Boolean(busy)} confirmLabel="Delete quotation" pendingLabel="Deleting…" />
  </div>;
}
