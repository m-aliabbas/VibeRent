import { AvailabilityConflictError, confirmBooking } from "@/db/booking-service";
import { sqlite } from "@/db/connection";

sqlite.prepare("DELETE FROM bookings WHERE notes = 'transaction-check'").run();
const input={agencyId:"agy-viberent",branchId:"br-islamabad",vehicleId:"veh-corolla",customerId:"cus-hamza",pickupAt:"2026-10-12T09:00:00.000Z",returnAt:"2026-10-14T09:00:00.000Z",dailyRate:9500,totalAmount:19000,depositRequired:25000,source:"test",notes:"transaction-check"};
const first=confirmBooking(input);
let conflictProtected=false;
try { confirmBooking({...input,customerId:"cus-areeba"}); } catch(error) { conflictProtected=error instanceof AvailabilityConflictError; }
if(!conflictProtected) throw new Error("Overlapping booking was not rejected.");
console.log(JSON.stringify({ok:true,created:first.id,overlapRejected:conflictProtected},null,2));
sqlite.close();
