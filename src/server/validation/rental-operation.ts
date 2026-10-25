import { DomainError } from "@/server/domain/errors";
import { NOT_RECORDED_FUEL, parseRecordPaymentInput, type RecordPaymentInput } from "@/server/validation/booking";

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

export type CheckInRentalInput = RentalInspectionInput & { payment?: RecordPaymentInput; lateReturnCharge?: LateReturnChargeInput; returnedAt?: string };

export function parseRentalInspectionInput(value: unknown): RentalInspectionInput {
  const input = value as Partial<RentalInspectionInput> | null;
  if (!input || typeof input !== "object") throw new DomainError("VALIDATION_FAILED", "Invalid inspection payload.", 400);
  const errors: Record<string, string> = {};
  if (!Number.isInteger(input.odometer) || input.odometer! < 0) errors.odometer = "Enter a valid odometer reading.";
  // Fuel level and condition notes are optional so a handover can be saved in seconds.
  if (input.fuelLevel != null && (typeof input.fuelLevel !== "string" || input.fuelLevel.trim().length > 30)) errors.fuelLevel = "Enter a valid fuel level.";
  if (input.conditionNotes != null && typeof input.conditionNotes !== "string") errors.conditionNotes = "Enter valid condition notes.";
  if (input.version !== undefined && (!Number.isInteger(input.version) || input.version < 1)) errors.version = "Enter a valid record version.";
  if (Object.keys(errors).length) throw new DomainError("VALIDATION_FAILED", "Review the inspection details.", 400, errors);
  return { odometer: input.odometer!, fuelLevel: input.fuelLevel?.trim() || NOT_RECORDED_FUEL, conditionNotes: input.conditionNotes?.trim() ?? "", version: input.version };
}

export function parseCheckInRentalInput(value: unknown): CheckInRentalInput {
  const inspection = parseRentalInspectionInput(value);
  const input = value as { payment?: unknown; lateReturnCharge?: Partial<LateReturnChargeInput>; returnedAt?: unknown };
  const lateReturnCharge=input.lateReturnCharge;
  let returnedAt:string|undefined;
  if(input.returnedAt!==undefined&&input.returnedAt!==null&&input.returnedAt!==""){
    const parsed=typeof input.returnedAt==="string"?Date.parse(input.returnedAt):Number.NaN;
    if(!Number.isFinite(parsed))throw new DomainError("VALIDATION_FAILED","Enter a valid return time.",400,{returnedAt:"Choose a valid date and time."});
    returnedAt=new Date(parsed).toISOString();
  }
  // A zero payment means nothing was collected; the remainder stays on the customer's balance.
  const payment=input.payment as {amount?:unknown}|undefined;
  const skipPayment=payment===undefined||payment===null||payment.amount===0;
  if(lateReturnCharge!==undefined){
    const errors:Record<string,string>={};
    if(!Number.isInteger(lateReturnCharge.amount)||(lateReturnCharge.amount??0)<=0)errors.lateReturnCharge="Enter a positive whole PKR late-return charge.";
    if(lateReturnCharge.method!==undefined&&!lateReturnCharge.method.trim())errors.lateReturnChargeMethod="Select a payment method.";
    if(Object.keys(errors).length)throw new DomainError("VALIDATION_FAILED","Review the late-return charge.",400,errors);
  }
  return {
    ...inspection,
    payment: skipPayment ? undefined : parseRecordPaymentInput(input.payment),
    returnedAt,
    lateReturnCharge:lateReturnCharge===undefined?undefined:{amount:lateReturnCharge.amount!,method:lateReturnCharge.method?.trim()||"Cash",reference:lateReturnCharge.reference?.trim()||""},
  };
}
