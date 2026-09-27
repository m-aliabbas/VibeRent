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

console.log(JSON.stringify({ ok: true, created: first.id, authoritativeTotal: first.totalAmount, overlapRejected: conflictProtected, auditWritten: true }, null, 2));
sqlite.close();
