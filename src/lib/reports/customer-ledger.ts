/** `returnedAt` is when the car actually came back (check-in); the rent is charged on that day. */
export type CustomerLedgerBooking = { id: string; publicNumber?: number | null; vehicle: string; plate: string; status: string; pickupAt: string; returnAt: string; returnedAt?: string | null; totalAmount: number; paid: number; discount?: number };

/**
 * Money received from (positive) or returned to (negative) the customer on a given day: booking payments,
 * corrections and refunds, and expense recoveries. `date` is the ledger date (ISO instant or YYYY-MM-DD).
 */
export type CustomerLedgerPayment = { id: string; date: string; amount: number; bookingId?: string | null; expenseId?: string | null; plate: string; description: string };

export type CustomerLedgerRow = CustomerLedgerBooking & {
  /** Expenses charged to the customer sit in the ledger as charges; payments are dated rows when supplied. */
  kind: "booking" | "expense" | "payment";
  description: string;
  /** Amount charged after discount; cancelled, no-show, and draft bookings charge nothing. Payments charge nothing. */
  amount: number;
  /** Rent before discount (amount + discount). */
  rent: number;
  /** Discount given to the customer on this booking. */
  discount: number;
  /** Rental days (pickup to return, at least 1). After an early return this is the days actually used. 0 for expenses and payments. */
  days: number;
  /** Reserved or on rent: shown in the ledger but not charged until the car comes back. */
  pending: boolean;
  /** Day the row counts on the ledger: a booking counts on the day the car came back, other rows on their own date. */
  date: string;
  /** Running balance after this row, like a bank statement. Negative means the customer is in credit. */
  balance: number;
  /** For payment rows: the booking or expense it settled. */
  bookingId?: string | null;
  expenseId?: string | null;
};

const voided = (status: string) => ["cancelled", "no_show", "draft"].includes(status);
/** Reserved or on rent: the rent is not owed yet. It is charged on return, for the days actually used. */
export const awaitingReturn = (status: string) => ["confirmed", "checked_out"].includes(status);
/** Whether a booking's amount counts toward what the customer owes today. */
export const chargedNow = (status: string) => !voided(status) && !awaitingReturn(status);
/** Billed rental days: same rule as early-return pricing (part of a day counts as a day, minimum 1). */
export function rentalDays(pickupAt: string, returnAt: string) {
  const span = Date.parse(returnAt) - Date.parse(pickupAt);
  return Number.isFinite(span) ? Math.max(1, Math.ceil(span / 86_400_000)) : 0;
}

type LedgerExpense = { id: string; date: string; head: string; description: string; plate: string | null; amount: number; recovered: number };

/**
 * Customer statement in date order: each row adds its charge and subtracts what was paid, so the balance
 * accumulates (6,000 → 9,000 → 24,000) instead of being recalculated per booking.
 *
 * Without `payments`, a booking row carries everything paid against it. With `payments`, charges carry no
 * payment and each payment is its own row on the day it was received, so the ledger shows when money came in.
 */
export function customerLedger(bookings: CustomerLedgerBooking[], filters: { from?: string; to?: string; plate?: string } = {}, expenses: LedgerExpense[] = [], payments?: CustomerLedgerPayment[]) {
  const dated = payments !== undefined;
  const charges: Array<CustomerLedgerBooking & { kind: CustomerLedgerRow["kind"]; description: string; date: string; days: number; bookingId?: string | null; expenseId?: string | null }> = [
    // A completed rental is charged on the day the car came back; reserved and on-rent bookings sit at pickup, uncharged.
    ...bookings.map((row) => ({ ...row, paid: dated ? 0 : row.paid, kind: "booking" as const, description: "", date: chargedNow(row.status) ? row.returnedAt || row.returnAt : row.pickupAt, days: rentalDays(row.pickupAt, row.returnAt) })),
    ...expenses.map((row) => ({ id: row.id, vehicle: "", plate: row.plate ?? "", status: "expense", pickupAt: row.date, returnAt: row.date, date: row.date, days: 0, totalAmount: row.amount, paid: dated ? 0 : row.recovered, kind: "expense" as const, description: `${row.head}: ${row.description}` })),
    ...(payments ?? []).map((row) => ({ id: row.id, vehicle: "", plate: row.plate, status: "payment", pickupAt: row.date, returnAt: row.date, date: row.date, days: 0, totalAmount: 0, paid: row.amount, kind: "payment" as const, description: row.description, bookingId: row.bookingId ?? null, expenseId: row.expenseId ?? null })),
  ];
  const ordered = charges
    .filter((row) => !filters.plate || row.plate === filters.plate)
    // Same day: charges before the money that pays them.
    .sort((a, b) => a.date.slice(0, 10).localeCompare(b.date.slice(0, 10)) || Number(a.kind === "payment") - Number(b.kind === "payment") || a.date.localeCompare(b.date) || (a.kind === "payment" && b.kind === "payment" ? 0 : a.id.localeCompare(b.id)));
  // Payments on the same day keep the order they were recorded in (the sort is stable).
  let opening = 0;
  let balance = 0;
  const rows: CustomerLedgerRow[] = [];
  for (const row of ordered) {
    const pending = row.kind === "booking" && awaitingReturn(row.status);
    const charged = row.kind === "expense" || (row.kind === "booking" && chargedNow(row.status));
    const amount = charged ? row.totalAmount : 0;
    const discount = charged ? Math.max(0, row.discount ?? 0) : 0;
    if (filters.from && row.date.slice(0, 10) < filters.from && !pending) {
      opening += amount - row.paid;
      continue;
    }
    if (filters.to && row.date.slice(0, 10) > filters.to) continue;
    if (!rows.length) balance = opening;
    balance += amount - row.paid;
    rows.push({ ...row, amount, rent: amount + discount, discount, pending, balance });
  }
  const amount = rows.reduce((sum, row) => sum + row.amount, 0);
  const rent = rows.reduce((sum, row) => sum + row.rent, 0);
  const discount = rows.reduce((sum, row) => sum + row.discount, 0);
  const paid = rows.reduce((sum, row) => sum + row.paid, 0);
  return { opening, rows, rent, discount, amount, paid, closing: opening + amount - paid };
}
