import { DomainError } from "@/server/domain/errors";

export type ConfirmBookingInput = {
  bookingDraftId?: string;
  vehicleId?: string;
  fulfillmentType: "fleet" | "external";
  external?: {
    supplierName: string;
    supplierPhone: string;
    vehicleMake: string;
    vehicleModel: string;
    vehicleYear?: number;
    vehiclePlate: string;
    vehicleColor?: string;
    pricingMode: "percentage" | "fixed";
    supplierSharePercent?: number;
    supplierFixedCost?: number;
  };
  customerId: string;
  rentalMode: "self_drive" | "with_driver";
  driverId?: string;
  renterSkipped?: boolean;
  guarantor?: GuarantorInput;
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
  startImmediately?: boolean;
  checkoutInspection?: {
    odometer: number;
    fuelLevel: string;
    conditionNotes: string;
  };
};

export type GuarantorInput = {
  name: string;
  parentage: string;
  cnic: string;
  phone: string;
  address: string;
  carAmount: number;
};

function normalizeCnic(value: string) { return value.replace(/\D/g, ""); }
function normalizePhone(value: string) { return value.replace(/\D/g, ""); }

function parseGuarantor(value: unknown, errors: Record<string, string>): GuarantorInput | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object") { errors.guarantor = "Enter valid guarantor details."; return undefined; }
  const input = value as Partial<GuarantorInput>;
  const name = input.name?.trim() ?? "";
  const parentage = input.parentage?.trim() ?? "";
  const cnic = normalizeCnic(input.cnic ?? "");
  const phone = normalizePhone(input.phone ?? "");
  const address = input.address?.trim() ?? "";
  if (!name) errors["guarantor.name"] = "Enter the guarantor name.";
  if (parentage && parentage.length < 2) errors["guarantor.parentage"] = "Enter at least 2 parentage characters.";
  if (cnic && !/^\d{13}$/.test(cnic)) errors["guarantor.cnic"] = "Enter a valid 13-digit CNIC, or leave it blank.";
  if (phone && !/^(?:92|0)?3\d{9}$/.test(phone)) errors["guarantor.phone"] = "Enter a valid Pakistani mobile number.";
  if (address && address.length < 5) errors["guarantor.address"] = "Enter at least 5 address characters.";
  if (input.carAmount !== undefined && (!Number.isInteger(input.carAmount) || input.carAmount < 0)) errors["guarantor.carAmount"] = "Enter a non-negative whole PKR amount.";
  return { name, parentage, cnic, phone, address, carAmount: input.carAmount ?? 0 };
}

export function parseConfirmBookingInput(value: unknown): ConfirmBookingInput {
  const input = value as Partial<ConfirmBookingInput> | null;
  const errors: Record<string, string> = {};
  if (!input || typeof input !== "object") throw new DomainError("VALIDATION_FAILED", "Invalid booking payload.", 400);
  const guarantor = parseGuarantor(input.guarantor, errors);
  const rentalMode=input.rentalMode??"self_drive";
  const fulfillmentType=input.fulfillmentType??"fleet";
  if (fulfillmentType!=="fleet"&&fulfillmentType!=="external") errors.fulfillmentType="Choose how the booking will be fulfilled.";
  if (fulfillmentType==="fleet"&&!input.vehicleId) errors.vehicleId = "Select a vehicle.";
  const external=input.external;
  if(fulfillmentType==="external"){
    if(!external?.supplierName?.trim())errors["external.supplierName"]="Enter the supplier name.";
    if(!external?.supplierPhone?.trim())errors["external.supplierPhone"]="Enter the supplier phone.";
    if(!external?.vehicleMake?.trim())errors["external.vehicleMake"]="Enter the vehicle make.";
    if(!external?.vehicleModel?.trim())errors["external.vehicleModel"]="Enter the vehicle model.";
    if(!external?.vehiclePlate?.trim())errors["external.vehiclePlate"]="Enter the registration number.";
    if(!external?.pricingMode||!["percentage","fixed"].includes(external.pricingMode))errors["external.pricingMode"]="Choose percentage or fixed cost.";
    if(external?.pricingMode==="percentage"&&(!Number.isFinite(external.supplierSharePercent)||external.supplierSharePercent!<0||external.supplierSharePercent!>100))errors["external.supplierSharePercent"]="Enter a percentage from 0 to 100.";
    if(external?.pricingMode==="fixed"&&(!Number.isInteger(external.supplierFixedCost)||external.supplierFixedCost!<0))errors["external.supplierFixedCost"]="Enter a valid fixed supplier cost.";
  }
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
  if(fulfillmentType==="external"&&input.dailyRateOverride===undefined)errors.dailyRateOverride="Enter the customer daily rate.";
  if (fulfillmentType==="fleet"&&input.dailyRateOverride !== undefined && !input.overrideReason?.trim()) errors.overrideReason = "Explain why the destination rate is being changed.";
  const startImmediately = Boolean(input.startImmediately);
  const checkoutInspection = input.checkoutInspection;
  if (startImmediately) {
    if (!checkoutInspection || !Number.isInteger(checkoutInspection.odometer) || checkoutInspection.odometer < 0) errors["checkoutInspection.odometer"] = "Enter a valid handover odometer reading.";
    if (!checkoutInspection?.fuelLevel?.trim()) errors["checkoutInspection.fuelLevel"] = "Select the handover fuel level.";
    if (!checkoutInspection?.conditionNotes?.trim()) errors["checkoutInspection.conditionNotes"] = "Enter the vehicle condition at handover.";
  }
  if (Object.keys(errors).length) throw new DomainError("VALIDATION_FAILED", "Review the booking details.", 400, errors);
  return {
    bookingDraftId: input.bookingDraftId?.trim() || undefined, vehicleId: input.vehicleId?.trim() || undefined, fulfillmentType, external:fulfillmentType==="external"&&external?{supplierName:external.supplierName.trim(),supplierPhone:external.supplierPhone.trim(),vehicleMake:external.vehicleMake.trim(),vehicleModel:external.vehicleModel.trim(),vehicleYear:external.vehicleYear,vehiclePlate:external.vehiclePlate.trim().toUpperCase(),vehicleColor:external.vehicleColor?.trim()||undefined,pricingMode:external.pricingMode,supplierSharePercent:external.supplierSharePercent,supplierFixedCost:external.supplierFixedCost}:undefined, customerId: input.customerId?.trim() || "", rentalMode, driverId:input.driverId?.trim()||undefined, renterSkipped:Boolean(input.renterSkipped), guarantor, destinationCity: input.destinationCity?.trim() || "Local", pickupAt: new Date(pickup).toISOString(), returnAt: new Date(returned).toISOString(),
    extras: input.extras!, discount: input.discount!, depositRequired: input.depositRequired!, source: input.source?.trim() || "counter", notes: input.notes?.trim() || undefined, estimatedKm: input.estimatedKm ?? 0, dailyRateOverride: input.dailyRateOverride, overrideReason: input.overrideReason?.trim() || undefined,
    startImmediately,
    checkoutInspection:startImmediately&&checkoutInspection?{odometer:checkoutInspection.odometer,fuelLevel:checkoutInspection.fuelLevel.trim(),conditionNotes:checkoutInspection.conditionNotes.trim()}:undefined,
  };
}

export const paymentMethods = ["Cash", "Bank transfer", "Card terminal", "JazzCash", "Easypaisa", "Other wallet"] as const;
export type PaymentMethod = (typeof paymentMethods)[number];

export type RecordPaymentInput = {
  amount: number;
  method: string;
  reference?: string;
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
  if (Object.keys(errors).length) throw new DomainError("VALIDATION_FAILED", "Review the payment details.", 400, errors);
  return {
    amount: input.amount!,
    method: input.method!.trim(),
    reference: input.reference?.trim() || "",
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
  adjustmentType?: "reversal" | "refund";
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
  if (input.adjustmentType && !["reversal", "refund"].includes(input.adjustmentType)) {
    errors.adjustmentType = "Choose refund or reversal.";
  }
  if (Object.keys(errors).length) throw new DomainError("VALIDATION_FAILED", "Review the reversal details.", 400, errors);
  return {
    transactionId: input.transactionId!.trim(),
    reason: input.reason!.trim(),
    adjustmentType: input.adjustmentType ?? "reversal",
  };
}
