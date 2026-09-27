"use server";

import { getWebRequestContext } from "@/server/auth/session";
import { asDomainError } from "@/server/domain/errors";
import { confirmBooking, listBookings } from "@/server/services/booking-service";
import type { BookingListItem } from "@/server/repositories/contracts";
import type { ConfirmBookingInput } from "@/server/validation/booking";

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
