"use server";

import { getWebRequestContext } from "@/server/auth/session";
import { asDomainError } from "@/server/domain/errors";
import {
  amendBooking,
  confirmBooking,
  createAvailabilityBlock,
  listAvailabilityBlocks,
  listBookings,
  recordBookingDeposit,
  recordBookingPayment,
  reverseBookingTransaction,
} from "@/server/services/booking-service";
import type { BookingListItem } from "@/server/repositories/contracts";
import type { ConfirmBookingInput, RecordDepositInput, RecordPaymentInput, ReverseTransactionInput } from "@/server/validation/booking";

export type ConfirmBookingActionResult =
  | { ok: true; data: ReturnType<typeof confirmBooking> }
  | { ok: false; error: { code: string; message: string; fieldErrors: Record<string, string> } };

export async function confirmBookingAction(input: ConfirmBookingInput): Promise<ConfirmBookingActionResult> {
  try { return { ok: true, data: confirmBooking(await getWebRequestContext(), input) }; }
  catch (error) { const issue = asDomainError(error); return { ok: false, error: { code: issue.code, message: issue.message, fieldErrors: issue.fieldErrors ?? {} } }; }
}

export async function listBookingsAction(): Promise<{ ok: true; data: BookingListItem[] } | { ok: false; error: { message: string } }> {
  try { return { ok: true, data: listBookings(await getWebRequestContext()) }; }
  catch (error) { return { ok: false, error: { message: asDomainError(error).message } }; }
}

export async function listAvailabilityBlocksAction() {
  try { return { ok: true as const, data: listAvailabilityBlocks(await getWebRequestContext()) }; }
  catch (error) { return { ok: false as const, error: { message: asDomainError(error).message } }; }
}

export async function createAvailabilityBlockAction(input: { vehicleId: string; from: string; to: string; reason: string; kind?: string }) {
  try { return { ok: true as const, data: createAvailabilityBlock(await getWebRequestContext(), input) }; }
  catch (error) { const issue = asDomainError(error); return { ok: false as const, error: { code: issue.code, message: issue.message, fieldErrors: issue.fieldErrors ?? {} } }; }
}

export async function amendBookingAction(bookingId:string,input:{vehicleId:string;pickupAt:string;returnAt:string;destinationCity:string;version:number}) {
  try { return {ok:true as const,data:amendBooking(await getWebRequestContext(),bookingId,input)}; }
  catch(error){const issue=asDomainError(error);return {ok:false as const,error:{code:issue.code,message:issue.message,fieldErrors:issue.fieldErrors??{}}};}
}

export async function recordBookingPaymentAction(bookingId: string, input: RecordPaymentInput) {
  try {
    const data = recordBookingPayment(await getWebRequestContext(), bookingId, input);
    return { ok: true as const, data };
  } catch (error) {
    const issue = asDomainError(error);
    return { ok: false as const, error: { code: issue.code, message: issue.message, fieldErrors: issue.fieldErrors ?? {} } };
  }
}

export async function recordBookingDepositAction(bookingId: string, input: RecordDepositInput) {
  try {
    const data = recordBookingDeposit(await getWebRequestContext(), bookingId, input);
    return { ok: true as const, data };
  } catch (error) {
    const issue = asDomainError(error);
    return { ok: false as const, error: { code: issue.code, message: issue.message, fieldErrors: issue.fieldErrors ?? {} } };
  }
}

export async function reverseBookingTransactionAction(bookingId: string, input: ReverseTransactionInput) {
  try {
    const data = reverseBookingTransaction(await getWebRequestContext(), bookingId, input);
    return { ok: true as const, data };
  } catch (error) {
    const issue = asDomainError(error);
    return { ok: false as const, error: { code: issue.code, message: issue.message, fieldErrors: issue.fieldErrors ?? {} } };
  }
}
