"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { CarFront, LoaderCircle, Plus, Trash2, X } from "lucide-react";
import { getVehicleFormOptionsAction } from "@/app/actions/vehicles";
import { Button } from "@/components/ui/button";
import { FormInput, FormSelect } from "@/components/forms/form-controls";
import type { RepositoryResult } from "@/lib/repositories/repository";
import type { Vehicle } from "@/types/vehicle";

const blank: Vehicle = {
  id: "",
  plate: "",
  chassisNumber: "",
  engineNumber: "",
  make: "",
  model: "",
  year: 2024,
  category: "Sedan",
  city: "Lahore",
  ownership: "Own",
  status: "Available",
  dailyRate: 8000,
  withDriverRate: 11000,
  color: "",
  transmission: "Automatic",
  fuel: "Petrol",
};

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
    setSaving(false);
    if (!result.ok) {
      setErrors((current) => ({
        ...current,
        [result.error.field ?? "form"]: result.error.message,
      }));
      return;
    }
    onOpenChange(false);
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
              <FormInput label="Chassis number" placeholder="e.g. MRHGM6650NP012345" value={form.chassisNumber??""} onChange={(e)=>update("chassisNumber",e.target.value)} error={errors.chassisNumber} required />
              <FormInput label="Engine number" placeholder="e.g. L15Z1-1234567" value={form.engineNumber??""} onChange={(e)=>update("engineNumber",e.target.value)} error={errors.engineNumber} required />
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
                <FormSelect
                  label="Initial status"
                  value={form.status}
                  onChange={(e) => update("status", e.target.value)}
                  options={[
                    "Available",
                    "Booked",
                    "Maintenance",
                    "Out of Service",
                  ]}
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
              <FormSelect
                label="Category"
                value={form.category}
                onChange={(e) => update("category", e.target.value)}
                options={["Economy", "Sedan", "SUV"]}
              />
              <FormSelect
                label="Current city"
                value={form.city}
                onChange={(e) => update("city", e.target.value)}
                options={options.branches.map(branch => branch.city)}
              />
              <FormSelect
                label="Ownership"
                value={form.ownership}
                onChange={(e) => update("ownership", e.target.value)}
                options={["Own", "Managed"]}
              />
              {form.ownership === "Managed" ? (
                <div>
                  <label className="block text-sm font-semibold text-[#344054]">Vehicle owner <span className="text-[#D92D20]">*</span></label>
                  <select className="field mt-1.5" value={form.ownerId ?? ""} onChange={(e) => { const owner=options.owners.find(item=>item.id===e.target.value); setForm(current=>({...current,ownerId:owner?.id,owner:owner?.name,agreement:{...(current.agreement??{effectiveFrom:new Date().toISOString().slice(0,10),effectiveTo:"",shareMethod:"Percentage",ownerShare:70,expenseResponsibility:"Shared",payoutFrequency:"Monthly"}),ownerId:owner?.id??""}})); }} required>
                    <option value="">Select an owner</option>
                    {options.owners.map(owner=><option key={owner.id} value={owner.id}>{owner.name} · {owner.phone}</option>)}
                  </select>
                  {options.owners.length === 0 ? <Link href="/owners?new=1" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#006FE6]"><Plus size={14}/>No owners yet — add a new owner</Link> : <Link href="/owners?new=1" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#006FE6]"><Plus size={14}/>Add new owner</Link>}
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
              <FormInput
                label="Self-drive rate (PKR)"
                type="number"
                min={1000}
                step={500}
                value={form.dailyRate}
                onChange={(e) => update("dailyRate", Number(e.target.value))}
                error={errors.dailyRate}
                required
              />
              <FormInput label="With-driver rate (PKR)" type="number" min={form.dailyRate} step={500} value={form.withDriverRate??form.dailyRate} onChange={(e)=>update("withDriverRate",Number(e.target.value))} error={errors.withDriverRate} required />
              <FormSelect
                label="Transmission"
                value={form.transmission}
                onChange={(e) => update("transmission", e.target.value)}
                options={["Automatic", "Manual"]}
              />
              <FormSelect
                label="Fuel type"
                value={form.fuel}
                onChange={(e) => update("fuel", e.target.value)}
                options={["Petrol", "Hybrid", "Diesel"]}
              />
              <div className="rounded-xl border border-[#B2DDFF] bg-[#F5FAFF] p-4 sm:col-span-2">
                <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-bold text-[#175CD3]">Destination rates</h3><p className="mt-1 text-xs text-[#475467]">Optional city-specific daily and mileage rates. The standard daily rate is used when no rule matches.</p></div><Button type="button" size="sm" variant="secondary" onClick={()=>setForm(current=>({...current,rateRules:[...(current.rateRules??[]),{destinationCity:"",dailyRate:current.dailyRate,perKmRate:0,minimumDays:1}]}))}><Plus size={15}/>Add rate</Button></div>
                {(form.rateRules??[]).length>0&&<div className="mt-4 space-y-3">{(form.rateRules??[]).map((rule,index)=><div key={index} className="grid gap-3 rounded-lg bg-white p-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto] sm:items-end"><FormInput label="Going to city" value={rule.destinationCity} onChange={e=>setForm(current=>({...current,rateRules:current.rateRules?.map((item,i)=>i===index?{...item,destinationCity:e.target.value}:item)}))}/><FormInput label="Daily rate" type="number" min={1000} value={rule.dailyRate} onChange={e=>setForm(current=>({...current,rateRules:current.rateRules?.map((item,i)=>i===index?{...item,dailyRate:Number(e.target.value)}:item)}))}/><FormInput label="Per km" type="number" min={0} value={rule.perKmRate} onChange={e=>setForm(current=>({...current,rateRules:current.rateRules?.map((item,i)=>i===index?{...item,perKmRate:Number(e.target.value)}:item)}))}/><FormInput label="Minimum days" type="number" min={1} value={rule.minimumDays} onChange={e=>setForm(current=>({...current,rateRules:current.rateRules?.map((item,i)=>i===index?{...item,minimumDays:Number(e.target.value)}:item)}))}/><Button type="button" size="sm" variant="ghost" aria-label={`Remove ${rule.destinationCity||"rate"}`} onClick={()=>setForm(current=>({...current,rateRules:current.rateRules?.filter((_,i)=>i!==index)}))}><Trash2 size={16}/></Button></div>)}</div>}
              </div>
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
              <Button
                type="button"
                variant="secondary"
                disabled={saving}
                onClick={requestClose}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <LoaderCircle className="animate-spin" size={17} />}{" "}
                {saving ? "Saving…" : vehicle ? "Save changes" : "Add vehicle"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
