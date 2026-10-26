import "server-only";

import PDFDocument from "pdfkit";
import { queryAll, queryOne } from "@/db/query";
import type { RenderedNotification } from "@/server/services/notification-delivery-service";

/** Yesterday in Pakistan time, as a date and its UTC bounds. */
export function previousPakistanDay(now = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const end = new Date(`${today}T00:00:00+05:00`);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 1);
  return { day: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(start), start: start.toISOString(), end: end.toISOString() };
}

/** Agencies that configured an owner WhatsApp number receive the previous-day report. */
export function listDailyReportAgencies() {
  return queryAll<{ agencyId: string }>("SELECT agency_id AS agencyId FROM whatsapp_settings WHERE owner_phone_normalized IS NOT NULL");
}

export async function renderDailyReport(agencyId: string, day: string): Promise<RenderedNotification> {
  const agency = await queryOne<{ name: string; phone: string | null }>(
    "SELECT a.name,w.owner_phone_normalized AS phone FROM agencies a LEFT JOIN whatsapp_settings w ON w.agency_id=a.id WHERE a.id=? LIMIT 1",
    [agencyId],
  );
  if (!agency) throw new Error("The agency for this report could not be found.");
  if (!agency.phone) return { status: "skipped", reason: "No owner WhatsApp number is configured." };
  const start = new Date(`${day}T00:00:00+05:00`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  const row = (await queryOne<{ bookings: number; income: number; expenses: number }>(
    `SELECT (SELECT count(*) FROM bookings WHERE agency_id=? AND created_at>=? AND created_at<?) AS bookings,
      (SELECT coalesce(sum(CASE WHEN kind IN ('refund','reversal') THEN -amount ELSE amount END),0) FROM financial_transactions WHERE agency_id=? AND status='posted' AND posted_at>=? AND posted_at<?) AS income,
      (SELECT coalesce(sum(amount),0) FROM expenses WHERE agency_id=? AND status='approved' AND occurred_on=?) AS expenses`,
    [agencyId, start.toISOString(), end.toISOString(), agencyId, start.toISOString(), end.toISOString(), agencyId, day],
  ))!;
  const income = Number(row.income);
  const expenses = Number(row.expenses);
  const document = await pdf(`${agency.name} — Daily report`, [
    `Date: ${day}`,
    `Bookings created: ${Number(row.bookings)}`,
    `Income: PKR ${income.toLocaleString("en-PK")}`,
    `Expenses: PKR ${expenses.toLocaleString("en-PK")}`,
    `Net cash movement: PKR ${(income - expenses).toLocaleString("en-PK")}`,
  ]);
  return {
    status: "ready", phone: agency.phone, recipientName: "Owner",
    document: { bytes: document, fileName: `daily-report-${day}.pdf` }, caption: `Previous-day report for ${day}`,
  };
}

function pdf(title: string, lines: string[]) {
  const doc = new PDFDocument({ size: "A4", margin: 48 });
  const chunks: Buffer[] = [];
  doc.on("data", chunk => chunks.push(Buffer.from(chunk)));
  const done = new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  doc.font("Helvetica-Bold").fontSize(19).fillColor("#0D1730").text(title);
  doc.moveDown();
  doc.font("Helvetica").fontSize(11).fillColor("#344054");
  for (const line of lines) doc.text(line, { lineGap: 7 });
  doc.end();
  return done;
}
