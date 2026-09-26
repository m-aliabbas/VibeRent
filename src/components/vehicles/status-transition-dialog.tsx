"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useMemo, useState, type FormEvent } from "react";
import { ArrowRight, LoaderCircle, Repeat2, X } from "lucide-react";
import { FormInput, FormSelect } from "@/components/forms/form-controls";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import type { Vehicle, VehicleStatus } from "@/types/vehicle";

const nextStates: Record<VehicleStatus, VehicleStatus[]> = {
  Available: ["Booked", "Maintenance", "Out of Service"],
  Booked: ["Available", "Maintenance", "Out of Service"],
  Maintenance: ["Available", "Out of Service"],
  "Out of Service": ["Available", "Maintenance"],
  Archived: ["Available"],
};
const reasons: Record<VehicleStatus, string[]> = {
  Available: [
    "Service completed",
    "Rental returned",
    "Inspection cleared",
    "Authorized override",
  ],
  Booked: ["Confirmed booking", "Fleet allocation"],
  Maintenance: ["Scheduled service", "Repair required", "Inspection issue"],
  "Out of Service": ["Safety issue", "Document issue", "Operational hold"],
  Archived: ["Restored to fleet"],
};
function localDateTimeValue() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}
export type StatusTransitionInput = {
  to: VehicleStatus;
  reason: string;
  notes: string;
  effectiveAt: string;
};

export function StatusTransitionDialog({
  vehicle,
  open,
  onOpenChange,
  onConfirm,
}: {
  vehicle: Vehicle;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: StatusTransitionInput) => Promise<boolean>;
}) {
  const options = nextStates[vehicle.status];
  const [to, setTo] = useState<VehicleStatus>(options[0]);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [effectiveAt, setEffectiveAt] = useState(localDateTimeValue);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const warning = useMemo(() => {
    if (vehicle.status === "Booked")
      return "This vehicle has a confirmed booking. Confirm it is reassigned or cancelled before changing operational status.";
    if (to === "Maintenance")
      return "Maintenance makes this vehicle unavailable for new bookings until service is completed.";
    if (to === "Out of Service")
      return "This vehicle will be unavailable indefinitely. Record the operational or safety issue.";
    if (vehicle.status === "Maintenance")
      return "Only continue after service is complete or an authorized override has been approved.";
    return "Availability will refresh immediately after this status change.";
  }, [to, vehicle.status]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!reason) nextErrors.reason = "Select a reason for this change.";
    if (!effectiveAt)
      nextErrors.effectiveAt = "Choose when this change takes effect.";
    if (
      (to === "Maintenance" || to === "Out of Service") &&
      notes.trim().length < 8
    )
      nextErrors.notes = "Add a short note (at least 8 characters).";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSaving(true);
    const saved = await onConfirm({
      to,
      reason,
      notes: notes.trim(),
      effectiveAt,
    });
    setSaving(false);
    if (saved) onOpenChange(false);
  }
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => !saving && onOpenChange(next)}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#101828]/45 backdrop-blur-[1px]" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-[calc(100%-32px)] sm:max-w-xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl">
          <div className="flex items-start justify-between border-b border-[#EAECF0] px-5 py-4 sm:px-6">
            <div className="flex gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-[10px] bg-[#EAF4FF] text-[#006FE6]">
                <Repeat2 size={20} />
              </span>
              <div>
                <Dialog.Title className="text-lg font-bold">
                  Change vehicle status
                </Dialog.Title>
                <Dialog.Description className="mt-0.5 text-xs text-[#667085]">
                  Record an operational change for {vehicle.plate}.
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close
              disabled={saving}
              className="grid h-9 w-9 place-items-center rounded-lg text-[#667085] hover:bg-[#F2F4F7]"
            >
              <X size={19} />
              <span className="sr-only">Close</span>
            </Dialog.Close>
          </div>
          <form onSubmit={submit}>
            <div className="space-y-5 px-5 py-6 sm:px-6">
              <div className="flex items-center gap-3 rounded-[10px] border border-[#EAECF0] bg-[#F8FAFC] p-4">
                <StatusBadge status={vehicle.status} />
                <ArrowRight size={17} className="text-[#98A2B3]" />
                <StatusBadge status={to} />
              </div>
              <FormSelect
                label="New status"
                value={to}
                onChange={(event) => {
                  setTo(event.target.value as VehicleStatus);
                  setReason("");
                }}
                options={options}
              />
              <FormSelect
                label="Reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                options={["Select a reason", ...reasons[to]]}
                required
              />
              {errors.reason && (
                <p role="alert" className="-mt-3 text-xs text-[#D92D20]">
                  {errors.reason}
                </p>
              )}
              <FormInput
                label="Effective date and time"
                type="datetime-local"
                value={effectiveAt}
                onChange={(event) => setEffectiveAt(event.target.value)}
                error={errors.effectiveAt}
                required
              />
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-[#344054]">
                  Notes
                  {(to === "Maintenance" || to === "Out of Service") && (
                    <span className="text-[#D92D20]"> *</span>
                  )}
                </span>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Add context for the operations team"
                  className={`w-full rounded-[9px] border bg-white px-3 py-2.5 text-sm outline-none focus:border-[#006FE6] focus:ring-2 focus:ring-[#006FE6]/10 ${errors.notes ? "border-[#F04438]" : "border-[#D0D5DD]"}`}
                />
                {errors.notes && (
                  <span className="mt-1 block text-xs text-[#D92D20]">
                    {errors.notes}
                  </span>
                )}
              </label>
              <p className="rounded-[10px] border border-[#FEDF89] bg-[#FFFAEB] p-3 text-sm leading-5 text-[#93370D]">
                {warning}
              </p>
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-[#EAECF0] px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
              <Button
                type="button"
                variant="secondary"
                disabled={saving}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <LoaderCircle className="animate-spin" size={17} />}{" "}
                {saving ? "Updating…" : "Confirm status change"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
