"use client";

import { formatInZone, toWallInput, zonedNow, zonedWallTimeToIso } from "@/lib/timezone";
import Link from "next/link";
import { useEffect, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { ArrowLeft, CarFront, Check, Loader2, MessageCircle, Pencil, Plus, Search, ShieldAlert, ShieldCheck, Trash2, X } from "lucide-react";

import { clearBookingAction, confirmBookingAction, startBookingAction } from "@/app/actions/bookings";
import { listCustomersAction, createCustomerAction, updateCustomerAction } from "@/app/actions/customers";
import { listVehiclesAction } from "@/app/actions/vehicles";
import { listBookingsAction } from "@/app/actions/bookings";
import { createAgencyCityAction, listAgencyCitiesAction } from "@/app/actions/catalogs";
import { getBookingCnicAction, getBookingLicenseAction, getGuarantorCnicAction, uploadBookingCnicAction, uploadBookingLicenseAction, uploadGuarantorCnicAction } from "@/app/actions/booking-cnic";
import { listDriversAction } from "@/app/actions/drivers";
import { defaultGuarantorForCustomerAction, guarantorFromCustomerAction, listGuarantorsAction, saveGuarantorAction } from "@/app/actions/guarantors";
import { PersonDocuments } from "@/components/shared/person-documents";
import type { GuarantorDto } from "@/server/services/guarantor-service";
import { ExternalVehiclePicker } from "@/components/bookings/external-vehicle-picker";
import { CnicDocumentDrawer } from "@/components/customers/cnic-document-drawer";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormCombobox } from "@/components/forms/form-combobox";
import { FormInput, FormSelect } from "@/components/forms/form-controls";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { SegmentedControl } from "@/components/forms/segmented-control";
import { useHotkey } from "@/lib/hotkeys";
import type React from "react";
import { cnicExtractionKey, mergeCnicExtraction, ocrDate, type CnicExtractedValues, type CnicIntake, type CnicIntakeFile } from "@/lib/cnic-intake";
import { formatPkr } from "@/lib/utils";
import type { Vehicle } from "@/types/vehicle";
import type { BookingListItem } from "@/server/repositories/contracts";
import type { GuarantorInput } from "@/server/validation/booking";
import type { CreateCustomerInput } from "@/server/validation/customer";

// ─── Domain types derived from server ───────────────────────────────────────

type CustomerDto = {
  id: string;
  name: string;
  fatherName: string | null;
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
  withDriverRate:number;
  /** Saved price for the chosen "going to" city, when the vehicle has one. */
  cityRate?:number;
  lastOdometer?:number;
};
type DriverOption={id:string;name:string;phone:string};

type ConflictInfo = { bookingId: string; reason: string };
type GuarantorDraft = GuarantorInput;
type TripChargeKind = "toll" | "fuel" | "driver" | "parking" | "other";
type TripChargeDraft = { kind: TripChargeKind; description: string; amount: number };
const tripChargeOptions: Array<{ label: string; value: TripChargeKind }> = [
  { label: "Toll tax", value: "toll" }, { label: "Fuel", value: "fuel" }, { label: "Driver expense", value: "driver" }, { label: "Parking", value: "parking" }, { label: "Other", value: "other" },
];
type LicenseExtracted = { name: string | null; father_name: string | null; cnic_no: string | null; license_no: string | null; dob: string | null; issue_date: string | null; expiry: string | null; address: string | null; categories: string | null };
type LicenseIntake = { bookingDraftId: string; front: CnicIntakeFile | null; back: CnicIntakeFile | null; extracted: LicenseExtracted };

function isGuarantorComplete(value: GuarantorDraft) {
  const cnic=value.cnic.replace(/\D/g,"");
  return Boolean(value.name.trim() && (!value.parentage.trim() || value.parentage.trim().length >= 2) && (!cnic || /^\d{13}$/.test(cnic)) && (!value.phone.trim() || /^(?:92|0)?3\d{9}$/.test(value.phone.replace(/\D/g,""))) && (!value.address.trim() || value.address.trim().length >= 5) && Number.isInteger(value.carAmount) && value.carAmount >= 0);
}

// ─── Draft ──────────────────────────────────────────────────────────────────

type Draft = {
  bookingMode:"reservation"|"rent_now";
  checkout:{odometer:number;fuelLevel:string;conditionNotes:string};
  fulfillmentType:"fleet"|"external";
  external:{supplierName:string;supplierPhone:string;vehicleMake:string;vehicleModel:string;vehicleYear:number;vehiclePlate:string;vehicleColor:string;pricingMode:"percentage"|"fixed";supplierSharePercent:number;supplierFixedCost:number};
  rentalMode:"self_drive"|"with_driver";
  driverId:string;
  renterSkipped:boolean;
  city: string;
  from: string;
  to: string;
  vehicleId: string;
  customerId: string;
  guarantor: GuarantorDraft | null;
  dailyRate: number;
  extras: number;
  discount: number;
  deposit: number;
  notes: string;
  estimatedKm: number;
  overrideReason: string;
  /** Set once staff type a rate, so it is not replaced by the vehicle's default (0 = agree later). */
  rateTouched?: boolean;
  /** Toll tax, fuel, driver expense, parking: billed to the customer on top of the rent. */
  tripCharges: TripChargeDraft[];
  /** Set when the booking starts from a quotation; the quotation is linked on confirm. */
  quotationId?: string;
};

function defaultDraft(): Draft {
  const now = zonedNow();
  const pickup = new Date(now);
  pickup.setSeconds(0, 0);
  pickup.setMinutes(Math.ceil(pickup.getMinutes() / 15) * 15);
  const returned = new Date(pickup);
  returned.setHours(23, 59, 0, 0);
  const local = toWallInput;
  return {
  bookingMode:"reservation",
  checkout:{odometer:0,fuelLevel:"Full",conditionNotes:"Vehicle handed over without visible damage"},
  fulfillmentType:"fleet",
  external:{supplierName:"",supplierPhone:"",vehicleMake:"",vehicleModel:"",vehicleYear:new Date().getFullYear(),vehiclePlate:"",vehicleColor:"",pricingMode:"percentage",supplierSharePercent:83,supplierFixedCost:0},
  rentalMode:"self_drive",
  driverId:"",
  renterSkipped:false,
  city: "Lahore",
  from: local(pickup),
  to: local(returned),
  vehicleId: "",
  customerId: "",
  guarantor:null,
  dailyRate: 0,
  extras: 0,
  discount: 0,
  deposit: 0,
  notes: "",
  estimatedKm: 0,
  overrideReason: "",
  tripCharges: [],
  };
}

// ─── Conflict detection (client-side, uses DB bookings) ──────────────────────

function getConflicts(
  vehicleId: string,
  from: string,
  to: string,
  bookings: BookingListItem[],
): ConflictInfo[] {
  const fromTs = Date.parse(zonedWallTimeToIso(from));
  const toTs = Date.parse(zonedWallTimeToIso(to));
  return bookings
    .filter(
      (b) =>
        b.vehicleId === vehicleId &&
        !["Cancelled", "No Show", "Completed"].includes(b.status) &&
        new Date(b.pickupAt).getTime() < toTs &&
        // An overdue rental keeps the car until it is checked in.
        Math.max(new Date(b.returnAt).getTime(), b.status === "Checked Out" ? Date.now() : 0) > fromTs,
    )
    .map((b) => ({ bookingId: b.id, reason: b.status === "Checked Out" && new Date(b.returnAt).getTime() < Date.now() ? `Out now, overdue since ${b.returnAt.slice(0, 10)}` : `Booked ${b.pickupAt.slice(0, 10)} – ${b.returnAt.slice(0, 10)}` }));
}

// ─── Main wizard ─────────────────────────────────────────────────────────────

export function BookingWizard() {
  const [draft, setDraft] = useState<Draft>(defaultDraft);
  const [confirmed, setConfirmed] = useState("");
  const [agreementDelivery,setAgreementDelivery]=useState<{status:"sent"|"queued"|"skipped"|"failed";message:string}>();
  const [startedImmediately,setStartedImmediately]=useState(false);
  const [conflictMode, setConflictMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [bookingReference, setBookingReference] = useState<{ id: string; publicNumber: number }>();
  const [clearing,setClearing]=useState(false);
  const [confirmationOpen,setConfirmationOpen]=useState(false);

  // Server data
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [bookings, setBookings] = useState<BookingListItem[]>([]);
  const [customers, setCustomers] = useState<CustomerDto[]>([]);
  const [savedCities, setSavedCities] = useState<string[]>([]);
  const [drivers,setDrivers]=useState<DriverOption[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState("");

  // Draft persistence. The restore runs once: in development React runs effects twice, and by the
  // second run the save effect below has already replaced the stored draft with the blank one.
  const draftRestored = useRef(false);
  useEffect(() => {
    if (draftRestored.current) return;
    draftRestored.current = true;
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
      const [vResult, bResult, cResult, cityResult, driverResult, referenceResult] = await Promise.all([
        listVehiclesAction(),
        listBookingsAction(),
        listCustomersAction(),
        listAgencyCitiesAction(),
        listDriversAction(),
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
      if(driverResult.ok)setDrivers(driverResult.data.filter(item=>item.status==="active"));
      else errors.push(`Drivers: ${driverResult.error.message}`);
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
  const fleetOptions: FleetOption[] = vehicles.filter((v) => v.status === "Available" || v.status === "Booked").map((v) => {
    const rule=v.rateRules?.find(item=>item.destinationCity.toLowerCase()===draft.city.toLowerCase());
    // Default rent = the price saved for the destination city. Self drive falls back to the standard
    // rate; with-driver trips stay empty unless a city price is saved. Staff can always change it.
    return {id:v.id,label:`${v.make} ${v.model} ${v.year}`,plate:v.plate,city:v.city,baseRate:v.dailyRate,rate:draft.rentalMode==="with_driver"?(rule?.dailyRate??0):(rule?.dailyRate??v.dailyRate),cityRate:rule?.dailyRate,withDriverRate:v.withDriverRate??v.dailyRate,perKmRate:draft.rentalMode==="with_driver"?0:(rule?.perKmRate??0),minimumDays:rule?.minimumDays??1,lastOdometer:v.lastOdometer};
  });

  // Unique cities from loaded vehicles (+ Lahore as default fallback)
  const cities = Array.from(new Set([...savedCities,...vehicles.flatMap(vehicle=>vehicle.rateRules?.map(rule=>rule.destinationCity)??[])])).sort();

  const vehicle = fleetOptions.find((item) => item.id === draft.vehicleId);
  const days = Math.max(1, Math.ceil((new Date(draft.to).getTime() - new Date(draft.from).getTime()) / 86_400_000));
  const tripCharges = draft.tripCharges ?? [];
  const tripTotal = tripCharges.reduce((sum, item) => sum + (Number.isFinite(item.amount) ? item.amount : 0), 0);
  const total = draft.dailyRate * days + (vehicle?.perKmRate??0) * draft.estimatedKm + draft.extras + tripTotal - draft.discount;

  const eligibleVehicles = fleetOptions
    .map((item) => ({
      ...item,
      conflicts: getConflicts(item.id, draft.from, draft.to, bookings),
    }));

  const sectionValid = [
    Boolean(draft.from && draft.to && new Date(draft.to) > new Date(draft.from) && (draft.rentalMode==="self_drive"||draft.driverId)),
    draft.fulfillmentType==="external"?Boolean(draft.external.supplierName.trim()&&draft.external.supplierPhone.trim()&&draft.external.vehicleMake.trim()&&draft.external.vehicleModel.trim()&&draft.external.vehiclePlate.trim()):Boolean(vehicle && getConflicts(vehicle.id, draft.from, draft.to, bookings).length === 0),
    Boolean((draft.customerId || (draft.rentalMode==="with_driver"&&draft.renterSkipped)) && (!draft.guarantor || isGuarantorComplete(draft.guarantor))),
    // The rent is negotiable and may be agreed later (0); only the discount and trip charges must be sensible.
    draft.dailyRate >= 0 && days >= (vehicle?.minimumDays??1) && draft.discount <= draft.dailyRate * days + draft.extras + tripTotal && tripCharges.every(item => Number.isSafeInteger(item.amount) && item.amount > 0) && (draft.fulfillmentType==="fleet"||(draft.external.pricingMode==="percentage"?draft.external.supplierSharePercent>=0&&draft.external.supplierSharePercent<=100:draft.external.supplierFixedCost>=0&&draft.external.supplierFixedCost<=total)),
    true,
    draft.bookingMode!=="rent_now"||Boolean(Number.isInteger(draft.checkout.odometer)&&draft.checkout.odometer>=0&&draft.checkout.fuelLevel&&draft.checkout.conditionNotes.trim()),
  ];
  const sections = [
    { id: "schedule", title: "When & how", valid: sectionValid[0], missing: "Pickup and return times" + (draft.rentalMode === "with_driver" ? " and driver" : "") },
    { id: "vehicle", title: "Vehicle", valid: sectionValid[1], missing: draft.fulfillmentType === "external" ? "Supplier and car details" : "An available vehicle" },
    { id: "customer", title: "Customer", valid: sectionValid[2], missing: "Customer" },
    { id: "pricing", title: "Price & trip charges", valid: sectionValid[3], missing: "Valid price (discount and trip charges)" },
    ...(draft.bookingMode === "rent_now" ? [{ id: "handover", title: "Handover", valid: sectionValid[5], missing: "Handover odometer, fuel and condition" }] : []),
  ];
  const missing = sections.filter(section => !section.valid);
  const ready = missing.length === 0 && Boolean(bookingReference) && !submitting;
  const scrollToSection = (id: string) => { const el = document.getElementById(`booking-${id}`); el?.scrollIntoView({ behavior: "smooth", block: "start" }); el?.querySelector<HTMLElement>("input,select,textarea,button")?.focus({ preventScroll: true }); };

  // A vehicle chosen elsewhere (vehicle page, rebook) arrives without its rate: fill it once.
  useEffect(() => {
    // With-driver trips are priced per trip, so no rate is pre-filled for them.
    if (draft.fulfillmentType === "fleet" && vehicle && vehicle.rate > 0 && draft.dailyRate === 0 && !draft.rateTouched) {
      queueMicrotask(() => setDraft(current => current.vehicleId === vehicle.id && current.dailyRate === 0 && !current.rateTouched ? { ...current, dailyRate: vehicle.rate, checkout: { ...current.checkout, odometer: current.checkout.odometer || (vehicle.lastOdometer ?? 0) } } : current));
    }
  }, [draft.fulfillmentType, draft.dailyRate, draft.rateTouched, draft.rentalMode, vehicle]);

  async function confirm() {
    if ((draft.fulfillmentType==="fleet"&&!vehicle) || (!draft.customerId && !draft.renterSkipped) || !bookingReference || submitting) return;
    setSubmitting(true);
    setSubmitError("");
    const result = await confirmBookingAction({
      bookingDraftId: bookingReference.id,
      quotationId: draft.quotationId,
      vehicleId: vehicle?.id,
      fulfillmentType:draft.fulfillmentType,
      external:draft.fulfillmentType==="external"?draft.external:undefined,
      customerId: draft.customerId,
      rentalMode:draft.rentalMode,
      driverId:draft.driverId||undefined,
      renterSkipped:draft.renterSkipped,
      guarantor:draft.guarantor??undefined,
      destinationCity: draft.city,
      pickupAt: zonedWallTimeToIso(draft.from),
      returnAt: zonedWallTimeToIso(draft.to),
      extras: draft.extras,
      discount: draft.discount,
      depositRequired: draft.deposit,
      source: "counter",
      notes: draft.notes,
      estimatedKm: draft.estimatedKm,
      dailyRateOverride: draft.fulfillmentType==="external"?draft.dailyRate:vehicle && (draft.dailyRate !== vehicle.rate || draft.rentalMode==="with_driver") ? draft.dailyRate : undefined,
      tripCharges: tripCharges.filter(item => item.amount > 0),
      overrideReason: draft.overrideReason || undefined,
      startImmediately:draft.bookingMode==="rent_now",
      checkoutInspection:draft.bookingMode==="rent_now"?draft.checkout:undefined,
    });
    setSubmitting(false);
    setConfirmationOpen(false);
    if (!result.ok) {
      setSubmitError(result.error.message);
      if (result.error.code === "BOOKING_CONFLICT") {
        setConflictMode(true);
        scrollToSection("vehicle");
      }
      return;
    }
    sessionStorage.removeItem("viberent-booking-draft");
    sessionStorage.removeItem("viberent-booking-reference");
    setAgreementDelivery(result.data.agreementDelivery);
    setStartedImmediately(result.data.status==="checked_out");
    setConfirmed(result.data.id);
  }

  async function clearBooking() {
    if(!bookingReference||clearing)return;
    if(!window.confirm("Clear this booking draft and permanently remove its attached CNIC images?"))return;
    setClearing(true);setSubmitError("");
    const result=await clearBookingAction(bookingReference.id);
    setClearing(false);
    if(!result.ok){setSubmitError(result.error.message);return;}
    sessionStorage.removeItem("viberent-booking-draft");
    sessionStorage.setItem("viberent-booking-reference",result.data.id);
    setBookingReference(result.data);
    setDraft(defaultDraft());setConflictMode(false);window.scrollTo({top:0});
  }

  if (confirmed) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-[#ABEFC6] bg-white p-8 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#ECFDF3] text-[#067647]"><Check size={28} /></span>
        <h1 className="mt-4 text-2xl font-bold">{startedImmediately?"Rental started":"Booking confirmed"}</h1>
        <p className="mt-2 text-sm text-[#667085]">Booking <strong className="text-[#101828]">#{bookingReference?.publicNumber}</strong> {startedImmediately?"was confirmed and checked out in one step":"now persistently blocks the selected vehicle for the agreed interval"}.</p>
        {agreementDelivery&&<p role="status" className={`mx-auto mt-4 flex max-w-lg items-start justify-center gap-2 rounded-lg border p-3 text-sm ${agreementDelivery.status==="sent"?"border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]":agreementDelivery.status==="failed"?"border-[#FEDF89] bg-[#FFFAEB] text-[#93370D]":"border-[#D0D5DD] bg-[#F8FAFC] text-[#475467]"}`}><MessageCircle size={17} className="mt-0.5 shrink-0"/>{agreementDelivery.message}</p>}
        <div className="mt-6 flex flex-wrap justify-center gap-2"><Button asChild variant="secondary"><Link href="/bookings">View bookings</Link></Button><Button asChild><Link href={`/bookings/${confirmed}`}>Open rental</Link></Button></div>
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

  const selectedCustomer = customers.find(item => item.id === draft.customerId);
  const submitLabel = draft.bookingMode === "rent_now" ? `Start rental #${bookingReference?.publicNumber ?? ""}` : `Confirm booking #${bookingReference?.publicNumber ?? ""}`;
  return (
    <form onSubmit={(event)=>{event.preventDefault();if(!ready)return;if(draft.bookingMode==="rent_now")setConfirmationOpen(true);else void confirm();}} className="space-y-5">
      <Link href="/bookings" className="inline-flex items-center gap-2 text-sm font-semibold text-[#475467]"><ArrowLeft size={17} />Bookings</Link>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><h1 className="text-2xl font-bold">New booking {bookingReference && <span className="text-[#475467]">#{bookingReference.publicNumber}</span>}</h1><p className="mt-1 text-sm text-[#475467]">Fill the four sections in any order. Your progress is kept if you leave this page.</p></div>{bookingReference&&<div className="flex flex-wrap gap-2"><Button type="button" variant="ghost" disabled={clearing} onClick={()=>void clearBooking()}><X size={16}/>{clearing?"Clearing…":"Start over"}</Button></div>}</div>
      {dataError && <p className="rounded-lg border border-[#FEDF89] bg-[#FFFAEB] px-3 py-2 text-xs text-[#93370D]">{dataError}</p>}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="space-y-4">
          {sections.map((section, index) => (
            <BookingSection key={section.id} id={section.id} number={index + 1} title={section.title} valid={section.valid}>
              {section.id === "schedule" && <ScheduleStep draft={draft} setDraft={setDraft} cities={cities} drivers={drivers} onCityCreated={city=>setSavedCities(current=>[...new Set([...current,city])].sort())} />}
              {section.id === "vehicle" && <VehicleStep draft={draft} setDraft={setDraft} vehicles={eligibleVehicles} conflictMode={conflictMode} clearConflict={() => setConflictMode(false)} />}
              {section.id === "customer" && <CustomerStep draft={draft} setDraft={setDraft} customers={customers} bookingReference={bookingReference} onCustomerCreated={(c) => setCustomers((prev) => [c, ...prev.filter(item=>item.id!==c.id)])} />}
              {section.id === "pricing" && <PricingStep draft={draft} setDraft={setDraft} days={days} total={total} tripTotal={tripTotal} baseRate={vehicle?.rate} cityRate={vehicle?.cityRate} />}
              {section.id === "handover" && <HandoverStep draft={draft} setDraft={setDraft} lastOdometer={draft.fulfillmentType==="fleet"?vehicle?.lastOdometer:undefined}/>}
            </BookingSection>
          ))}
        </div>
        <aside className="lg:sticky lg:top-[92px]" aria-label="Booking summary">
          <section className="rounded-xl border border-[#E4E7EC] bg-white p-4">
            <h2 className="text-sm font-bold text-[#475467]">Summary</h2>
            <dl className="mt-3 space-y-2.5 text-sm">
              <SummaryRow label="Dates" value={draft.from && draft.to ? `${formatShort(draft.from)} → ${formatShort(draft.to)}` : undefined} sub={`${days} day${days === 1 ? "" : "s"} · ${draft.rentalMode === "with_driver" ? "with driver" : "self drive"} · ${draft.city || "—"}`} />
              <SummaryRow label="Vehicle" value={draft.fulfillmentType === "external" ? (draft.external.vehiclePlate ? `${draft.external.vehicleMake} ${draft.external.vehicleModel} · ${draft.external.vehiclePlate}` : undefined) : vehicle ? `${vehicle.label} · ${vehicle.plate}` : undefined} />
              <SummaryRow label="Customer" value={selectedCustomer ? selectedCustomer.name : draft.renterSkipped ? "Skipped (with driver)" : undefined} sub={selectedCustomer?.phone} />
              <SummaryRow label="Rate" value={draft.dailyRate ? `${formatPkr(draft.dailyRate)} × ${days}` : vehicle || draft.fulfillmentType === "external" ? "To be agreed (0)" : undefined} sub={[draft.extras ? `+ ${formatPkr(draft.extras)} extras` : "", tripTotal ? `+ ${formatPkr(tripTotal)} trip charges` : "", draft.discount ? `− ${formatPkr(draft.discount)} discount` : "", draft.deposit ? `Deposit ${formatPkr(draft.deposit)}` : ""].filter(Boolean).join(" · ") || undefined} />
            </dl>
            <div className="mt-4 border-t border-[#EAECF0] pt-3">
              <p className="text-xs font-semibold text-[#475467]">Total</p>
              <p className="text-[28px] font-bold leading-tight tabular-nums">{formatPkr(Math.max(0, total))}</p>
            </div>
            {missing.length > 0 && (
              <div className="mt-3 rounded-lg bg-[#F8FAFC] p-3">
                <p className="text-xs font-semibold text-[#475467]">Still needed</p>
                <ul className="mt-1 space-y-1">
                  {missing.map(section => <li key={section.id}><button type="button" onClick={() => scrollToSection(section.id)} className="text-left text-sm font-medium text-[#0058B8] hover:underline">{section.missing}</button></li>)}
                </ul>
              </div>
            )}
            {submitError && <p role="alert" className="mt-3 rounded-lg border border-[#FDA29B] bg-[#FEF3F2] p-3 text-sm text-[#B42318]">{submitError}</p>}
            <Button type="submit" shortcut="mod+enter" shortcutInInput className="mt-4 w-full" disabled={!ready}>{submitting ? "Saving…" : submitLabel}</Button>
            <p className="mt-2 text-xs text-[#475467]">{draft.bookingMode === "rent_now" ? "Creates the booking and checks the car out in one step." : "Blocks the car for these dates. Availability is checked again when you confirm."}</p>
          </section>
        </aside>
      </div>
      <ConfirmDialog open={confirmationOpen} onOpenChange={setConfirmationOpen} title={`Start rental #${bookingReference?.publicNumber ?? ""} now?`} description={`${vehicle ? `${vehicle.label} · ${vehicle.plate}` : "The vehicle"} will be checked out to ${selectedCustomer?.name ?? "the renter"} with odometer ${draft.checkout.odometer.toLocaleString("en-PK")} km and fuel ${draft.checkout.fuelLevel}. Total ${formatPkr(total)}.`} confirmLabel="Start rental" pendingLabel="Starting rental…" confirmVariant="primary" pending={submitting} onConfirm={()=>void confirm()}/>
    </form>
  );
}

function BookingSection({ id, number, title, valid, children }: { id: string; number: number; title: string; valid: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useHotkey(`alt+${number}`, () => { ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }); ref.current?.querySelector<HTMLElement>("input:not([type=hidden]),select,textarea,button")?.focus({ preventScroll: true }); }, { allowInInput: true });
  return (
    <section id={`booking-${id}`} ref={ref} aria-labelledby={`booking-${id}-title`} className="scroll-mt-24 rounded-xl border border-[#E4E7EC] bg-white p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold ${valid ? "bg-[#ECFDF3] text-[#067647]" : "bg-[#F2F4F7] text-[#475467]"}`} aria-hidden>{valid ? <Check size={15} /> : number}</span>
        <h2 id={`booking-${id}-title`} className="flex-1 text-base font-bold">{title}<span className="sr-only">{valid ? " (complete)" : " (needs input)"}</span></h2>
        <Kbd combo={`alt+${number}`} />
      </div>
      {children}
    </section>
  );
}

function SummaryRow({ label, value, sub }: { label: string; value?: string; sub?: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-[#475467]">{label}</dt>
      <dd className={value ? "font-semibold text-[#19191F]" : "text-[#667085]"}>{value ?? "Not chosen yet"}</dd>
      {sub && <dd className="text-xs text-[#475467]">{sub}</dd>}
    </div>
  );
}

function formatShort(value: string) {
  return formatInZone(value, { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" });
}


// ─── Schedule step ───────────────────────────────────────────────────────────

function ScheduleStep({ draft, setDraft, cities, drivers, onCityCreated }: { draft: Draft; setDraft: (value: Draft) => void; cities: string[]; drivers:DriverOption[]; onCityCreated: (city:string)=>void }) {
  const [cityInput,setCityInput]=useState(draft.city);
  const [pending,setPending]=useState(false);
  const [error,setError]=useState("");
  const exact=cities.find(city=>city.toLowerCase()===cityInput.trim().toLowerCase());
  function chooseCity(value:string){setCityInput(value);setDraft({...draft,city:value,vehicleId:"",dailyRate:0,rateTouched:false,overrideReason:""})}
  async function addCity(){if(!cityInput.trim()||pending)return;setPending(true);setError("");const result=await createAgencyCityAction(cityInput);setPending(false);if(!result.ok){setError(result.error.message);return}onCityCreated(result.data.name);chooseCity(result.data.name)}
  return (
    <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
      <SegmentedControl label="Booking type" value={draft.bookingMode} onChange={value=>{if(value==="rent_now"){const local=toWallInput(zonedNow());setDraft({...draft,bookingMode:"rent_now",from:local})}else setDraft({...draft,bookingMode:"reservation"})}} options={[{label:"Reserve",value:"reservation"},{label:"Rent now",value:"rent_now"}]}/>
      <SegmentedControl label="Rental type" value={draft.rentalMode} onChange={value=>setDraft({...draft,rentalMode:value,driverId:value==="self_drive"?"":draft.driverId,renterSkipped:value==="self_drive"?false:draft.renterSkipped,vehicleId:"",dailyRate:0,rateTouched:false})} options={[{label:"Self drive",value:"self_drive"},{label:"With driver",value:"with_driver"}]}/>
      {draft.rentalMode==="with_driver"&&<FormCombobox label="Driver" value={draft.driverId} onValueChange={driverId=>setDraft({...draft,driverId})} options={[{label:"Select a driver",value:""},...drivers.map(driver=>({label:`${driver.name} · ${driver.phone}`,value:driver.id}))]} searchPlaceholder="Search driver name or phone…"/>}
      <div>
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-[#344054]">Going to city</span>
          <input
            list="booking-city-options"
            value={cityInput}
            onChange={(e) => chooseCity(e.target.value)}
            placeholder="Search or enter a city"
            className="h-10 w-full rounded-[9px] border border-[#D0D5DD] bg-white px-3 text-sm text-[#19191F] outline-none focus:border-[#006FE6] focus:ring-2 focus:ring-[#006FE6]/10"
          />
          <datalist id="booking-city-options">{cities.map(city=><option key={city} value={city}/>)}</datalist>
        </label>
        {!exact&&cityInput.trim().length>=2&&<button type="button" disabled={pending} onClick={()=>void addCity()} className="mt-2 text-xs font-semibold text-[#006FE6] hover:underline">{pending?"Adding…":`Add “${cityInput.trim()}” to city list`}</button>}
        {error&&<p className="mt-1 text-xs text-[#B42318]">{error}</p>}
      </div>
      <div>
        <FormInput label="Pickup" type="datetime-local" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
        <div className="mt-1.5 flex flex-wrap gap-1" aria-label="Pickup presets">{pickupPresets().map(preset => <PresetChip key={preset.label} active={draft.from === preset.value} onClick={() => setDraft({ ...draft, from: preset.value, to: draft.to && new Date(draft.to) > new Date(preset.value) ? draft.to : addDays(preset.value, 1) })}>{preset.label}</PresetChip>)}</div>
      </div>
      <div>
        <FormInput label="Return" type="datetime-local" value={draft.to} min={draft.from} onChange={(e) => setDraft({ ...draft, to: e.target.value })} error={draft.from && draft.to && new Date(draft.to) <= new Date(draft.from) ? "Return must be after pickup." : undefined} />
        <div className="mt-1.5 flex flex-wrap gap-1" aria-label="Rental length presets">{[1, 2, 3, 7].map(daysCount => { const value = addDays(draft.from, daysCount); return <PresetChip key={daysCount} active={draft.to === value} onClick={() => setDraft({ ...draft, to: value })}>{daysCount === 7 ? "1 week" : `${daysCount} day${daysCount === 1 ? "" : "s"}`}</PresetChip>; })}<PresetChip active={draft.to === endOfDay(draft.from)} onClick={() => setDraft({ ...draft, to: endOfDay(draft.from) })}>Same day</PresetChip></div>
      </div>
      {draft.rentalMode==="with_driver"&&<label className="flex items-center gap-2 rounded-lg border bg-[#F8FAFC] p-3 text-sm sm:col-span-2"><input type="checkbox" checked={draft.renterSkipped} onChange={e=>setDraft({...draft,renterSkipped:e.target.checked,customerId:e.target.checked?"":draft.customerId})}/>Skip renter details for this with-driver booking</label>}
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
  const [vehicleSearch,setVehicleSearch]=useState("");
  const term=vehicleSearch.trim().toLocaleLowerCase("en");
  const filteredVehicles=term?vehicles.filter(item=>`${item.label} ${item.plate} ${item.city}`.toLocaleLowerCase("en").includes(term)):vehicles;
  const availableVehicles=filteredVehicles.filter(item=>!item.conflicts.length);
  const bookedVehicles=filteredVehicles.filter(item=>item.conflicts.length>0);
  const pick = (item: EligibleVehicle) => { setDraft({ ...draft, vehicleId: item.id, dailyRate: draft.rateTouched ? draft.dailyRate : item.rate, checkout: { ...draft.checkout, odometer: item.lastOdometer ?? 0 } }); clearConflict(); };
  if (draft.fulfillmentType === "external") return (
    <div>
      <button type="button" onClick={() => setDraft({ ...draft, fulfillmentType: "fleet", dailyRate: 0 })} className="mb-3 text-sm font-semibold text-[#0058B8] hover:underline">← Pick from our fleet instead</button>
      <ExternalVehicleFields draft={draft} setDraft={setDraft} />
    </div>
  );
  return (
    <div>
      {conflictMode && <p role="alert" className="mb-3 flex items-center gap-2 rounded-lg border border-[#FDA29B] bg-[#FEF3F2] px-3 py-2 text-sm text-[#B42318]"><ShieldAlert size={16} />That car was just booked by someone else. Pick another — everything else is kept.</p>}
      {vehicles.length > 8 && <div className="mb-3 flex items-center gap-3"><label className="relative flex-1"><span className="sr-only">Filter vehicles</span><Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#667085]"/><input type="search" value={vehicleSearch} onChange={event=>setVehicleSearch(event.target.value)} placeholder="Filter by model, plate or city" className="h-9 w-full rounded-[8px] border border-[#D0D5DD] bg-white pl-8 pr-3 text-sm"/></label><span className="whitespace-nowrap text-xs text-[#475467]">{availableVehicles.length} free</span></div>}
      {availableVehicles.length > 0 ? (
        <div role="radiogroup" aria-label="Available vehicles" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {availableVehicles.map((item) => {
            const selected = draft.vehicleId === item.id;
            return (
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                key={item.id}
                onClick={() => pick(item)}
                className={`relative rounded-[10px] border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#006FE6] ${selected ? "border-[#006FE6] bg-[#EFF8FF] ring-1 ring-[#006FE6]" : "border-[#D0D5DD] bg-white hover:border-[#84CAFF]"}`}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-semibold text-[#19191F]">{item.label}</span>
                  {selected ? <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#006FE6] text-white"><Check size={13} /></span> : <span className="h-5 w-5 shrink-0 rounded-full border border-[#D0D5DD]" />}
                </span>
                <span className="mt-0.5 block text-xs text-[#475467]"><span className="font-mono">{item.plate}</span> · {item.city}</span>
                <span className="mt-2 block text-base font-bold tabular-nums">{item.rate ? <>{formatPkr(item.rate)}<span className="text-xs font-normal text-[#475467]"> /day{item.cityRate ? ` · ${draft.city} price` : ""}</span></> : <span className="text-sm font-semibold text-[#475467]">Price per trip</span>}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="rounded-lg border border-[#D0D5DD] bg-[#F8FAFC] p-3 text-sm text-[#475467]">{vehicles.length === 0 ? "No car in the fleet is free." : filteredVehicles.length === 0 ? `No car matches “${vehicleSearch.trim()}”.` : "Every car is booked for these dates."} Change the dates, or source one externally below.</p>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[13px]">
        {bookedVehicles.length > 0 ? <details><summary className="cursor-pointer text-[#475467]">{bookedVehicles.length} booked for these dates</summary><ul className="mt-1 space-y-0.5 pl-4 text-[#475467]">{bookedVehicles.map(item=><li key={item.id}>{item.label} <span className="font-mono text-xs">{item.plate}</span> — {item.conflicts[0].reason}</li>)}</ul></details> : <span />}
        <button type="button" onClick={() => setDraft({ ...draft, fulfillmentType: "external", vehicleId: "", dailyRate: draft.dailyRate || 0, overrideReason: "" })} className="font-semibold text-[#0058B8] hover:underline">Car not in our fleet? Source externally</button>
      </div>
    </div>
  );
}

function ExternalVehicleFields({draft,setDraft}:{draft:Draft;setDraft:(value:Draft)=>void}){const update=(values:Partial<Draft["external"]>)=>setDraft({...draft,external:{...draft.external,...values}});return <div className="mt-4 space-y-4"><ExternalVehiclePicker value={draft.external} onSelect={car=>setDraft({...draft,external:{...draft.external,supplierName:car.supplierName,supplierPhone:car.supplierPhone,vehicleMake:car.make,vehicleModel:car.model,vehicleYear:car.year,vehiclePlate:car.plate,vehicleColor:car.color}})}/><div className="rounded-lg border border-[#B2DDFF] bg-[#EFF8FF] p-3 text-sm text-[#175CD3]"><strong>Booking snapshot.</strong> Selecting a saved source car fills these fields. Changes here apply to this booking unless you save the car for reuse.</div><div className="grid gap-4 sm:grid-cols-2"><FormInput label="Supplier / owner name" required value={draft.external.supplierName} onChange={e=>update({supplierName:e.target.value})}/><FormInput label="Supplier phone" required type="tel" value={draft.external.supplierPhone} onChange={e=>update({supplierPhone:e.target.value})}/><FormInput label="Vehicle make" required placeholder="Toyota" value={draft.external.vehicleMake} onChange={e=>update({vehicleMake:e.target.value})}/><FormInput label="Vehicle model" required placeholder="Corolla" value={draft.external.vehicleModel} onChange={e=>update({vehicleModel:e.target.value})}/><FormInput label="Registration number" required placeholder="LEA-4582" value={draft.external.vehiclePlate} onChange={e=>update({vehiclePlate:e.target.value.toUpperCase()})}/><FormInput label="Year" type="number" min={1980} max={new Date().getFullYear()+1} value={draft.external.vehicleYear} onChange={e=>update({vehicleYear:Number(e.target.value)})}/><FormInput label="Colour (optional)" value={draft.external.vehicleColor} onChange={e=>update({vehicleColor:e.target.value})}/></div></div>}

// ─── Driving licence intake (drawer + OCR) ──────────────────────────────────

/** Uploads licence images for this booking draft and reports each new OCR result once. */
function useLicenseIntake(bookingDraftId: string | undefined, purpose: "customer" | "guarantor", enabled: boolean, onExtracted: (values: LicenseExtracted) => void) {
  const [intake, setIntake] = useState<LicenseIntake>();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState<"front" | "back" | null>(null);
  const [error, setError] = useState("");
  const lastKey = useRef("");
  const callback = useRef(onExtracted);
  useEffect(() => { callback.current = onExtracted; });
  function accept(next: LicenseIntake) {
    setIntake(next);
    const key = JSON.stringify(next.extracted);
    if (key !== lastKey.current && Object.values(next.extracted).some(Boolean)) { lastKey.current = key; callback.current(next.extracted); }
  }
  async function refresh() {
    if (!bookingDraftId) return;
    setLoading(true);
    const result = await getBookingLicenseAction(bookingDraftId, purpose);
    setLoading(false);
    if (result.ok) accept(result.data as LicenseIntake); else setError(result.error.message);
  }
  useEffect(() => {
    if (!bookingDraftId || !enabled) return;
    let active = true;
    void getBookingLicenseAction(bookingDraftId, purpose).then(result => { if (active && result.ok) accept(result.data as LicenseIntake); });
    return () => { active = false; };
  }, [bookingDraftId, purpose, enabled]);
  async function upload(side: "front" | "back", file: File | undefined) {
    if (!file || !bookingDraftId || uploading) return;
    setUploading(side); setError("");
    const form = new FormData(); form.set("bookingDraftId", bookingDraftId); form.set("side", side); form.set("purpose", purpose); form.set("image", file);
    const result = await uploadBookingLicenseAction(form);
    setUploading(null);
    if (!result.ok) { setError(result.error.message); return; }
    accept(result.data as LicenseIntake);
  }
  return { intake, loading, uploading, error, refresh, upload };
}

// ─── Customer step ───────────────────────────────────────────────────────────

type NewCustomerFormErrors = Partial<Record<keyof CreateCustomerInput, string>>;

function CustomerStep({ draft, setDraft, customers, bookingReference, onCustomerCreated }: {
  draft: Draft;
  setDraft: Dispatch<SetStateAction<Draft>>;
  customers: CustomerDto[];
  bookingReference?: {id:string;publicNumber:number};
  onCustomerCreated: (c: CustomerDto) => void;
}) {
  const [customerSearch, setCustomerSearch] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [updatingCustomer, setUpdatingCustomer] = useState<CustomerDto>();
  const [newForm, setNewForm] = useState<CreateCustomerInput>({ name: "", fatherName: "", phone: "", cnic: "", email: "", dateOfBirth:"", address:"", cnicExpiresAt:"", licenseNumber: "", licenseExpiresAt: "" });
  const [formErrors, setFormErrors] = useState<NewCustomerFormErrors>({});
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formSubmitError, setFormSubmitError] = useState("");
  const [cnicIntake,setCnicIntake]=useState<CnicIntake>();
  const [cnicLoading,setCnicLoading]=useState(false);
  const [cnicUploading,setCnicUploading]=useState<"front"|"back"|null>(null);
  const [cnicError,setCnicError]=useState("");
  const lastExtraction=useRef<CnicExtractedValues | undefined>(undefined);
  const lastExtractionKey=useRef("");
  // Licence OCR fills the licence fields and any identity field still empty (manual edits are kept).
  const license=useLicenseIntake(bookingReference?.id,"customer",showNewForm,values=>setNewForm(current=>({
    ...current,
    licenseNumber:values.license_no??current.licenseNumber,
    licenseExpiresAt:ocrDate(values.expiry)||current.licenseExpiresAt,
    name:current.name||values.name||"",
    fatherName:current.fatherName||values.father_name||"",
    cnic:current.cnic||values.cnic_no||"",
    dateOfBirth:current.dateOfBirth||ocrDate(values.dob)||"",
    address:current.address||values.address||"",
  })));

  const selected = customers.find((c) => c.id === draft.customerId);
  const cnicDigits=/^[\d\s-]+$/.test(customerSearch.trim())?customerSearch.replace(/\D/g,""):"";
  const matches=customerSearch.trim()?customers.filter(customer=>`${customer.name} ${customer.phone} ${customer.cnic}`.toLowerCase().includes(customerSearch.trim().toLowerCase())).slice(0,5):[];
  const existingCnic=showNewForm&&newForm.cnic.replace(/\D/g,"").length===13?customers.find(customer=>customer.cnic.replace(/\D/g,"")===newForm.cnic.replace(/\D/g,"")):undefined;
  function editExisting(customer:CustomerDto){setUpdatingCustomer(customer);setShowNewForm(true);setNewForm({name:customer.name,fatherName:customer.fatherName??"",phone:customer.phone,cnic:customer.cnic,email:customer.email??"",dateOfBirth:customer.dateOfBirth??"",address:customer.address??"",cnicExpiresAt:customer.cnicExpiresAt??"",licenseNumber:customer.licenseNumber??"",licenseExpiresAt:customer.licenseExpiresAt??""});}

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
    const input = {
      name: newForm.name,
      fatherName: newForm.fatherName || undefined,
      phone: newForm.phone,
      cnic: newForm.cnic,
      email: newForm.email || undefined,
      dateOfBirth:newForm.dateOfBirth||undefined,
      address:newForm.address||undefined,
      cnicExpiresAt:newForm.cnicExpiresAt||undefined,
      licenseNumber: newForm.licenseNumber || undefined,
      licenseExpiresAt: newForm.licenseExpiresAt || undefined,
    };
    const result = updatingCustomer ? await updateCustomerAction(updatingCustomer.id, input) : await createCustomerAction(input);
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
    setUpdatingCustomer(undefined);
    setNewForm({ name: "", fatherName: "", phone: "", cnic: "", email: "", dateOfBirth:"", address:"", cnicExpiresAt:"", licenseNumber: "", licenseExpiresAt: "" });
  }

  return (
    <div>
      {draft.rentalMode==="with_driver"&&draft.renterSkipped&&<div className="mt-3 rounded-lg border border-[#B2DDFF] bg-[#EFF8FF] p-3 text-sm text-[#175CD3]">Renter details are skipped for this with-driver booking. Continue to pricing, or untick the option in Schedule to attach a customer.</div>}

      <div className="space-y-3">
        {selected && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#B2DDFF] bg-[#EFF8FF] px-3 py-2 text-sm"><div><p className="font-bold text-[#1D2939]"><Check size={14} className="mr-1 inline text-[#067647]"/>{selected.name}</p><p className="text-xs text-[#667085]">{selected.phone || "No phone"} · {selected.cnic || "No CNIC"} · {selected.status}{selected.status==="review"&&" · Manager review required"}</p></div><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="secondary" onClick={()=>editExisting(selected)}>Update details</Button><Button type="button" size="sm" variant="secondary" onClick={()=>{setDraft(current=>({...current,customerId:""}));setCustomerSearch("")}}>Change</Button></div></div>}
        {selected&&!showNewForm&&<details className="rounded-lg border border-[#E4E7EC] bg-white p-3" open>
          <summary className="cursor-pointer text-sm font-semibold text-[#344054]">CNIC &amp; driving license images <span className="font-normal text-[#667085]">(optional, saved on the customer)</span></summary>
          <div className="mt-3"><PersonDocuments key={selected.id} owner="customer" ownerId={selected.id} compact/></div>
        </details>}
        {!selected&&<FormInput
          label="Find customer"
          placeholder="Name, phone or CNIC (35202-1234567-1)"
          value={customerSearch}
          onChange={(e) => setCustomerSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (matches[0]) { setDraft({ ...draft, customerId: matches[0].id }); setCustomerSearch(""); } else if (cnicDigits.length === 13) { setUpdatingCustomer(undefined); setNewForm(current => ({ ...current, cnic: cnicDigits })); setShowNewForm(true); } } }}
        />}
        {!selected&&customerSearch.trim()&&<div className="max-h-52 overflow-y-auto rounded-xl border border-[#E4E7EC] bg-white p-1" aria-label="Customer suggestions">{matches.map(customer=><button key={customer.id} type="button" role="option" aria-selected={draft.customerId===customer.id} onClick={()=>{setDraft({...draft,customerId:customer.id});setCustomerSearch("")}} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${draft.customerId===customer.id?"bg-[#EFF8FF] text-[#0058B8]":"hover:bg-[#F8FAFC]"}`}><span><strong>{customer.name}</strong><span className="ml-2 text-xs text-[#667085]">{customer.phone} · {customer.cnic}</span></span><span className="text-xs capitalize">{customer.status}</span></button>)}{!matches.length&&(cnicDigits.length===13?<button type="button" onClick={()=>{setUpdatingCustomer(undefined);setNewForm(current=>({...current,cnic:cnicDigits}));setShowNewForm(true)}} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-[#0058B8] hover:bg-[#F8FAFC]"><Plus size={15}/>No match — add new customer with CNIC {cnicDigits.slice(0,5)}-{cnicDigits.slice(5,12)}-{cnicDigits.slice(12)} <kbd className="ml-auto rounded border px-1 text-xs">↵</kbd></button>:<p className="p-3 text-sm text-[#475467]">No customer matches. Type the full 13-digit CNIC to add one.</p>)}</div>}

        {bookingReference&&showNewForm&&<div className="flex flex-col gap-2 sm:flex-row">
          {!updatingCustomer&&<CnicDocumentDrawer
            label="Scan CNIC to fill the form"
            commandHint={{bookingNumber:bookingReference.publicNumber}}
            intake={cnicIntake}
            loading={cnicLoading}
            uploading={cnicUploading}
            error={cnicError}
            onRefresh={()=>void refreshCnic()}
            onUpload={(side,file)=>void uploadCnic(side,file)}
          />}
          <CnicDocumentDrawer label="Scan driving licence" documentLabel="Licence" backOptional intake={license.intake} loading={license.loading} uploading={license.uploading} error={license.error} onRefresh={()=>void license.refresh()} onUpload={(side,file)=>void license.upload(side,file)}/>
        </div>}

        {/* New customer toggle */}
        {!showNewForm ? (selected ? null :
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
              <p className="text-sm font-bold">{updatingCustomer?"Update customer":"New customer"}</p>
              <button type="button" onClick={() => { setShowNewForm(false); setFormErrors({}); setFormSubmitError(""); }} className="text-[#667085] hover:text-[#19191F]"><X size={16} /></button>
            </div>
            {formSubmitError && <p className="mb-3 rounded-lg border border-[#FDA29B] bg-[#FEF3F2] p-2 text-xs text-[#B42318]">{formSubmitError}</p>}
            {existingCnic && !updatingCustomer && <div className="mb-3 rounded-lg border border-[#B2DDFF] bg-[#EFF8FF] p-3 text-sm"><strong>{existingCnic.name}</strong> already has this CNIC. <div className="mt-2 flex gap-2"><Button type="button" size="sm" onClick={()=>{setDraft({...draft,customerId:existingCnic.id});setShowNewForm(false)}}>Use existing</Button><Button type="button" size="sm" variant="secondary" onClick={()=>editExisting(existingCnic)}>Update details</Button></div></div>}
            <div className="grid gap-3 sm:grid-cols-2">
              <FormInput autoFocus label="Full name" required value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} error={formErrors.name} />
              <FormInput label="Father / husband name" value={newForm.fatherName ?? ""} onChange={(e) => setNewForm({ ...newForm, fatherName: e.target.value })} error={formErrors.fatherName} />
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
              <Button type="button" size="sm" disabled={formSubmitting || Boolean(existingCnic&&!updatingCustomer)} onClick={handleCreateCustomer}>{formSubmitting ? "Saving…" : updatingCustomer ? "Update customer" : "Save customer"}</Button>
            </div>
          </div>
        )}
        <GuarantorSection draft={draft} setDraft={setDraft} bookingReference={bookingReference}/>
      </div>
    </div>
  );
}

function GuarantorSection({draft,setDraft,bookingReference}:{draft:Draft;setDraft:Dispatch<SetStateAction<Draft>>;bookingReference?:{id:string;publicNumber:number}}) {
  const guarantor=draft.guarantor;
  const [savedGuarantors,setSavedGuarantors]=useState<GuarantorDto[]>([]);
  const [savingGuarantor,setSavingGuarantor]=useState(false);
  const [guarantorNotice,setGuarantorNotice]=useState("");
  const [guarantorQuery,setGuarantorQuery]=useState("");
  const [savedGuarantorId,setSavedGuarantorId]=useState<string>();
  const [editingSaved,setEditingSaved]=useState(false);
  const [intake,setIntake]=useState<CnicIntake>();
  const [loading,setLoading]=useState(false);
  const [uploading,setUploading]=useState<"front"|"back"|null>(null);
  const [error,setError]=useState("");
  const lastExtraction=useRef<CnicExtractedValues|undefined>(undefined);
  const lastExtractionKey=useRef("");
  const [customerCandidates,setCustomerCandidates]=useState<Array<{id:string;name:string;phone:string;cnic:string}>>([]);
  const license=useLicenseIntake(bookingReference?.id,"guarantor",Boolean(guarantor)&&(!savedGuarantorId||editingSaved),values=>setDraft(current=>current.guarantor?{...current,guarantor:{
    ...current.guarantor,
    licenseNumber:values.license_no??current.guarantor.licenseNumber,
    licenseExpiresAt:ocrDate(values.expiry)||current.guarantor.licenseExpiresAt,
    name:current.guarantor.name||values.name||"",
    parentage:current.guarantor.parentage||values.father_name||"",
    cnic:current.guarantor.cnic||values.cnic_no||"",
    address:current.guarantor.address||values.address||"",
  }}:current));
  // Picking an existing customer brings their guarantor along (latest booking's, else latest linked).
  // Staff can remove it; a removed guarantor is not re-added for the same customer.
  const autoAppliedFor=useRef<string>("");
  useEffect(()=>{
    const customerId=draft.customerId;
    if(!customerId||autoAppliedFor.current===customerId)return;
    autoAppliedFor.current=customerId;
    if(draft.guarantor)return;
    let active=true;
    void defaultGuarantorForCustomerAction(customerId).then(result=>{
      if(!active||!result.ok||!result.data)return;
      const found=result.data;
      setSavedGuarantors(current=>[found,...current.filter(item=>item.id!==found.id)]);
      setSavedGuarantorId(found.id);setEditingSaved(false);
      setDraft(current=>current.customerId===customerId&&!current.guarantor?{...current,guarantor:{id:found.id,name:found.name,parentage:found.parentage,cnic:found.cnic,phone:found.phone,address:found.address,carAmount:found.carAmount,licenseNumber:found.licenseNumber||undefined,licenseExpiresAt:found.licenseExpiresAt??undefined}}:current);
      setGuarantorNotice("This customer's usual guarantor was added. Remove or change it if someone else stands guarantee.");
    });
    return()=>{active=false};
    // Runs when the selected customer changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[draft.customerId]);
  useEffect(()=>{let active=true;void listGuarantorsAction().then(result=>{if(active&&result.ok)setSavedGuarantors(result.data)});void listCustomersAction().then(result=>{if(active&&result.ok)setCustomerCandidates(result.data.map(item=>({id:item.id,name:item.name,phone:item.phone,cnic:item.cnic})))});return()=>{active=false}},[]);
  // A customer can stand guarantee for someone else: reuse their saved guarantor record, or create one from their details.
  async function pickCustomer(customerId:string){setSavingGuarantor(true);setGuarantorNotice("");const result=await guarantorFromCustomerAction(customerId);setSavingGuarantor(false);if(!result.ok){setGuarantorNotice(result.error.message);return}setSavedGuarantors(current=>[result.data,...current.filter(item=>item.id!==result.data.id)]);pickSaved(result.data)}

  async function saveToDirectory(){if(!guarantor||!isGuarantorComplete(guarantor))return;setSavingGuarantor(true);const cnic=guarantor.cnic.replace(/\D/g,"");const existing=cnic?savedGuarantors.find(item=>item.cnic.replace(/\D/g,"")===cnic):undefined;const result=await saveGuarantorAction({...guarantor,id:savedGuarantorId??existing?.id??""});setSavingGuarantor(false);if(result.ok){setSavedGuarantors(current=>[result.data,...current.filter(item=>item.id!==result.data.id)]);setSavedGuarantorId(result.data.id);update({id:result.data.id});setEditingSaved(false);setGuarantorNotice("Guarantor saved for future bookings. Add their CNIC and license images below.")}else setGuarantorNotice(result.error.message)}

  function update(values:Partial<GuarantorDraft>){
    setDraft(current=>current.guarantor?{...current,guarantor:{...current.guarantor,...values}}:current);
  }

  function applyExtracted(next:CnicIntake){
    const key=cnicExtractionKey(next.extracted);
    if(key===lastExtractionKey.current)return;
    const previous=lastExtraction.current;
    setDraft(current=>{
      if(!current.guarantor)return current;
      const values:Partial<GuarantorDraft>={};
      if(next.extracted.name&&(!current.guarantor.name||current.guarantor.name===previous?.name))values.name=next.extracted.name;
      if(next.extracted.father_name&&(!current.guarantor.parentage||current.guarantor.parentage===previous?.father_name))values.parentage=next.extracted.father_name;
      if(next.extracted.cnic_no&&(!current.guarantor.cnic||current.guarantor.cnic===previous?.cnic_no))values.cnic=next.extracted.cnic_no;
      if(next.extracted.address&&(!current.guarantor.address||current.guarantor.address===previous?.address))values.address=next.extracted.address;
      return Object.keys(values).length?{...current,guarantor:{...current.guarantor,...values}}:current;
    });
    lastExtraction.current=next.extracted;
    lastExtractionKey.current=key;
  }

  async function refresh(silent=false){
    if(!bookingReference||loading)return;
    if(!silent)setLoading(true);
    const result=await getGuarantorCnicAction(bookingReference.id);
    if(!silent)setLoading(false);
    if(!result.ok){if(!silent)setError(result.error.message);return;}
    const next=result.data as CnicIntake;setIntake(next);applyExtracted(next);
  }

  useEffect(()=>{
    if(!bookingReference||!guarantor)return;
    const initial=window.setTimeout(()=>void refresh(),0);
    const timer=window.setInterval(()=>void refresh(true),7000);
    return()=>{window.clearTimeout(initial);window.clearInterval(timer);};
    // The booking reference and guarantor toggle control this polling lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[bookingReference?.id,Boolean(guarantor)]);

  async function upload(side:"front"|"back",file:File|undefined){
    if(!file||!bookingReference||uploading)return;
    setUploading(side);setError("");
    const formData=new FormData();formData.set("bookingDraftId",bookingReference.id);formData.set("side",side);formData.set("image",file);
    const result=await uploadGuarantorCnicAction(formData);
    setUploading(null);
    if(!result.ok){setError(result.error.message);return;}
    const next=result.data as CnicIntake;setIntake(next);applyExtracted(next);
  }

  function pickSaved(selected:GuarantorDto){setSavedGuarantorId(selected.id);setEditingSaved(false);setGuarantorNotice("");setDraft(current=>({...current,guarantor:{id:selected.id,name:selected.name,parentage:selected.parentage,cnic:selected.cnic,phone:selected.phone,address:selected.address,carAmount:selected.carAmount,licenseNumber:selected.licenseNumber||undefined,licenseExpiresAt:selected.licenseExpiresAt??undefined}}))}
  function startNew(name=""){setSavedGuarantorId(undefined);setEditingSaved(false);setGuarantorNotice("");setDraft(current=>({...current,guarantor:{name,parentage:"",cnic:"",phone:"",address:"",carAmount:0}}))}
  function clearGuarantor(){setSavedGuarantorId(undefined);setEditingSaved(false);setGuarantorQuery("");setDraft(current=>({...current,guarantor:null}))}

  if(!guarantor){
    const query=guarantorQuery.trim().toLowerCase();
    const digits=query.replace(/\D/g,"");
    const matches=savedGuarantors.filter(item=>!query||`${item.name} ${item.parentage} ${item.phone} ${item.address}`.toLowerCase().includes(query)||(digits.length>2&&`${item.cnic}${item.phone}`.replace(/\D/g,"").includes(digits)));
    const visible=matches.slice(0,query?8:4);
    const savedCnics=new Set(savedGuarantors.map(item=>item.cnic.replace(/\D/g,"")).filter(Boolean));
    const customerMatches=query?customerCandidates.filter(item=>item.id!==draft.customerId&&!savedCnics.has(item.cnic.replace(/\D/g,""))&&(item.name.toLowerCase().includes(query)||(digits.length>2&&`${item.cnic}${item.phone}`.replace(/\D/g,"").includes(digits)))).slice(0,5):[];
    return <section className="rounded-xl border border-[#E4E7EC] bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="flex gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#EFF8FF] text-[#006FE6]"><ShieldCheck size={19}/></span><div><h3 className="text-sm font-bold text-[#1D2939]">Guarantor <span className="font-normal text-[#667085]">(optional)</span></h3><p className="mt-1 text-xs text-[#667085]">Pick someone who stood guarantee before, or add a new guarantor.</p></div></div><Button type="button" size="sm" variant="secondary" className="shrink-0" onClick={()=>startNew()}><Plus size={15}/>New guarantor</Button></div>
      {savedGuarantors.length>0&&<div className="mt-4">
        <label className="flex h-11 items-center gap-2 rounded-[9px] border border-[#D0D5DD] px-3 focus-within:border-[#006FE6] focus-within:ring-2 focus-within:ring-[#006FE6]/10"><Search size={16} className="shrink-0 text-[#667085]"/><input aria-label="Search saved guarantors" value={guarantorQuery} onChange={event=>setGuarantorQuery(event.target.value)} placeholder="Search name, phone or CNIC…" className="w-full bg-transparent text-sm outline-none placeholder:text-[#667085]"/>{guarantorQuery&&<button type="button" aria-label="Clear search" onClick={()=>setGuarantorQuery("")} className="grid size-7 place-items-center rounded text-[#667085] hover:bg-[#F2F4F7]"><X size={14}/></button>}</label>
        {visible.length?<ul className="mt-2 divide-y divide-[#EAECF0] overflow-hidden rounded-xl border border-[#E4E7EC]" aria-label="Saved guarantors">{visible.map(item=><li key={item.id}><button type="button" onClick={()=>pickSaved(item)} className="flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-[#F5FAFF] focus-visible:bg-[#F5FAFF] focus-visible:outline-none">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#F2F4F7] text-xs font-bold text-[#475467]">{initials(item.name)}</span>
          <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-[#19191F]">{item.name}{item.parentage&&<span className="font-normal text-[#667085]"> · s/o {item.parentage}</span>}</strong><span className="mt-0.5 block truncate text-xs text-[#667085]">{[item.cnic,item.phone].filter(Boolean).join(" · ")||"No CNIC or phone saved"}</span></span>
          <span className="shrink-0 text-xs font-semibold text-[#006FE6]">Use</span>
        </button></li>)}</ul>
        :<div className="mt-2 rounded-xl border border-dashed border-[#D0D5DD] p-4 text-center text-sm text-[#667085]">No saved guarantor matches “{guarantorQuery}”.<div className="mt-2"><Button type="button" size="sm" variant="secondary" onClick={()=>startNew(/\d/.test(guarantorQuery)?"":guarantorQuery.trim())}><Plus size={15}/>Add as new guarantor</Button></div></div>}
        {matches.length>visible.length&&<p className="mt-2 text-xs text-[#667085]">Showing {visible.length} of {matches.length}. Search to narrow the list.</p>}
      </div>}
      {customerMatches.length>0&&<div className="mt-3"><p className="text-xs font-semibold text-[#475467]">Customers — use as guarantor</p><ul className="mt-1.5 divide-y divide-[#EAECF0] overflow-hidden rounded-xl border border-[#E4E7EC]" aria-label="Customers who can be guarantors">{customerMatches.map(item=><li key={item.id}><button type="button" disabled={savingGuarantor} onClick={()=>void pickCustomer(item.id)} className="flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-[#F5FAFF] disabled:opacity-60">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#F4F3FF] text-xs font-bold text-[#5925DC]">{initials(item.name)}</span>
        <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-[#19191F]">{item.name}</strong><span className="mt-0.5 block truncate text-xs text-[#667085]">Customer · {[item.cnic,item.phone].filter(Boolean).join(" · ")}</span></span>
        <span className="shrink-0 text-xs font-semibold text-[#006FE6]">Use</span>
      </button></li>)}</ul></div>}
      {guarantorNotice&&<p role="status" className="mt-2 text-xs text-[#B42318]">{guarantorNotice}</p>}
    </section>;
  }

  if(savedGuarantorId&&!editingSaved)return <section className="rounded-xl border border-[#B2DDFF] bg-[#F5FAFF] p-4">
    <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-sm font-bold text-[#006FE6] ring-1 ring-[#B2DDFF]">{initials(guarantor.name)}</span><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-[#175CD3]">Guarantor · saved record</p><h3 className="truncate text-base font-bold text-[#19191F]">{guarantor.name}</h3>{guarantor.parentage&&<p className="text-xs text-[#667085]">s/o {guarantor.parentage}</p>}</div><button type="button" onClick={clearGuarantor} className="grid size-9 shrink-0 place-items-center rounded-lg text-[#667085] hover:bg-white" aria-label="Remove guarantor"><X size={16}/></button></div>
    <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">{[["CNIC",guarantor.cnic||"Not provided"],["Phone",guarantor.phone||"Not provided"],["Car amount",guarantor.carAmount?formatPkr(guarantor.carAmount):"Not set"],["Address",guarantor.address||"Not provided"]].map(([label,value])=><div key={label} className="min-w-0 rounded-lg bg-white p-2.5 ring-1 ring-[#E4E7EC]"><dt className="text-[#667085]">{label}</dt><dd className="mt-0.5 truncate font-semibold text-[#344054]" title={value}>{value}</dd></div>)}</dl>
    <div className="mt-3 rounded-lg bg-white p-3 ring-1 ring-[#E4E7EC]"><p className="mb-2 text-xs font-semibold text-[#344054]">CNIC &amp; driving license images</p><PersonDocuments key={savedGuarantorId} owner="guarantor" ownerId={savedGuarantorId} compact/></div>
    <div className="mt-3 flex flex-wrap gap-2"><Button type="button" size="sm" variant="secondary" onClick={()=>setEditingSaved(true)}><Pencil size={15}/>Edit for this booking</Button><Button type="button" size="sm" variant="ghost" onClick={clearGuarantor}>Choose a different guarantor</Button></div>
    {guarantorNotice&&<p role="status" className="mt-2 text-xs text-[#475467]">{guarantorNotice}</p>}
  </section>;

  return <section className="rounded-xl border border-[#B2DDFF] bg-[#F5FAFF] p-4">
    <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-bold text-[#1D2939]">{savedGuarantorId?"Edit guarantor details":"New guarantor"}</h3><p className="mt-1 text-xs text-[#667085]">{savedGuarantorId?"Changes apply to this booking. Save them to update the guarantor directory.":"Upload the guarantor CNIC to fill identity fields, then review every value."}</p></div><button type="button" onClick={clearGuarantor} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#667085] hover:bg-white" aria-label="Remove guarantor"><X size={16}/></button></div>
    {savedGuarantors.length>0&&!savedGuarantorId&&<button type="button" onClick={clearGuarantor} className="mt-2 text-xs font-semibold text-[#006FE6] hover:underline">Pick a saved guarantor instead</button>}
    {bookingReference&&<div className="mt-4 flex flex-col gap-2 sm:flex-row"><CnicDocumentDrawer label="Guarantor CNIC" subjectLabel="guarantor" intake={intake} loading={loading} uploading={uploading} error={error} onRefresh={()=>void refresh()} onUpload={(side,file)=>void upload(side,file)}/><CnicDocumentDrawer label="Guarantor licence" subjectLabel="guarantor" documentLabel="Licence" backOptional intake={license.intake} loading={license.loading} uploading={license.uploading} error={license.error} onRefresh={()=>void license.refresh()} onUpload={(side,file)=>void license.upload(side,file)}/></div>}
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <FormInput label="Name" required value={guarantor.name} onChange={e=>update({name:e.target.value})}/>
      <FormInput label="Parentage" value={guarantor.parentage} onChange={e=>update({parentage:e.target.value})}/>
      <FormInput label="CNIC (optional)" placeholder="35202-1234567-1" value={guarantor.cnic} onChange={e=>update({cnic:e.target.value})}/>
      <FormInput label="Phone" type="tel" placeholder="03001234567" value={guarantor.phone} onChange={e=>update({phone:e.target.value})}/>
      <FormInput label="Amount of car (PKR)" type="number" min={0} value={guarantor.carAmount||""} onChange={e=>update({carAmount:Number(e.target.value)})}/>
      <FormInput label="Licence number (optional)" value={guarantor.licenseNumber??""} onChange={e=>update({licenseNumber:e.target.value.toUpperCase()})}/>
      <FormInput label="Licence expiry (optional)" type="date" value={guarantor.licenseExpiresAt??""} onChange={e=>update({licenseExpiresAt:e.target.value||undefined})}/>
      <label className="text-sm font-semibold text-[#344054] sm:col-span-2">Address<textarea className="mt-1.5 min-h-20 w-full rounded-[9px] border border-[#D0D5DD] bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[#006FE6] focus:ring-2 focus:ring-[#006FE6]/10" value={guarantor.address} onChange={e=>update({address:e.target.value})} placeholder="Address printed on CNIC"/></label>
    </div>
    {!isGuarantorComplete(guarantor)&&<p className="mt-3 text-xs text-[#B54708]">Enter a guarantor name. Any other details provided must be valid.</p>}
    {isGuarantorComplete(guarantor)&&<div className="mt-3 flex flex-wrap gap-2"><Button type="button" size="sm" variant="secondary" disabled={savingGuarantor} onClick={()=>void saveToDirectory()}>{savingGuarantor?"Saving…":savedGuarantorId?"Update saved guarantor":"Save guarantor for future bookings"}</Button>{savedGuarantorId&&<Button type="button" size="sm" variant="ghost" onClick={()=>setEditingSaved(false)}>Done editing</Button>}</div>}
    {guarantorNotice&&<p role="status" className="mt-2 text-xs text-[#475467]">{guarantorNotice}</p>}
  </section>;
}

function initials(name:string){return name.trim().split(/\s+/).slice(0,2).map(part=>part[0]?.toUpperCase()??"").join("")||"G"}

// ─── Pricing step ────────────────────────────────────────────────────────────

function PricingStep({ draft, setDraft, days, total, tripTotal, baseRate, cityRate }: { draft: Draft; setDraft: (value: Draft) => void; days: number; total: number; tripTotal: number; baseRate?: number; cityRate?: number }) {
  const rateChanged = Boolean(baseRate) && draft.dailyRate !== baseRate;
  const supplierPayable=draft.external.pricingMode==="percentage"?Math.round(Math.max(0,total-tripTotal)*draft.external.supplierSharePercent/100):draft.external.supplierFixedCost;
  const charges = draft.tripCharges ?? [];
  const setCharges = (next: TripChargeDraft[]) => setDraft({ ...draft, tripCharges: next });
  const withDriver = draft.rentalMode === "with_driver";
  return (
    <div className="grid gap-x-4 gap-y-3 sm:grid-cols-3">
      {withDriver && !cityRate && <p className="rounded-lg border border-[#B2DDFF] bg-[#EFF8FF] p-3 text-xs text-[#175CD3] sm:col-span-3">No price is saved for {draft.city || "this city"}, so this with-driver trip starts with no amount. Enter the agreed rent per day, or leave it at 0 and settle it after the trip. Toll tax, fuel and driver expenses go below — everything can be changed later from the booking.</p>}
      <FormInput label={withDriver ? "Rent per day (PKR)" : "Daily rate (PKR)"} type="number" inputMode="numeric" min={0} value={draft.dailyRate||""} placeholder="0 = agree later" onChange={(e)=>setDraft({...draft,dailyRate:Number(e.target.value)||0,rateTouched:true})} hint={`${days} day${days===1?"":"s"}${baseRate?` · saved ${cityRate?`${draft.city} `:""}price ${formatPkr(baseRate)}`:""}${baseRate&&draft.dailyRate!==baseRate?" · changed":""}`} />
      <FormInput label="Deposit (optional)" type="number" inputMode="numeric" min={0} value={draft.deposit||""} placeholder="None" onChange={(e) => setDraft({ ...draft, deposit: Number(e.target.value) })} />
      <FormInput label="Discount" type="number" inputMode="numeric" min={0} value={draft.discount||""} placeholder="0" onChange={(e) => setDraft({ ...draft, discount: Number(e.target.value) })} />
      {draft.fulfillmentType==="fleet"&&rateChanged&&<div className="flex flex-col gap-2 sm:col-span-3 sm:flex-row sm:items-end"><button type="button" onClick={()=>setDraft({...draft,dailyRate:baseRate??0,rateTouched:false})} className="h-10 shrink-0 rounded-[9px] border border-[#D0D5DD] px-3 text-sm font-semibold text-[#344054] hover:bg-[#F8FAFC]">Use saved price {formatPkr(baseRate??0)}</button><div className="flex-1"><FormInput label="Note on the negotiated rate (optional)" value={draft.overrideReason} onChange={(e)=>setDraft({...draft,overrideReason:e.target.value})} placeholder="e.g. regular customer, 3-day package"/></div></div>}
      <section className="rounded-xl border border-[#E4E7EC] p-3 sm:col-span-3" aria-label="Trip charges">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-bold text-[#1D2939]">Trip charges <span className="font-normal text-[#667085]">(optional)</span></h3><p className="text-xs text-[#667085]">Toll tax, fuel, driver expense or parking billed to the customer. Editable after booking too.</p></div><Button type="button" size="sm" variant="secondary" onClick={()=>setCharges([...charges,{kind:withDriver?"toll":"other",description:"",amount:0}])}><Plus size={15}/>Add charge</Button></div>
        {charges.length>0&&<div className="mt-3 space-y-2">{charges.map((charge,index)=><div key={index} className="grid gap-2 rounded-lg bg-[#F8FAFC] p-2 sm:grid-cols-[150px_1fr_140px_auto] sm:items-end">
          <FormSelect label="Type" value={charge.kind} onChange={e=>setCharges(charges.map((item,i)=>i===index?{...item,kind:e.target.value as TripChargeKind}:item))} options={tripChargeOptions}/>
          <FormInput label="Details" value={charge.description} placeholder="e.g. M-2 Lahore–Islamabad" onChange={e=>setCharges(charges.map((item,i)=>i===index?{...item,description:e.target.value}:item))}/>
          <FormInput label="Amount (PKR)" type="number" inputMode="numeric" min={1} value={charge.amount||""} onChange={e=>setCharges(charges.map((item,i)=>i===index?{...item,amount:Number(e.target.value)||0}:item))} error={charge.amount<=0?"Enter an amount":undefined}/>
          <button type="button" onClick={()=>setCharges(charges.filter((_,i)=>i!==index))} className="grid h-10 w-10 place-items-center rounded-lg text-[#B42318] hover:bg-white" aria-label="Remove charge"><Trash2 size={16}/></button>
        </div>)}<p className="text-right text-xs font-semibold text-[#344054]">Trip charges total {formatPkr(tripTotal)}</p></div>}
      </section>
      <details className="sm:col-span-3" open={Boolean(draft.extras||draft.estimatedKm||draft.notes)}>
        <summary className="cursor-pointer text-sm font-semibold text-[#475467]">Extras, trip distance, notes</summary>
        <div className="mt-3 grid gap-x-4 gap-y-3 sm:grid-cols-3">
          <FormInput label="Extras (PKR)" type="number" inputMode="numeric" value={draft.extras||""} placeholder="0" onChange={(e) => setDraft({ ...draft, extras: Number(e.target.value) })} />
          <FormInput label="Trip distance (km)" type="number" inputMode="numeric" min={0} value={draft.estimatedKm||""} placeholder="0" onChange={(e)=>setDraft({...draft,estimatedKm:Number(e.target.value)})}/>
          <FormInput label="Notes" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        </div>
      </details>
      {draft.fulfillmentType==="external"&&<div className="space-y-4 rounded-xl border border-[#B2DDFF] bg-[#F5FAFF] p-4 sm:col-span-2"><div><h3 className="text-sm font-bold text-[#175CD3]">Supplier terms</h3><p className="mt-1 text-xs text-[#475467]">83/17 is the default. The percentage applies to the rent, not to trip charges.</p></div><div className="grid gap-4 sm:grid-cols-2"><FormSelect label="Arrangement" value={draft.external.pricingMode} onChange={e=>setDraft({...draft,external:{...draft.external,pricingMode:e.target.value as "percentage"|"fixed"}})} options={[{label:"Percentage split",value:"percentage"},{label:"Fixed supplier cost",value:"fixed"}]}/>{draft.external.pricingMode==="percentage"?<FormInput label="Supplier share (%)" type="number" min={0} max={100} value={draft.external.supplierSharePercent} onChange={e=>setDraft({...draft,external:{...draft.external,supplierSharePercent:Number(e.target.value)}})}/>:<FormInput label="Supplier cost (PKR)" type="number" min={0} value={draft.external.supplierFixedCost} onChange={e=>setDraft({...draft,external:{...draft.external,supplierFixedCost:Number(e.target.value)}})}/>}</div><div className="grid grid-cols-3 gap-2 text-sm"><div className="rounded-lg bg-white p-3"><p className="text-xs text-[#667085]">Customer total</p><strong>{formatPkr(total)}</strong></div><div className="rounded-lg bg-white p-3"><p className="text-xs text-[#667085]">Supplier gets</p><strong>{formatPkr(supplierPayable)}</strong></div><div className="rounded-lg bg-white p-3"><p className="text-xs text-[#667085]">Your commission</p><strong className={total-tripTotal-supplierPayable<0?"text-[#B42318]":"text-[#067647]"}>{formatPkr(total-tripTotal-supplierPayable)}</strong></div></div></div>}
    </div>
  );
}

function HandoverStep({draft,setDraft,lastOdometer}:{draft:Draft;setDraft:(value:Draft)=>void;lastOdometer?:number}){
  const update=(values:Partial<Draft["checkout"]>)=>setDraft({...draft,checkout:{...draft.checkout,...values}});
  return <div>
    <div className="flex items-start gap-3 rounded-xl border border-[#B2DDFF] bg-[#EFF8FF] p-4"><CarFront className="mt-0.5 shrink-0 text-[#006FE6]" size={20}/><div><h2 className="font-bold text-[#175CD3]">Handover inspection</h2><p className="mt-1 text-xs text-[#475467]">Confirming this step creates the booking and checks the vehicle out atomically.</p></div></div>
    <div className="mt-5 grid gap-4 sm:grid-cols-2"><FormInput label="Handover odometer (km)" type="number" min={0} value={draft.checkout.odometer||""} placeholder={lastOdometer!==undefined?String(lastOdometer):undefined} hint={lastOdometer!==undefined?`Last recorded reading: ${lastOdometer.toLocaleString("en-PK")} km`:undefined} error={lastOdometer!==undefined&&draft.checkout.odometer>0&&draft.checkout.odometer<lastOdometer?`Lower than the last recorded reading (${lastOdometer.toLocaleString("en-PK")} km).`:undefined} onChange={e=>update({odometer:Number(e.target.value)})}/><SegmentedControl label="Handover fuel" value={draft.checkout.fuelLevel} onChange={value=>update({fuelLevel:value})} options={["Full","3/4","1/2","1/4","Empty"].map(level=>({label:level,value:level}))}/><label className="text-sm font-semibold text-[#344054] sm:col-span-2">Vehicle condition at handover<textarea className="mt-1.5 min-h-24 w-full rounded-[9px] border border-[#D0D5DD] p-3 text-sm font-normal outline-none focus:border-[#006FE6] focus:ring-2 focus:ring-[#006FE6]/10" value={draft.checkout.conditionNotes} onChange={e=>update({conditionNotes:e.target.value})}/></label></div>
  </div>;
}

const toLocalInput = toWallInput;
function addDays(from: string, days: number) { const date = from ? new Date(from) : zonedNow(); date.setDate(date.getDate() + days); return toLocalInput(date); }
function endOfDay(from: string) { const date = from ? new Date(from) : zonedNow(); date.setHours(23, 59, 0, 0); return toLocalInput(date); }
function pickupPresets() {
  const now = zonedNow(); now.setSeconds(0, 0); now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15);
  const tomorrow = zonedNow(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(9, 0, 0, 0);
  const evening = zonedNow(); evening.setHours(18, 0, 0, 0);
  return [{ label: "Now", value: toLocalInput(now) }, ...(evening > now ? [{ label: "Today 6 pm", value: toLocalInput(evening) }] : []), { label: "Tomorrow 9 am", value: toLocalInput(tomorrow) }];
}
function PresetChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-pressed={active} onClick={onClick} className={`h-7 rounded-full border px-2.5 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#006FE6] ${active ? "border-[#006FE6] bg-[#EFF8FF] text-[#0058B8]" : "border-[#D0D5DD] bg-white text-[#344054] hover:bg-[#F8FAFC]"}`}>{children}</button>;
}
