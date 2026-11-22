"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, CarFront, LoaderCircle, Plus, Trash2, X } from "lucide-react";
import { saveOwnerAction } from "@/app/actions/owners";
import { getVehicleFormOptionsAction } from "@/app/actions/vehicles";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/forms/segmented-control";
import { FormCombobox } from "@/components/forms/form-combobox";
import { FormInput, FormSelect } from "@/components/forms/form-controls";
import type { RepositoryResult } from "@/lib/repositories/repository";
import type { Vehicle } from "@/types/vehicle";
import { PersonDocuments } from "@/components/shared/person-documents";

const vehicleDocSlots = [
  { slot: "registration_front", label: "Registration card front" },
  { slot: "registration_back", label: "Registration card back" },
  { slot: "owner_cnic_front", label: "Owner CNIC front" },
  { slot: "owner_cnic_back", label: "Owner CNIC back" },
] as const;
type VehicleDocSlot = (typeof vehicleDocSlots)[number]["slot"];

const blank: Vehicle = {
  id: "",
  plate: "",
  chassisNumber: "",
  engineNumber: "",
  make: "",
  model: "",
  year: new Date().getFullYear(),
  category: "Sedan",
  city: "Lahore",
  ownership: "Own",
  status: "Available",
  // No invented prices: staff type the real rate.
  dailyRate: 0,
  withDriverRate: 0,
  color: "",
  transmission: "Automatic",
  fuel: "Petrol",
};

const MAX_PHOTOS = 5;

export function VehicleDialog({
  open,
  onOpenChange,
  vehicle,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle?: Vehicle;
  onSave: (vehicle: Vehicle) => Promise<RepositoryResult<Vehicle>>;
}) {
  const [form, setForm] = useState<Vehicle>(
    () => vehicle ?? { ...blank, id: `v-${Date.now()}` },
  );
  const [initialSnapshot] = useState(() => JSON.stringify(form));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [options, setOptions] = useState<{branches:Array<{id:string;name:string;city:string}>;owners:Array<{id:string;name:string;phone:string}>;defaultCity:string}>({branches:[],owners:[],defaultCity:""});
  const [addingOwner, setAddingOwner] = useState(false);
  const [ownerForm, setOwnerForm] = useState({ name: "", phone: "", email: "" });
  const [ownerError, setOwnerError] = useState("");
  const [savingOwner, setSavingOwner] = useState(false);
  // Photos picked while adding a car upload right after the vehicle is created (it needs an id first).
  const [photos, setPhotos] = useState<Array<{ file: File; url: string }>>([]);
  const [photoIssue, setPhotoIssue] = useState("");
  // Registration card and owner CNIC picked while adding a car; uploaded once the vehicle exists.
  const [docFiles, setDocFiles] = useState<Partial<Record<VehicleDocSlot, File>>>({});
  const photoUrls = useRef<string[]>([]);
  useEffect(() => () => photoUrls.current.forEach(url => URL.revokeObjectURL(url)), []);
  function addPhotos(files: FileList | null) {
    const picked = [...(files ?? [])].filter(file => ["image/jpeg", "image/png", "image/webp"].includes(file.type) && file.size <= 8 * 1024 * 1024);
    const added = picked.slice(0, Math.max(0, MAX_PHOTOS - photos.length)).map(file => ({ file, url: URL.createObjectURL(file) }));
    photoUrls.current.push(...added.map(photo => photo.url));
    setPhotos(current => [...current, ...added].slice(0, MAX_PHOTOS));
    if (picked.length < (files?.length ?? 0)) setErrors(current => ({ ...current, photos: "Only JPG, PNG or WebP photos up to 8 MB each are accepted." }));
    else setErrors(current => { const next = { ...current }; delete next.photos; return next; });
  }
  const update = (key: keyof Vehicle, value: string | number) =>
    setForm((current) => ({ ...current, [key]: value }));
  const dirty = JSON.stringify(form) !== initialSnapshot;
  useEffect(() => {
    let active = true;
    void getVehicleFormOptionsAction().then(result => {
      if (!active || !result.ok) return;
      setOptions(result.data);
      if (!vehicle && result.data.defaultCity) setForm(current => ({ ...current, city: result.data.defaultCity }));
    });
    return () => { active = false; };
  }, [vehicle]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const requestClose = () => {
    if (!dirty || window.confirm("Discard unsaved vehicle changes?"))
      onOpenChange(false);
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!form.plate.trim()) nextErrors.plate = "Plate number is required.";
    if (!form.chassisNumber?.trim()) nextErrors.chassisNumber = "Chassis number is required.";
    if (!form.engineNumber?.trim()) nextErrors.engineNumber = "Engine number is required.";
    if (!form.make.trim()) nextErrors.make = "Make is required.";
    if (!form.model.trim()) nextErrors.model = "Model is required.";
    if (form.dailyRate < 1000)
      nextErrors.dailyRate = "Enter a valid daily rate.";
    if ((form.withDriverRate??0) < form.dailyRate)
      nextErrors.withDriverRate = "With-driver rate must be at least the self-drive rate.";
    if (form.ownership === "Managed" && !form.ownerId?.trim())
      nextErrors.owner = "Select or enter the vehicle owner.";
    if (
      form.ownership === "Managed" &&
      (!form.agreement?.effectiveFrom || !form.agreement.effectiveTo)
    )
      nextErrors.agreement = "Agreement start and end dates are required.";
    if (
      form.ownership === "Managed" &&
      form.agreement &&
      form.agreement.effectiveFrom > form.agreement.effectiveTo
    )
      nextErrors.agreement = "Agreement end date must be after its start date.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSaving(true);
    const result = await onSave({ ...form, plate: form.plate.toUpperCase() });
    if (!result.ok) {
      setSaving(false);
      setErrors((current) => ({
        ...current,
        [result.error.field ?? "form"]: result.error.message,
      }));
      return;
    }
    let failed = 0;
    for (const photo of vehicle ? [] : photos) {
      const data = new FormData();
      data.set("vehicleId", result.data.id); data.set("classification", "vehicle_photo"); data.set("file", photo.file);
      try { const response = await fetch("/api/v1/files", { method: "POST", body: data }); if (!response.ok) failed += 1; }
      catch { failed += 1; }
    }
    for (const [slot, file] of vehicle ? [] : Object.entries(docFiles)) {
      if (!file) continue;
      const data = new FormData();
      data.set("owner", "vehicle"); data.set("id", result.data.id); data.set("slot", slot); data.set("file", file);
      try { const response = await fetch("/api/v1/person-documents", { method: "POST", body: data }); if (!response.ok) failed += 1; }
      catch { failed += 1; }
    }
    setSaving(false);
    if (failed) {
      setPhotoIssue(`${result.data.plate} was added, but ${failed} image${failed === 1 ? "" : "s"} could not be uploaded. Add ${failed === 1 ? "it" : "them"} from the vehicle's Media tab.`);
      return;
    }
    onOpenChange(false);
  }
  async function createOwner() {
    if (!ownerForm.name.trim() || !ownerForm.phone.trim() || savingOwner) return;
    setSavingOwner(true);
    setOwnerError("");
    const result = await saveOwnerAction(ownerForm);
    setSavingOwner(false);
    if (!result.ok) {
      setOwnerError(result.error.message);
      return;
    }
    const owner = { id: result.data.id, name: result.data.name, phone: result.data.phone };
    setOptions(current => ({ ...current, owners: [...current.owners, owner].sort((a,b) => a.name.localeCompare(b.name)) }));
    setForm(current => ({
      ...current,
      ownerId: owner.id,
      owner: owner.name,
      agreement: {
        ...(current.agreement ?? { effectiveFrom: new Date().toISOString().slice(0, 10), effectiveTo: "", shareMethod: "Percentage", ownerShare: 70, expenseResponsibility: "Shared", payoutFrequency: "Monthly" }),
        ownerId: owner.id,
      },
    }));
    setOwnerForm({ name: "", phone: "", email: "" });
    setAddingOwner(false);
  }
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (saving) return;
        if (!nextOpen) requestClose();
        else onOpenChange(true);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#101828]/45 backdrop-blur-[1px]" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-[calc(100%-32px)] sm:max-w-3xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl">
          <div className="sticky top-0 z-10 flex items-start justify-between border-b border-[#EAECF0] bg-white px-5 py-4 sm:px-6">
            <div className="flex gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-[10px] bg-[#EAF4FF] text-[#006FE6]">
                <CarFront size={20} />
              </span>
              <div>
                <Dialog.Title className="text-lg font-bold">
                  {vehicle ? "Edit vehicle" : "Add new vehicle"}
                </Dialog.Title>
                <Dialog.Description className="mt-0.5 text-xs text-[#667085]">
                  Keep fleet details accurate for bookings and reports.
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close
              disabled={saving}
              className="grid h-9 w-9 place-items-center rounded-lg text-[#667085] hover:bg-[#F2F4F7] disabled:opacity-50"
            >
              <X size={19} />
              <span className="sr-only">Close</span>
            </Dialog.Close>
          </div>
          <form onSubmit={submit}>
            <div className="grid gap-5 px-5 py-6 sm:grid-cols-2 sm:px-6">
              <FormInput
                label="Plate number"
                placeholder="e.g. LEB-218"
                value={form.plate}
                onChange={(e) => update("plate", e.target.value)}
                error={errors.plate}
                required
              />
              {vehicle ? (
                <div>
                  <p className="mb-1.5 text-sm font-semibold text-[#344054]">
                    Current status
                  </p>
                  <div className="flex h-11 items-center rounded-[9px] border border-[#EAECF0] bg-[#F8FAFC] px-3 text-sm text-[#475467]">
                    Use Change status from the vehicle record
                  </div>
                </div>
              ) : (
                <SegmentedControl
                  label="Starts as"
                  value={form.status}
                  onChange={(value) => update("status", value)}
                  options={["Available", "Maintenance", "Out of Service"].map((value) => ({ value, label: value }))}
                />
              )}
              <FormInput
                label="Make"
                placeholder="e.g. Honda"
                value={form.make}
                onChange={(e) => update("make", e.target.value)}
                error={errors.make}
                required
              />
              <FormInput
                label="Model"
                placeholder="e.g. City Aspire"
                value={form.model}
                onChange={(e) => update("model", e.target.value)}
                error={errors.model}
                required
              />
              <FormInput
                label="Year"
                type="number"
                min={2000}
                max={2030}
                value={form.year}
                onChange={(e) => update("year", Number(e.target.value))}
                required
              />
              <FormInput
                label="Color"
                placeholder="e.g. Pearl White"
                value={form.color}
                onChange={(e) => update("color", e.target.value)}
              />
              <SegmentedControl
                label="Category"
                value={form.category}
                onChange={(value) => update("category", value)}
                options={["Economy", "Sedan", "SUV"].map((value) => ({ value, label: value }))}
              />
              <FormSelect
                label="Current city"
                value={form.city}
                onChange={(e) => update("city", e.target.value)}
                options={options.branches.map(branch => branch.city)}
              />
              <SegmentedControl
                label="Ownership"
                value={form.ownership}
                onChange={(value) => update("ownership", value)}
                options={[{ value: "Own", label: "Agency owned" }, { value: "Managed", label: "Owner's car (managed)" }]}
              />
              {form.ownership === "Managed" ? (
                <div>
                  <FormCombobox
                    label="Vehicle owner"
                    value={form.ownerId ?? ""}
                    onValueChange={(ownerId) => {
                      const owner = options.owners.find(item => item.id === ownerId);
                      setForm(current => ({
                        ...current,
                        ownerId: owner?.id,
                        owner: owner?.name,
                        agreement: {
                          ...(current.agreement ?? { effectiveFrom: new Date().toISOString().slice(0, 10), effectiveTo: "", shareMethod: "Percentage", ownerShare: 70, expenseResponsibility: "Shared", payoutFrequency: "Monthly" }),
                          ownerId: owner?.id ?? "",
                        },
                      }));
                    }}
                    options={[
                      { label: "Select an owner", value: "" },
                      ...options.owners.map(owner => ({ label: `${owner.name} · ${owner.phone}`, value: owner.id })),
                    ]}
                    searchPlaceholder="Search owner name or phone…"
                    required
                  />
                  <button type="button" onClick={() => { setAddingOwner(value => !value); setOwnerError(""); }} className="mt-2 inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-[#006FE6] hover:underline"><Plus size={14}/>{options.owners.length === 0 ? "No owners yet — add one here" : "Add new owner"}</button>
                </div>
              ) : (
                <div className="hidden sm:block" />
              )}
              {form.ownership === "Managed" && form.agreement && (
                <div className="rounded-xl border border-[#D9D6FE] bg-[#F9F5FF] p-4 sm:col-span-2">
                  <h3 className="text-sm font-bold text-[#42307D]">
                    Management agreement
                  </h3>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <FormInput
                      label="Effective from"
                      type="date"
                      value={form.agreement.effectiveFrom}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          agreement: {
                            ...current.agreement!,
                            effectiveFrom: e.target.value,
                          },
                        }))
                      }
                    />
                    <FormInput
                      label="Effective to"
                      type="date"
                      value={form.agreement.effectiveTo}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          agreement: {
                            ...current.agreement!,
                            effectiveTo: e.target.value,
                          },
                        }))
                      }
                    />
                    <FormSelect
                      label="Share method"
                      value={form.agreement.shareMethod}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          agreement: {
                            ...current.agreement!,
                            shareMethod: e.target.value as
                              | "Percentage"
                              | "Fixed monthly",
                          },
                        }))
                      }
                      options={["Percentage", "Fixed monthly"]}
                    />
                    <FormInput
                      label={
                        form.agreement.shareMethod === "Percentage"
                          ? "Owner share (%)"
                          : "Fixed monthly amount (PKR)"
                      }
                      type="number"
                      min={1}
                      max={
                        form.agreement.shareMethod === "Percentage"
                          ? 100
                          : undefined
                      }
                      value={form.agreement.ownerShare}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          agreement: {
                            ...current.agreement!,
                            ownerShare: Number(e.target.value),
                          },
                        }))
                      }
                    />
                    <FormSelect
                      label="Expense responsibility"
                      value={form.agreement.expenseResponsibility}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          agreement: {
                            ...current.agreement!,
                            expenseResponsibility: e.target.value as
                              | "Agency"
                              | "Owner"
                              | "Shared",
                          },
                        }))
                      }
                      options={["Agency", "Owner", "Shared"]}
                    />
                    <FormSelect
                      label="Payout frequency"
                      value={form.agreement.payoutFrequency}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          agreement: {
                            ...current.agreement!,
                            payoutFrequency: e.target.value as
                              | "Monthly"
                              | "Fortnightly",
                          },
                        }))
                      }
                      options={["Monthly", "Fortnightly"]}
                    />
                  </div>
                  {errors.owner && (
                    <p className="mt-3 text-xs text-[#B42318]">
                      {errors.owner}
                    </p>
                  )}
                  {errors.agreement && (
                    <p className="mt-3 text-xs text-[#B42318]">
                      {errors.agreement}
                    </p>
                  )}
                </div>
              )}
              {form.ownership === "Managed" && addingOwner && (
                <section className="rounded-xl border border-[#B2DDFF] bg-[#F5FAFF] p-4 sm:col-span-2" aria-label="Add owner inline">
                  <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-bold text-[#175CD3]">Add a new owner</h3><p className="mt-1 text-xs text-[#475467]">The owner will be saved and selected for this vehicle.</p></div><button type="button" aria-label="Close add owner form" onClick={() => setAddingOwner(false)} className="grid h-8 w-8 place-items-center rounded-lg text-[#667085] hover:bg-white"><X size={16}/></button></div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-3"><FormInput label="Owner / business name" value={ownerForm.name} onChange={event => setOwnerForm(current => ({...current,name:event.target.value}))} required/><FormInput label="Phone" value={ownerForm.phone} onChange={event => setOwnerForm(current => ({...current,phone:event.target.value}))} placeholder="0300 1234567" required/><FormInput label="Email" type="email" value={ownerForm.email} onChange={event => setOwnerForm(current => ({...current,email:event.target.value}))}/></div>
                  {ownerError && <p role="alert" className="mt-3 text-xs font-medium text-[#B42318]">{ownerError}</p>}
                  <div className="mt-4 flex justify-end gap-2"><Button type="button" size="sm" variant="secondary" disabled={savingOwner} onClick={() => setAddingOwner(false)}>Cancel</Button><Button type="button" size="sm" disabled={savingOwner || !ownerForm.name.trim() || !ownerForm.phone.trim()} onClick={() => void createOwner()}>{savingOwner && <LoaderCircle className="animate-spin" size={15}/>} {savingOwner ? "Saving…" : "Save and select owner"}</Button></div>
                </section>
              )}
              <FormInput
                label="Self-drive rate (PKR)"
                type="number"
                min={1000}
                step={500}
                value={form.dailyRate || ""}
                placeholder="e.g. 8000"
                onChange={(e) => update("dailyRate", Number(e.target.value))}
                error={errors.dailyRate}
                required
              />
              <FormInput label="With-driver rate (PKR)" type="number" min={form.dailyRate} step={500} value={form.withDriverRate||""} placeholder="e.g. 11000" onChange={(e)=>update("withDriverRate",Number(e.target.value))} error={errors.withDriverRate} required />
              <FormInput label="Vehicle value (PKR)" type="number" min={0} step={50000} value={form.vehicleValue||""} placeholder="e.g. 6500000" hint="Market value — shown to guarantors and on the agreement" onChange={(e)=>update("vehicleValue",Number(e.target.value))} error={errors.vehicleValue} />
              <SegmentedControl
                label="Transmission"
                value={form.transmission}
                onChange={(value) => update("transmission", value)}
                options={["Automatic", "Manual"].map((value) => ({ value, label: value }))}
              />
              <SegmentedControl
                label="Fuel type"
                value={form.fuel}
                onChange={(value) => update("fuel", value)}
                options={["Petrol", "Hybrid", "Diesel"].map((value) => ({ value, label: value }))}
              />
              <p className="-mb-2 border-t border-[#EAECF0] pt-4 text-sm font-bold text-[#344054] sm:col-span-2">Registration</p>
              <FormInput label="Chassis number" placeholder="e.g. MRHGM6650NP012345" value={form.chassisNumber??""} onChange={(e)=>update("chassisNumber",e.target.value)} error={errors.chassisNumber} required />
              <FormInput label="Engine number" placeholder="e.g. L15Z1-1234567" value={form.engineNumber??""} onChange={(e)=>update("engineNumber",e.target.value)} error={errors.engineNumber} required />

              <div className="rounded-xl border border-[#B2DDFF] bg-[#F5FAFF] p-4 sm:col-span-2">
                <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-bold text-[#175CD3]">Destination rates</h3><p className="mt-1 text-xs text-[#475467]">Optional city-specific daily and mileage rates. The standard daily rate is used when no rule matches.</p></div><Button type="button" size="sm" variant="secondary" onClick={()=>setForm(current=>({...current,rateRules:[...(current.rateRules??[]),{destinationCity:"",dailyRate:current.dailyRate,perKmRate:0,minimumDays:1}]}))}><Plus size={15}/>Add rate</Button></div>
                {(form.rateRules??[]).length>0&&<div className="mt-4 space-y-3">{(form.rateRules??[]).map((rule,index)=><div key={index} className="grid gap-3 rounded-lg bg-white p-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto] sm:items-end"><FormInput label="Going to city" value={rule.destinationCity} onChange={e=>setForm(current=>({...current,rateRules:current.rateRules?.map((item,i)=>i===index?{...item,destinationCity:e.target.value}:item)}))}/><FormInput label="Daily rate" type="number" min={1000} value={rule.dailyRate} onChange={e=>setForm(current=>({...current,rateRules:current.rateRules?.map((item,i)=>i===index?{...item,dailyRate:Number(e.target.value)}:item)}))}/><FormInput label="Per km" type="number" min={0} value={rule.perKmRate} onChange={e=>setForm(current=>({...current,rateRules:current.rateRules?.map((item,i)=>i===index?{...item,perKmRate:Number(e.target.value)}:item)}))}/><FormInput label="Minimum days" type="number" min={1} value={rule.minimumDays} onChange={e=>setForm(current=>({...current,rateRules:current.rateRules?.map((item,i)=>i===index?{...item,minimumDays:Number(e.target.value)}:item)}))}/><Button type="button" size="sm" variant="ghost" aria-label={`Remove ${rule.destinationCity||"rate"}`} onClick={()=>setForm(current=>({...current,rateRules:current.rateRules?.filter((_,i)=>i!==index)}))}><Trash2 size={16}/></Button></div>)}</div>}
              </div>
              {!vehicle && <section className="rounded-xl border border-[#E4E7EC] p-4 sm:col-span-2" aria-label="Vehicle photos">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><h3 className="text-sm font-bold text-[#1D2939]">Photos <span className="font-normal text-[#667085]">(optional)</span></h3><p className="mt-1 text-xs text-[#475467]">Add 3–5 photos: front, back, both sides and the interior. Up to {MAX_PHOTOS}, JPG, PNG or WebP, 8 MB each.</p></div>
                  <label className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-[9px] border border-[#D0D5DD] bg-white px-3 text-sm font-semibold hover:bg-[#F8FAFC] ${photos.length >= MAX_PHOTOS || saving ? "pointer-events-none opacity-50" : ""}`}><Camera size={16} />Add photos<input type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={photos.length >= MAX_PHOTOS || saving} onChange={event => { addPhotos(event.target.files); event.target.value = ""; }} /></label>
                </div>
                {photos.length > 0 && <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">{photos.map((photo, index) => <li key={photo.url} className="relative aspect-[4/3] overflow-hidden rounded-lg border border-[#EAECF0] bg-[#F2F4F7]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview before upload */}
                  <img src={photo.url} alt={`Photo ${index + 1}`} className="h-full w-full object-cover" />
                  <button type="button" disabled={saving} onClick={() => setPhotos(current => current.filter(item => item.url !== photo.url))} className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white hover:bg-black/75" aria-label={`Remove photo ${index + 1}`}><X size={14} /></button>
                </li>)}</ul>}
                <p className="mt-2 text-xs text-[#667085]">{photos.length} of {MAX_PHOTOS} selected{photos.length > 0 && photos.length < 3 ? " · 3 or more gives customers a better view" : ""}</p>
                {errors.photos && <p role="alert" className="mt-1 text-xs text-[#B42318]">{errors.photos}</p>}
              </section>}
              <section className="rounded-xl border border-[#E4E7EC] p-4 sm:col-span-2" aria-label="Registration card and owner CNIC">
                <h3 className="text-sm font-bold text-[#1D2939]">Registration card &amp; owner CNIC <span className="font-normal text-[#667085]">(optional)</span></h3>
                <p className="mt-1 mb-3 text-xs text-[#475467]">Both sides of the vehicle registration card and of the registered owner&apos;s CNIC. They are attached to rental agreements.</p>
                {vehicle ? <PersonDocuments owner="vehicle" ownerId={vehicle.id} compact /> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{vehicleDocSlots.map(({ slot, label }) => {
                  const file = docFiles[slot];
                  return <label key={slot} className={`flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed p-2 text-center text-xs ${file ? "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]" : "border-[#D0D5DD] bg-[#F8FAFC] text-[#475467] hover:bg-[#F0F7FF]"}`}>
                    <Camera size={16} /><span className="font-semibold">{label}</span><span className="max-w-full truncate">{file ? file.name : "Add image"}</span>
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={saving} onChange={event => { const picked = event.target.files?.[0]; event.target.value = ""; if (picked && picked.size <= 10 * 1024 * 1024) setDocFiles(current => ({ ...current, [slot]: picked })); }} />
                  </label>;
                })}</div>}
              </section>
              {photoIssue && <p role="alert" className="rounded-lg bg-[#FFFAEB] p-3 text-sm font-medium text-[#B54708] sm:col-span-2">{photoIssue}</p>}
              {errors.form && (
                <p
                  role="alert"
                  className="text-sm font-medium text-[#B42318] sm:col-span-2"
                >
                  {errors.form}
                </p>
              )}
            </div>
            <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-[#EAECF0] bg-white px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
              {photoIssue ? <Button type="button" onClick={() => onOpenChange(false)}>Done</Button> : <><Button
                type="button"
                variant="secondary"
                disabled={saving}
                onClick={requestClose}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <LoaderCircle className="animate-spin" size={17} />}{" "}
                {saving ? (photos.length && !vehicle ? "Saving and uploading photos…" : "Saving…") : vehicle ? "Save changes" : "Add vehicle"}
              </Button></>}
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
