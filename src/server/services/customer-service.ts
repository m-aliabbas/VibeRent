import "server-only";
import { randomUUID } from "node:crypto";
import { execute, inTransaction, queryAll, queryOne } from "@/db/query";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";
import { parseCreateCustomerInput } from "@/server/validation/customer";
import { attachCustomerCnicDraft } from "@/server/services/customer-cnic-service";
import { recordBookingPayment } from "@/server/services/booking-service";
import { applyExpenseRecovery, listAccountExpenses } from "@/server/services/expense-service";
import type { AccountExpense } from "@/lib/reports/account-summary";

export type CustomerDto = { id: string; name: string; fatherName: string | null; phone: string; cnic: string; email: string | null; dateOfBirth: string | null; address: string | null; cnicExpiresAt: string | null; licenseNumber: string | null; licenseExpiresAt: string | null; status: string; version: number; updatedAt: string; bookingCount: number; paidAmount: number; outstanding: number; expenseDue: number };

export type CustomerDetailDto = CustomerDto & {
  lifetimeValue: number;
  /** Paid above booking totals (overpayments not yet refunded). */
  credit: number;
  lastRentalAt: string | null;
  /** totalAmount is net of discount; discount covers booking-time and settlement discounts. */
  bookings: Array<{ id: string; publicNumber: number | null; vehicle: string; plate: string; status: string; pickupAt: string; returnAt: string; totalAmount: number; discount: number; dailyRate: number; paid: number }>;
  /** Approved expenses charged to this customer, with recovered amounts, for the income/expense summary. */
  expenses: AccountExpense[];
};

const customerListSelect = `
  SELECT c.id, c.name, c.father_name AS fatherName, c.phone_normalized AS phone,
    substr(c.cnic_normalized,1,5) || '-' || substr(c.cnic_normalized,6,7) || '-' || substr(c.cnic_normalized,13,1) AS cnic,
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
    ), 0) + coalesce((
      SELECT sum(e.amount - coalesce((SELECT sum(r.amount) FROM expense_recoveries r WHERE r.agency_id=e.agency_id AND r.expense_id=e.id AND r.status='posted'),0))
      FROM expenses e WHERE e.agency_id=c.agency_id AND e.customer_id=c.id AND e.status='approved'
    ), 0) AS outstanding,
    coalesce((
      SELECT sum(e.amount - coalesce((SELECT sum(r.amount) FROM expense_recoveries r WHERE r.agency_id=e.agency_id AND r.expense_id=e.id AND r.status='posted'),0))
      FROM expenses e WHERE e.agency_id=c.agency_id AND e.customer_id=c.id AND e.status='approved'
    ), 0) AS expenseDue
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
  const expenses = await listAccountExpenses(context.agencyId, { customerId: id });
  const expenseDue = expenses.reduce((sum, row) => sum + row.amount - row.recovered, 0);
  const bookings = await queryAll<{ id: string; publicNumber: number | null; vehicle: string; plate: string; status: string; pickupAt: string; returnAt: string; totalAmount: number; discount: number; dailyRate: number; paid: number; archivedAt: string | null }>(`
    SELECT bk.id, CASE WHEN bk.fulfillment_type='external' THEN bk.external_vehicle_make||' '||bk.external_vehicle_model||coalesce(' '||bk.external_vehicle_year,'') ELSE v.make||' '||v.model||' '||v.year END AS vehicle, coalesce(bk.external_vehicle_plate,v.plate) AS plate,
      bk.status, bk.pickup_at AS pickupAt, bk.return_at AS returnAt, bk.total_amount AS totalAmount, bk.archived_at AS archivedAt,
      bk.public_number AS publicNumber, coalesce(bk.discount,0) AS discount, coalesce(bk.daily_rate,0) AS dailyRate,
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
    outstanding: bookings.filter(item => !["cancelled", "no_show"].includes(item.status)).reduce((sum, item) => sum + Math.max(0, item.totalAmount - item.paid), 0) + expenseDue,
    expenseDue,
    credit: bookings.filter(item => !item.archivedAt).reduce((sum, item) => sum + Math.max(0, item.paid - item.totalAmount), 0),
    lastRentalAt: bookings[0]?.returnAt ?? null,
    bookings: bookings.map(booking => ({ id: booking.id, publicNumber: booking.publicNumber, vehicle: booking.vehicle, plate: booking.plate, status: booking.status, pickupAt: booking.pickupAt, returnAt: booking.returnAt, totalAmount: booking.totalAmount, discount: booking.discount, dailyRate: booking.dailyRate, paid: booking.paid })),
    expenses,
  };
}

/** Allocates a customer balance payment to the newest unpaid booking first, then to expenses charged to the customer (oldest first). */
export async function payCustomerBalance(context: RequestContext, customerId: string, input: { amount: number; method: string; reference?: string; idempotencyKey: string; discount?: number }) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  const discount = input?.discount ?? 0;
  if (!Number.isSafeInteger(discount) || discount < 0) throw new DomainError("VALIDATION_FAILED", "Enter a non-negative whole discount.", 400, { discount: "Enter a non-negative whole PKR discount." });
  if (!input || !Number.isSafeInteger(input.amount) || input.amount < 0 || (input.amount === 0 && discount === 0) || !input.method?.trim() || !input.idempotencyKey?.trim()) throw new DomainError("VALIDATION_FAILED", "Enter a positive whole amount and payment method.", 400);
  return inTransaction(async () => {
    await getCustomer(context, customerId);
    const previous=await queryAll<{metadata:string}>("SELECT metadata FROM audit_events WHERE agency_id=? AND entity_type='customer' AND entity_id=? AND action='customer.balance_payment_allocated' ORDER BY occurred_at DESC",[context.agencyId,customerId]);
    const replay=previous.map(row=>JSON.parse(row.metadata) as {idempotencyKey?:string;amount:number;method:string;reference:string;allocations:Array<{bookingId?:string;expenseId?:string;amount:number}>}).find(row=>row.idempotencyKey===input.idempotencyKey);
    if(replay){if(replay.amount!==input.amount||replay.method!==input.method.trim()||replay.reference!==(input.reference?.trim()??""))throw new DomainError("VERSION_CONFLICT","This payment retry key was already used with different details.",409);return {allocations:replay.allocations,customer:await getCustomerDetail(context,customerId)};}
    const bookings=await queryAll<{id:string;balance:number}>(`SELECT bk.id,
      max(0,bk.total_amount-coalesce((SELECT sum(CASE WHEN lower(ft.kind) IN ('refund','reversal','payment_adjustment_decrease') THEN -ft.amount ELSE ft.amount END) FROM financial_transactions ft WHERE ft.agency_id=bk.agency_id AND ft.booking_id=bk.id AND ft.status='posted' AND lower(ft.kind) IN ('payment','late_return_charge','deposit_applied','payment_adjustment_increase','payment_adjustment_decrease','reversal','refund')),0)) AS balance
      FROM bookings bk WHERE bk.agency_id=? AND bk.customer_id=? AND bk.archived_at IS NULL AND bk.status NOT IN ('draft','cancelled','no_show') ORDER BY bk.pickup_at DESC,bk.created_at DESC,bk.id DESC`,[context.agencyId,customerId]);
    const openExpenses=(await listAccountExpenses(context.agencyId,{customerId})).filter(row=>row.amount>row.recovered);
    const outstanding=bookings.reduce((sum,row)=>sum+row.balance,0)+openExpenses.reduce((sum,row)=>sum+row.amount-row.recovered,0);
    if (input.amount+discount>outstanding) throw new DomainError("VALIDATION_FAILED", "Payment and discount exceed the customer balance.",400,{amount:`Available balance is PKR ${outstanding.toLocaleString("en-PK")}.`});
    const bookingOutstanding=bookings.reduce((sum,row)=>sum+row.balance,0);
    if (discount>bookingOutstanding) throw new DomainError("VALIDATION_FAILED", "Discount can only reduce rental balances.",400,{discount:`Rental balance is PKR ${bookingOutstanding.toLocaleString("en-PK")}.`});
    let remaining=input.amount;
    let remainingDiscount=discount;
    const allocations:Array<{bookingId?:string;expenseId?:string;amount:number;discount?:number}>=[];
    for (const booking of bookings) {
      if (!remaining && !remainingDiscount) break;
      const amount=Math.min(remaining,booking.balance);
      // The discount settles whatever the payment leaves open on the same booking.
      const bookingDiscount=Math.min(remainingDiscount,booking.balance-amount);
      if (!amount && !bookingDiscount) continue;
      await recordBookingPayment(context,booking.id,{amount,discount:bookingDiscount,method:input.method.trim(),reference:input.reference?.trim()??"",idempotencyKey:`customer_${input.idempotencyKey}_${booking.id}`});
      allocations.push({bookingId:booking.id,amount,...(bookingDiscount?{discount:bookingDiscount}:{})});
      remaining-=amount;
      remainingDiscount-=bookingDiscount;
    }
    const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Karachi"}).format(new Date());
    for (const expense of openExpenses) {
      if (!remaining) break;
      const amount=Math.min(remaining,expense.amount-expense.recovered);
      await applyExpenseRecovery(context,expense.id,{amount,receivedOn:today<expense.date?expense.date:today,source:"customer",method:input.method.trim(),reference:input.reference?.trim()??"",note:"Customer balance payment",idempotencyKey:`customer_${input.idempotencyKey}_${expense.id}`});
      allocations.push({expenseId:expense.id,amount});
      remaining-=amount;
    }
    const now=new Date().toISOString();
    await execute("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)",[randomUUID(),context.agencyId,context.userId,"customer.balance_payment_allocated","customer",customerId,JSON.stringify({idempotencyKey:input.idempotencyKey,amount:input.amount,discount,method:input.method.trim(),reference:input.reference?.trim()??"",allocations,order:"LIFO"}),now]);
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
    const duplicate = await queryOne<{ id: string; archivedAt: string | null }>("SELECT id,archived_at AS archivedAt FROM customers WHERE agency_id=? AND cnic_normalized=? LIMIT 1",[context.agencyId, input.cnicNormalized]);
    if (duplicate && !duplicate.archivedAt) throw new DomainError("VALIDATION_FAILED", "A customer with this CNIC already exists. Open the existing customer to edit it.", 409, { cnic: "This CNIC belongs to an existing customer." });
    const now = new Date().toISOString();
    if (duplicate) {
      // A deleted (archived) customer keeps their CNIC; adding the same person again restores that record with the new details.
      await execute(`UPDATE customers SET name=?,father_name=?,phone_normalized=?,email=?,date_of_birth=?,address=?,cnic_expires_at=?,license_number=?,license_expires_at=?,status='active',archived_at=NULL,version=version+1,updated_at=? WHERE agency_id=? AND id=?`,[input.name, input.fatherName ?? null, input.phoneNormalized, input.email ?? null, input.dateOfBirth ?? null, input.address ?? null, input.cnicExpiresAt ?? null, input.licenseNumber ?? null, input.licenseExpiresAt ?? null, now, context.agencyId, duplicate.id]);
      if (documentDraftId) await attachCustomerCnicDraft(context, documentDraftId, duplicate.id, now);
      await execute(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`,[randomUUID(), context.agencyId, context.userId, "customer.restored", "customer", duplicate.id, JSON.stringify({ name: input.name }), now]);
      return (await getCustomerRow(context, duplicate.id))!;
    }
    const id = `cus_${randomUUID()}`;
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
    if (duplicate) throw new DomainError("VALIDATION_FAILED", "Another customer already uses this CNIC.", 409, { cnic: "This CNIC belongs to another customer." });
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
