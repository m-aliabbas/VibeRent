import { DomainError } from "@/server/domain/errors";
import { parseRecordPaymentInput, type RecordPaymentInput } from "@/server/validation/booking";

export type RentalInspectionInput = {
  odometer: number;
  fuelLevel: string;
  conditionNotes: string;
  version?: number;
};

export type LateReturnChargeInput = {
  amount: number;
  method?: string;
  reference?: string;
};

export type CheckInRentalInput = RentalInspectionInput & { payment?: RecordPaymentInput; lateReturnCharge?: LateReturnChargeInput };

export function parseRentalInspectionInput(value: unknown): RentalInspectionInput {
  const input = value as Partial<RentalInspectionInput> | null;
  if (!input || typeof input !== "object") throw new DomainError("VALIDATION_FAILED", "Invalid inspection payload.", 400);
  const errors: Record<string, string> = {};
  if (!Number.isInteger(input.odometer) || input.odometer! < 0) errors.odometer = "Enter a valid odometer reading.";
  if (!input.fuelLevel?.trim() || input.fuelLevel.trim().length > 30) errors.fuelLevel = "Enter a valid fuel level.";
  if (!input.conditionNotes?.trim()) errors.conditionNotes = "Condition notes are required.";
  if (input.version !== undefined && (!Number.isInteger(input.version) || input.version < 1)) errors.version = "Enter a valid record version.";
  if (Object.keys(errors).length) throw new DomainError("VALIDATION_FAILED", "Review the inspection details.", 400, errors);
  return { odometer: input.odometer!, fuelLevel: input.fuelLevel!.trim(), conditionNotes: input.conditionNotes!.trim(), version: input.version };
}

export function parseCheckInRentalInput(value: unknown): CheckInRentalInput {
  const inspection = parseRentalInspectionInput(value);
  const input = value as { payment?: unknown; lateReturnCharge?: Partial<LateReturnChargeInput> };
  const lateReturnCharge=input.lateReturnCharge;
  if(lateReturnCharge!==undefined){
    const errors:Record<string,string>={};
    if(!Number.isInteger(lateReturnCharge.amount)||(lateReturnCharge.amount??0)<=0)errors.lateReturnCharge="Enter a positive whole PKR late-return charge.";
    if(lateReturnCharge.method!==undefined&&!lateReturnCharge.method.trim())errors.lateReturnChargeMethod="Select a payment method.";
    if(Object.keys(errors).length)throw new DomainError("VALIDATION_FAILED","Review the late-return charge.",400,errors);
  }
  return {
    ...inspection,
    payment: input.payment === undefined ? undefined : parseRecordPaymentInput(input.payment),
    lateReturnCharge:lateReturnCharge===undefined?undefined:{amount:lateReturnCharge.amount!,method:lateReturnCharge.method?.trim()||"Cash",reference:lateReturnCharge.reference?.trim()||""},
  };
}
