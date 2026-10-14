import "server-only";

import { randomUUID } from "node:crypto";
import { sqlite } from "@/db/connection";
import type { RequestContext } from "@/server/context/request-context";
import { createTransactionInvoice, type InvoiceLine } from "@/server/documents/transaction-invoice";
import { ensureWhatsAppRuntimeForDelivery } from "@/server/services/whatsapp-settings-service";
import { sendWhatsAppDocument, sendWhatsAppText } from "@/server/whatsapp/runtime-registry";
import { formatPaymentReceiptNumber } from "@/lib/payment-receipt";

export type NotificationDeliveryResult = { status: "sent" | "skipped" | "failed"; message: string };

type BookingNoticeRow = {
  publicNumber: number | null; agency: string; customer: string; phone: string; vehicle: string; plate: string;
  totalAmount: number; paid: number; checkoutOdometer: number | null; checkinOdometer: number | null;
  checkoutFuel: string | null; checkinFuel: string | null; checkedOutAt: string | null; completedAt: string | null;
};

export async function deliverCheckoutNotice(context: RequestContext, bookingId: string) {
  const row = bookingNotice(context.agencyId, bookingId);
  if (!row) return failed("Checkout was saved, but its customer notice could not be prepared.");
  return deliverBookingPdf(context, bookingId, row, {
    action: "booking.checkout_notice",
    title: "Vehicle checkout receipt",
    fileName: `checkout-${row.publicNumber ?? bookingId}.pdf`,
    caption: `Checkout receipt #${row.publicNumber ?? bookingId} · odometer ${formatKm(row.checkoutOdometer)}`,
    issuedAt: row.checkedOutAt ?? new Date().toISOString(),
    lines: [
      { label: "Vehicle", value: `${row.vehicle} · ${row.plate}` },
      { label: "Checkout odometer", value: formatKm(row.checkoutOdometer) },
      { label: "Fuel level", value: row.checkoutFuel ?? "Not recorded" },
    ],
    amountLabel: "Rental total",
    amount: row.totalAmount,
  });
}

export async function deliverCheckinInvoice(context: RequestContext, bookingId: string) {
  const row = bookingNotice(context.agencyId, bookingId);
  if (!row) return failed("Check-in was saved, but its invoice could not be prepared.");
  return deliverBookingPdf(context, bookingId, row, {
    action: "booking.checkin_invoice",
    title: "Final rental invoice",
    fileName: `final-invoice-${row.publicNumber ?? bookingId}.pdf`,
    caption: `Final invoice #${row.publicNumber ?? bookingId} · balance ${money(Math.max(0, row.totalAmount - row.paid))}`,
    issuedAt: row.completedAt ?? new Date().toISOString(),
    lines: [
      { label: "Vehicle", value: `${row.vehicle} · ${row.plate}` },
      { label: "Checkout odometer", value: formatKm(row.checkoutOdometer) },
      { label: "Check-in odometer", value: formatKm(row.checkinOdometer) },
      { label: "Distance travelled", value: formatKm(row.checkoutOdometer === null || row.checkinOdometer === null ? null : row.checkinOdometer - row.checkoutOdometer) },
      { label: "Paid", value: money(row.paid) },
      { label: "Outstanding balance", value: money(Math.max(0, row.totalAmount - row.paid)) },
    ],
    amountLabel: "Final rental total",
    amount: row.totalAmount,
  });
}

export async function deliverPaymentInvoice(context: RequestContext, bookingId: string, payment: { amount: number; method: string; reference?: string; receiptNumber: number | null }) {
  const row = bookingNotice(context.agencyId, bookingId);
  if (!row) return failed("Payment was posted, but its receipt could not be prepared.");
  if (payment.receiptNumber == null) return failed("Payment was posted, but its receipt number could not be prepared.");
  const receiptId = formatPaymentReceiptNumber(payment.receiptNumber);
  return deliverBookingPdf(context, bookingId, row, {
    action: "booking.payment_invoice",
    title: "Payment receipt",
    fileName: `payment-receipt-${receiptId}.pdf`,
    caption: `Payment receipt ${receiptId} · ${money(payment.amount)}`,
    issuedAt: new Date().toISOString(),
    lines: [
      { label: "Vehicle", value: `${row.vehicle} · ${row.plate}` },
      { label: "Method", value: payment.method },
      { label: "Receipt ID", value: receiptId },
      ...(payment.reference ? [{ label: "External reference", value: payment.reference }] : []),
      { label: "Total paid to date", value: money(row.paid) },
      { label: "Outstanding balance", value: money(Math.max(0, row.totalAmount - row.paid)) },
    ],
    amountLabel: "Payment received",
    amount: payment.amount,
    reference: receiptId,
  });
}

export async function deliverOwnerPayoutInvoice(context: RequestContext, ownerId: string, payout: { amount: number; method: string; reference: string; periodFrom: string; periodTo: string }) {
  const row = sqlite.prepare(`SELECT a.name AS agency,o.name AS owner,o.phone FROM owners o JOIN agencies a ON a.id=o.agency_id WHERE o.agency_id=? AND o.id=? LIMIT 1`)
    .get(context.agencyId, ownerId) as { agency: string; owner: string; phone: string } | undefined;
  if (!row) return failed("Payout was posted, but the owner invoice could not be prepared.");
  return deliverPdf(context, row.phone, "owner_payout", ownerId, {
    agency: row.agency, title: "Owner payout receipt", reference: payout.reference, recipient: row.owner,
    issuedAt: new Date().toISOString(), fileName: `owner-payout-${safeFilePart(payout.reference)}.pdf`,
    caption: `Owner payout receipt · ${money(payout.amount)} · ${payout.reference}`,
    lines: [
      { label: "Statement period", value: `${payout.periodFrom} to ${payout.periodTo}` },
      { label: "Payment method", value: payout.method },
      { label: "Reference", value: payout.reference },
    ], amountLabel: "Amount paid", amount: payout.amount,
  });
}

export async function deliverOwnerExpenseNotice(context: RequestContext, expenseId: string) {
  const row = sqlite.prepare(`SELECT e.id,e.amount,e.category,e.description,e.occurred_on AS occurredOn,o.id AS ownerId,o.name AS owner,o.phone,v.make||' '||v.model||' · '||v.plate AS vehicle
    FROM expenses e JOIN owners o ON o.id=e.owner_id AND o.agency_id=e.agency_id LEFT JOIN vehicles v ON v.id=e.vehicle_id AND v.agency_id=e.agency_id
    WHERE e.agency_id=? AND e.id=? LIMIT 1`).get(context.agencyId, expenseId) as { id:string;amount:number;category:string;description:string;occurredOn:string;ownerId:string;owner:string;phone:string;vehicle:string|null } | undefined;
  if (!row) return skipped("Expense saved. No owner message was needed because the expense is not allocated to an owner.");
  try {
    await ensureWhatsAppRuntimeForDelivery(context.agencyId);
    const sent = await sendWhatsAppText(context.agencyId, row.phone, [
      `VibeRent owner expense notice`, `Expense: ${row.id}`, `Date: ${row.occurredOn}`,
      `Category: ${row.category}`, `Vehicle: ${row.vehicle ?? "Not linked"}`, `Details: ${row.description}`, `Amount: ${money(row.amount)}`,
    ].join("\n"));
    audit(context, "expense", expenseId, "expense.owner_notice_sent", { messageId: sent.id, ownerId: row.ownerId });
    return sentResult(`Expense saved and details sent to ${row.owner} on WhatsApp.`);
  } catch (error) {
    audit(context, "expense", expenseId, "expense.owner_notice_failed", { reason: safeReason(error) });
    return failed("Expense saved, but the owner WhatsApp message failed. Check the connection and owner phone number.");
  }
}

async function deliverBookingPdf(context: RequestContext, bookingId: string, row: BookingNoticeRow, input: { action:string;title:string;fileName:string;caption:string;issuedAt:string;lines:InvoiceLine[];amountLabel:string;amount:number;reference?:string }) {
  return deliverPdf(context, row.phone, input.action, bookingId, { agency:row.agency,title:input.title,reference:input.reference??String(row.publicNumber ?? bookingId),recipient:row.customer,issuedAt:input.issuedAt,fileName:input.fileName,caption:input.caption,lines:input.lines,amountLabel:input.amountLabel,amount:input.amount });
}

async function deliverPdf(context: RequestContext, phone: string, action: string, entityId: string, input: { agency:string;title:string;reference:string;recipient:string;issuedAt:string;fileName:string;caption:string;lines:InvoiceLine[];amountLabel:string;amount:number }) {
  if (!phone.trim()) return skipped("The record was saved, but WhatsApp delivery was skipped because no phone number is available.");
  try {
    const document = await createTransactionInvoice(input);
    await ensureWhatsAppRuntimeForDelivery(context.agencyId);
    const sent = await sendWhatsAppDocument(context.agencyId, phone, { document, mimeType:"application/pdf", fileName:input.fileName, caption:input.caption });
    audit(context, action.startsWith("owner_") ? "owner" : "booking", entityId, `${action}_sent`, { messageId: sent.id });
    return sentResult(`${input.title} sent to ${input.recipient} on WhatsApp.`);
  } catch (error) {
    audit(context, action.startsWith("owner_") ? "owner" : "booking", entityId, `${action}_failed`, { reason: safeReason(error) });
    return failed(`${input.title} could not be sent. Check the WhatsApp connection and recipient phone number.`);
  }
}

function bookingNotice(agencyId: string, bookingId: string) {
  return sqlite.prepare(`SELECT b.public_number AS publicNumber,a.name AS agency,c.name AS customer,c.phone_normalized AS phone,CASE WHEN b.fulfillment_type='external' THEN b.external_vehicle_make||' '||b.external_vehicle_model||coalesce(' '||b.external_vehicle_year,'') ELSE v.make||' '||v.model||' '||v.year END AS vehicle,coalesce(b.external_vehicle_plate,v.plate) AS plate,b.total_amount AS totalAmount,
    coalesce((SELECT sum(CASE WHEN lower(ft.kind) IN ('refund','reversal') THEN -ft.amount ELSE ft.amount END) FROM financial_transactions ft WHERE ft.agency_id=b.agency_id AND ft.booking_id=b.id AND ft.status='posted' AND lower(ft.kind) IN ('payment','deposit_applied','reversal','refund')),0) AS paid,
    (SELECT odometer FROM rental_inspections ri WHERE ri.agency_id=b.agency_id AND ri.booking_id=b.id AND ri.kind='checkout') AS checkoutOdometer,
    (SELECT odometer FROM rental_inspections ri WHERE ri.agency_id=b.agency_id AND ri.booking_id=b.id AND ri.kind='checkin') AS checkinOdometer,
    (SELECT fuel_level FROM rental_inspections ri WHERE ri.agency_id=b.agency_id AND ri.booking_id=b.id AND ri.kind='checkout') AS checkoutFuel,
    (SELECT fuel_level FROM rental_inspections ri WHERE ri.agency_id=b.agency_id AND ri.booking_id=b.id AND ri.kind='checkin') AS checkinFuel,
    b.checked_out_at AS checkedOutAt,b.completed_at AS completedAt
    FROM bookings b JOIN agencies a ON a.id=b.agency_id JOIN customers c ON c.id=b.customer_id AND c.agency_id=b.agency_id LEFT JOIN vehicles v ON v.id=b.vehicle_id AND v.agency_id=b.agency_id WHERE b.agency_id=? AND b.id=? LIMIT 1`)
    .get(agencyId, bookingId) as BookingNoticeRow | undefined;
}

function audit(context: RequestContext, entityType: string, entityId: string, action: string, metadata: Record<string, unknown>) {
  sqlite.prepare("INSERT INTO audit_events (id,agency_id,actor_id,action,entity_type,entity_id,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,?)")
    .run(`aud_${randomUUID()}`, context.agencyId, context.userId, action, entityType, entityId, JSON.stringify(metadata), new Date().toISOString());
}
function safeReason(error: unknown) { const message=error instanceof Error?error.message:"unknown";if(message.includes("already active"))return "duplicate_session";if(message.includes("not connected")||message.includes("reconnect"))return "whatsapp_not_connected";if(message.includes("not registered"))return "recipient_not_registered";return "delivery_failed"; }
function safeFilePart(value:string){return value.replace(/[^a-z0-9_-]/gi,"-").slice(0,40)||"receipt";}
function formatKm(value:number|null){return value===null?"Not recorded":`${value.toLocaleString("en-PK")} km`;}
function money(value:number){return `PKR ${value.toLocaleString("en-PK")}`;}
function sentResult(message:string):NotificationDeliveryResult{return {status:"sent",message};}
function skipped(message:string):NotificationDeliveryResult{return {status:"skipped",message};}
function failed(message:string):NotificationDeliveryResult{return {status:"failed",message};}
