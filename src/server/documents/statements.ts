import "server-only";

import { queryOne } from "@/db/query";
import { customerLedger } from "@/lib/reports/customer-ledger";
import { filterAccountExpenses } from "@/lib/reports/account-summary";
import { buildLedgerEntries, filterLedgerEntries, ledgerOpeningResult, ownerLedgerByCar } from "@/lib/reports/ledger";
import type { RequestContext } from "@/server/context/request-context";
import { createStatementPdf, number, sheetDate, type Column } from "@/server/documents/account-ledger";
import { createLedgerReportPdf } from "@/server/documents/ledger-report";
import { DomainError } from "@/server/domain/errors";
import { getCustomerDetail } from "@/server/services/customer-service";
import { getReportAgencyHeader } from "@/server/services/organization-settings-service";
import { getReports } from "@/server/services/report-service";

export type StatementFilters = { from?: string; to?: string; plate?: string };
export type BuiltStatement = { bytes: Buffer; fileName: string; name: string; phone: string; closing: number; periodLabel: string };

/** Column headings written for the customer: what they rented, what was discounted, what they paid, and what they still owe. */
export const customerLedgerColumns: Column[] = [
  { label: "Date", width: 50 },
  { label: "Car", width: 66 },
  { label: "Booking / charge", width: 85 },
  { label: "Rent", width: 60, align: "right" },
  { label: "Discount", width: 55, align: "right" },
  { label: "Net amount", width: 63, align: "right" },
  { label: "Received", width: 63, align: "right" },
  { label: "Outstanding", width: 69, align: "right" },
];

const outstanding = (value: number) => (value < 0 ? `${number(value)} Cr` : number(value));

/** Customer statement PDF: the same document the profile downloads and WhatsApp sends. */
export async function buildCustomerStatement(context: RequestContext, customerId: string, filters: StatementFilters = {}): Promise<BuiltStatement> {
  const [customer, agency] = await Promise.all([getCustomerDetail(context, customerId), getReportAgencyHeader(context)]);
  const { from = "", to = "", plate = "" } = filters;
  if (plate && !customer.bookings.some((row) => row.plate === plate) && !customer.expenses.some((row) => row.plate === plate)) throw new DomainError("VALIDATION_FAILED", "Unknown car filter.", 400);
  const ledger = customerLedger(customer.bookings, { from, to, plate }, customer.expenses);
  const otherCharges = filterAccountExpenses(customer.expenses, { from, to, plate });
  const periodLabel = `${from ? sheetDate(from) : "All dates"} to ${to ? sheetDate(to) : "present"}${plate ? ` | ${plate}` : ""}`;
  const bytes = await createStatementPdf({
    ...agency,
    title: `Customer statement - ${customer.name}`,
    period: periodLabel,
    band: [
      { label: "RENT", value: ledger.rent, color: "#006FE6" },
      { label: "DISCOUNT", value: ledger.discount, color: "#067647" },
      { label: "NET AMOUNT", value: ledger.amount, color: "#006FE6" },
      { label: "RECEIVED", value: ledger.paid, color: "#067647" },
      { label: ledger.closing < 0 ? "CREDIT" : "OUTSTANDING", value: Math.abs(ledger.closing), color: "#DC6803", highlight: true },
    ],
    bandNote: "Net amount = rent - discount (plus other charges). Outstanding = opening balance + net amount - received. Cr means the customer is in credit.",
    sections: [
      {
        title: "Rentals and charges",
        columns: customerLedgerColumns,
        opening: ledger.opening ? ["", "", "Opening balance", "", "", "", "", outstanding(ledger.opening)] : undefined,
        rows: ledger.rows.map((row) => [
          sheetDate(row.pickupAt),
          row.plate,
          row.kind === "expense" ? row.description : `${row.publicNumber ? `#${row.publicNumber}` : row.id}${row.status === "completed" ? "" : ` (${row.status.replaceAll("_", " ")})`}`,
          number(row.rent),
          row.discount ? number(row.discount) : "-",
          number(row.amount),
          number(row.paid),
          outstanding(row.balance),
        ]),
        totals: ledger.rows.length ? ["Total", "", "", number(ledger.rent), number(ledger.discount), number(ledger.amount), number(ledger.paid), outstanding(ledger.closing)] : undefined,
        emptyText: "No rentals or charges in this period.",
      },
      ...(otherCharges.length
        ? [{
            title: "Other charges (damage, fuel, fines)",
            columns: [{ label: "Date", width: 60 }, { label: "Car", width: 60 }, { label: "Charge", width: 211 }, { label: "Charged", width: 60, align: "right" as const }, { label: "Paid", width: 60, align: "right" as const }, { label: "Due", width: 60, align: "right" as const }],
            rows: otherCharges.map((row) => [sheetDate(row.date), row.plate ?? "", `${row.head}: ${row.description}`, number(row.amount), number(row.recovered), number(row.amount - row.recovered)]),
            emptyText: "",
          }]
        : []),
    ],
  });
  return { bytes, fileName: `statement-${slug(customer.name)}${to ? `-${to}` : ""}.pdf`, name: customer.name, phone: customer.phone, closing: ledger.closing, periodLabel };
}

/** Owner statement PDF (owner headings: rent, owner share, debit, payable) for one period. */
export async function buildOwnerStatement(context: RequestContext, ownerId: string, filters: { from: string; to: string }): Promise<BuiltStatement> {
  const data = await getReports(context);
  const owner = data.ledgerAccounts.owners.find((item) => item.id === ownerId);
  if (!owner) throw new DomainError("NOT_FOUND", "Owner not found.", 404);
  const scope = { type: "owner" as const, ownerId };
  const ledgerFilters = { from: filters.from, to: filters.to, city: "All cities", ownership: "All ownership", scope };
  const entries = filterLedgerEntries(buildLedgerEntries(data.ledgerEntries, ledgerFilters), "all", true, "");
  const openingResult = ledgerOpeningResult(data.ledgerEntries, ledgerFilters);
  const periodLabel = `${sheetDate(filters.from)} to ${sheetDate(filters.to)}`;
  const bytes = await createLedgerReportPdf({
    agencyName: data.agencyName, agencyAddress: data.agencyContact.address, agencyPhone: data.agencyContact.phone,
    from: filters.from, to: filters.to, periodLabel, city: "All cities", ownership: "All ownership",
    accountLabel: `Owner ledger - ${owner.label}`, entries, openingResult, ownerView: true,
  });
  const closing = ownerLedgerByCar(entries).reduce((sum, car) => sum + car.closing, 0);
  const phone = (await queryOne<{ phone: string | null }>("SELECT phone FROM owners WHERE agency_id=? AND id=? LIMIT 1", [context.agencyId, ownerId]))?.phone ?? "";
  return { bytes, fileName: `owner-statement-${slug(owner.label)}-${filters.to}.pdf`, name: owner.label, phone, closing, periodLabel };
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "account";
}
