"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState, type FormEvent } from "react";
import { CarFront, LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormInput, FormSelect } from "@/components/forms/form-controls";
import type { RepositoryResult } from "@/lib/repositories/repository";
import type { Vehicle } from "@/types/vehicle";

const blank: Vehicle = {
  id: "",
  plate: "",
  make: "",
  model: "",
  year: 2024,
  category: "Sedan",
  city: "Lahore",
  ownership: "Own",
  status: "Available",
  dailyRate: 8000,
  color: "",
  transmission: "Automatic",
  fuel: "Petrol",
};

const ownerOptions = [
  "Farhan Qureshi",
  "Hassan Motors",
  "Sana Malik",
  "Usman Raza",
];

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
  const update = (key: keyof Vehicle, value: string | number) =>
    setForm((current) => ({ ...current, [key]: value }));
  const dirty = JSON.stringify(form) !== initialSnapshot;
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
    if (!form.make.trim()) nextErrors.make = "Make is required.";
    if (!form.model.trim()) nextErrors.model = "Model is required.";
    if (form.dailyRate < 1000)
      nextErrors.dailyRate = "Enter a valid daily rate.";
    if (form.ownership === "Managed" && !form.owner?.trim())
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
                options={["Lahore", "Islamabad", "Rawalpindi", "Karachi"]}
              />
              <FormSelect
                label="Ownership"
                value={form.ownership}
                onChange={(e) => update("ownership", e.target.value)}
                options={["Own", "Managed"]}
              />
              {form.ownership === "Managed" ? (
                <FormSelect
                  label="Vehicle owner"
                  value={form.owner ?? ""}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      owner: e.target.value,
                      agreement: current.agreement ?? {
                        ownerId: `OWN-${ownerOptions.indexOf(e.target.value) + 1}`,
                        effectiveFrom: "2026-09-01",
                        effectiveTo: "2027-08-31",
                        shareMethod: "Percentage",
                        ownerShare: 70,
                        expenseResponsibility: "Shared",
                        payoutFrequency: "Monthly",
                      },
                    }))
                  }
                  options={["Select owner", ...ownerOptions]}
                  required
                />
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
                label="Daily rate (PKR)"
                type="number"
                min={1000}
                step={500}
                value={form.dailyRate}
                onChange={(e) => update("dailyRate", Number(e.target.value))}
                error={errors.dailyRate}
                required
              />
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
