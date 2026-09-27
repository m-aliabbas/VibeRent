import { DomainError } from "@/server/domain/errors";

export type ConfirmBookingInput = {
  vehicleId: string;
  customerId: string;
  pickupAt: string;
  returnAt: string;
  extras: number;
  discount: number;
  depositRequired: number;
  source: string;
  notes?: string;
};

export function parseConfirmBookingInput(value: unknown): ConfirmBookingInput {
  const input = value as Partial<ConfirmBookingInput> | null;
  const errors: Record<string, string> = {};
  if (!input || typeof input !== "object") throw new DomainError("VALIDATION_FAILED", "Invalid booking payload.", 400);
  if (!input.vehicleId) errors.vehicleId = "Select a vehicle.";
  if (!input.customerId) errors.customerId = "Select an existing customer.";
  const pickup = Date.parse(input.pickupAt ?? "");
  const returned = Date.parse(input.returnAt ?? "");
  if (!Number.isFinite(pickup)) errors.pickupAt = "Enter a valid pickup time.";
  if (!Number.isFinite(returned) || returned <= pickup) errors.returnAt = "Return must be after pickup.";
  for (const key of ["extras", "discount", "depositRequired"] as const) {
    if (!Number.isInteger(input[key]) || input[key]! < 0) errors[key] = "Enter a non-negative whole PKR amount.";
  }
  if (Object.keys(errors).length) throw new DomainError("VALIDATION_FAILED", "Review the booking details.", 400, errors);
  return {
    vehicleId: input.vehicleId!, customerId: input.customerId!, pickupAt: new Date(pickup).toISOString(), returnAt: new Date(returned).toISOString(),
    extras: input.extras!, discount: input.discount!, depositRequired: input.depositRequired!, source: input.source?.trim() || "counter", notes: input.notes?.trim() || undefined,
  };
}

