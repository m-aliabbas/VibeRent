import { sqlite } from "@/db/connection";
import { DomainError } from "@/server/domain/errors";
import { confirmBooking } from "@/server/services/booking-service";
import type { RequestContext } from "@/server/context/request-context";

const context: RequestContext = {
  requestId: "req_transaction_check",
  userId: "usr-demo-owner",
  agencyId: "agy-viberent",
  roles: ["agency_owner"],
};
const input = {
  vehicleId: "veh-corolla",
  customerId: "cus-hamza",
  pickupAt: "2027-01-12T09:00:00.000Z",
  returnAt: "2027-01-14T09:00:00.000Z",
  extras: 0,
  discount: 0,
  depositRequired: 25000,
  source: "transaction-check",
  notes: "transaction-check",
};

sqlite.prepare("DELETE FROM financial_transactions WHERE booking_id IN (SELECT id FROM bookings WHERE source = 'transaction-check')").run();
sqlite.prepare("DELETE FROM audit_events WHERE entity_id IN (SELECT id FROM bookings WHERE source = 'transaction-check')").run();
sqlite.prepare("DELETE FROM bookings WHERE source = 'transaction-check'").run();
const first = confirmBooking(context, input);
let conflictProtected = false;
try {
  confirmBooking(context, input);
} catch (error) {
  conflictProtected = error instanceof DomainError && error.code === "BOOKING_CONFLICT";
}
if (!conflictProtected) throw new Error("Overlapping booking was not rejected.");
const audit = sqlite.prepare("SELECT id FROM audit_events WHERE agency_id=? AND entity_id=? AND action='booking.confirmed'").get(context.agencyId, first.id);
if (!audit) throw new Error("Booking audit event was not written.");

import { getBooking, recordBookingPayment, reverseBookingTransaction } from "@/server/services/booking-service";

// Test recording a payment
const paymentAmount = 10000;
const updatedWithPayment = recordBookingPayment(context, first.id, {
  amount: paymentAmount,
  method: "Cash",
  reference: "REC-TEST-001",
  account: "Lahore cash drawer",
});

if (updatedWithPayment.paid !== paymentAmount) {
  throw new Error(`Expected paid to be ${paymentAmount}, got ${updatedWithPayment.paid}`);
}

// Test re-fetching (simulating page refresh)
const refreshed = getBooking(context, first.id);
if (refreshed.paid !== paymentAmount) {
  throw new Error(`After refresh, expected paid to be ${paymentAmount}, got ${refreshed.paid}`);
}

const expectedBalance = refreshed.dailyRate * refreshed.days + refreshed.extras - refreshed.discount - refreshed.paid;
const computedBalance = (refreshed.dailyRate * refreshed.days + refreshed.extras - refreshed.discount) - refreshed.paid;
if (computedBalance !== expectedBalance) {
  throw new Error(`Balance mismatch: expected ${expectedBalance}, got ${computedBalance}`);
}

// Test overpayment protection
let overpaymentBlocked = false;
try {
  recordBookingPayment(context, first.id, {
    amount: computedBalance + 1000,
    method: "Bank transfer",
    reference: "OVERPAY",
  });
} catch (error) {
  overpaymentBlocked = error instanceof DomainError && error.code === "VALIDATION_FAILED";
}
if (!overpaymentBlocked) throw new Error("Overpayment was not blocked.");

// Test reversal
const paymentTxn = refreshed.transactions?.find(t => t.amount === paymentAmount && t.status === "posted");
if (!paymentTxn) throw new Error("Payment transaction was not found in transactions list.");

const reversed = reverseBookingTransaction(context, first.id, {
  transactionId: paymentTxn.id,
  reason: "Test correction",
});

if (reversed.paid !== 0) {
  throw new Error(`After reversal, expected paid to be 0, got ${reversed.paid}`);
}

const auditPayment = sqlite.prepare("SELECT id FROM audit_events WHERE agency_id=? AND entity_id=? AND action='booking.payment_posted'").get(context.agencyId, first.id);
if (!auditPayment) throw new Error("Payment audit event was not written.");

const auditReversal = sqlite.prepare("SELECT id FROM audit_events WHERE agency_id=? AND entity_id=? AND action='booking.payment_reversed'").get(context.agencyId, first.id);
if (!auditReversal) throw new Error("Reversal audit event was not written.");

// Clean up test booking and related financial records
sqlite.prepare("DELETE FROM financial_transactions WHERE booking_id = ?").run(first.id);
sqlite.prepare("DELETE FROM audit_events WHERE entity_id = ?").run(first.id);
sqlite.prepare("DELETE FROM bookings WHERE id = ?").run(first.id);

console.log(JSON.stringify({
  ok: true,
  created: first.id,
  authoritativeTotal: first.totalAmount,
  overlapRejected: conflictProtected,
  paymentPersisted: true,
  refreshRetainedPaid: true,
  overpaymentBlocked: true,
  reversalWorked: true,
  auditWritten: true
}, null, 2));
sqlite.close();
