import "server-only";

import { queryOne } from "@/db/query";
import type { RequestContext } from "@/server/context/request-context";
import { createRentalAgreementPdf } from "@/server/documents/rental-agreement";
import { createTransactionInvoice, type InvoiceLine } from "@/server/documents/transaction-invoice";
import { renderDailyReport } from "@/server/notifications/daily-report";
import type { NotificationDeliveryRow } from "@/server/notifications/notification-service";
import { formatPaymentReceiptNumber } from "@/lib/payment-receipt";

/** The content of a delivery, ready for WhatsApp. Rendering runs in the worker, never in a web request. */
export type RenderedNotification =
  | { status: "ready"; phone: string; recipientName: string; document?: { bytes: Buffer; fileName: string }; text?: string; caption?: string }
  | { status: "skipped"; reason: string };

type BookingNoticeRow = {
  publicNumber: number | null; agency: string; customer: string; phone: string; vehicle: string; plate: string;
  totalAmount: number; paid: number; checkoutOdometer: number | null; checkinOdometer: number | null;
  checkoutFuel: string | null; checkinFuel: string | null; checkedOutAt: string | null; completedAt: string | null;
};

type BookingPdfInput = { action:string;title:string;fileName:string;caption:string;issuedAt:string;lines:InvoiceLine[];amountLabel:string;amount:number;reference?:string };

function checkoutNoticeInput(bookingId: string, row: BookingNoticeRow): BookingPdfInput {
  return {
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
  };
}

function checkinInvoiceInput(bookingId: string, row: BookingNoticeRow): BookingPdfInput {
  return {
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
  };
}

function bookingStatementInput(bookingId: string, row: BookingNoticeRow): BookingPdfInput {
  return {
    action: "booking.statement",
    title: "Booking payment statement",
    fileName: `statement-${row.publicNumber ?? bookingId}.pdf`,
    caption: `Booking #${row.publicNumber ?? bookingId} · paid ${money(row.paid)} · balance ${money(Math.max(0, row.totalAmount - row.paid))}`,
    issuedAt: new Date().toISOString(),
    lines: [
      { label: "Vehicle", value: `${row.vehicle} · ${row.plate}` },
      { label: "Rental total", value: money(row.totalAmount) },
      { label: "Total paid to date", value: money(row.paid) },
      { label: "Outstanding balance", value: money(Math.max(0, row.totalAmount - row.paid)) },
    ],
    amountLabel: "Outstanding balance",
    amount: Math.max(0, row.totalAmount - row.paid),
  };
}

export type BookingDocumentKind = "checkout" | "checkin" | "statement";

/**
 * Renders a booking receipt/invoice PDF without sending it, so the mobile app can share it from the
 * phone's own WhatsApp (or save it). Returns null when the booking does not exist in this agency.
 */
export async function renderBookingDocument(context: RequestContext, bookingId: string, kind: BookingDocumentKind) {
  const row = await bookingNotice(context.agencyId, bookingId);
  if (!row) return null;
  const input = kind === "checkout" ? checkoutNoticeInput(bookingId, row) : kind === "checkin" ? checkinInvoiceInput(bookingId, row) : bookingStatementInput(bookingId, row);
  const bytes = await createTransactionInvoice({ agency: row.agency, title: input.title, reference: input.reference ?? String(row.publicNumber ?? bookingId), recipient: row.customer, issuedAt: input.issuedAt, lines: input.lines, amountLabel: input.amountLabel, amount: input.amount });
  return { bytes, fileName: input.fileName, caption: input.caption };
}

/** Builds the PDF or text for a queued delivery. `context` is the agency-scoped system context of the job. */
export async function renderNotification(context: RequestContext, delivery: NotificationDeliveryRow): Promise<RenderedNotification> {
  const payload = JSON.parse(delivery.payload || "{}") as Record<string, unknown>;
  switch (delivery.kind) {
    case "booking.agreement": return renderAgreement(context, delivery.entityId);
    case "booking.checkout_notice": return renderBookingPdf(context.agencyId, delivery.entityId, row => checkoutNoticeInput(delivery.entityId, row));
    case "booking.checkin_invoice": return renderBookingPdf(context.agencyId, delivery.entityId, row => checkinInvoiceInput(delivery.entityId, row));
    case "booking.payment_receipt": return renderBookingPdf(context.agencyId, delivery.entityId, row => paymentReceiptInput(row, payload as PaymentPayload));
    case "owner.payout_receipt": return renderOwnerPayout(context.agencyId, delivery.entityId, payload as PayoutPayload);
    case "owner.expense_notice": return renderOwnerExpenseNotice(context.agencyId, delivery.entityId);
    case "owner.command_reply": return { status: "ready", phone: String(payload.phone ?? ""), recipientName: "Owner", text: String(payload.text ?? "") };
    case "report.daily": return renderDailyReport(context.agencyId, String(payload.day ?? ""));
  }
}

type PaymentPayload = { amount: number; method: string; reference?: string; receiptNumber: number | null };
type PayoutPayload = { amount: number; method: string; reference: string; periodFrom: string; periodTo: string };

async function renderAgreement(context: RequestContext, bookingId: string): Promise<RenderedNotification> {
  const booking = await queryOne<{ publicNumber: number | null; renterSkipped: number; customer: string }>(
    "SELECT b.public_number AS publicNumber,b.renter_skipped AS renterSkipped,c.name AS customer FROM bookings b JOIN customers c ON c.id=b.customer_id AND c.agency_id=b.agency_id WHERE b.agency_id=? AND b.id=? LIMIT 1",
    [context.agencyId, bookingId],
  );
  if (!booking) throw new Error("The rental agreement could not be found.");
  if (booking.renterSkipped) return { status: "skipped", reason: "This with-driver booking has no renter contact." };
  const agreement = await createRentalAgreementPdf(context, bookingId);
  if (!agreement.customerPhone.trim()) return { status: "skipped", reason: "The customer has no phone number." };
  return {
    status: "ready", phone: agreement.customerPhone, recipientName: booking.customer,
    document: { bytes: agreement.bytes, fileName: agreement.fileName }, caption: `Rental agreement #${booking.publicNumber ?? bookingId}`,
  };
}

async function renderBookingPdf(agencyId: string, bookingId: string, build: (row: BookingNoticeRow) => BookingPdfInput): Promise<RenderedNotification> {
  const row = await bookingNotice(agencyId, bookingId);
  if (!row) throw new Error("The booking for this notice could not be found.");
  if (!row.phone?.trim()) return { status: "skipped", reason: "No phone number is available for the customer." };
  const input = build(row);
  const bytes = await createTransactionInvoice({ agency: row.agency, title: input.title, reference: input.reference ?? String(row.publicNumber ?? bookingId), recipient: row.customer, issuedAt: input.issuedAt, lines: input.lines, amountLabel: input.amountLabel, amount: input.amount });
  return { status: "ready", phone: row.phone, recipientName: row.customer, document: { bytes, fileName: input.fileName }, caption: input.caption };
}

function paymentReceiptInput(row: BookingNoticeRow, payment: PaymentPayload): BookingPdfInput {
  if (payment.receiptNumber == null) throw new Error("The payment receipt number is missing.");
  const receiptId = formatPaymentReceiptNumber(payment.receiptNumber);
  return {
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
  };
}

async function renderOwnerPayout(agencyId: string, ownerId: string, payout: PayoutPayload): Promise<RenderedNotification> {
  const row = await queryOne<{ agency: string; owner: string; phone: string }>(`SELECT a.name AS agency,o.name AS owner,o.phone FROM owners o JOIN agencies a ON a.id=o.agency_id WHERE o.agency_id=? AND o.id=? LIMIT 1`,[agencyId, ownerId]);
  if (!row) throw new Error("The owner for this payout could not be found.");
  if (!row.phone?.trim()) return { status: "skipped", reason: "The owner has no phone number." };
  const bytes = await createTransactionInvoice({
    agency: row.agency, title: "Owner payout receipt", reference: payout.reference, recipient: row.owner, issuedAt: new Date().toISOString(),
    lines: [
      { label: "Statement period", value: `${payout.periodFrom} to ${payout.periodTo}` },
      { label: "Payment method", value: payout.method },
      { label: "Reference", value: payout.reference },
    ], amountLabel: "Amount paid", amount: payout.amount,
  });
  return {
    status: "ready", phone: row.phone, recipientName: row.owner,
    document: { bytes, fileName: `owner-payout-${safeFilePart(payout.reference)}.pdf` },
    caption: `Owner payout receipt · ${money(payout.amount)} · ${payout.reference}`,
  };
}

async function renderOwnerExpenseNotice(agencyId: string, expenseId: string): Promise<RenderedNotification> {
  const row = await queryOne<{ id:string;amount:number;category:string;description:string;occurredOn:string;owner:string;phone:string;vehicle:string|null }>(`SELECT e.id,e.amount,e.category,e.description,e.occurred_on AS occurredOn,o.name AS owner,o.phone,v.make||' '||v.model||' · '||v.plate AS vehicle
    FROM expenses e JOIN owners o ON o.id=e.owner_id AND o.agency_id=e.agency_id LEFT JOIN vehicles v ON v.id=e.vehicle_id AND v.agency_id=e.agency_id
    WHERE e.agency_id=? AND e.id=? LIMIT 1`,[agencyId, expenseId]);
  if (!row) return { status: "skipped", reason: "The expense is not allocated to an owner." };
  if (!row.phone?.trim()) return { status: "skipped", reason: "The owner has no phone number." };
  return {
    status: "ready", phone: row.phone, recipientName: row.owner,
    text: [
      `VibeRent owner expense notice`, `Expense: ${row.id}`, `Date: ${row.occurredOn}`,
      `Category: ${row.category}`, `Vehicle: ${row.vehicle ?? "Not linked"}`, `Details: ${row.description}`, `Amount: ${money(row.amount)}`,
    ].join("\n"),
  };
}

function bookingNotice(agencyId: string, bookingId: string) {
  return queryOne<BookingNoticeRow>(`SELECT b.public_number AS publicNumber,a.name AS agency,c.name AS customer,c.phone_normalized AS phone,CASE WHEN b.fulfillment_type='external' THEN b.external_vehicle_make||' '||b.external_vehicle_model||coalesce(' '||b.external_vehicle_year,'') ELSE v.make||' '||v.model||' '||v.year END AS vehicle,coalesce(b.external_vehicle_plate,v.plate) AS plate,b.total_amount AS totalAmount,
    coalesce((SELECT sum(CASE WHEN lower(ft.kind) IN ('refund','reversal','payment_adjustment_decrease') THEN -ft.amount ELSE ft.amount END) FROM financial_transactions ft WHERE ft.agency_id=b.agency_id AND ft.booking_id=b.id AND ft.status='posted' AND lower(ft.kind) IN ('payment','late_return_charge','deposit_applied','payment_adjustment_increase','payment_adjustment_decrease','reversal','refund')),0) AS paid,
    (SELECT odometer FROM rental_inspections ri WHERE ri.agency_id=b.agency_id AND ri.booking_id=b.id AND ri.kind='checkout') AS checkoutOdometer,
    (SELECT odometer FROM rental_inspections ri WHERE ri.agency_id=b.agency_id AND ri.booking_id=b.id AND ri.kind='checkin') AS checkinOdometer,
    (SELECT fuel_level FROM rental_inspections ri WHERE ri.agency_id=b.agency_id AND ri.booking_id=b.id AND ri.kind='checkout') AS checkoutFuel,
    (SELECT fuel_level FROM rental_inspections ri WHERE ri.agency_id=b.agency_id AND ri.booking_id=b.id AND ri.kind='checkin') AS checkinFuel,
    b.checked_out_at AS checkedOutAt,b.completed_at AS completedAt
    FROM bookings b JOIN agencies a ON a.id=b.agency_id JOIN customers c ON c.id=b.customer_id AND c.agency_id=b.agency_id LEFT JOIN vehicles v ON v.id=b.vehicle_id AND v.agency_id=b.agency_id WHERE b.agency_id=? AND b.id=? LIMIT 1`,[agencyId, bookingId]);
}

function safeFilePart(value:string){return value.replace(/[^a-z0-9_-]/gi,"-").slice(0,40)||"receipt";}
function formatKm(value:number|null){return value===null?"Not recorded":`${value.toLocaleString("en-PK")} km`;}
function money(value:number){return `PKR ${value.toLocaleString("en-PK")}`;}
