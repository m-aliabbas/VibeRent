import { DomainError } from "@/server/domain/errors";

export type ConfirmBookingInput = {
  bookingDraftId?: string;
  vehicleId: string;
  customerId: string;
  rentalMode: "self_drive" | "with_driver";
  driverId?: string;
  renterSkipped?: boolean;
  destinationCity: string;
  pickupAt: string;
  returnAt: string;
  extras: number;
  discount: number;
  depositRequired: number;
  source: string;
  notes?: string;
  estimatedKm: number;
  dailyRateOverride?: number;
  overrideReason?: string;
};

export function parseConfirmBookingInput(value: unknown): ConfirmBookingInput {
  const input = value as Partial<ConfirmBookingInput> | null;
  const errors: Record<string, string> = {};
  if (!input || typeof input !== "object") throw new DomainError("VALIDATION_FAILED", "Invalid booking payload.", 400);
  const rentalMode=input.rentalMode??"self_drive";
  if (!input.vehicleId) errors.vehicleId = "Select a vehicle.";
  if (!input.customerId && !(rentalMode === "with_driver" && input.renterSkipped)) errors.customerId = "Select an existing customer.";
  if (rentalMode !== "self_drive" && rentalMode !== "with_driver") errors.rentalMode = "Choose self drive or with driver.";
  if (rentalMode === "with_driver" && !input.driverId) errors.driverId = "Select a driver.";
  const pickup = Date.parse(input.pickupAt ?? "");
  const returned = Date.parse(input.returnAt ?? "");
  if (!Number.isFinite(pickup)) errors.pickupAt = "Enter a valid pickup time.";
  if (!Number.isFinite(returned) || returned <= pickup) errors.returnAt = "Return must be after pickup.";
  for (const key of ["extras", "discount", "depositRequired"] as const) {
    if (!Number.isInteger(input[key]) || input[key]! < 0) errors[key] = "Enter a non-negative whole PKR amount.";
  }
  if (input.estimatedKm !== undefined && (!Number.isInteger(input.estimatedKm) || input.estimatedKm < 0)) errors.estimatedKm = "Estimated mileage must be zero or more.";
  if (input.dailyRateOverride !== undefined && (!Number.isInteger(input.dailyRateOverride) || input.dailyRateOverride < 1000)) errors.dailyRateOverride = "Enter a valid override rate.";
  if (input.dailyRateOverride !== undefined && !input.overrideReason?.trim()) errors.overrideReason = "Explain why the destination rate is being changed.";
  if (Object.keys(errors).length) throw new DomainError("VALIDATION_FAILED", "Review the booking details.", 400, errors);
  return {
    bookingDraftId: input.bookingDraftId?.trim() || undefined, vehicleId: input.vehicleId!, customerId: input.customerId?.trim() || "", rentalMode, driverId:input.driverId?.trim()||undefined, renterSkipped:Boolean(input.renterSkipped), destinationCity: input.destinationCity?.trim() || "Local", pickupAt: new Date(pickup).toISOString(), returnAt: new Date(returned).toISOString(),
    extras: input.extras!, discount: input.discount!, depositRequired: input.depositRequired!, source: input.source?.trim() || "counter", notes: input.notes?.trim() || undefined, estimatedKm: input.estimatedKm ?? 0, dailyRateOverride: input.dailyRateOverride, overrideReason: input.overrideReason?.trim() || undefined,
  };
}

export const paymentMethods = ["Cash", "Bank transfer", "Card terminal", "JazzCash", "Easypaisa", "Other wallet"] as const;
export type PaymentMethod = (typeof paymentMethods)[number];

export type RecordPaymentInput = {
  amount: number;
  method: string;
  reference: string;
  account?: string;
  note?: string;
  idempotencyKey?: string;
};

export function parseRecordPaymentInput(value: unknown): RecordPaymentInput {
  const input = value as Partial<RecordPaymentInput> | null;
  const errors: Record<string, string> = {};
  if (!input || typeof input !== "object") throw new DomainError("VALIDATION_FAILED", "Invalid payment payload.", 400);
  if (!Number.isInteger(input.amount) || (input.amount ?? 0) <= 0) {
    errors.amount = "Enter a positive whole PKR amount.";
  }
  if (!input.method?.trim() || !paymentMethods.includes(input.method as PaymentMethod)) {
    errors.method = "Select a valid payment method.";
  }
  if (!input.reference?.trim()) {
    errors.reference = "Enter a payment reference or counter receipt number.";
  }
  if (Object.keys(errors).length) throw new DomainError("VALIDATION_FAILED", "Review the payment details.", 400, errors);
  return {
    amount: input.amount!,
    method: input.method!.trim(),
    reference: input.reference!.trim(),
    account: input.account?.trim() || undefined,
    note: input.note?.trim() || undefined,
    idempotencyKey: input.idempotencyKey?.trim() || undefined,
  };
}

export const depositActions = ["Deposit received", "Deposit applied", "Deposit refunded", "Deposit forfeited"] as const;
export type DepositAction = (typeof depositActions)[number];

export type RecordDepositInput = {
  action: DepositAction;
  amount: number;
  method?: string;
  reference: string;
  note?: string;
  idempotencyKey?: string;
};

export function parseRecordDepositInput(value: unknown): RecordDepositInput {
  const input = value as Partial<RecordDepositInput> | null;
  const errors: Record<string, string> = {};
  if (!input || typeof input !== "object") throw new DomainError("VALIDATION_FAILED", "Invalid deposit payload.", 400);
  if (!input.action || !depositActions.includes(input.action as DepositAction)) {
    errors.action = "Select a valid deposit action.";
  }
  if (!Number.isInteger(input.amount) || (input.amount ?? 0) <= 0) {
    errors.amount = "Enter a positive whole PKR amount.";
  }
  if (!input.reference?.trim()) {
    errors.reference = "Enter a reason or reference for this deposit transaction.";
  }
  if (Object.keys(errors).length) throw new DomainError("VALIDATION_FAILED", "Review the deposit details.", 400, errors);
  return {
    action: input.action!,
    amount: input.amount!,
    method: input.method?.trim() || "Bank transfer",
    reference: input.reference!.trim(),
    note: input.note?.trim() || undefined,
    idempotencyKey: input.idempotencyKey?.trim() || undefined,
  };
}

export type ReverseTransactionInput = {
  transactionId: string;
  reason: string;
};

export function parseReverseTransactionInput(value: unknown): ReverseTransactionInput {
  const input = value as Partial<ReverseTransactionInput> | null;
  const errors: Record<string, string> = {};
  if (!input || typeof input !== "object") throw new DomainError("VALIDATION_FAILED", "Invalid reversal payload.", 400);
  if (!input.transactionId?.trim()) {
    errors.transactionId = "Transaction ID is required.";
  }
  if (!input.reason?.trim()) {
    errors.reason = "A reason is required for correcting or reversing a transaction.";
  }
  if (Object.keys(errors).length) throw new DomainError("VALIDATION_FAILED", "Review the reversal details.", 400, errors);
  return {
    transactionId: input.transactionId!.trim(),
    reason: input.reason!.trim(),
  };
}
