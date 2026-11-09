import "server-only";

import { ownerLedgerByCar, runningResultBalances, summarizeLedger } from "@/lib/reports/ledger";
import type { LedgerEntry, OwnerCarLedger, OwnerLedgerRow } from "@/lib/reports/ledger";
import type { AccountExpense } from "@/lib/reports/account-summary";
import { createStatementPdf, expenseSection, number, sheetDate, signed } from "@/server/documents/account-ledger";
import type { StatementSection } from "@/server/documents/account-ledger";

type LedgerPdfInput = {
  agencyName: string;
  agencyAddress?: string | null;
  agencyPhone?: string | null;
  from: string;
  to: string;
  periodLabel: string;
  city: string;
  ownership: string;
  accountLabel: string;
  entries: LedgerEntry[];
  openingResult?: number;
  ownerView: boolean;
};

/** Owner and agency ledgers in the same statement design as the customer and driver PDFs. */
export async function createLedgerReportPdf(input: LedgerPdfInput): Promise<Buffer> {
  const base = { agency: input.agencyName, address: input.agencyAddress, phone: input.agencyPhone };
  return input.ownerView ? createStatementPdf({ ...base, ...ownerStatement(input) }) : createStatementPdf({ ...base, ...agencyStatement(input) });
}

function ownerStatement(input: LedgerPdfInput) {
  const owner = input.accountLabel.split("Owner ledger - ").at(-1) ?? "Owner";
  const cars = ownerLedgerByCar(input.entries);
  const total = cars.reduce(
    (sum, car) => ({ opening: sum.opening + car.opening, rent: sum.rent + car.rent, agency: sum.agency + car.agencyShare, income: sum.income + car.income, debit: sum.debit + car.debit, trips: sum.trips + car.trips, days: sum.days + car.days, closing: sum.closing + car.closing }),
    { opening: 0, rent: 0, agency: 0, income: 0, debit: 0, trips: 0, days: 0, closing: 0 },
  );
  const percents = new Set(cars.filter((car) => car.rent).map((car) => car.agencyPercent));
  const agencyPercent = percents.size === 1 ? [...percents][0] : null;
  const sections: StatementSection[] = [
    {
      title: "Summary by car",
      columns: [
        { label: "Car", width: 70 },
        { label: "Trips", width: 40, align: "right" },
        { label: "Days", width: 40, align: "right" },
        { label: "Remaining", width: 70, align: "right" },
        { label: "Rent", width: 70, align: "right" },
        { label: "Owner share", width: 70, align: "right" },
        { label: "Debit", width: 70, align: "right" },
        { label: "Grand", width: 81, align: "right" },
      ],
      rows: cars.map((car) => [car.plate, car.trips, car.days, signed(car.opening), number(car.rent), number(car.income), number(car.debit), signed(car.closing)]),
      totals: cars.length ? ["Total", total.trips, total.days, signed(total.opening), number(total.rent), number(total.income), number(total.debit), signed(total.closing)] : undefined,
      emptyText: "No owner income, expenses, or payouts match this period.",
    },
    ...cars.map((car) => carSection(car, input.from, cars.length > 1)),
    expenseSection(ownerExpenses(input.entries), "No owner expenses in this period.", "Owner expenses and recoveries"),
  ];
  return {
    title: `Owner ledger - ${owner}`,
    period: `${sheetDate(input.from)} to ${sheetDate(input.to)}`,
    band: [
      { label: "REMAINING", value: total.opening, color: "#DC6803" },
      { label: "TOTAL RENT", value: total.rent, color: "#006FE6" },
      { label: agencyPercent !== null ? `${formatPercent(agencyPercent)} AGENCY` : "AGENCY SHARE", value: total.agency, color: "#006FE6" },
      { label: "OWNER SHARE", value: total.income, color: "#006FE6" },
      { label: "DEBIT", value: total.debit, color: "#B42318" },
      { label: "GRAND", value: total.closing, color: "#DC6803", highlight: true },
    ],
    bandNote: `${total.trips} trips, ${total.days} rental days. Debit = owner's expenses and charges + payments to owner. Grand = Remaining + Owner share - Debit. Cars are shown by number.`,
    sections,
  };
}

/** One car's sheet: Date, Customer, Description, Rent, Cash out, Meter, Remaining. */
function carSection(car: OwnerCarLedger, from: string, newPage: boolean): StatementSection {
  const hasOpening = car.rows.some((row) => row.kind === "Opening balance");
  const cashOut = car.rows.reduce((sum, row) => sum + row.expense + row.paid, 0);
  return {
    title: `Car ${car.plate}  |  Rent ${number(car.rent)}  |  Owner share ${number(car.income)}  |  Debit ${number(car.debit)}  |  Grand ${signed(car.closing)}`,
    newPage,
    columns: [
      { label: "Date", width: 52 },
      { label: "Customer", width: 88 },
      { label: "Description", width: 124 },
      { label: "Rent", width: 58, align: "right" },
      { label: "Cash out", width: 62, align: "right" },
      { label: "Meter", width: 52, align: "right" },
      { label: "Remaining", width: 75, align: "right" },
    ],
    opening: hasOpening ? undefined : [sheetDate(from), "", "Opening balance", "", "", "", "0"],
    rows: car.rows.map((row) => {
      const out = row.expense + row.paid;
      return [
        sheetDate(row.date),
        row.customer ?? "",
        carDescription(row),
        row.rent ? number(row.rent) : "",
        out ? (out < 0 ? `(${number(out)})` : number(out)) : "",
        row.meter ? number(row.meter) : "",
        signed(row.balance),
      ];
    }),
    totals: ["Grand total", "", "", number(car.rent), number(cashOut), "", signed(car.closing)],
    emptyText: "No activity for this car.",
  };
}

function carDescription(row: OwnerLedgerRow) {
  if (row.kind === "Opening balance") return "Opening balance";
  if (row.kind === "Rental share") return `${row.destination && row.destination !== "Not recorded" ? row.destination : "Local"} (${row.days}d)`;
  if (row.kind === "Payout") return `Paid to owner - ${row.reference}`;
  if (row.kind === "Recovery") return `${row.head ?? "Expense"} returned`;
  if (row.kind === "Fixed charge") return row.head ?? "Fixed charge";
  const detail = expenseDetail(row.description, row.head);
  return row.head && detail && detail !== row.head ? `${row.head}: ${detail}` : detail || row.head || "Expense";
}

/** The owner's portion of each expense, with the owner's portion of anything returned against it. */
function ownerExpenses(entries: LedgerEntry[]): AccountExpense[] {
  const returned = new Map<string, number>();
  for (const row of entries) if (row.kind === "Expense recovery" && row.sourceId) returned.set(row.sourceId, (returned.get(row.sourceId) ?? 0) + row.ownerMovement);
  return entries
    .filter((row) => row.kind === "Expense" && row.ownerMovement < 0)
    .map((row) => ({ id: row.reference, date: row.date, head: row.category ?? "Expense", description: expenseDetail(row.description, row.category ?? null), plate: row.plate ?? null, bookingId: null, amount: -row.ownerMovement, recovered: returned.get(row.reference) ?? 0 }));
}

function agencyStatement(input: LedgerPdfInput) {
  const opening = input.openingResult ?? 0;
  const balances = runningResultBalances(input.entries, opening);
  const summary = summarizeLedger(input.entries);
  const rows = input.entries.filter((row) => row.income || row.expense || row.operatingResult);
  const grossExpenses = input.entries.filter((row) => row.kind === "Expense").reduce((sum, row) => sum + row.expense, 0);
  const closing = opening + summary.operatingResult;
  const returned = new Map<string, number>();
  for (const row of input.entries) if (row.kind === "Expense recovery" && row.sourceId) returned.set(row.sourceId, (returned.get(row.sourceId) ?? 0) - row.expense);
  const expenses: AccountExpense[] = input.entries
    .filter((row) => row.kind === "Expense")
    .map((row) => ({ id: row.reference, date: row.date, head: row.category ?? "Expense", description: expenseDetail(row.description, row.category ?? null), plate: row.plate ?? null, bookingId: null, amount: row.expense, recovered: returned.get(row.reference) ?? 0 }));
  const sum = (pick: (row: LedgerEntry) => number) => rows.reduce((total, row) => total + pick(row), 0);
  return {
    title: input.accountLabel.replace(/^All entries - /, ""),
    period: `${input.periodLabel}${input.city !== "All cities" ? ` | ${input.city}` : ""}${input.ownership !== "All ownership" ? ` | ${input.ownership}` : ""}`,
    band: [
      { label: "OPENING", value: opening, color: "#DC6803" },
      { label: "INCOME", value: summary.income, color: "#006FE6" },
      { label: "EXPENSES", value: grossExpenses, color: "#B42318" },
      { label: "RETURNED", value: summary.recovered, color: "#067647" },
      { label: "PAID OUT", value: summary.ownerSettlements, color: "#B42318" },
      { label: "CLOSING", value: closing, color: "#DC6803", highlight: true },
    ],
    bandNote: "Closing = opening + income - (expenses - returned) - payments to owners and sources. Owner shares that are not yet paid are on each owner's ledger.",
    sections: [
      {
        title: "Ledger",
        columns: [
          { label: "Date", width: 50 },
          { label: "Car", width: 52 },
          { label: "Entry", width: 72 },
          { label: "Description", width: 122 },
          { label: "Income", width: 55, align: "right" as const },
          { label: "Expense", width: 55, align: "right" as const },
          { label: "Paid out", width: 50, align: "right" as const },
          { label: "Balance", width: 55, align: "right" as const },
        ],
        opening: ["", "", "Opening balance", "Carried from before this range", "", "", "", signed(opening)],
        rows: rows.map((row) => [
          sheetDate(row.date),
          row.plate ?? row.vehicle,
          row.category ? `${row.kind === "Expense recovery" ? "Returned" : row.kind}: ${row.category}` : row.kind,
          [row.customer, row.kind === "Expense" || row.kind === "Expense recovery" ? expenseDetail(row.description, row.category ?? null) : row.description].filter(Boolean).join(" - "),
          row.income ? signed(row.income) : "",
          row.kind === "Expense recovery" ? `(${number(row.expense)})` : row.expense ? number(row.expense) : "",
          paidOut(row) ? number(paidOut(row)) : "",
          signed(balances.get(row.id) ?? 0),
        ]),
        totals: ["Total", "", "", "", signed(sum((row) => row.income)), signed(sum((row) => row.expense)), number(sum(paidOut)), signed(closing)],
        emptyText: "No entries match these filters.",
      },
      expenseSection(expenses, "No approved expenses in this period."),
    ],
  };
}

function paidOut(row: LedgerEntry) {
  return row.kind === "Owner settlement" || row.kind === "Source settlement" ? Math.abs(row.ownerMovement) : 0;
}
function expenseDetail(value: string, head: string | null) {
  return (head && value.startsWith(`${head} - `) ? value.slice(head.length + 3) : value).replace(/\s*[·]\s*owner pays.*$/i, "").replace(/\s*[·]\s*recurring/i, " (recurring)");
}
function formatPercent(value: number) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}
