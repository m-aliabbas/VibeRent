import "server-only";
import { randomUUID } from "node:crypto";
import { execute, inTransaction, queryAll, queryOne } from "@/db/query";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";
import { parseCreateCustomerInput } from "@/server/validation/customer";
import { attachCustomerCnicDraft } from "@/server/services/customer-cnic-service";
import { recordBookingPayment } from "@/server/services/booking-service";
import { isCalendarDate } from "@/server/validation/booking";
import { getAgencyTimeZone } from "@/server/context/agency-time-zone";
import { zonedDayKey } from "@/lib/timezone";
import { attachCustomerDocumentDraft } from "@/server/services/person-document-service";
import { applyExpenseRecovery, listAccountExpenses } from "@/server/services/expense-service";
import type { AccountExpense } from "@/lib/reports/account-summary";
import { chargedNow, type CustomerLedgerPayment } from "@/lib/reports/customer-ledger";
import { formatPaymentReceiptNumber } from "@/lib/payment-receipt";

export type CustomerDto = { id: string; name: string; fatherName: string | null; phone: string; cnic: string; email: string | null; dateOfBirth: string | null; address: string | null; cnicExpiresAt: string | null; licenseNumber: string | null; licenseExpiresAt: string | null; status: string; version: number; updatedAt: string; bookingCount: number; paidAmount: number; outstanding: number; expenseDue: number };

export type CustomerDetailDto = CustomerDto & {
  lifetimeValue: number;
  /** Paid above booking totals (overpayments not yet refunded). */
  credit: number;
  lastRentalAt: string | null;
  /** totalAmount is net of discount; discount covers booking-time and settlement discounts. */
  bookings: Array<{ id: string; publicNumber: number | null; vehicle: string; plate: string; status: string; pickupAt: string; returnAt: string; returnedAt: string | null; totalAmount: number; discount: number; dailyRate: number; paid: number }>;
  /** Approved expenses charged to this customer, with recovered amounts, for the income/expense summary. */
  expenses: AccountExpense[];
  /** Money received from or returned to the customer, dated by when it happened (for the dated ledger). */
  payments: CustomerLedgerPayment[];
};

const moneyKinds = "'payment','late_return_charge','deposit_applied','payment_adjustment_increase','payment_adjustment_decrease','reversal','refund'";
const kindLabel: Record<string, string> = { payment: "Payment received", late_return_charge: "Late-return charge paid", deposit_applied: "Deposit applied", payment_adjustment_increase: "Payment correction", payment_adjustment_decrease: "Payment correction", reversal: "Payment reversed", refund: "Refund" };

async function listCustomerPayments(agencyId: string, customerId: string, expenses: AccountExpense[]): Promise<CustomerLedgerPayment[]> {
  const transactions = await queryAll<{ id: string; date: string; kind: string; amount: number; method: string; reference: string; receiptNumber: number | null; bookingId: string; publicNumber: number | null; plate: string | null }>(`
    SELECT ft.id, ft.posted_at AS date, lower(ft.kind) AS kind, ft.amount, ft.method, ft.reference, ft.receipt_number AS receiptNumber, bk.id AS bookingId, bk.public_number AS publicNumber, coalesce(bk.external_vehicle_plate,v.plate) AS plate
    FROM financial_transactions ft
    JOIN bookings bk ON bk.id=ft.booking_id AND bk.agency_id=ft.agency_id
    LEFT JOIN vehicles v ON v.id=bk.vehicle_id AND v.agency_id=bk.agency_id
    WHERE ft.agency_id=? AND bk.customer_id=? AND bk.archived_at IS NULL AND ft.status='posted' AND lower(ft.kind) IN (${moneyKinds})
      -- A deleted (reversed) payment and the reversal that cancels it net to zero: neither is shown.
      AND NOT (lower(ft.kind)='reversal' AND ft.linked_transaction_id IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM financial_transactions rv WHERE rv.agency_id=ft.agency_id AND rv.linked_transaction_id=ft.id AND rv.status='posted' AND lower(rv.kind)='reversal')
    ORDER BY ft.posted_at, ft.created_at, ft.receipt_number`, [agencyId, customerId]);
  const expenseById = new Map(expenses.map(row => [row.id, row]));
  const recoveries = expenses.length ? await queryAll<{ id: string; expenseId: string; date: string; amount: number; method: string; reference: string }>(`
    SELECT r.id, r.expense_id AS expenseId, r.received_on AS date, r.amount, r.method, r.reference
    FROM expense_recoveries r JOIN expenses e ON e.id=r.expense_id AND e.agency_id=r.agency_id
    WHERE r.agency_id=? AND e.customer_id=? AND r.status='posted' ORDER BY r.received_on, r.created_at`, [agencyId, customerId]) : [];
  const negative = new Set(["refund", "reversal", "payment_adjustment_decrease"]);
  // Ledger rows show the agency's calendar day of the payment, not the UTC day of the stored instant.
  const timeZone = await getAgencyTimeZone(agencyId);
  return [
    ...transactions.map(row => ({
      id: row.id, date: zonedDayKey(row.date, timeZone), bookingId: row.bookingId, plate: row.plate ?? "",
      amount: negative.has(row.kind) ? -Number(row.amount) : Number(row.amount),
      description: [`${kindLabel[row.kind] ?? "Payment"} · ${row.publicNumber ? `#${row.publicNumber}` : row.bookingId}`, row.method && row.method !== "manual_correction" ? row.method : "", row.receiptNumber ? formatPaymentReceiptNumber(row.receiptNumber) : row.reference].filter(Boolean).join(" · "),
    })),
    ...recoveries.filter(row => expenseById.has(row.expenseId)).map(row => {
      const expense = expenseById.get(row.expenseId)!;
      return { id: row.id, date: row.date, expenseId: row.expenseId, plate: expense.plate ?? "", amount: Number(row.amount), description: [`Expense repaid · ${expense.head}`, row.method, row.reference].filter(Boolean).join(" · ") };
    }),
  ];
}

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
        -- Reserved and on-rent bookings are charged when the car comes back.
        AND bk.status NOT IN ('cancelled','no_show','draft','confirmed','checked_out')
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
  const bookings = await queryAll<{ id: string; publicNumber: number | null; vehicle: string; plate: string; status: string; pickupAt: string; returnAt: string; returnedAt: string | null; totalAmount: number; discount: number; dailyRate: number; paid: number }>(`
    SELECT bk.id, CASE WHEN bk.fulfillment_type='external' THEN bk.external_vehicle_make||' '||bk.external_vehicle_model||coalesce(' '||bk.external_vehicle_year,'') ELSE v.make||' '||v.model||' '||v.year END AS vehicle, coalesce(bk.external_vehicle_plate,v.plate) AS plate,
      bk.status, bk.pickup_at AS pickupAt, bk.return_at AS returnAt, bk.total_amount AS totalAmount,
      (SELECT ri.occurred_at FROM rental_inspections ri WHERE ri.agency_id=bk.agency_id AND ri.booking_id=bk.id AND ri.kind='checkin' LIMIT 1) AS returnedAt,
      bk.public_number AS publicNumber, coalesce(bk.discount,0) AS discount, coalesce(bk.daily_rate,0) AS dailyRate,
      coalesce((SELECT sum(CASE WHEN lower(ft.kind) IN ('refund','reversal','payment_adjustment_decrease') THEN -ft.amount ELSE ft.amount END)
        FROM financial_transactions ft WHERE ft.agency_id=bk.agency_id AND ft.booking_id=bk.id AND ft.status='posted' AND lower(ft.kind) IN ('payment','late_return_charge','deposit_applied','payment_adjustment_increase','payment_adjustment_decrease','reversal','refund')),0) AS paid
    FROM bookings bk
    LEFT JOIN vehicles v ON v.id=bk.vehicle_id AND v.agency_id=bk.agency_id
    WHERE bk.agency_id=? AND bk.customer_id=? AND bk.archived_at IS NULL
    ORDER BY bk.pickup_at DESC
  `,[context.agencyId, id]);
  return {
    ...customer,
    bookingCount: bookings.length,
    lifetimeValue: bookings.filter(item => item.status === "completed").reduce((sum, item) => sum + item.totalAmount, 0),
    outstanding: bookings.filter(item => chargedNow(item.status)).reduce((sum, item) => sum + Math.max(0, item.totalAmount - item.paid), 0) + expenseDue,
    expenseDue,
    credit: bookings.reduce((sum, item) => sum + Math.max(0, item.paid - item.totalAmount), 0),
    lastRentalAt: bookings[0]?.returnAt ?? null,
    bookings: bookings.map(booking => ({ id: booking.id, publicNumber: booking.publicNumber, vehicle: booking.vehicle, plate: booking.plate, status: booking.status, pickupAt: booking.pickupAt, returnAt: booking.returnAt, returnedAt: booking.returnedAt, totalAmount: booking.totalAmount, discount: booking.discount, dailyRate: booking.dailyRate, paid: booking.paid })),
    expenses,
    payments: await listCustomerPayments(context.agencyId, id, expenses),
  };
}

/**
 * Allocates a customer balance payment first-in, first-out: the oldest unpaid booking is cleared first, then the
 * next, and so on; anything left settles expenses charged to the customer (oldest first). `paidOn` dates every
 * resulting ledger entry, so the customer ledger and the system ledger both show the day the money was received.
 */
export async function payCustomerBalance(context: RequestContext, customerId: string, input: { amount: number; method: string; reference?: string; idempotencyKey: string; discount?: number; paidOn?: string }) {
  requireRole(context, ["agency_owner", "fleet_manager", "rental_agent", "accountant"]);
  const discount = input?.discount ?? 0;
  if (!Number.isSafeInteger(discount) || discount < 0) throw new DomainError("VALIDATION_FAILED", "Enter a non-negative whole discount.", 400, { discount: "Enter a non-negative whole PKR discount." });
  if (!input || !Number.isSafeInteger(input.amount) || input.amount < 0 || (input.amount === 0 && discount === 0) || !input.method?.trim() || !input.idempotencyKey?.trim()) throw new DomainError("VALIDATION_FAILED", "Enter a positive whole amount and payment method.", 400);
  const paidOn = input.paidOn || undefined;
  if (paidOn !== undefined && !isCalendarDate(paidOn)) throw new DomainError("VALIDATION_FAILED", "Enter a valid payment date.", 400, { paidOn: "Enter a valid payment date." });
  const today = zonedDayKey(new Date(), await getAgencyTimeZone(context.agencyId));
  if (paidOn && paidOn > today) throw new DomainError("VALIDATION_FAILED", "The payment date cannot be in the future.", 400, { paidOn: "Choose today or an earlier date." });
  return inTransaction(async () => {
    await getCustomer(context, customerId);
    const previous=await queryAll<{metadata:string}>("SELECT metadata FROM audit_events WHERE agency_id=? AND entity_type='customer' AND entity_id=? AND action='customer.balance_payment_allocated' ORDER BY occurred_at DESC",[context.agencyId,customerId]);
    const replay=previous.map(row=>JSON.parse(row.metadata) as {idempotencyKey?:string;amount:number;method:string;reference:string;allocations:Array<{bookingId?:string;expenseId?:string;amount:number}>}).find(row=>row.idempotencyKey===input.idempotencyKey);
    if(replay){if(replay.amount!==input.amount||replay.method!==input.method.trim()||replay.reference!==(input.reference?.trim()??""))throw new DomainError("VERSION_CONFLICT","This payment retry key was already used with different details.",409);return {allocations:replay.allocations,customer:await getCustomerDetail(context,customerId)};}
    const bookings=await queryAll<{id:string;balance:number}>(`SELECT bk.id,
      max(0,bk.total_amount-coalesce((SELECT sum(CASE WHEN lower(ft.kind) IN ('refund','reversal','payment_adjustment_decrease') THEN -ft.amount ELSE ft.amount END) FROM financial_transactions ft WHERE ft.agency_id=bk.agency_id AND ft.booking_id=bk.id AND ft.status='posted' AND lower(ft.kind) IN ('payment','late_return_charge','deposit_applied','payment_adjustment_increase','payment_adjustment_decrease','reversal','refund')),0)) AS balance
      FROM bookings bk WHERE bk.agency_id=? AND bk.customer_id=? AND bk.archived_at IS NULL AND bk.status NOT IN ('draft','cancelled','no_show','confirmed','checked_out') ORDER BY bk.pickup_at ASC,bk.created_at ASC,bk.id ASC`,[context.agencyId,customerId]);
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
      await recordBookingPayment(context,booking.id,{amount,discount:bookingDiscount,method:input.method.trim(),reference:input.reference?.trim()??"",idempotencyKey:`customer_${input.idempotencyKey}_${booking.id}`,paidOn});
      allocations.push({bookingId:booking.id,amount,...(bookingDiscount?{discount:bookingDiscount}:{})});
      remaining-=amount;
      remainingDiscount-=bookingDiscount;
    }
    const receivedOn=paidOn??today;
    for (const expense of openExpenses) {
      if (!remaining) break;
      const amount=Math.min(remaining,expense.amount-expense.recovered);
      await applyExpenseRecovery(context,expense.id,{amount,receivedOn:receivedOn<expense.date?expense.date:receivedOn,source:"customer",method:input.method.trim(),reference:input.reference?.trim()??"",note:"Customer balance payment",idempotencyKey:`customer_${input.idempotencyKey}_${expense.id}`});
      allocations.push({expenseId:expense.id,amount});
      remaining-=amount;
    }
    const now=new Date().toISOString();
    await execute("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)",[randomUUID(),context.agencyId,context.userId,"customer.balance_payment_allocated","customer",customerId,JSON.stringify({idempotencyKey:input.idempotencyKey,amount:input.amount,discount,method:input.method.trim(),reference:input.reference?.trim()??"",allocations,order:"FIFO",paidOn:paidOn??null}),now]);
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
      if (documentDraftId) { await attachCustomerCnicDraft(context, documentDraftId, duplicate.id, now); await attachCustomerDocumentDraft(context, documentDraftId, duplicate.id, now); }
      await execute(`INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)`,[randomUUID(), context.agencyId, context.userId, "customer.restored", "customer", duplicate.id, JSON.stringify({ name: input.name }), now]);
      return (await getCustomerRow(context, duplicate.id))!;
    }
    const id = `cus_${randomUUID()}`;
    await execute(`INSERT INTO customers (id,agency_id,name,father_name,phone_normalized,cnic_normalized,email,date_of_birth,address,cnic_expires_at,license_number,license_expires_at,status,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'active',1,?,?)`,[id, context.agencyId, input.name, input.fatherName ?? null, input.phoneNormalized, input.cnicNormalized, input.email ?? null, input.dateOfBirth ?? null, input.address ?? null, input.cnicExpiresAt ?? null, input.licenseNumber ?? null, input.licenseExpiresAt ?? null, now, now]);
    if (documentDraftId) { await attachCustomerCnicDraft(context, documentDraftId, id, now); await attachCustomerDocumentDraft(context, documentDraftId, id, now); }
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
