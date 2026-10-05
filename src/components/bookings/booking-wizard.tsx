"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Check, Loader2, Plus, ShieldAlert, X } from "lucide-react";

import { confirmBookingAction, startBookingAction } from "@/app/actions/bookings";
import { listCustomersAction, createCustomerAction } from "@/app/actions/customers";
import { listVehiclesAction } from "@/app/actions/vehicles";
import { listBookingsAction } from "@/app/actions/bookings";
import { createAgencyCityAction, listAgencyCitiesAction } from "@/app/actions/catalogs";
import { getBookingCnicAction, uploadBookingCnicAction } from "@/app/actions/booking-cnic";
import { CnicDocumentDrawer } from "@/components/customers/cnic-document-drawer";
import { FormInput } from "@/components/forms/form-controls";
import { Button } from "@/components/ui/button";
import { cnicExtractionKey, mergeCnicExtraction, type CnicExtractedValues, type CnicIntake } from "@/lib/cnic-intake";
import { formatPkr } from "@/lib/utils";
import type { Vehicle } from "@/types/vehicle";
import type { BookingListItem } from "@/server/repositories/contracts";
import type { CreateCustomerInput } from "@/server/validation/customer";

// ─── Domain types derived from server ───────────────────────────────────────

type CustomerDto = {
  id: string;
  name: string;
  phone: string;
  cnic: string;
  email: string | null;
  dateOfBirth: string | null;
  address: string | null;
  cnicExpiresAt: string | null;
  licenseNumber: string | null;
  licenseExpiresAt: string | null;
  status: string;
};

type FleetOption = {
  id: string;
  label: string;
  plate: string;
  city: string;
  rate: number;
  baseRate: number;
  perKmRate: number;
  minimumDays: number;
};

type ConflictInfo = { bookingId: string; reason: string };

// ─── Draft ──────────────────────────────────────────────────────────────────

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
  estimatedKm: number;
  overrideReason: string;
};

function defaultDraft(): Draft {
  const now = new Date();
  const pickup = new Date(now);
  pickup.setSeconds(0, 0);
  pickup.setMinutes(Math.ceil(pickup.getMinutes() / 15) * 15);
  const returned = new Date(pickup);
  returned.setHours(23, 59, 0, 0);
  const local = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  return {
  city: "Lahore",
  from: local(pickup),
  to: local(returned),
  vehicleId: "",
  customerId: "",
  dailyRate: 0,
  extras: 0,
  discount: 0,
  deposit: 0,
  notes: "",
  estimatedKm: 0,
  overrideReason: "",
  };
}

const steps = ["Schedule", "Vehicle", "Customer", "Pricing", "Review"];

// ─── Conflict detection (client-side, uses DB bookings) ──────────────────────

function getConflicts(
  vehicleId: string,
  from: string,
  to: string,
  bookings: BookingListItem[],
): ConflictInfo[] {
  const fromTs = new Date(from).getTime();
  const toTs = new Date(to).getTime();
  return bookings
    .filter(
      (b) =>
        b.vehicleId === vehicleId &&
        !["Cancelled", "No Show", "Completed"].includes(b.status) &&
        new Date(b.pickupAt).getTime() < toTs &&
        new Date(b.returnAt).getTime() > fromTs,
    )
    .map((b) => ({ bookingId: b.id, reason: `Booked ${b.pickupAt.slice(0, 10)} – ${b.returnAt.slice(0, 10)}` }));
}

// ─── Main wizard ─────────────────────────────────────────────────────────────

export function BookingWizard() {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(defaultDraft);
  const [confirmed, setConfirmed] = useState("");
  const [conflictMode, setConflictMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [bookingReference, setBookingReference] = useState<{ id: string; publicNumber: number }>();

  // Server data
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [bookings, setBookings] = useState<BookingListItem[]>([]);
  const [customers, setCustomers] = useState<CustomerDto[]>([]);
  const [savedCities, setSavedCities] = useState<string[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState("");

  // Draft persistence
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

  // Load server data once on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setDataLoading(true);
      setDataError("");
      const savedReference = sessionStorage.getItem("viberent-booking-reference");
      const [vResult, bResult, cResult, cityResult, referenceResult] = await Promise.all([
        listVehiclesAction(),
        listBookingsAction(),
        listCustomersAction(),
        listAgencyCitiesAction(),
        startBookingAction(savedReference || undefined),
      ]);
      if (cancelled) return;
      const errors: string[] = [];
      if (vResult.ok) setVehicles(vResult.data);
      else errors.push(`Vehicles: ${vResult.error.message}`);
      if (bResult.ok) setBookings(bResult.data);
      else errors.push(`Bookings: ${bResult.error.message}`);
      if (cResult.ok) setCustomers(cResult.data);
      else errors.push(`Customers: ${cResult.error.message}`);
      if (cityResult.ok) setSavedCities(cityResult.data.map(item=>item.name));
      else errors.push(`Cities: ${cityResult.error.message}`);
      if (referenceResult.ok) {
        setBookingReference(referenceResult.data);
        sessionStorage.setItem("viberent-booking-reference", referenceResult.data.id);
      } else errors.push(`Booking number: ${referenceResult.error.message}`);
      if (errors.length) setDataError(errors.join(" · "));
      setDataLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  // Derived fleet options from live vehicle data
  const fleetOptions: FleetOption[] = vehicles.map((v) => {
    const rule=v.rateRules?.find(item=>item.destinationCity.toLowerCase()===draft.city.toLowerCase());
    return {id:v.id,label:`${v.make} ${v.model} ${v.year}`,plate:v.plate,city:v.city,baseRate:v.dailyRate,rate:rule?.dailyRate??v.dailyRate,perKmRate:rule?.perKmRate??0,minimumDays:rule?.minimumDays??1};
  });

  // Unique cities from loaded vehicles (+ Lahore as default fallback)
  const cities = Array.from(new Set([...savedCities,...vehicles.flatMap(vehicle=>vehicle.rateRules?.map(rule=>rule.destinationCity)??[])])).sort();

  const vehicle = fleetOptions.find((item) => item.id === draft.vehicleId);
  const days = Math.max(1, Math.ceil((new Date(draft.to).getTime() - new Date(draft.from).getTime()) / 86_400_000));
  const total = draft.dailyRate * days + (vehicle?.perKmRate??0) * draft.estimatedKm + draft.extras - draft.discount;

  const eligibleVehicles = fleetOptions
    .map((item) => ({
      ...item,
      conflicts: getConflicts(item.id, draft.from, draft.to, bookings),
    }));

  const canContinue = [
    Boolean(draft.from && draft.to && new Date(draft.to) > new Date(draft.from)),
    Boolean(vehicle && getConflicts(vehicle.id, draft.from, draft.to, bookings).length === 0),
    Boolean(draft.customerId),
    draft.dailyRate > 0 && days >= (vehicle?.minimumDays??1) && draft.discount <= draft.dailyRate * days + draft.extras && (draft.dailyRate === (vehicle?.rate??draft.dailyRate) || Boolean(draft.overrideReason.trim())),
    true,
  ][step];

  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (!vehicle || !draft.customerId || !bookingReference || submitting) return;
    setSubmitting(true);
    setSubmitError("");
    const result = await confirmBookingAction({
      bookingDraftId: bookingReference.id,
      vehicleId: vehicle.id,
      customerId: draft.customerId,
      destinationCity: draft.city,
      pickupAt: draft.from,
      returnAt: draft.to,
      extras: draft.extras,
      discount: draft.discount,
      depositRequired: draft.deposit,
      source: "counter",
      notes: draft.notes,
      estimatedKm: draft.estimatedKm,
      dailyRateOverride: vehicle && draft.dailyRate !== vehicle.rate ? draft.dailyRate : undefined,
      overrideReason: draft.overrideReason || undefined,
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
    sessionStorage.removeItem("viberent-booking-reference");
    setConfirmed(result.data.id);
  }

  if (confirmed) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-[#ABEFC6] bg-white p-8 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#ECFDF3] text-[#067647]"><Check size={28} /></span>
        <h1 className="mt-4 text-2xl font-bold">Booking confirmed</h1>
        <p className="mt-2 text-sm text-[#667085]">Booking <strong className="text-[#101828]">#{bookingReference?.publicNumber}</strong> now persistently blocks {vehicle?.plate} for the selected interval.</p>
        <div className="mt-6 flex justify-center gap-2"><Button asChild><Link href="/bookings">View bookings</Link></Button></div>
      </div>
    );
  }

  if (dataLoading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center gap-3 text-sm text-[#667085]">
        <Loader2 size={20} className="animate-spin text-[#006FE6]" />
        Loading booking data…
      </div>
    );
  }

  if (dataError && !vehicles.length) {
    return (
      <div className="rounded-xl border border-[#FDA29B] bg-[#FEF3F2] p-6 text-center text-sm text-[#B42318]">
        <p className="font-semibold">Failed to load data</p>
        <p className="mt-1 text-xs">{dataError}</p>
        <Button className="mt-4" variant="secondary" onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }

  return (
    <form onSubmit={confirm} className="space-y-6">
      <Link href="/bookings" className="inline-flex items-center gap-2 text-sm font-semibold text-[#475467]"><ArrowLeft size={17} />Bookings</Link>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-[#006FE6]">New booking</p><h1 className="mt-1 text-2xl font-bold">Create a reservation</h1><p className="mt-1 text-sm text-[#667085]">Your progress is preserved in this browser session.</p></div>{bookingReference&&<div className="flex flex-col gap-2 sm:flex-row sm:items-stretch"><div className="w-fit rounded-xl border border-[#B2DDFF] bg-[#EFF8FF] px-4 py-2 text-sm text-[#175CD3]">Booking ID <strong className="ml-1 text-xl text-[#004EAA]">#{bookingReference.publicNumber}</strong></div><BookingCnicDrawer bookingReference={bookingReference}/></div>}</div>
      {dataError && <p className="rounded-lg border border-[#FEDF89] bg-[#FFFAEB] px-3 py-2 text-xs text-[#93370D]">{dataError}</p>}
      <ol className="grid grid-cols-5 gap-1" aria-label="Booking steps">
        {steps.map((label, index) => <li key={label} className={`rounded-lg px-2 py-2 text-center text-[11px] font-semibold sm:text-xs ${index === step ? "bg-[#006FE6] text-white" : index < step ? "bg-[#EAF4FF] text-[#0058B8]" : "bg-[#F2F4F7] text-[#667085]"}`}>{index + 1}. {label}</li>)}
      </ol>
      <section className="rounded-xl border border-[#E4E7EC] bg-white p-5">
        {step === 0 && <ScheduleStep draft={draft} setDraft={setDraft} cities={cities} onCityCreated={city=>setSavedCities(current=>[...new Set([...current,city])].sort())} />}
        {step === 1 && <VehicleStep draft={draft} setDraft={setDraft} vehicles={eligibleVehicles} conflictMode={conflictMode} clearConflict={() => setConflictMode(false)} />}
        {step === 2 && <CustomerStep draft={draft} setDraft={setDraft} customers={customers} bookingReference={bookingReference} onCustomerCreated={(c) => setCustomers((prev) => [...prev, c])} />}
        {step === 3 && <PricingStep draft={draft} setDraft={setDraft} days={days} total={total} />}
        {step === 4 && <Review draft={draft} days={days} total={total} vehicle={vehicle} customers={customers} />}
      </section>
      {submitError && <p role="alert" className="rounded-lg border border-[#FDA29B] bg-[#FEF3F2] p-3 text-sm text-[#B42318]">{submitError}</p>}
      <div className="flex justify-between">
        <Button type="button" variant="secondary" disabled={step === 0 || submitting} onClick={() => setStep(step - 1)}>Back</Button>
        {step < 4 ? <Button type="button" disabled={!canContinue||!bookingReference} onClick={() => setStep(step + 1)}>Continue</Button> : <Button type="submit" disabled={submitting||!bookingReference}>{submitting ? "Confirming…" : `Confirm booking #${bookingReference?.publicNumber ?? ""}`}</Button>}
      </div>
    </form>
  );
}

function BookingCnicDrawer({ bookingReference }: { bookingReference: { id: string; publicNumber: number } }) {
  const [intake, setIntake] = useState<CnicIntake>();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState<"front"|"back"|null>(null);
  const [error, setError] = useState("");

  async function refresh(silent = false) {
    if (!silent) setLoading(true);
    const result = await getBookingCnicAction(bookingReference.id);
    if (!silent) setLoading(false);
    if (!result.ok) { if (!silent) setError(result.error.message); return; }
    setIntake(result.data as CnicIntake);
  }

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(true), 5000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
    // The booking reference is stable for this wizard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingReference.id]);

  async function upload(side: "front"|"back", file: File|undefined) {
    if (!file || uploading) return;
    setUploading(side); setError("");
    const data = new FormData();
    data.set("bookingDraftId", bookingReference.id); data.set("side", side); data.set("image", file);
    const result = await uploadBookingCnicAction(data);
    setUploading(null);
    if (!result.ok) { setError(result.error.message); return; }
    setIntake(result.data as CnicIntake);
  }

  return <CnicDocumentDrawer label="Booking CNIC" commandHint={{bookingNumber:bookingReference.publicNumber}} intake={intake} loading={loading} uploading={uploading} error={error} onRefresh={() => void refresh()} onUpload={(side,file) => void upload(side,file)}/>;
}

// ─── Schedule step ───────────────────────────────────────────────────────────

function ScheduleStep({ draft, setDraft, cities, onCityCreated }: { draft: Draft; setDraft: (value: Draft) => void; cities: string[]; onCityCreated: (city:string)=>void }) {
  const [cityInput,setCityInput]=useState(draft.city);
  const [pending,setPending]=useState(false);
  const [error,setError]=useState("");
  const exact=cities.find(city=>city.toLowerCase()===cityInput.trim().toLowerCase());
  function chooseCity(value:string){setCityInput(value);setDraft({...draft,city:value,vehicleId:"",dailyRate:0,overrideReason:""})}
  async function addCity(){if(!cityInput.trim()||pending)return;setPending(true);setError("");const result=await createAgencyCityAction(cityInput);setPending(false);if(!result.ok){setError(result.error.message);return}onCityCreated(result.data.name);chooseCity(result.data.name)}
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-[#344054]">Going to city</span>
          <input
            list="booking-city-options"
            value={cityInput}
            onChange={(e) => chooseCity(e.target.value)}
            placeholder="Search or enter a city"
            className="h-11 w-full rounded-[9px] border border-[#D0D5DD] bg-white px-3 text-sm text-[#19191F] outline-none focus:border-[#006FE6] focus:ring-2 focus:ring-[#006FE6]/10"
          />
          <datalist id="booking-city-options">{cities.map(city=><option key={city} value={city}/>)}</datalist>
        </label>
        {!exact&&cityInput.trim().length>=2&&<button type="button" disabled={pending} onClick={()=>void addCity()} className="mt-2 text-xs font-semibold text-[#006FE6] hover:underline">{pending?"Adding…":`Add “${cityInput.trim()}” to city list`}</button>}
        {error&&<p className="mt-1 text-xs text-[#B42318]">{error}</p>}
      </div>
      <div />
      <FormInput label="Pickup" type="datetime-local" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
      <FormInput label="Return" type="datetime-local" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
    </div>
  );
}

// ─── Vehicle step ────────────────────────────────────────────────────────────

type EligibleVehicle = FleetOption & { conflicts: ConflictInfo[] };

function VehicleStep({ draft, setDraft, vehicles, conflictMode, clearConflict }: {
  draft: Draft;
  setDraft: (value: Draft) => void;
  vehicles: EligibleVehicle[];
  conflictMode: boolean;
  clearConflict: () => void;
}) {
  return (
    <div>
      <h2 className="font-bold">Available vehicles</h2>
      <p className="mt-1 text-xs text-[#667085]">Vehicles at the agency’s operating branches are shown. The rate reflects the selected destination and availability is checked again on confirmation.</p>
      {conflictMode && (
        <div role="alert" className="mt-4 rounded-lg border border-[#FDA29B] bg-[#FEF3F2] p-3 text-sm text-[#B42318]">
          <strong className="flex gap-2"><ShieldAlert size={17} />Availability changed</strong>
          <p className="mt-1 text-xs">We kept every other field. Choose an alternative vehicle to continue.</p>
        </div>
      )}
      {vehicles.length === 0 && (
        <p className="mt-4 text-sm text-[#667085]">No vehicles found for {draft.city}.</p>
      )}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {vehicles.map((item) => (
          <button
            type="button"
            key={item.id}
            disabled={item.conflicts.length > 0}
            onClick={() => { setDraft({ ...draft, vehicleId: item.id, dailyRate: item.rate }); clearConflict(); }}
            className={`rounded-xl border p-4 text-left disabled:cursor-not-allowed disabled:opacity-55 ${draft.vehicleId === item.id ? "border-[#006FE6] bg-[#EFF8FF]" : "border-[#E4E7EC]"}`}
          >
            <strong className="text-sm">{item.label}</strong>
            <p className="mt-1 text-xs text-[#667085]">{item.plate} · currently in {item.city}</p><p className="mt-1 text-xs font-semibold text-[#344054]">{formatPkr(item.rate)}/day{item.perKmRate>0?` + ${formatPkr(item.perKmRate)}/km`:""}</p>
            <p className={`mt-3 text-xs font-semibold ${item.conflicts.length ? "text-[#B42318]" : "text-[#067647]"}`}>
              {item.conflicts.length ? item.conflicts[0].reason : "Available"}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Customer step ───────────────────────────────────────────────────────────

type NewCustomerFormErrors = Partial<Record<keyof CreateCustomerInput, string>>;

function CustomerStep({ draft, setDraft, customers, bookingReference, onCustomerCreated }: {
  draft: Draft;
  setDraft: (value: Draft) => void;
  customers: CustomerDto[];
  bookingReference?: {id:string;publicNumber:number};
  onCustomerCreated: (c: CustomerDto) => void;
}) {
  const [customerSearch, setCustomerSearch] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [newForm, setNewForm] = useState<CreateCustomerInput>({ name: "", phone: "", cnic: "", email: "", dateOfBirth:"", address:"", cnicExpiresAt:"", licenseNumber: "", licenseExpiresAt: "" });
  const [formErrors, setFormErrors] = useState<NewCustomerFormErrors>({});
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formSubmitError, setFormSubmitError] = useState("");
  const [cnicIntake,setCnicIntake]=useState<CnicIntake>();
  const [cnicLoading,setCnicLoading]=useState(false);
  const [cnicUploading,setCnicUploading]=useState<"front"|"back"|null>(null);
  const [cnicError,setCnicError]=useState("");
  const lastExtraction=useRef<CnicExtractedValues | undefined>(undefined);
  const lastExtractionKey=useRef("");

  const selected = customers.find((c) => c.id === draft.customerId);
  const matches=customerSearch.trim()?customers.filter(customer=>`${customer.name} ${customer.phone}`.toLowerCase().includes(customerSearch.trim().toLowerCase())).slice(0,8):customers.slice(0,8);

  function applyExtracted(intake:CnicIntake){
    const key=cnicExtractionKey(intake.extracted);
    if(key===lastExtractionKey.current)return;
    setNewForm(current=>mergeCnicExtraction(current,intake.extracted,lastExtraction.current));
    lastExtraction.current=intake.extracted;
    lastExtractionKey.current=key;
  }

  async function refreshCnic(silent=false){
    if(!bookingReference||cnicLoading)return;
    if(!silent)setCnicLoading(true);
    const result=await getBookingCnicAction(bookingReference.id);
    if(!silent)setCnicLoading(false);
    if(!result.ok){if(!silent)setCnicError(result.error.message);return;}
    const intake=result.data as CnicIntake;
    setCnicIntake(intake);
    if(intake.front||intake.back){if(!draft.customerId)setShowNewForm(true);applyExtracted(intake);}
  }

  useEffect(()=>{
    if(!bookingReference)return;
    const initial=window.setTimeout(()=>void refreshCnic(),0);
    const timer=window.setInterval(()=>void refreshCnic(true),7000);
    return()=>{window.clearTimeout(initial);window.clearInterval(timer);};
    // The draft reference is stable for this booking wizard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[bookingReference?.id]);

  async function uploadCnic(side:"front"|"back",file:File|undefined){
    if(!file||!bookingReference||cnicUploading)return;
    setCnicUploading(side);setCnicError("");
    const formData=new FormData();formData.set("bookingDraftId",bookingReference.id);formData.set("side",side);formData.set("image",file);
    const result=await uploadBookingCnicAction(formData);
    setCnicUploading(null);
    if(!result.ok){setCnicError(result.error.message);return;}
    const intake=result.data as CnicIntake;setCnicIntake(intake);if(!draft.customerId)setShowNewForm(true);applyExtracted(intake);
  }

  async function handleCreateCustomer(e: FormEvent) {
    e.preventDefault();
    setFormSubmitting(true);
    setFormErrors({});
    setFormSubmitError("");
    const result = await createCustomerAction({
      name: newForm.name,
      phone: newForm.phone,
      cnic: newForm.cnic,
      email: newForm.email || undefined,
      dateOfBirth:newForm.dateOfBirth||undefined,
      address:newForm.address||undefined,
      cnicExpiresAt:newForm.cnicExpiresAt||undefined,
      licenseNumber: newForm.licenseNumber || undefined,
      licenseExpiresAt: newForm.licenseExpiresAt || undefined,
    });
    setFormSubmitting(false);
    if (!result.ok) {
      const fe = result.error.fieldErrors;
      setFormErrors({
        name: fe.name,
        phone: fe.phone,
        cnic: fe.cnic,
        email: fe.email,
        licenseNumber: fe.licenseNumber,
        licenseExpiresAt: fe.licenseExpiresAt,
      });
      setFormSubmitError(result.error.message);
      return;
    }
    onCustomerCreated(result.data);
    setDraft({ ...draft, customerId: result.data.id });
    setShowNewForm(false);
    setNewForm({ name: "", phone: "", cnic: "", email: "", dateOfBirth:"", address:"", cnicExpiresAt:"", licenseNumber: "", licenseExpiresAt: "" });
  }

  return (
    <div>
      <h2 className="font-bold">Customer</h2>
      <p className="mt-1 text-xs text-[#667085]">Use one search for name or phone, or add a new customer without leaving the booking.</p>

      <div className="mt-4 space-y-4">
        <FormInput
          label="Existing customer"
          placeholder="Search name or phone number"
          value={customerSearch}
          onChange={(e) => setCustomerSearch(e.target.value)}
        />
        <div className="max-h-52 overflow-y-auto rounded-xl border border-[#E4E7EC] bg-white p-1" role="listbox" aria-label="Customer matches">{matches.map(customer=><button key={customer.id} type="button" role="option" aria-selected={draft.customerId===customer.id} onClick={()=>{setDraft({...draft,customerId:customer.id});setCustomerSearch(`${customer.name} · ${customer.phone}`)}} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${draft.customerId===customer.id?"bg-[#EFF8FF] text-[#0058B8]":"hover:bg-[#F8FAFC]"}`}><span><strong>{customer.name}</strong><span className="ml-2 text-xs text-[#667085]">{customer.phone}</span></span><span className="text-xs capitalize">{customer.status}</span></button>)}{!matches.length&&<p className="p-3 text-sm text-[#667085]">No existing customer matches that name or phone.</p>}</div>

        {/* Selected customer info */}
        {selected && (
          <div className={`rounded-lg border p-3 text-sm ${selected.status === "review" ? "border-[#FEDF89] bg-[#FFFAEB] text-[#93370D]" : "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]"}`}>
            <strong>{selected.name} · {selected.status}</strong>
            <p className="mt-1 text-xs">CNIC on file{selected.status === "review" ? " · Manager review required" : ""}</p>
          </div>
        )}

        {bookingReference&&<CnicDocumentDrawer
          label="CNIC documents"
          commandHint={{bookingNumber:bookingReference.publicNumber}}
          intake={cnicIntake}
          loading={cnicLoading}
          uploading={cnicUploading}
          error={cnicError}
          onRefresh={()=>void refreshCnic()}
          onUpload={(side,file)=>void uploadCnic(side,file)}
        />}

        {/* New customer toggle */}
        {!showNewForm ? (
          <button
            type="button"
            onClick={() => setShowNewForm(true)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#006FE6] hover:underline"
          >
            <Plus size={15} />New customer
          </button>
        ) : (
          <div className="rounded-xl border border-[#E4E7EC] bg-[#F8FAFC] p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold">New customer</p>
              <button type="button" onClick={() => { setShowNewForm(false); setFormErrors({}); setFormSubmitError(""); }} className="text-[#667085] hover:text-[#19191F]"><X size={16} /></button>
            </div>
            {formSubmitError && <p className="mb-3 rounded-lg border border-[#FDA29B] bg-[#FEF3F2] p-2 text-xs text-[#B42318]">{formSubmitError}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <FormInput autoFocus label="Full name" required value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} error={formErrors.name} />
              <FormInput label="Phone" required type="tel" placeholder="03001234567" value={newForm.phone} onChange={(e) => setNewForm({ ...newForm, phone: e.target.value })} error={formErrors.phone} />
              <FormInput label="CNIC" required placeholder="3520212345679" value={newForm.cnic} onChange={(e) => setNewForm({ ...newForm, cnic: e.target.value })} error={formErrors.cnic} />
              <FormInput label="Email" type="email" placeholder="optional" value={newForm.email ?? ""} onChange={(e) => setNewForm({ ...newForm, email: e.target.value })} error={formErrors.email} />
              <FormInput label="Date of birth" type="date" value={newForm.dateOfBirth ?? ""} onChange={(e) => setNewForm({ ...newForm, dateOfBirth: e.target.value })} error={formErrors.dateOfBirth} />
              <FormInput label="CNIC expiry" type="date" value={newForm.cnicExpiresAt ?? ""} onChange={(e) => setNewForm({ ...newForm, cnicExpiresAt: e.target.value })} error={formErrors.cnicExpiresAt} />
              <FormInput label="License number" placeholder="optional" value={newForm.licenseNumber ?? ""} onChange={(e) => setNewForm({ ...newForm, licenseNumber: e.target.value })} error={formErrors.licenseNumber} />
              <FormInput label="License expiry" type="date" placeholder="YYYY-MM-DD" value={newForm.licenseExpiresAt ?? ""} onChange={(e) => setNewForm({ ...newForm, licenseExpiresAt: e.target.value })} error={formErrors.licenseExpiresAt} />
              <label className="text-sm font-semibold text-[#344054] sm:col-span-2">Address
                <textarea className="mt-1.5 min-h-20 w-full rounded-[9px] border border-[#D0D5DD] bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[#006FE6] focus:ring-2 focus:ring-[#006FE6]/10" value={newForm.address??""} onChange={e=>setNewForm({...newForm,address:e.target.value})} placeholder="Address printed on CNIC"/>
                {formErrors.address&&<span className="mt-1 block text-xs font-normal text-[#B42318]">{formErrors.address}</span>}
              </label>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => { setShowNewForm(false); setFormErrors({}); setFormSubmitError(""); }}>Cancel</Button>
              <Button type="button" size="sm" disabled={formSubmitting} onClick={handleCreateCustomer}>{formSubmitting ? "Saving…" : "Save customer"}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Pricing step ────────────────────────────────────────────────────────────

function PricingStep({ draft, setDraft, days, total }: { draft: Draft; setDraft: (value: Draft) => void; days: number; total: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormInput label="Daily rate" type="number" min={1000} value={draft.dailyRate} onChange={(e)=>setDraft({...draft,dailyRate:Number(e.target.value)})} />
      <FormInput label="Estimated trip distance (km)" type="number" min={0} value={draft.estimatedKm} onChange={(e)=>setDraft({...draft,estimatedKm:Number(e.target.value)})}/>
      <FormInput label="Deposit (optional)" type="number" min={0} value={draft.deposit||""} placeholder="No deposit required" onChange={(e) => setDraft({ ...draft, deposit: Number(e.target.value) })} />
      <FormInput label="Extras" type="number" value={draft.extras} onChange={(e) => setDraft({ ...draft, extras: Number(e.target.value) })} />
      <FormInput label="Discount" type="number" value={draft.discount} onChange={(e) => setDraft({ ...draft, discount: Number(e.target.value) })} />
      <FormInput label="Notes" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
      <FormInput label="Rate change reason (required for an override)" value={draft.overrideReason} onChange={(e)=>setDraft({...draft,overrideReason:e.target.value})} placeholder="e.g. approved corporate rate"/>
      <div className="rounded-lg bg-[#F8FAFC] p-4">
        <p className="text-xs text-[#667085]">{days} rental days · rate verified by server</p>
        <p className="mt-1 text-xl font-bold">{formatPkr(total)}</p>
      </div>
    </div>
  );
}

// ─── Review step ─────────────────────────────────────────────────────────────

function Review({ draft, days, total, vehicle, customers }: {
  draft: Draft;
  days: number;
  total: number;
  vehicle: FleetOption | undefined;
  customers: CustomerDto[];
}) {
  const customer = customers.find((c) => c.id === draft.customerId);
  const details: [string, string | undefined][] = [
    ["Schedule", `${new Date(draft.from).toLocaleString("en-PK")} – ${new Date(draft.to).toLocaleString("en-PK")}`],
    ["Going to", draft.city],
    ["Vehicle", vehicle ? `${vehicle.label} · ${vehicle.plate}` : "—"],
    ["Customer", customer ? `${customer.name} · ${customer.phone}` : "—"],
    ["Price", `${formatPkr(total)} · ${days} days`],
    ["Deposit", draft.deposit?formatPkr(draft.deposit):"Not required"],
    ["Final availability", "Checked transactionally on confirmation"],
  ];
  return (
    <div>
      <h2 className="font-bold">Review and confirm</h2>
      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
        {details.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-[#F8FAFC] p-3">
            <dt className="text-xs text-[#667085]">{label}</dt>
            <dd className="mt-1 font-semibold">{value ?? "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
