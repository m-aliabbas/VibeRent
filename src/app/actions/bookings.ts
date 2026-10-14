"use server";

import { getWebRequestContext } from "@/server/auth/session";
import { asDomainError } from "@/server/domain/errors";
import {
  amendBooking,
  archiveBooking,
  cancelBooking,
  checkInRental,
  checkOutRental,
  confirmBooking,
  createAvailabilityBlock,
  listAvailabilityBlocks,
  listBookings,
  recordBookingDeposit,
  recordBookingPayment,
  reverseBookingTransaction,
  startBooking,
} from "@/server/services/booking-service";
import { revalidatePath } from "next/cache";
import { clearBookingDraft } from "@/server/services/booking-cnic-service";
import type { BookingListItem } from "@/server/repositories/contracts";
import type { ConfirmBookingInput, RecordDepositInput, RecordPaymentInput, ReverseTransactionInput } from "@/server/validation/booking";
import type { CheckInRentalInput, RentalInspectionInput } from "@/server/validation/rental-operation";
import { deliverRentalAgreement, type AgreementDeliveryResult } from "@/server/services/agreement-delivery-service";
import { deliverCheckinInvoice, deliverCheckoutNotice, deliverPaymentInvoice } from "@/server/services/notification-delivery-service";

export type ConfirmBookingActionResult =
  | { ok: true; data: ReturnType<typeof confirmBooking> & { agreementDelivery: AgreementDeliveryResult } }
  | { ok: false; error: { code: string; message: string; fieldErrors: Record<string, string> } };

export async function startBookingAction(existingDraftId?: string) {
  try { return { ok: true as const, data: startBooking(await getWebRequestContext(), existingDraftId) }; }
  catch (error) { const issue = asDomainError(error); return { ok: false as const, error: { code: issue.code, message: issue.message } }; }
}

export async function clearBookingAction(bookingDraftId:string) {
  try {
    const context=await getWebRequestContext();
    await clearBookingDraft(context,bookingDraftId);
    return {ok:true as const,data:startBooking(context)};
  } catch(error) {
    const issue=asDomainError(error);
    return {ok:false as const,error:{code:issue.code,message:issue.message}};
  }
}

export async function confirmBookingAction(input: ConfirmBookingInput): Promise<ConfirmBookingActionResult> {
  try { const context=await getWebRequestContext();const data=confirmBooking(context,input);const agreementDelivery=await deliverRentalAgreement(context,data.id);return { ok: true, data:{...data,agreementDelivery} }; }
  catch (error) { const issue = asDomainError(error); return { ok: false, error: { code: issue.code, message: issue.message, fieldErrors: issue.fieldErrors ?? {} } }; }
}

export async function sendBookingAgreementAction(bookingId:string) {
  try { return {ok:true as const,data:await deliverRentalAgreement(await getWebRequestContext(),bookingId)}; }
  catch(error){const issue=asDomainError(error);return {ok:false as const,error:{code:issue.code,message:issue.message}};}
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

export async function cancelBookingAction(bookingId:string,input:{reason:string;version:number}) {
  try {
    const data=cancelBooking(await getWebRequestContext(),bookingId,input);
    revalidatePath("/bookings");
    revalidatePath(`/bookings/${bookingId}`);
    return {ok:true as const,data};
  } catch(error) {
    const issue=asDomainError(error);
    return {ok:false as const,error:{code:issue.code,message:issue.message,fieldErrors:issue.fieldErrors??{}}};
  }
}

export async function archiveBookingAction(bookingId:string,reason?:string) {
  try {
    const data=archiveBooking(await getWebRequestContext(),bookingId,reason);
    revalidatePath("/bookings");
    revalidatePath(`/bookings/${bookingId}`);
    return {ok:true as const,data};
  } catch(error) {
    const issue=asDomainError(error);
    return {ok:false as const,error:{code:issue.code,message:issue.message}};
  }
}

export async function checkOutRentalAction(bookingId: string, input: RentalInspectionInput) {
  try { const context=await getWebRequestContext();const data=checkOutRental(context,bookingId,input);const notificationDelivery=await deliverCheckoutNotice(context,bookingId);return { ok: true as const, data:{...data,notificationDelivery} }; }
  catch (error) { const issue=asDomainError(error);return {ok:false as const,error:{code:issue.code,message:issue.message,fieldErrors:issue.fieldErrors??{}}}; }
}

export async function checkInRentalAction(bookingId: string, input: CheckInRentalInput) {
  try { const context=await getWebRequestContext();const data=checkInRental(context,bookingId,input);const notificationDelivery=await deliverCheckinInvoice(context,bookingId);return { ok: true as const, data:{...data,notificationDelivery} }; }
  catch (error) { const issue=asDomainError(error);return {ok:false as const,error:{code:issue.code,message:issue.message,fieldErrors:issue.fieldErrors??{}}}; }
}

export async function recordBookingPaymentAction(bookingId: string, input: RecordPaymentInput) {
  try {
    const context=await getWebRequestContext();
    const data = recordBookingPayment(context, bookingId, input);
    const notificationDelivery=await deliverPaymentInvoice(context,bookingId,{...input,receiptNumber:data.paymentReceiptNumber});
    return { ok: true as const, data:{...data,notificationDelivery} };
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
    revalidatePath("/bookings");
    revalidatePath(`/bookings/${bookingId}`);
    revalidatePath("/dashboard");
    revalidatePath("/reports");
    return { ok: true as const, data };
  } catch (error) {
    const issue = asDomainError(error);
    return { ok: false as const, error: { code: issue.code, message: issue.message, fieldErrors: issue.fieldErrors ?? {} } };
  }
}
