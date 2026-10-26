import "server-only";

import { inTransaction, queryOne } from "@/db/query";
import type { DeliveryMode, QueuedDeliveryResult } from "@/server/api/delivery";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";
import { queueNotification } from "@/server/notifications/notification-service";

/**
 * Runs a mutation and queues its notices in one transaction: the business rows, the delivery rows
 * and their jobs commit together or not at all.
 */
export function withNotices<T extends object, N extends object>(work: () => Promise<T>, notices: (data: T) => Promise<N>): Promise<T & N> {
  return inTransaction(async () => {
    const data = await work();
    return { ...data, ...await notices(data) };
  }, { immediate: true });
}

/** Notices raised by booking, owner and expense workflows. Idempotency keys stop double-submits from sending twice. */
export const notices = {
  /** `resend` queues a new delivery even when the agreement was sent before (the "Send agreement" button). */
  agreement: (context: RequestContext, mode: DeliveryMode, bookingId: string, resend = false) =>
    queueNotification(context, mode, { kind: "booking.agreement", entityId: bookingId, idempotencyKey: resend ? undefined : `booking.agreement:${bookingId}` }),
  checkout: (context: RequestContext, mode: DeliveryMode, bookingId: string) =>
    queueNotification(context, mode, { kind: "booking.checkout_notice", entityId: bookingId, idempotencyKey: `booking.checkout_notice:${bookingId}` }),
  checkin: (context: RequestContext, mode: DeliveryMode, bookingId: string) =>
    queueNotification(context, mode, { kind: "booking.checkin_invoice", entityId: bookingId, idempotencyKey: `booking.checkin_invoice:${bookingId}` }),
  payment: (context: RequestContext, mode: DeliveryMode, bookingId: string, payment: { amount: number; method: string; reference?: string; receiptNumber: number | null }) =>
    queueNotification(context, mode, {
      kind: "booking.payment_receipt", entityId: bookingId, payload: payment,
      idempotencyKey: payment.receiptNumber == null ? undefined : `booking.payment_receipt:${payment.receiptNumber}`,
    }),
  payout: (context: RequestContext, mode: DeliveryMode, ownerId: string, payout: { amount: number; method: string; reference: string; periodFrom: string; periodTo: string; idempotencyKey: string }) =>
    queueNotification(context, mode, {
      kind: "owner.payout_receipt", entityId: ownerId,
      payload: { amount: payout.amount, method: payout.method, reference: payout.reference, periodFrom: payout.periodFrom, periodTo: payout.periodTo },
      idempotencyKey: `owner.payout_receipt:${payout.idempotencyKey}`,
    }),
  expense: async (context: RequestContext, mode: DeliveryMode, expense: { id: string; ownerId: string | null }): Promise<QueuedDeliveryResult> =>
    expense.ownerId
      ? queueNotification(context, mode, { kind: "owner.expense_notice", entityId: expense.id, idempotencyKey: `owner.expense_notice:${expense.id}` })
      : { status: "skipped", message: "Expense saved. No owner message was needed because the expense is not allocated to an owner." },
};

/** The "Send agreement" action: queues the agreement again for a booking in this agency. */
export async function resendAgreement(context: RequestContext, bookingId: string) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  const booking = await queryOne("SELECT id FROM bookings WHERE agency_id=? AND id=? LIMIT 1", [context.agencyId, bookingId]);
  if (!booking) throw new DomainError("NOT_FOUND", "Booking not found.", 404);
  return notices.agreement(context, "server", bookingId, true);
}
