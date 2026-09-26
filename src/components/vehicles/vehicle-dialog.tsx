"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState, type FormEvent } from "react";
import { CarFront, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormInput, FormSelect } from "@/components/forms/form-controls";
import type { Vehicle } from "@/lib/mock-data";

const blank: Vehicle = { id: "", plate: "", make: "", model: "", year: 2024, category: "Sedan", city: "Lahore", ownership: "Own", status: "Available", dailyRate: 8000, color: "", transmission: "Automatic", fuel: "Petrol" };

export function VehicleDialog({ open, onOpenChange, vehicle, onSave }: { open: boolean; onOpenChange: (open: boolean) => void; vehicle?: Vehicle; onSave: (vehicle: Vehicle) => void }) {
  const [form, setForm] = useState<Vehicle>(() => vehicle ?? { ...blank, id: `v-${Date.now()}` });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const update = (key: keyof Vehicle, value: string | number) => setForm((current) => ({ ...current, [key]: value }));
  function submit(event: FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!form.plate.trim()) nextErrors.plate = "Plate number is required.";
    if (!form.make.trim()) nextErrors.make = "Make is required.";
    if (!form.model.trim()) nextErrors.model = "Model is required.";
    if (form.dailyRate < 1000) nextErrors.dailyRate = "Enter a valid daily rate.";
    if (form.ownership === "Managed" && !form.owner?.trim()) nextErrors.owner = "Select or enter the vehicle owner.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    onSave({ ...form, plate: form.plate.toUpperCase() }); onOpenChange(false);
  }
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-[#101828]/45 backdrop-blur-[1px]"/><Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-[calc(100%-32px)] sm:max-w-3xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"><div className="sticky top-0 z-10 flex items-start justify-between border-b border-[#EAECF0] bg-white px-5 py-4 sm:px-6"><div className="flex gap-3"><span className="grid h-10 w-10 place-items-center rounded-[10px] bg-[#EAF4FF] text-[#006FE6]"><CarFront size={20}/></span><div><Dialog.Title className="text-lg font-bold">{vehicle ? "Edit vehicle" : "Add new vehicle"}</Dialog.Title><Dialog.Description className="mt-0.5 text-xs text-[#667085]">Keep fleet details accurate for bookings and reports.</Dialog.Description></div></div><Dialog.Close className="grid h-9 w-9 place-items-center rounded-lg text-[#667085] hover:bg-[#F2F4F7]"><X size={19}/><span className="sr-only">Close</span></Dialog.Close></div><form onSubmit={submit}><div className="grid gap-5 px-5 py-6 sm:grid-cols-2 sm:px-6"><FormInput label="Plate number" placeholder="e.g. LEB-218" value={form.plate} onChange={(e) => update("plate", e.target.value)} error={errors.plate} required/><FormSelect label="Current status" value={form.status} onChange={(e) => update("status", e.target.value)} options={["Available", "Booked", "Maintenance", "Out of Service"]}/><FormInput label="Make" placeholder="e.g. Honda" value={form.make} onChange={(e) => update("make", e.target.value)} error={errors.make} required/><FormInput label="Model" placeholder="e.g. City Aspire" value={form.model} onChange={(e) => update("model", e.target.value)} error={errors.model} required/><FormInput label="Year" type="number" min={2000} max={2030} value={form.year} onChange={(e) => update("year", Number(e.target.value))} required/><FormInput label="Color" placeholder="e.g. Pearl White" value={form.color} onChange={(e) => update("color", e.target.value)}/><FormSelect label="Category" value={form.category} onChange={(e) => update("category", e.target.value)} options={["Economy", "Sedan", "SUV"]}/><FormSelect label="Current city" value={form.city} onChange={(e) => update("city", e.target.value)} options={["Lahore", "Islamabad", "Rawalpindi", "Karachi"]}/><FormSelect label="Ownership" value={form.ownership} onChange={(e) => update("ownership", e.target.value)} options={["Own", "Managed"]}/>{form.ownership === "Managed" ? <FormInput label="Vehicle owner" placeholder="Owner name" value={form.owner ?? ""} onChange={(e) => update("owner", e.target.value)} error={errors.owner} required/> : <div className="hidden sm:block"/>}<FormInput label="Daily rate (PKR)" type="number" min={1000} step={500} value={form.dailyRate} onChange={(e) => update("dailyRate", Number(e.target.value))} error={errors.dailyRate} required/><FormSelect label="Transmission" value={form.transmission} onChange={(e) => update("transmission", e.target.value)} options={["Automatic", "Manual"]}/><FormSelect label="Fuel type" value={form.fuel} onChange={(e) => update("fuel", e.target.value)} options={["Petrol", "Hybrid", "Diesel"]}/></div><div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-[#EAECF0] bg-white px-5 py-4 sm:flex-row sm:justify-end sm:px-6"><Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit">{vehicle ? "Save changes" : "Add vehicle"}</Button></div></form></Dialog.Content></Dialog.Portal></Dialog.Root>;
}
