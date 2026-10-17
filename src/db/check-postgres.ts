import { execute, inTransaction } from "@/db/query";
import { confirmBooking, getBooking, recordBookingPayment, startBooking } from "@/server/services/booking-service";
import type { RequestContext } from "@/server/context/request-context";

const ids = {
  agency: "agy-pg-check",
  branch: "br-pg-check",
  authUser: "auth-pg-check",
  member: "mem-pg-check",
  staff: "usr-pg-check",
  customer: "cus-pg-check",
  vehicle: "veh-pg-check",
};

const context: RequestContext = {
  requestId: "req_pg_check",
  userId: ids.staff,
  authUserId: ids.authUser,
  agencyId: ids.agency,
  roles: ["agency_owner"],
};

async function main() {
  const now = new Date().toISOString();
  const epoch = Date.now();
  await cleanup();
  await inTransaction(async () => {
    await execute("INSERT INTO organization (id,name,slug,created_at) VALUES (?,?,?,?)",[ids.agency,"PostgreSQL Check Agency","postgresql-check-agency",epoch]);
    await execute("INSERT INTO agencies (id,name,created_at,updated_at) VALUES (?,?,?,?)",[ids.agency,"PostgreSQL Check Agency",now,now]);
    await execute("INSERT INTO branches (id,agency_id,name,city,address,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",[ids.branch,ids.agency,"Main","Lahore","Test address",now,now]);
    await execute("INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES (?,?,?,?,?,?)",[ids.authUser,"PostgreSQL Owner","postgresql-check@example.test",1,epoch,epoch]);
    await execute("INSERT INTO member (id,organization_id,user_id,role,created_at) VALUES (?,?,?,?,?)",[ids.member,ids.agency,ids.authUser,"agency_owner",epoch]);
    await execute("INSERT INTO users (id,auth_user_id,membership_id,agency_id,branch_id,email,name,role,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",[ids.staff,ids.authUser,ids.member,ids.agency,ids.branch,"postgresql-check@example.test","PostgreSQL Owner","agency_owner",now,now]);
    await execute("INSERT INTO customers (id,agency_id,name,phone_normalized,cnic_normalized,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",[ids.customer,ids.agency,"PostgreSQL Customer","03001234567","3520212345671",now,now]);
    await execute("INSERT INTO vehicles (id,agency_id,branch_id,plate,make,model,year,daily_rate,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",[ids.vehicle,ids.agency,ids.branch,"PG-1701","Toyota","Corolla",2024,12000,now,now]);
  });

  const draft = await startBooking(context);
  const confirmed = await confirmBooking(context, {
    bookingDraftId: draft.id,
    fulfillmentType: "fleet",
    vehicleId: ids.vehicle,
    customerId: ids.customer,
    rentalMode: "self_drive",
    destinationCity: "Islamabad",
    pickupAt: "2030-01-10T09:00:00.000Z",
    returnAt: "2030-01-12T09:00:00.000Z",
    extras: 1000,
    discount: 0,
    depositRequired: 25000,
    source: "postgresql-check",
    notes: "PostgreSQL integration check",
    estimatedKm: 0,
  });
  const paid = await recordBookingPayment(context, confirmed.id, {
    amount: 5000,
    method: "Cash",
    idempotencyKey: `pg_check_${confirmed.id}`,
    account: "PostgreSQL test drawer",
  });
  const refreshed = await getBooking(context, confirmed.id);
  if (paid.paid !== 5000 || refreshed.paid !== 5000 || refreshed.publicNumber !== draft.publicNumber) {
    throw new Error("PostgreSQL booking workflow did not persist correctly.");
  }
  console.log(JSON.stringify({ ok: true, bookingId: confirmed.id, publicNumber: confirmed.publicNumber, totalAmount: confirmed.totalAmount, paid: refreshed.paid }, null, 2));
  await cleanup();
}

async function cleanup() {
  await execute("DELETE FROM audit_events WHERE agency_id=?",[ids.agency]);
  await execute("DELETE FROM financial_transactions WHERE agency_id=?",[ids.agency]);
  await execute("DELETE FROM rental_inspections WHERE agency_id=?",[ids.agency]);
  await execute("DELETE FROM bookings WHERE agency_id=?",[ids.agency]);
  await execute("DELETE FROM booking_drafts WHERE agency_id=?",[ids.agency]);
  await execute("DELETE FROM payment_receipt_counters WHERE agency_id=?",[ids.agency]);
  await execute("DELETE FROM booking_number_counters WHERE agency_id=?",[ids.agency]);
  await execute("DELETE FROM vehicles WHERE agency_id=?",[ids.agency]);
  await execute("DELETE FROM customers WHERE agency_id=?",[ids.agency]);
  await execute("DELETE FROM member_branch_access WHERE membership_id=?",[ids.member]);
  await execute("DELETE FROM users WHERE agency_id=?",[ids.agency]);
  await execute("DELETE FROM member WHERE organization_id=?",[ids.agency]);
  await execute("DELETE FROM user WHERE id=?",[ids.authUser]);
  await execute("DELETE FROM branches WHERE agency_id=?",[ids.agency]);
  await execute("DELETE FROM agencies WHERE id=?",[ids.agency]);
  await execute("DELETE FROM organization WHERE id=?",[ids.agency]);
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
