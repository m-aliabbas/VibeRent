"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Banknote,
  CalendarPlus,
  CarFront,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  MapPin,
  Plus,
  ReceiptText,
  RotateCcw,
  Search,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormInput, FormSelect } from "@/components/forms/form-controls";
import { StatusBadge } from "@/components/shared/status-badge";
import { Toast } from "@/components/shared/toast";
import { confirmBookingAction, listBookingsAction, recordBookingPaymentAction } from "@/app/actions/bookings";
import { createCustomerAction, listCustomersAction } from "@/app/actions/customers";
import { listVehiclesAction } from "@/app/actions/vehicles";
import { bookings, customers } from "@/lib/operations-data";
import { formatPkr } from "@/lib/utils";
import type { DashboardData } from "@/server/services/dashboard-service";
import type { BookingListItem } from "@/server/repositories/contracts";
import type { PaymentMethod } from "@/server/validation/booking";
import type { Vehicle } from "@/types/vehicle";

type DeskAction = "booking" | "return" | "payment" | null;
type QueueFilter = "All" | "Pickup" | "Return";
type CustomerDto = {
  id: string;
  name: string;
  phone: string;
  cnic: string;
  email: string | null;
  licenseNumber: string | null;
  licenseExpiresAt: string | null;
  status: string;
  version: number;
  updatedAt: string;
};

const recordHubs = [
  { label: "Vehicles", note: "Fleet & availability", href: "/vehicles", icon: CarFront },
  { label: "Bookings", note: "All reservations", href: "/bookings", icon: CalendarPlus },
  { label: "Customers", note: "Renter records", href: "/customers", icon: UsersRound },
  { label: "Expenses", note: "Costs & receipts", href: "/expenses", icon: ReceiptText },
];

export function OperationsDesk({
  firstName,
  data,
}: {
  firstName: string;
  data: DashboardData;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<QueueFilter>("All");
  const [action, setAction] = useState<DeskAction>(null);
  const [notice, setNotice] = useState("");
  const term = query.trim().toLowerCase();

  const queue = useMemo(
    () =>
      data.schedule.filter((item) => {
        const matchesFilter = filter === "All" || item.type === filter;
        const haystack = `${item.customer} ${item.vehicle} ${item.plate} ${item.location}`.toLowerCase();
        return matchesFilter && (!term || haystack.includes(term));
      }),
    [data.schedule, filter, term],
  );

  const directoryMatches = useMemo(() => {
    if (!term) return [];
    return [
      ...bookings.map((item) => ({
        id: item.id,
        title: `${item.customer} · ${item.vehicle}`,
        note: `${item.dates} · ${formatPkr(item.amount)}`,
        href: "/bookings",
        status: item.status,
      })),
      ...customers.map((item) => ({
        id: item.id,
        title: item.name,
        note: `${item.phone} · ${item.bookings} rentals`,
        href: item.id.startsWith("cus-") ? `/customers/${item.id}` : "/customers",
        status: item.status,
      })),
    ]
      .filter((item) => `${item.title} ${item.note} ${item.id}`.toLowerCase().includes(term))
      .slice(0, 4);
  }, [term]);

  const stats = [
    { label: "Fleet", value: String(data.totalVehicles), note: "total vehicles", icon: CarFront },
    { label: "On rent", value: String(data.activeRentals), note: "active now", icon: Clock3 },
    { label: "Today", value: String(data.schedule.length), note: "pickups & returns", icon: RotateCcw },
    { label: "Collected", value: formatPkr(data.todayRevenue), note: "today", icon: Banknote },
  ];

  return (
    <div className="space-y-5">
      <Toast message={notice} onDismiss={() => setNotice("")} />

      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#006FE6]">Operations desk</p>
          <h1 className="mt-1 text-[28px] font-extrabold tracking-[-.035em] text-[#0D1730] sm:text-[34px]">
            Assalam-o-Alaikum, {firstName}
          </h1>
          <p className="mt-1 text-sm text-[#667085]">Aaj ka rental kaam ek hi jagah se handle karein.</p>
        </div>
        <p className="w-fit rounded-full border border-[#DCE7F5] bg-white px-3 py-1.5 text-xs font-semibold text-[#475467]">
          {new Intl.DateTimeFormat("en-PK", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Karachi" }).format(new Date())}
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Today at a glance">
        {stats.map(({ label, value, note, icon: Icon }) => (
          <article key={label} className="rounded-xl border border-[#E4E7EC] bg-white p-3.5 shadow-[0_1px_3px_rgba(16,24,40,.04)] sm:p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-[#667085]">{label}</p>
                <p className="mt-1 text-2xl font-extrabold tracking-[-.03em] text-[#101828] sm:text-[28px]">{value}</p>
                <p className="mt-1 text-[11px] text-[#667085]">{note}</p>
              </div>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[#EFF6FF] text-[#006FE6]">
                <Icon size={18} />
              </span>
            </div>
          </article>
        ))}
      </section>

      <section className="rounded-xl border border-[#CFE3FB] bg-[linear-gradient(135deg,#F5FAFF_0%,#FFFFFF_72%)] p-4 shadow-[0_2px_8px_rgba(0,111,230,.06)] sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-[#101828]">Kya karna hai?</h2>
            <p className="mt-0.5 text-xs text-[#667085]">Roz ke 3 main kaam—seedha yahin se.</p>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-3 xl:min-w-[690px]">
            <PrimaryAction icon={CalendarPlus} label="New booking" note="Customer + gaari reserve karein" onClick={() => setAction("booking")} primary />
            <PrimaryAction icon={RotateCcw} label="Return vehicle" note="Check-in aur charges" onClick={() => setAction("return")} />
            <PrimaryAction icon={WalletCards} label="Record payment" note="Balance receive karein" onClick={() => setAction("payment")} />
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,.72fr)]">
        <section className="overflow-hidden rounded-xl border border-[#E4E7EC] bg-white shadow-[0_2px_7px_rgba(16,24,40,.045)]">
          <div className="border-b border-[#EAECF0] p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-[17px] font-bold text-[#101828]">Today&apos;s work</h2>
                <p className="mt-0.5 text-xs text-[#667085]">Next pickup ya return par direct action lein.</p>
              </div>
              <div className="flex rounded-[9px] bg-[#F2F4F7] p-1" aria-label="Filter today's work">
                {(["All", "Pickup", "Return"] as const).map((item) => (
                  <button key={item} onClick={() => setFilter(item)} className={`min-h-9 rounded-[7px] px-3 text-xs font-semibold ${filter === item ? "bg-white text-[#006FE6] shadow-sm" : "text-[#667085] hover:text-[#344054]"}`} aria-pressed={filter === item}>
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <label className="mt-4 flex h-11 items-center gap-2 rounded-[10px] border border-[#D0D5DD] bg-white px-3 focus-within:border-[#006FE6] focus-within:ring-2 focus-within:ring-[#006FE6]/10">
              <Search size={18} className="text-[#667085]" />
              <span className="sr-only">Search customer, vehicle, or plate</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-[#98A2B3]" placeholder="Customer, phone, vehicle ya plate search karein…" />
              {query && <button onClick={() => setQuery("")} className="grid h-8 w-8 place-items-center rounded-full text-[#667085] hover:bg-[#F2F4F7]" aria-label="Clear search"><X size={16} /></button>}
            </label>
          </div>

          {queue.length ? (
            <div className="divide-y divide-[#EAECF0]">
              {queue.map((item) => (
                <article key={item.id} className="grid gap-3 p-4 sm:grid-cols-[76px_minmax(0,1fr)_auto] sm:items-center sm:px-5">
                  <div>
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${item.type === "Pickup" ? "bg-[#ECFDF3] text-[#067647]" : "bg-[#EFF8FF] text-[#175CD3]"}`}>{item.type}</span>
                    <p className="mt-1.5 text-xs font-semibold text-[#475467]">{formatTime(item.time)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[#101828]">{item.customer}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#667085]"><span>{item.vehicle}</span><span className="rounded border border-[#D0D5DD] bg-[#F8FAFC] px-1.5 py-0.5 font-semibold text-[#344054]">{item.plate}</span></p>
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-[#667085]"><MapPin size={12} />{item.location}</p>
                  </div>
                  <div className="flex gap-2 sm:justify-end">
                    <Button variant="secondary" size="sm" asChild><Link href={`/bookings/${bookingId(item.id)}`}>Details</Link></Button>
                    {item.type === "Return" ? <Button size="sm" onClick={() => setAction("return")}>Check in</Button> : <Button size="sm" asChild><Link href={`/bookings/${bookingId(item.id)}`}>Check out</Link></Button>}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="px-5 py-12 text-center">
              <CheckCircle2 className="mx-auto text-[#12B76A]" size={28} />
              <p className="mt-3 text-sm font-bold">No matching work</p>
              <p className="mt-1 text-xs text-[#667085]">Search clear karein ya doosra filter select karein.</p>
            </div>
          )}

          {directoryMatches.length > 0 && (
            <div className="border-t border-[#D9E8FA] bg-[#F7FBFF] p-4 sm:px-5">
              <p className="mb-2 text-xs font-bold uppercase tracking-[.1em] text-[#667085]">Other records</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {directoryMatches.map((item) => <Link key={item.id} href={item.href} className="flex items-center gap-3 rounded-[10px] border border-[#DCE7F5] bg-white p-3 hover:border-[#8EC5FF]"><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{item.title}</span><span className="mt-1 block truncate text-[11px] text-[#667085]">{item.note}</span></span><StatusBadge status={item.status} /></Link>)}
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <section className="rounded-xl border border-[#E4E7EC] bg-white p-4 shadow-[0_2px_7px_rgba(16,24,40,.045)]">
            <div className="flex items-center justify-between">
              <div><h2 className="text-[15px] font-bold">All records</h2><p className="mt-0.5 text-[11px] text-[#667085]">Detailed lists jab zarurat ho.</p></div>
              <FileText size={18} className="text-[#006FE6]" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {recordHubs.map(({ label, note, href, icon: Icon }) => <Link key={href} href={href} className="group rounded-[10px] border border-[#E4E7EC] p-3 hover:border-[#9CCBFF] hover:bg-[#F8FBFF]"><Icon size={18} className="text-[#006FE6]"/><span className="mt-2 block text-xs font-bold">{label}</span><span className="mt-0.5 block text-[10px] leading-4 text-[#667085]">{note}</span><ArrowRight size={14} className="mt-2 text-[#98A2B3] group-hover:text-[#006FE6]"/></Link>)}
            </div>
          </section>

          <section className="rounded-xl border border-[#E4E7EC] bg-white p-4 shadow-[0_2px_7px_rgba(16,24,40,.045)]">
            <div className="flex items-center justify-between"><h2 className="text-[15px] font-bold">Recent activity</h2><Clock3 size={17} className="text-[#667085]" /></div>
            {data.activity.length ? <div className="mt-2 divide-y divide-[#EAECF0]">{data.activity.slice(0, 4).map((item) => <div key={item.id} className="py-3"><p className="text-xs font-bold text-[#344054]">{item.title}</p><p className="mt-1 truncate text-[11px] text-[#667085]">{item.detail}</p></div>)}</div> : <p className="mt-4 rounded-lg bg-[#F8FAFC] p-3 text-xs text-[#667085]">No recent activity yet.</p>}
          </section>
        </aside>
      </div>

      <QuickActionDrawer action={action} onClose={() => setAction(null)} onComplete={(message) => { setAction(null); setNotice(message); }} />
    </div>
  );
}

function PrimaryAction({ icon: Icon, label, note, onClick, primary = false }: { icon: typeof CalendarPlus; label: string; note: string; onClick: () => void; primary?: boolean }) {
  return <button onClick={onClick} className={`flex min-h-[72px] items-center gap-3 rounded-[11px] border p-3 text-left transition-colors ${primary ? "border-[#006FE6] bg-[#006FE6] text-white hover:bg-[#005FC4]" : "border-[#D6DEE8] bg-white text-[#101828] hover:border-[#8EC5FF] hover:bg-[#F8FBFF]"}`}><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-[10px] ${primary ? "bg-white/16" : "bg-[#EFF6FF] text-[#006FE6]"}`}><Icon size={20}/></span><span><span className="block text-sm font-bold">{label}</span><span className={`mt-0.5 block text-[11px] ${primary ? "text-white/78" : "text-[#667085]"}`}>{note}</span></span></button>;
}

function QuickActionDrawer({ action, onClose, onComplete }: { action: DeskAction; onClose: () => void; onComplete: (message: string) => void }) {
  const [amount, setAmount] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [from, setFrom] = useState("2026-09-28T10:00");
  const [to, setTo] = useState("2026-10-01T18:00");
  const [bookingId, setBookingId] = useState("");
  const [liveBookings, setLiveBookings] = useState<BookingListItem[]>([]);
  const [liveCustomers, setLiveCustomers] = useState<CustomerDto[]>([]);
  const [liveVehicles, setLiveVehicles] = useState<Vehicle[]>([]);
  const [method, setMethod] = useState<PaymentMethod>("Cash");
  const [reference, setReference] = useState("");
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!action) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      const [bookingResult, customerResult, vehicleResult] = await Promise.all([
        listBookingsAction(),
        listCustomersAction(),
        listVehiclesAction(),
      ]);
      if (cancelled) return;
      const failures: string[] = [];
      if (bookingResult.ok) {
        setLiveBookings(bookingResult.data);
        const options = action === "return"
          ? bookingResult.data.filter((item) => item.status === "Checked Out")
          : action === "payment"
            ? bookingResult.data.filter((item) => !["Draft", "Cancelled", "No Show"].includes(item.status) && bookingBalance(item) > 0)
            : [];
        if (options[0]) {
          setBookingId(options[0].id);
          if (action === "payment") setAmount(String(bookingBalance(options[0])));
        }
      } else failures.push(bookingResult.error.message);
      if (customerResult.ok) setLiveCustomers(customerResult.data);
      else failures.push(customerResult.error.message);
      if (vehicleResult.ok) setLiveVehicles(vehicleResult.data);
      else failures.push(vehicleResult.error.message);
      setError(failures.join(" · "));
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [action]);

  const activeRentals = liveBookings.filter((item) => item.status === "Checked Out");
  const payableBookings = liveBookings.filter((item) => !["Draft", "Cancelled", "No Show"].includes(item.status) && bookingBalance(item) > 0);
  const availableVehicles = liveVehicles.filter((item) => item.status === "Available");
  const selectedPayment = payableBookings.find((item) => item.id === bookingId);
  const selectedCustomer = liveCustomers.find((item) => item.id === customerId);
  const selectedVehicle = availableVehicles.find((item) => item.id === vehicleId);

  if (!action) return null;
  const content = {
    booking: { title: "Quick booking", description: "Sirf zaroori details. Baqi information baad mein add ho sakti hai." },
    return: { title: "Return vehicle", description: "Active rental select karke check-in shuru karein." },
    payment: { title: "Record payment", description: "Tamam outstanding bookings mein se select karke payment post karein." },
  }[action];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    if (action === "booking" && selectedCustomer && selectedVehicle) {
      const result = await confirmBookingAction({
        vehicleId: selectedVehicle.id,
        customerId: selectedCustomer.id,
        destinationCity: selectedVehicle.city,
        pickupAt: from,
        returnAt: to,
        extras: 0,
        discount: 0,
        depositRequired: Number(amount || 0),
        source: "counter",
        estimatedKm: 0,
      });
      setPending(false);
      if (!result.ok) return setError(result.error.message);
      return onComplete(`${result.data.id} booked for ${selectedCustomer.name}.`);
    }
    if (action === "payment" && selectedPayment) {
      const result = await recordBookingPaymentAction(selectedPayment.id, {
        amount: Number(amount),
        method,
        reference: reference.trim(),
        account: "Counter",
      });
      setPending(false);
      if (!result.ok) return setError(result.error.message);
      return onComplete(`${formatPkr(Number(amount))} posted for ${selectedPayment.id}.`);
    }
    setPending(false);
    if (action === "return") onComplete(`Return check-in started for ${bookingId}.`);
  }

  const paymentTooHigh = Boolean(selectedPayment && Number(amount) > bookingBalance(selectedPayment));
  const disabled = loading || pending || (action === "booking"
    ? !selectedCustomer || !selectedVehicle || !from || !to || new Date(to) <= new Date(from) || Number(amount) < 0
    : action === "payment"
      ? !selectedPayment || Number(amount) <= 0 || paymentTooHigh || !reference.trim()
      : !bookingId);

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#101828]/40" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[94vh] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:w-full sm:max-w-[500px] sm:rounded-none sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-xl font-bold tracking-[-.02em]">{content.title}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm leading-5 text-[#667085]">{content.description}</Dialog.Description>
            </div>
            <Dialog.Close className="grid h-10 w-10 shrink-0 place-items-center rounded-lg hover:bg-[#F2F4F7]" aria-label="Close"><X size={20}/></Dialog.Close>
          </div>

          {loading ? (
            <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-[#667085]"><Loader2 className="animate-spin text-[#006FE6]" size={19}/>Loading live records…</div>
          ) : (
            <form onSubmit={(event) => void submit(event)} className="mt-6 space-y-4">
              {action === "booking" && (
                <>
                  <CustomerPicker
                    customers={liveCustomers}
                    selectedId={customerId}
                    onSelect={setCustomerId}
                    onCreated={(created) => {
                      setLiveCustomers((items) => [created, ...items]);
                      setCustomerId(created.id);
                    }}
                  />
                  <FormSelect
                    label="Available vehicle"
                    value={vehicleId}
                    onChange={(event) => setVehicleId(event.target.value)}
                    options={[{ label: availableVehicles.length ? "Select a vehicle" : "No available vehicles", value: "" }, ...availableVehicles.map((item) => ({ label: `${item.make} ${item.model} · ${item.plate} · ${formatPkr(item.dailyRate)}/day`, value: item.id }))]}
                    required
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormInput required label="Pickup" type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)}/>
                    <FormInput required label="Return" type="datetime-local" value={to} onChange={(event) => setTo(event.target.value)}/>
                  </div>
                  <FormInput label="Advance (PKR)" type="number" min="0" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0"/>
                  <Link href="/bookings/new" className="inline-flex items-center gap-1 text-xs font-semibold text-[#006FE6] hover:underline">Add custom pricing or notes <ArrowRight size={14}/></Link>
                </>
              )}

              {action === "return" && (
                activeRentals.length ? <>
                  <FormSelect label="Active rental" value={bookingId} onChange={(event) => setBookingId(event.target.value)} options={activeRentals.map((item) => ({ label: `${item.id} · ${item.customer} · ${item.vehicle} · ${item.plate}`, value: item.id }))}/>
                  <div className="rounded-[10px] border border-[#D9E8FA] bg-[#F5FAFF] p-3 text-xs text-[#344054]"><strong>Next:</strong> odometer, fuel, photos aur extra charges capture honge.</div>
                </> : <EmptyDrawerState title="No active rentals" note="Sirf checked-out bookings return ke liye yahan nazar aati hain." />
              )}

              {action === "payment" && (
                payableBookings.length ? <>
                  <FormSelect label="Outstanding booking" value={bookingId} onChange={(event) => { const id = event.target.value; setBookingId(id); const item = payableBookings.find((booking) => booking.id === id); setAmount(item ? String(bookingBalance(item)) : ""); }} options={payableBookings.map((item) => ({ label: `${item.id} · ${item.customer} · Balance ${formatPkr(bookingBalance(item))}`, value: item.id }))}/>
                  <FormInput required label="Amount received (PKR)" type="number" min="1" max={selectedPayment ? bookingBalance(selectedPayment) : undefined} step="1" value={amount} onChange={(event) => setAmount(event.target.value)}/>
                  <FormSelect label="Payment method" value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)} options={["Cash", "Bank transfer", "Card terminal", "Wallet"]}/>
                  <FormInput required label="Reference / receipt #" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="e.g. Counter-1042 or IBFT-90418"/>
                  {paymentTooHigh && <p role="alert" className="rounded-lg bg-[#FEF3F2] p-3 text-xs text-[#B42318]">Amount outstanding balance se zyada nahi ho sakta.</p>}
                </> : <EmptyDrawerState title="No outstanding balances" note="Sab eligible bookings fully paid hain." />
              )}

              {error && <p role="alert" className="rounded-lg border border-[#FECDCA] bg-[#FEF3F2] p-3 text-xs text-[#B42318]">{error}</p>}
              <div className="flex flex-col-reverse gap-2 border-t border-[#EAECF0] pt-5 sm:flex-row sm:justify-end">
                <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>Cancel</Button>
                <Button type="submit" disabled={disabled}>{pending ? "Saving…" : action === "booking" ? "Save booking" : action === "return" ? "Start check-in" : "Post payment"}</Button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function CustomerPicker({ customers, selectedId, onSelect, onCreated }: { customers: CustomerDto[]; selectedId: string; onSelect: (id: string) => void; onCreated: (customer: CustomerDto) => void }) {
  const selected = customers.find((item) => item.id === selectedId);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [cnic, setCnic] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const term = query.trim().toLowerCase();
  const results = customers.filter((item) => `${item.name} ${item.phone}`.toLowerCase().includes(term)).slice(0, 6);

  async function createCustomer() {
    if (pending) return;
    setPending(true);
    setError("");
    const result = await createCustomerAction({ name, phone, cnic });
    setPending(false);
    if (!result.ok) return setError(result.error.message);
    onCreated(result.data);
    setQuery(`${result.data.name} · ${result.data.phone}`);
    setAdding(false);
  }

  return (
    <section className="rounded-xl border border-[#E4E7EC] bg-[#FAFCFF] p-3.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="quick-customer-search" className="text-sm font-semibold text-[#344054]">Customer / phone <span className="text-[#D92D20]">*</span></label>
        <button type="button" onClick={() => { setAdding((value) => !value); setError(""); }} className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-[#006FE6] hover:underline"><Plus size={14}/>{adding ? "Select existing" : "New customer"}</button>
      </div>

      {adding ? (
        <div className="mt-3 space-y-3 border-t border-[#E4E7EC] pt-3">
          <FormInput label="Full name" required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Areeba Khan"/>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormInput label="Phone number" required type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="0300 1234567"/>
            <FormInput label="CNIC" required inputMode="numeric" value={cnic} onChange={(event) => setCnic(event.target.value)} placeholder="35202-1234567-1"/>
          </div>
          {error && <p role="alert" className="text-xs text-[#B42318]">{error}</p>}
          <Button type="button" size="sm" disabled={pending || name.trim().length < 2 || phone.replace(/\D/g, "").length < 10 || cnic.replace(/\D/g, "").length !== 13} onClick={() => void createCustomer()}>{pending ? "Adding…" : "Add & select customer"}</Button>
        </div>
      ) : (
        <div className="relative mt-2">
          <div className="flex h-11 items-center gap-2 rounded-[9px] border border-[#D0D5DD] bg-white px-3 focus-within:border-[#006FE6] focus-within:ring-2 focus-within:ring-[#006FE6]/10">
            <Search size={17} className="text-[#667085]"/>
            <input id="quick-customer-search" value={query} onChange={(event) => { setQuery(event.target.value); onSelect(""); }} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#98A2B3]" placeholder="Name ya phone number search karein" autoComplete="off"/>
            {query && <button type="button" onClick={() => { setQuery(""); onSelect(""); }} className="grid h-8 w-8 place-items-center rounded-full hover:bg-[#F2F4F7]" aria-label="Clear customer search"><X size={15}/></button>}
          </div>
          {!selected && <div className="mt-2 max-h-52 overflow-y-auto rounded-[9px] border border-[#DCE3EC] bg-white p-1 shadow-lg">{results.length ? results.map((item) => <button type="button" key={item.id} onClick={() => { onSelect(item.id); setQuery(`${item.name} · ${item.phone}`); }} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-[#F2F7FD]"><span><span className="block text-sm font-semibold text-[#101828]">{item.name}</span><span className="mt-0.5 block text-xs text-[#667085]">{item.phone}</span></span><StatusBadge status={item.status}/></button>) : <p className="p-3 text-center text-xs text-[#667085]">No customer found. “New customer” se inline add karein.</p>}</div>}
          {selected && <div className="mt-2 flex items-center justify-between rounded-[9px] border border-[#B2DDFF] bg-[#EFF8FF] p-3"><span><span className="block text-sm font-bold text-[#175CD3]">{selected.name}</span><span className="mt-0.5 block text-xs text-[#475467]">{selected.phone}</span></span><button type="button" onClick={() => { onSelect(""); setQuery(""); }} className="text-xs font-semibold text-[#006FE6] hover:underline">Change</button></div>}
        </div>
      )}
    </section>
  );
}

function EmptyDrawerState({ title, note }: { title: string; note: string }) {
  return <div className="rounded-xl border border-dashed border-[#D0D5DD] bg-[#F8FAFC] px-4 py-8 text-center"><p className="text-sm font-bold text-[#344054]">{title}</p><p className="mt-1 text-xs text-[#667085]">{note}</p></div>;
}

function bookingBalance(booking: BookingListItem) {
  return Math.max(0, booking.dailyRate * booking.days + booking.extras - booking.discount + booking.tax - booking.paid);
}

function bookingId(eventId: string) {
  return eventId.replace(/-(pickup|return)$/, "");
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-PK", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Karachi" }).format(new Date(value));
}
