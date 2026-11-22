import "server-only";

import PDFDocument from "pdfkit";

import { queryOne } from "@/db/query";
import { formatInZone } from "@/lib/timezone";
import { formatPaymentReceiptNumber } from "@/lib/payment-receipt";
import { getAgencyTimeZone } from "@/server/context/agency-time-zone";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";
import { bookingActorId, drawSignatureBlock, loadDocumentBranding } from "@/server/services/branding-service";
import { getBooking } from "@/server/services/booking-service";

export type BookingInvoiceKind = "customer" | "supplier";

const LEFT = 44;
const WIDTH = 507;
const BLUE = "#006FE6";
const chargeLabels: Record<string, string> = { toll: "Toll tax", fuel: "Fuel", driver: "Driver allowance / expense", parking: "Parking", other: "Other charge" };
const money = (value: number) => `PKR ${Math.round(value).toLocaleString("en-PK")}`;
const cnic = (value?: string) => { const digits = value?.replace(/\D/g, "") ?? ""; return digits.length === 13 ? `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}` : value || ""; };
const moneyIn = new Set(["payment", "late_return_charge", "deposit_applied", "payment_adjustment_increase"]);

type AgencyRow = { name: string; address: string | null; phone: string | null; email: string | null; registrationNumber: string | null; taxNumber: string | null; logo: string | null };

/**
 * Itemised invoices for a booking.
 * - customer: what the renter is billed (rent, mileage, extras, each trip charge, discount), what was
 *   received and the balance due.
 * - supplier: the payable to the supplier of an externally sourced car, what was paid and the balance.
 * Both carry the agency signature/stamp when the agency has uploaded them.
 */
export async function createBookingInvoicePdf(context: RequestContext, bookingId: string, kind: BookingInvoiceKind): Promise<{ bytes: Buffer; fileName: string; caption: string; phone: string }> {
  const booking = await getBooking(context, bookingId);
  if (kind === "supplier" && booking.fulfillmentType !== "external") throw new DomainError("NOT_FOUND", "Supplier invoices exist only for externally sourced cars.", 404);
  const [agency, timeZone, branding] = await Promise.all([
    queryOne<AgencyRow>(`SELECT a.name,a.address,a.phone,a.public_email AS email,a.registration_number AS registrationNumber,a.tax_number AS taxNumber,o.logo FROM agencies a LEFT JOIN organization o ON o.id=a.id WHERE a.id=? LIMIT 1`, [context.agencyId]),
    getAgencyTimeZone(context.agencyId),
    loadDocumentBranding(context.agencyId, await bookingActorId(context.agencyId, bookingId)),
  ]);
  const when = (value: string) => formatInZone(value, { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }, timeZone);
  const day = (value: string) => formatInZone(value, { day: "2-digit", month: "short", year: "numeric" }, timeZone);
  const number = booking.publicNumber ?? booking.id;
  const reference = kind === "customer" ? `INV-${number}` : `SUP-${number}`;

  const doc = new PDFDocument({ size: "A4", margin: LEFT, bufferPages: true, info: { Title: `${kind === "customer" ? "Invoice" : "Supplier invoice"} ${reference}`, Author: agency?.name ?? "VibeRent" } });
  const chunks: Buffer[] = [];
  const completed = new Promise<Buffer>((resolve, reject) => { doc.on("data", chunk => chunks.push(Buffer.from(chunk))); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });

  // Header
  let textX = LEFT;
  if (agency?.logo?.startsWith("data:image/")) { try { doc.image(Buffer.from(agency.logo.split(",")[1] ?? "", "base64"), LEFT, 40, { fit: [64, 46] }); textX = LEFT + 74; } catch { textX = LEFT; } }
  doc.font("Helvetica-Bold").fontSize(16).fillColor("#19191F").text(agency?.name ?? "VibeRent", textX, 42, { width: 300 });
  doc.font("Helvetica").fontSize(8.5).fillColor("#667085").text([agency?.address, agency?.phone, agency?.email].filter(Boolean).join(" · "), textX, doc.y + 2, { width: 300 });
  const ids = [agency?.registrationNumber && `Reg: ${agency.registrationNumber}`, agency?.taxNumber && `NTN: ${agency.taxNumber}`].filter(Boolean).join(" · ");
  if (ids) doc.fontSize(8).fillColor("#98A2B3").text(ids, textX, doc.y + 1, { width: 300 });
  doc.font("Helvetica-Bold").fontSize(20).fillColor(BLUE).text(kind === "customer" ? "INVOICE" : "SUPPLIER INVOICE", 330, 42, { width: 221, align: "right" });
  doc.font("Helvetica").fontSize(9).fillColor("#344054")
    .text(`No. ${reference}`, 330, 68, { width: 221, align: "right" })
    .text(`Date: ${day(new Date().toISOString())}`, 330, doc.y + 1, { width: 221, align: "right" })
    .text(`Booking #${number}`, 330, doc.y + 1, { width: 221, align: "right" });
  doc.moveTo(LEFT, 112).lineTo(LEFT + WIDTH, 112).strokeColor(BLUE).lineWidth(2).stroke();

  // Parties and trip
  const partyTop = 124;
  const party = kind === "customer"
    ? { title: "BILL TO", lines: booking.renterSkipped ? ["With-driver guest"] : [booking.customer, booking.customerPhone ?? "", booking.customerCnic ? `CNIC ${cnic(booking.customerCnic)}` : ""] }
    : { title: "PAY TO (SUPPLIER)", lines: [booking.externalSupplierName ?? "Supplier", booking.externalSupplierPhone ?? ""] };
  box(doc, LEFT, partyTop, 245, party.title, party.lines.filter(Boolean));
  box(doc, LEFT + 262, partyTop, 245, "RENTAL", [
    `${booking.vehicle} · ${booking.plate}`,
    `${when(booking.pickupAt)} to ${when(booking.returnAt)}`,
    `${booking.days} day${booking.days === 1 ? "" : "s"} · ${booking.rentalMode === "with_driver" ? `with driver${booking.driver ? ` (${booking.driver})` : ""}` : "self drive"} · ${booking.city} to ${booking.destinationCity}`,
  ]);
  doc.y = partyTop + 78;

  if (kind === "customer") {
    const charges = booking.charges ?? [];
    const rows: Array<[string, string, string, string]> = [];
    rows.push([`Vehicle rent${booking.rateOverrideReason ? ` (${booking.rateOverrideReason})` : ""}`, String(booking.days), booking.dailyRate ? money(booking.dailyRate) : "To be agreed", money(booking.dailyRate * booking.days)]);
    if (booking.mileageRate && booking.estimatedKm) rows.push(["Mileage", `${booking.estimatedKm} km`, money(booking.mileageRate), money(booking.mileageRate * booking.estimatedKm)]);
    if (booking.extras) rows.push(["Extras and adjustments", "1", money(booking.extras), money(booking.extras)]);
    for (const charge of charges) rows.push([`${chargeLabels[charge.kind] ?? "Charge"}${charge.description ? ` — ${charge.description}` : ""}`, "1", money(charge.amount), money(charge.amount)]);
    table(doc, ["Description", "Qty", "Rate", "Amount"], [279, 50, 89, 89], rows);
    const gross = booking.dailyRate * booking.days + booking.mileageRate * booking.estimatedKm + booking.extras + (booking.tripCharges ?? 0);
    const balance = booking.totalAmount - booking.paid;
    totals(doc, [
      ["Subtotal", money(gross)],
      ...(booking.discount ? [["Discount", `- ${money(booking.discount)}`] as [string, string]] : []),
      ["Total", money(booking.totalAmount), true],
      ["Received", money(booking.paid)],
      [balance < 0 ? "Customer credit" : "Balance due", money(Math.abs(balance)), true],
    ]);
    if (booking.deposit || booking.depositHeld) note(doc, `Security deposit${booking.depositHeld ? ` held: ${money(booking.depositHeld)}` : ` required: ${money(booking.deposit)}`}. It is not part of the invoice total and is settled at return.`);
    const payments = (booking.transactions ?? []).filter(item => item.status === "posted" && moneyIn.has(item.kind.toLowerCase()));
    if (payments.length) {
      heading(doc, "Payments received");
      table(doc, ["Date", "Receipt", "Method", "Amount"], [110, 120, 188, 89], payments.map(item => [day(item.postedAt), item.receiptNumber ? formatPaymentReceiptNumber(item.receiptNumber) : "—", item.method.replaceAll("_", " "), money(item.amount)]));
    }
  } else {
    const rentPart = booking.totalAmount - (booking.tripCharges ?? 0);
    const paid = (booking.sourcePayouts ?? []).filter(item => item.status === "posted").reduce((sum, item) => sum + item.amount, 0);
    const payable = booking.supplierPayable ?? 0;
    table(doc, ["Description", "Basis", "Amount"], [279, 139, 89], [
      ["Customer rent for this car", `${booking.days} day${booking.days === 1 ? "" : "s"}`, money(rentPart)],
      ["Supplier share", booking.supplierPricingMode === "fixed" ? "Fixed amount" : `${booking.supplierSharePercent ?? 83}% of rent`, money(payable)],
    ]);
    totals(doc, [["Payable to supplier", money(payable), true], ["Paid to supplier", money(paid)], ["Balance payable", money(Math.max(0, payable - paid)), true]]);
    const payouts = (booking.sourcePayouts ?? []).filter(item => item.status === "posted");
    if (payouts.length) {
      heading(doc, "Payments made to supplier");
      table(doc, ["Date", "Method", "Reference", "Amount"], [110, 120, 188, 89], payouts.map(item => [day(item.paidAt), item.method.replaceAll("_", " "), item.reference || "—", money(item.amount)]));
    }
  }

  // Signature and stamp
  if (doc.y + 100 > 770) { doc.addPage(); doc.y = 60; }
  const signY = Math.max(doc.y + 24, 660);
  doc.font("Helvetica").fontSize(8).fillColor("#475467").text(kind === "customer" ? "Received by (customer)" : "Received by (supplier)", LEFT, signY + 53, { width: 180 });
  doc.moveTo(LEFT, signY + 50).lineTo(LEFT + 180, signY + 50).strokeColor("#98A2B3").lineWidth(0.6).stroke();
  if (!drawSignatureBlock(doc, branding, LEFT + WIDTH - 240, signY, { width: 240, label: `For ${agency?.name ?? "the agency"}` })) {
    doc.moveTo(LEFT + WIDTH - 180, signY + 50).lineTo(LEFT + WIDTH, signY + 50).strokeColor("#98A2B3").lineWidth(0.6).stroke();
    doc.font("Helvetica").fontSize(8).fillColor("#475467").text(`For ${agency?.name ?? "the agency"}`, LEFT + WIDTH - 180, signY + 53, { width: 180 });
  }

  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index++) {
    doc.switchToPage(index);
    // Writing inside the bottom margin would otherwise start a new blank page.
    doc.page.margins.bottom = 0;
    doc.font("Helvetica").fontSize(7).fillColor("#98A2B3").text(`${reference} · Generated by VibeRent · Page ${index - range.start + 1} of ${range.count}`, LEFT, 805, { width: WIDTH, align: "center", lineBreak: false });
  }
  doc.end();
  return {
    bytes: await completed,
    fileName: `${kind === "customer" ? "invoice" : "supplier-invoice"}-${number}.pdf`,
    caption: kind === "customer" ? `Invoice ${reference} · Total ${money(booking.totalAmount)} · Balance ${money(Math.max(0, booking.totalAmount - booking.paid))}` : `Supplier invoice ${reference} · Payable ${money(booking.supplierPayable ?? 0)}`,
    phone: kind === "customer" ? booking.customerPhone ?? "" : booking.externalSupplierPhone ?? "",
  };
}

function box(doc: PDFKit.PDFDocument, x: number, y: number, width: number, title: string, lines: string[]) {
  doc.roundedRect(x, y, width, 68, 6).fillColor("#F8FAFC").fill();
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(BLUE).text(title, x + 10, y + 8, { width: width - 20 });
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#19191F").text(lines[0] ?? "", x + 10, y + 20, { width: width - 20, lineBreak: false, ellipsis: true });
  doc.font("Helvetica").fontSize(8.5).fillColor("#475467");
  lines.slice(1, 4).forEach((line, index) => doc.text(line, x + 10, y + 34 + index * 11, { width: width - 20, lineBreak: false, ellipsis: true }));
}

function heading(doc: PDFKit.PDFDocument, title: string) {
  if (doc.y + 60 > 760) { doc.addPage(); doc.y = 60; }
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#19191F").text(title, LEFT, doc.y + 14);
  doc.y += 6;
}

function table(doc: PDFKit.PDFDocument, headers: string[], widths: number[], rows: string[][]) {
  const drawHeader = () => {
    const y = doc.y;
    doc.rect(LEFT, y, WIDTH, 20).fillColor(BLUE).fill();
    let x = LEFT;
    headers.forEach((header, index) => { doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#FFFFFF").text(header, x + 8, y + 6, { width: widths[index] - 16, align: index === 0 ? "left" : "right", lineBreak: false }); x += widths[index]; });
    doc.y = y + 20;
  };
  drawHeader();
  rows.forEach((row, rowIndex) => {
    const height = Math.max(20, doc.font("Helvetica").fontSize(8.5).heightOfString(row[0], { width: widths[0] - 16 }) + 10);
    if (doc.y + height > 760) { doc.addPage(); doc.y = 60; drawHeader(); }
    const y = doc.y;
    if (rowIndex % 2) doc.rect(LEFT, y, WIDTH, height).fillColor("#F8FAFC").fill();
    let x = LEFT;
    row.forEach((cell, index) => { doc.font(index === row.length - 1 ? "Helvetica-Bold" : "Helvetica").fontSize(8.5).fillColor("#19191F").text(cell, x + 8, y + 5, { width: widths[index] - 16, align: index === 0 ? "left" : "right" }); x += widths[index]; });
    doc.moveTo(LEFT, y + height).lineTo(LEFT + WIDTH, y + height).strokeColor("#EAECF0").lineWidth(0.5).stroke();
    doc.y = y + height;
  });
}

function totals(doc: PDFKit.PDFDocument, rows: Array<[string, string, boolean?]>) {
  if (doc.y + rows.length * 20 + 10 > 760) { doc.addPage(); doc.y = 60; }
  doc.y += 8;
  for (const [label, value, strong] of rows) {
    const y = doc.y;
    if (strong) doc.roundedRect(LEFT + WIDTH - 230, y - 2, 230, 20, 4).fillColor("#EFF8FF").fill();
    doc.font(strong ? "Helvetica-Bold" : "Helvetica").fontSize(strong ? 10 : 9).fillColor(strong ? BLUE : "#344054")
      .text(label, LEFT + WIDTH - 222, y + 3, { width: 110 })
      .text(value, LEFT + WIDTH - 112, y + 3, { width: 104, align: "right" });
    doc.y = y + 20;
  }
}

function note(doc: PDFKit.PDFDocument, text: string) {
  doc.font("Helvetica").fontSize(8).fillColor("#667085").text(text, LEFT, doc.y + 8, { width: WIDTH });
}
