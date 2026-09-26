"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { useState, type FormEvent } from "react";
import {
  ArrowRightLeft,
  CircleDollarSign,
  LoaderCircle,
  Wrench,
  X,
} from "lucide-react";
import { FormInput, FormSelect } from "@/components/forms/form-controls";
import { Button } from "@/components/ui/button";
import type { Vehicle } from "@/types/vehicle";

export type VehicleOperation = "maintenance" | "transfer" | "rate";
const copy = {
  maintenance: {
    title: "Schedule maintenance",
    description: "Create a blocking service case.",
    Icon: Wrench,
  },
  transfer: {
    title: "Transfer vehicle",
    description: "Plan movement between operating cities.",
    Icon: ArrowRightLeft,
  },
  rate: {
    title: "Edit rate card",
    description: "Update the effective base rental rate.",
    Icon: CircleDollarSign,
  },
};
export function VehicleOperationDialog({
  mode,
  vehicle,
  open,
  onOpenChange,
  onComplete,
}: {
  mode: VehicleOperation;
  vehicle: Vehicle;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (update: Partial<Vehicle>, message: string) => Promise<void>;
}) {
  const meta = copy[mode];
  const Icon = meta.Icon;
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [category, setCategory] = useState("Routine service");
  const [date, setDate] = useState("2026-10-05");
  const [odometer, setOdometer] = useState("45000");
  const [destination, setDestination] = useState(
    vehicle.city === "Lahore" ? "Islamabad" : "Lahore",
  );
  const [agent, setAgent] = useState("Ali Raza");
  const [rate, setRate] = useState(vehicle.dailyRate);
  const [effective, setEffective] = useState("2026-10-01");
  const [notes, setNotes] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (mode === "maintenance" && !date)
      next.date = "Service date is required.";
    if (mode === "transfer" && destination === vehicle.city)
      next.destination = "Choose a different destination.";
    if (mode === "rate" && rate < 1000) next.rate = "Enter a valid daily rate.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    if (mode === "maintenance")
      await onComplete(
        { status: "Maintenance" },
        `${category} scheduled for ${date} at ${Number(odometer).toLocaleString()} km.`,
      );
    if (mode === "transfer")
      await onComplete(
        { city: destination as Vehicle["city"] },
        `Transfer to ${destination} assigned to ${agent}.`,
      );
    if (mode === "rate")
      await onComplete(
        { dailyRate: rate },
        `Rate card updated effective ${effective}.`,
      );
    setSaving(false);
    onOpenChange(false);
  }
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => !saving && onOpenChange(next)}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#101828]/45" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-[calc(100%-32px)] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl">
          <div className="flex items-start justify-between border-b border-[#EAECF0] p-5">
            <div className="flex gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-[10px] bg-[#EFF8FF] text-[#006FE6]">
                <Icon size={20} />
              </span>
              <div>
                <Dialog.Title className="font-bold">{meta.title}</Dialog.Title>
                <Dialog.Description className="mt-1 text-xs text-[#667085]">
                  {meta.description}
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close className="grid h-9 w-9 place-items-center rounded-lg hover:bg-[#F2F4F7]">
              <X size={18} />
              <span className="sr-only">Close</span>
            </Dialog.Close>
          </div>
          <form onSubmit={submit}>
            <div className="space-y-4 p-5">
              {mode === "maintenance" && (
                <>
                  <FormSelect
                    label="Service category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    options={[
                      "Routine service",
                      "Tyres",
                      "Mechanical repair",
                      "Inspection",
                    ]}
                  />
                  <FormInput
                    label="Scheduled date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    error={errors.date}
                  />
                  <FormInput
                    label="Odometer trigger"
                    type="number"
                    value={odometer}
                    onChange={(e) => setOdometer(e.target.value)}
                  />
                </>
              )}
              {mode === "transfer" && (
                <>
                  <FormSelect
                    label="Destination city"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    options={["Lahore", "Islamabad", "Rawalpindi", "Karachi"]}
                  />
                  {errors.destination && (
                    <p role="alert" className="text-xs text-[#B42318]">
                      {errors.destination}
                    </p>
                  )}
                  <FormInput
                    label="Departure date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                  <FormSelect
                    label="Assigned agent"
                    value={agent}
                    onChange={(e) => setAgent(e.target.value)}
                    options={["Ali Raza", "Sara Malik", "Usman Khan"]}
                  />
                </>
              )}
              {mode === "rate" && (
                <>
                  <FormInput
                    label="Base daily rate (PKR)"
                    type="number"
                    step={500}
                    value={rate}
                    onChange={(e) => setRate(Number(e.target.value))}
                    error={errors.rate}
                  />
                  <FormInput
                    label="Effective from"
                    type="date"
                    value={effective}
                    onChange={(e) => setEffective(e.target.value)}
                  />
                  <p className="rounded-lg bg-[#F8FAFC] p-3 text-xs leading-5 text-[#667085]">
                    Confirmed bookings keep their quoted rate snapshot. This
                    change affects future quotes only.
                  </p>
                </>
              )}
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-[#344054]">
                  Notes
                </span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-[9px] border border-[#D0D5DD] px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-[#EAECF0] p-4 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <LoaderCircle className="animate-spin" size={16} />}
                Save {mode}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
