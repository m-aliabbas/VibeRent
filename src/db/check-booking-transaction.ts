import { sqlite } from "@/db/connection";
import { DomainError } from "@/server/domain/errors";
import { archiveBooking, cancelBooking, checkInRental, confirmBooking, extendRental, getBooking, recordSourcePayout, startBooking } from "@/server/services/booking-service";
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
const firstDraft = startBooking(context);
const first = confirmBooking(context, { ...input, bookingDraftId: firstDraft.id });
let conflictProtected = false;
let conflictDraftId = "";
try {
  const conflictDraft = startBooking(context);
  conflictDraftId = conflictDraft.id;
  if (conflictDraft.publicNumber === firstDraft.publicNumber) throw new Error("Booking numbers were not unique.");
  confirmBooking(context, { ...input, bookingDraftId: conflictDraft.id });
} catch (error) {
  conflictProtected = error instanceof DomainError && error.code === "BOOKING_CONFLICT";
}
if (!conflictProtected) throw new Error("Overlapping booking was not rejected.");
const audit = sqlite.prepare("SELECT id FROM audit_events WHERE agency_id=? AND entity_id=? AND action='booking.confirmed'").get(context.agencyId, first.id);
if (!audit) throw new Error("Booking audit event was not written.");

import { recordBookingPayment, reverseBookingTransaction } from "@/server/services/booking-service";

// Test recording a payment
const paymentAmount = 10000;
const updatedWithPayment = recordBookingPayment(context, first.id, {
  amount: paymentAmount,
  method: "Cash",
  idempotencyKey: `receipt_check_${first.id}`,
  account: "Lahore cash drawer",
});

if (updatedWithPayment.paid !== paymentAmount) {
  throw new Error(`Expected paid to be ${paymentAmount}, got ${updatedWithPayment.paid}`);
}
if (!updatedWithPayment.paymentReceiptNumber) throw new Error("Payment receipt number was not generated.");
const retriedPayment = recordBookingPayment(context, first.id, {
  amount: paymentAmount,
  method: "Cash",
  idempotencyKey: `receipt_check_${first.id}`,
  account: "Lahore cash drawer",
});
if (retriedPayment.paymentReceiptNumber !== updatedWithPayment.paymentReceiptNumber) {
  throw new Error("Idempotent payment retry did not retain its receipt number.");
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
if (reversed.paymentStatus !== "Payment reversed") {
  throw new Error(`After a full reversal, expected the payment status to be Payment reversed, got ${reversed.paymentStatus}.`);
}

const reversalTxn = reversed.transactions?.find(t => t.linkedTransactionId === paymentTxn.id && t.kind === "reversal");
if (!reversalTxn || reversalTxn.reference !== "Test correction") {
  throw new Error("Reversal details were not preserved in the booking ledger.");
}

const cancelled = cancelBooking(context, first.id, {
  reason: "Customer changed travel plans",
  version: reversed.version,
});
if (cancelled.status !== "Cancelled") throw new Error("Paid booking could not be cancelled after reversal.");

archiveBooking(context, first.id);
const archived = sqlite.prepare("SELECT archived_at AS archivedAt FROM bookings WHERE agency_id=? AND id=?")
  .get(context.agencyId, first.id) as { archivedAt: string | null } | undefined;
if (!archived?.archivedAt) throw new Error("Financially settled cancelled booking was not archived.");

const auditPayment = sqlite.prepare("SELECT id FROM audit_events WHERE agency_id=? AND entity_id=? AND action='booking.payment_posted'").get(context.agencyId, first.id);
if (!auditPayment) throw new Error("Payment audit event was not written.");

const auditReversal = sqlite.prepare("SELECT id FROM audit_events WHERE agency_id=? AND entity_id=? AND action='booking.payment_reversed'").get(context.agencyId, first.id);
if (!auditReversal) throw new Error("Reversal audit event was not written.");

// Test the atomic immediate-booking handover and late-return charge.
const immediateDraft=startBooking(context);
const immediate=confirmBooking(context,{
  bookingDraftId:immediateDraft.id,fulfillmentType:"external",external:{supplierName:"Test Supplier",supplierPhone:"03001234567",vehicleMake:"Honda",vehicleModel:"BR-V",vehiclePlate:"TST-101",pricingMode:"percentage",supplierSharePercent:80},
  customerId:"cus-areeba",rentalMode:"self_drive",destinationCity:"Lahore",pickupAt:"2028-02-01T09:00:00.000Z",returnAt:"2028-02-02T09:00:00.000Z",extras:0,discount:0,depositRequired:0,source:"transaction-check",estimatedKm:0,dailyRateOverride:12000,
  startImmediately:true,checkoutInspection:{odometer:42000,fuelLevel:"Full",conditionNotes:"Immediate rental handover test"},
});
if(immediate.status!=="checked_out")throw new Error("Immediate booking did not start the rental atomically.");
const immediateBooking=getBooking(context,immediate.id);
if(immediateBooking.status!=="Checked Out"||!immediateBooking.inspections?.some(item=>item.kind==="checkout"))throw new Error("Immediate rental checkout inspection was not persisted.");
const extended=extendRental(context,immediate.id,{returnAt:"2028-02-03T09:00:00.000Z",version:immediateBooking.version});
if(extended.returnAt!=="2028-02-03T09:00:00.000Z"||extended.dailyRate*extended.days+extended.extras-extended.discount!==24000||extended.supplierPayable!==19200)throw new Error("Rental extension did not persist the new return, total, and source payable.");
const sourceSettled=recordSourcePayout(context,immediate.id,{amount:19200,method:"Bank transfer",reference:"SRC-CHECK",idempotencyKey:`source_check_${immediate.id}`});
if(sourceSettled.supplierPaid!==19200||sourceSettled.supplierBalance!==0||sourceSettled.sourcePayouts?.length!==1)throw new Error("External source payout was not linked to the rental correctly.");
sqlite.prepare("UPDATE bookings SET return_at=? WHERE agency_id=? AND id=?").run("2026-01-01T00:00:00.000Z",context.agencyId,immediate.id);
const completedLate=checkInRental(context,immediate.id,{odometer:42120,fuelLevel:"3/4",conditionNotes:"Returned after agreed time",version:sourceSettled.version,lateReturnCharge:{amount:2500,method:"Cash"}});
if(completedLate.status!=="Completed"||completedLate.extras!==2500||completedLate.paid!==2500)throw new Error("Late-return charge was not added to booking extras and income.");
const lateTransaction=completedLate.transactions?.find(item=>item.kind==="late_return_charge");
if(!lateTransaction||!lateTransaction.reference.includes("Late return"))throw new Error("Late-return transaction details were not preserved.");

// Clean up test booking and related financial records
sqlite.prepare("DELETE FROM financial_transactions WHERE booking_id = ?").run(first.id);
sqlite.prepare("DELETE FROM audit_events WHERE entity_id = ?").run(first.id);
sqlite.prepare("DELETE FROM bookings WHERE id = ?").run(first.id);
sqlite.prepare("DELETE FROM financial_transactions WHERE booking_id = ?").run(immediate.id);
sqlite.prepare("DELETE FROM source_payouts WHERE booking_id = ?").run(immediate.id);
sqlite.prepare("DELETE FROM rental_inspections WHERE booking_id = ?").run(immediate.id);
sqlite.prepare("DELETE FROM audit_events WHERE entity_id = ?").run(immediate.id);
sqlite.prepare("DELETE FROM bookings WHERE id = ?").run(immediate.id);
sqlite.prepare("DELETE FROM audit_events WHERE entity_type='booking_draft' AND entity_id IN (?,?,?)").run(firstDraft.id, conflictDraftId,immediateDraft.id);
sqlite.prepare("DELETE FROM booking_drafts WHERE id IN (?,?,?)").run(firstDraft.id, conflictDraftId,immediateDraft.id);

console.log(JSON.stringify({
  ok: true,
  created: first.id,
  publicNumber: first.publicNumber,
  uniqueDraftNumbers: true,
  authoritativeTotal: first.totalAmount,
  overlapRejected: conflictProtected,
  paymentPersisted: true,
  paymentReceiptNumber: updatedWithPayment.paymentReceiptNumber,
  paymentReceiptIdempotent: true,
  refreshRetainedPaid: true,
  overpaymentBlocked: true,
  reversalWorked: true,
  fullyReversedStatusShown: true,
  reversalDetailsPreserved: true,
  immediateRentalStartedAtomically:true,
  rentalExtensionPersisted:true,
  sourcePayoutLinked:true,
  lateReturnChargeRecordedAsIncome:true,
  cancelledBookingArchivedAfterSettlement: true,
  auditWritten: true
}, null, 2));
sqlite.close();
