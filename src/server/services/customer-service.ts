import "server-only";
import { randomUUID } from "node:crypto";
import { execute, inTransaction, queryAll, queryOne } from "@/db/query";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";
import { parseCreateCustomerInput } from "@/server/validation/customer";
import { attachCustomerCnicDraft } from "@/server/services/customer-cnic-service";
import { recordBookingPayment } from "@/server/services/booking-service";

export type CustomerDto = { id: string; name: string; fatherName: string | null; phone: string; cnic: string; email: string | null; dateOfBirth: string | null; address: string | null; cnicExpiresAt: string | null; licenseNumber: string | null; licenseExpiresAt: string | null; status: string; version: number; updatedAt: string; bookingCount: number; paidAmount: number; outstanding: number };

export type CustomerDetailDto = CustomerDto & {
  lifetimeValue: number;
  /** Paid above booking totals (overpayments not yet refunded). */
  credit: number;
  lastRentalAt: string | null;
  bookings: Array<{ id: string; vehicle: string; plate: string; status: string; pickupAt: string; returnAt: string; totalAmount: number; paid: number }>;
};

const customerListSelect = `
  SELECT c.id, c.name, c.father_name AS fatherName, c.phone_normalized AS phone,
    substr(c.cnic_normalized,1,5) || '-' || substr(c.cnic_normalized,6,7) || '-' || substr(c.cnic_normalized,-1) AS cnic,
    c.email, c.date_of_birth AS dateOfBirth, c.address, c.cnic_expires_at AS cnicExpiresAt,
    c.license_number AS licenseNumber, c.license_expires_at AS licenseExpiresAt, c.status, c.version, c.updated_at AS updatedAt,
    (SELECT count(*) FROM bookings bk WHERE bk.agency_id=c.agency_id AND bk.customer_id=c.id AND bk.archived_at IS NULL) AS bookingCount,
    coalesce((
      SELECT sum(CASE WHEN lower(ft.kind) IN ('refund','reversal','payment_adjustment_decrease') THEN -ft.amount ELSE ft.amount END)
      FROM financial_transactions ft
      WHERE ft.agency_id=c.agency_id AND ft.customer_id=c.id AND ft.status='posted'
        AND lower(ft.kind) IN ('payment','late_return_charge','deposit_applied','payment_adjustment_increase','payment_adjustment_decrease','reversal','refund')
    ), 0) AS paidAmount,
    coalesce((
      SELECT sum(max(0, bk.total_amount - coalesce((
        SELECT sum(CASE WHEN lower(ft.kind) IN ('refund','reversal','payment_adjustment_decrease') THEN -ft.amount ELSE ft.amount END)
        FROM financial_transactions ft
        WHERE ft.agency_id=bk.agency_id AND ft.booking_id=bk.id AND ft.status='posted'
          AND lower(ft.kind) IN ('payment','late_return_charge','deposit_applied','payment_adjustment_increase','payment_adjustment_decrease','reversal','refund')
      ), 0)))
      FROM bookings bk
      WHERE bk.agency_id=c.agency_id AND bk.customer_id=c.id AND bk.archived_at IS NULL
        AND bk.status NOT IN ('cancelled','no_show','draft')
    ), 0) AS outstanding
  FROM customers c`;

function getCustomerRow(context: RequestContext, id: string) {
  return queryOne<CustomerDto>(`${customerListSelect} WHERE c.agency_id=? AND c.id=? AND c.archived_at IS NULL LIMIT 1`,[context.agencyId, id]);
}

export async function listCustomers(context: RequestContext) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  return queryAll<CustomerDto>(`${customerListSelect} WHERE c.agency_id=? AND c.archived_at IS NULL ORDER BY c.name`,[context.agencyId]);
}

export async function getCustomer(context: RequestContext, id: string) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  const customer = await getCustomerRow(context, id);
  if (!customer) throw new DomainError("NOT_FOUND", "Customer not found.", 404);
  return customer;
}

export async function getCustomerDetail(context: RequestContext, id: string): Promise<CustomerDetailDto> {
  const customer = await getCustomer(context, id);
  const bookings = await queryAll<{ id: string; vehicle: string; plate: string; status: string; pickupAt: string; returnAt: string; totalAmount: number; paid: number; archivedAt: string | null }>(`
    SELECT bk.id, CASE WHEN bk.fulfillment_type='external' THEN bk.external_vehicle_make||' '||bk.external_vehicle_model||coalesce(' '||bk.external_vehicle_year,'') ELSE v.make||' '||v.model||' '||v.year END AS vehicle, coalesce(bk.external_vehicle_plate,v.plate) AS plate,
      bk.status, bk.pickup_at AS pickupAt, bk.return_at AS returnAt, bk.total_amount AS totalAmount, bk.archived_at AS archivedAt,
      coalesce((SELECT sum(CASE WHEN lower(ft.kind) IN ('refund','reversal','payment_adjustment_decrease') THEN -ft.amount ELSE ft.amount END)
        FROM financial_transactions ft WHERE ft.agency_id=bk.agency_id AND ft.booking_id=bk.id AND ft.status='posted' AND lower(ft.kind) IN ('payment','late_return_charge','deposit_applied','payment_adjustment_increase','payment_adjustment_decrease','reversal','refund')),0) AS paid
    FROM bookings bk
    LEFT JOIN vehicles v ON v.id=bk.vehicle_id AND v.agency_id=bk.agency_id
    WHERE bk.agency_id=? AND bk.customer_id=?
    ORDER BY bk.pickup_at DESC
  `,[context.agencyId, id]);
  return {
    ...customer,
    bookingCount: bookings.length,
    lifetimeValue: bookings.filter(item => item.status === "completed").reduce((sum, item) => sum + item.totalAmount, 0),
    outstanding: bookings.filter(item => !["cancelled", "no_show"].includes(item.status)).reduce((sum, item) => sum + Math.max(0, item.totalAmount - item.paid), 0),
    credit: bookings.filter(item => !item.archivedAt).reduce((sum, item) => sum + Math.max(0, item.paid - item.totalAmount), 0),
    lastRentalAt: bookings[0]?.returnAt ?? null,
    bookings: bookings.map(booking => ({ id: booking.id, vehicle: booking.vehicle, plate: booking.plate, status: booking.status, pickupAt: booking.pickupAt, returnAt: booking.returnAt, totalAmount: booking.totalAmount, paid: booking.paid })),
  };
}

/** Allocates a customer balance payment to the newest unpaid booking first. */
export async function payCustomerBalance(context: RequestContext, customerId: string, input: { amount: number; method: string; reference?: string; idempotencyKey: string }) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  if (!input || !Number.isSafeInteger(input.amount) || input.amount <= 0 || !input.method?.trim() || !input.idempotencyKey?.trim()) throw new DomainError("VALIDATION_FAILED", "Enter a positive whole amount and payment method.", 400);
  return inTransaction(async () => {
    await getCustomer(context, customerId);
    const previous=await queryAll<{metadata:string}>("SELECT metadata FROM audit_events WHERE agency_id=? AND entity_type='customer' AND entity_id=? AND action='customer.balance_payment_allocated' ORDER BY occurred_at DESC",[context.agencyId,customerId]);
    const replay=previous.map(row=>JSON.parse(row.metadata) as {idempotencyKey?:string;amount:number;method:string;reference:string;allocations:Array<{bookingId:string;amount:number}>}).find(row=>row.idempotencyKey===input.idempotencyKey);
    if(replay){if(replay.amount!==input.amount||replay.method!==input.method.trim()||replay.reference!==(input.reference?.trim()??""))throw new DomainError("VERSION_CONFLICT","This payment retry key was already used with different details.",409);return {allocations:replay.allocations,customer:await getCustomerDetail(context,customerId)};}
    const bookings=await queryAll<{id:string;balance:number}>(`SELECT bk.id,
      max(0,bk.total_amount-coalesce((SELECT sum(CASE WHEN lower(ft.kind) IN ('refund','reversal','payment_adjustment_decrease') THEN -ft.amount ELSE ft.amount END) FROM financial_transactions ft WHERE ft.agency_id=bk.agency_id AND ft.booking_id=bk.id AND ft.status='posted' AND lower(ft.kind) IN ('payment','late_return_charge','deposit_applied','payment_adjustment_increase','payment_adjustment_decrease','reversal','refund')),0)) AS balance
      FROM bookings bk WHERE bk.agency_id=? AND bk.customer_id=? AND bk.archived_at IS NULL AND bk.status NOT IN ('draft','cancelled','no_show') ORDER BY bk.pickup_at DESC,bk.created_at DESC,bk.id DESC`,[context.agencyId,customerId]);
    const outstanding=bookings.reduce((sum,row)=>sum+row.balance,0);
    if (input.amount>outstanding) throw new DomainError("VALIDATION_FAILED", "Payment exceeds the customer balance.",400,{amount:`Available balance is PKR ${outstanding.toLocaleString("en-PK")}.`});
    let remaining=input.amount;
    const allocations:Array<{bookingId:string;amount:number}>=[];
    for (const booking of bookings) {
      if (!remaining) break;
      const amount=Math.min(remaining,booking.balance);
      if (!amount) continue;
      await recordBookingPayment(context,booking.id,{amount,method:input.method.trim(),reference:input.reference?.trim()??"",idempotencyKey:`customer_${input.idempotencyKey}_${booking.id}`});
      allocations.push({bookingId:booking.id,amount});
      remaining-=amount;
    }
    const now=new Date().toISOString();
    await execute("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)",[randomUUID(),context.agencyId,context.userId,"customer.balance_payment_allocated","customer",customerId,JSON.stringify({idempotencyKey:input.idempotencyKey,amount:input.amount,method:input.method.trim(),reference:input.reference?.trim()??"",allocations,order:"LIFO"}),now]);
    return {allocations,customer:await getCustomerDetail(context,customerId)};
  },{immediate:true});
}

export async function createCustomer(context: RequestContext, rawInput: unknown) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent"]);
  const input = parseCreateCustomerInput(rawInput);
  const documentDraftId = typeof (rawInput as { cnicDocumentDraftId?: unknown } | null)?.cnicDocumentDraftId === "string"
    ? (rawInput as { cnicDocumentDraftId: string }).cnicDocumentDraftId
    : undefined;
  return inTransaction(async () => {
    const duplicate = await queryOne<{ id: string }>("SELECT id FROM customers WHERE agency_id=? AND cnic_normalized=? LIMIT 1",[context.agencyId, input.cnicNormalized]);
    if (duplicate) throw new DomainError("VALIDATION_FAILED", "A customer with this CNIC already exists.", 409, { cnic: "CNIC must be unique." });
    const id = `cus_${randomUUID()}`;
    const now = new Date().toISOString();
    await execute(`INSERT INTO customers (id,agency_id,name,father_name,phone_normalized,cnic_normalized,email,date_of_birth,address,cnic_expires_at,license_number,license_expires_at,status,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'active',1,?,?)`,[id, context.agencyId, input.name, input.fatherName ?? null, input.phoneNormalized, input.cnicNormalized, input.email ?? null, input.dateOfBirth ?? null, input.address ?? null, input.cnicExpiresAt ?? null, input.licenseNumber ?? null, input.licenseExpiresAt ?? null, now, now]);
    if (documentDraftId) await attachCustomerCnicDraft(context, documentDraftId, id, now);
    await execute(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`,[randomUUID(), context.agencyId, context.userId, "customer.created", "customer", id, JSON.stringify({ name: input.name }), now]);
    return (await getCustomerRow(context, id))!;
  });
}

export async function updateCustomer(context: RequestContext, id: string, rawInput: unknown) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent"]);
  const current = await queryOne<{ cnic: string }>("SELECT cnic_normalized AS cnic FROM customers WHERE agency_id=? AND id=? AND archived_at IS NULL LIMIT 1",[context.agencyId, id]);
  if (!current) throw new DomainError("NOT_FOUND", "Customer not found.", 404);
  const raw = rawInput as Record<string, unknown>;
  const input = parseCreateCustomerInput({ ...raw, cnic: typeof raw.cnic === "string" && raw.cnic.includes("•") ? current.cnic : raw.cnic });
  const status = typeof raw.status === "string" ? raw.status.toLowerCase() : "active";
  if (!["active", "preferred", "review", "blacklisted"].includes(status)) throw new DomainError("VALIDATION_FAILED", "Choose a valid customer status.", 400, { status: "Choose a valid status." });
  return inTransaction(async () => {
    const duplicate = await queryOne("SELECT id FROM customers WHERE agency_id=? AND cnic_normalized=? AND id<>? LIMIT 1",[context.agencyId, input.cnicNormalized, id]);
    if (duplicate) throw new DomainError("VALIDATION_FAILED", "A customer with this CNIC already exists.", 409, { cnic: "CNIC must be unique." });
    const now = new Date().toISOString();
    await execute(`UPDATE customers SET name=?,father_name=?,phone_normalized=?,cnic_normalized=?,email=?,date_of_birth=?,address=?,cnic_expires_at=?,license_number=?,license_expires_at=?,status=?,version=version+1,updated_at=? WHERE agency_id=? AND id=?`,[input.name, input.fatherName ?? null, input.phoneNormalized, input.cnicNormalized, input.email ?? null, input.dateOfBirth ?? null, input.address ?? null, input.cnicExpiresAt ?? null, input.licenseNumber ?? null, input.licenseExpiresAt ?? null, status, now, context.agencyId, id]);
    await execute(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`,[randomUUID(), context.agencyId, context.userId, "customer.updated", "customer", id, JSON.stringify({ name: input.name, status }), now]);
    return (await getCustomerRow(context, id))!;
  });
}

export async function archiveCustomer(context:RequestContext,id:string) {
  requireRole(context,["agency_owner","fleet_manager"]);
  return inTransaction(async()=>{
    const customer=await queryOne<{id:string;name:string}>("SELECT id,name FROM customers WHERE agency_id=? AND id=? AND archived_at IS NULL LIMIT 1",[context.agencyId,id]);
    if(!customer) throw new DomainError("NOT_FOUND","Customer not found.",404);
    const activeBooking=await queryOne("SELECT id FROM bookings WHERE agency_id=? AND customer_id=? AND archived_at IS NULL AND status IN ('confirmed','checked_out') LIMIT 1",[context.agencyId,id]);
    if(activeBooking) throw new DomainError("INVALID_STATUS_TRANSITION","Cancel or complete the customer's active booking before deleting this customer.",409);
    const now=new Date().toISOString();
    await execute("UPDATE customers SET status='archived',archived_at=?,version=version+1,updated_at=? WHERE agency_id=? AND id=?",[now,now,context.agencyId,id]);
    await execute("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)",[randomUUID(),context.agencyId,context.userId,"customer.archived","customer",id,JSON.stringify({name:customer.name}),now]);
    return {id};
  },{immediate:true});
}
