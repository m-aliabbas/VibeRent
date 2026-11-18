export type CustomerLedgerBooking = { id: string; publicNumber?: number | null; vehicle: string; plate: string; status: string; pickupAt: string; returnAt: string; totalAmount: number; paid: number; discount?: number };

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
  /** Running balance after this row, like a bank statement. Negative means the customer is in credit. */
  balance: number;
  /** For payment rows: the booking or expense it settled. */
  bookingId?: string | null;
  expenseId?: string | null;
};

const voided = (status: string) => ["cancelled", "no_show", "draft"].includes(status);

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
  const charges: Array<CustomerLedgerBooking & { kind: CustomerLedgerRow["kind"]; description: string; bookingId?: string | null; expenseId?: string | null }> = [
    ...bookings.map((row) => ({ ...row, paid: dated ? 0 : row.paid, kind: "booking" as const, description: "" })),
    ...expenses.map((row) => ({ id: row.id, vehicle: "", plate: row.plate ?? "", status: "expense", pickupAt: row.date, returnAt: row.date, totalAmount: row.amount, paid: dated ? 0 : row.recovered, kind: "expense" as const, description: `${row.head}: ${row.description}` })),
    ...(payments ?? []).map((row) => ({ id: row.id, vehicle: "", plate: row.plate, status: "payment", pickupAt: row.date, returnAt: row.date, totalAmount: 0, paid: row.amount, kind: "payment" as const, description: row.description, bookingId: row.bookingId ?? null, expenseId: row.expenseId ?? null })),
  ];
  const ordered = charges
    .filter((row) => !filters.plate || row.plate === filters.plate)
    // Same day: charges before the money that pays them.
    .sort((a, b) => a.pickupAt.slice(0, 10).localeCompare(b.pickupAt.slice(0, 10)) || Number(a.kind === "payment") - Number(b.kind === "payment") || a.pickupAt.localeCompare(b.pickupAt) || (a.kind === "payment" && b.kind === "payment" ? 0 : a.id.localeCompare(b.id)));
  // Payments on the same day keep the order they were recorded in (the sort is stable).
  let opening = 0;
  let balance = 0;
  const rows: CustomerLedgerRow[] = [];
  for (const row of ordered) {
    const amount = row.kind === "payment" || voided(row.status) ? 0 : row.totalAmount;
    const discount = row.kind === "payment" || voided(row.status) ? 0 : Math.max(0, row.discount ?? 0);
    if (filters.from && row.returnAt.slice(0, 10) < filters.from) {
      opening += amount - row.paid;
      continue;
    }
    if (filters.to && row.pickupAt.slice(0, 10) > filters.to) continue;
    if (!rows.length) balance = opening;
    balance += amount - row.paid;
    rows.push({ ...row, amount, rent: amount + discount, discount, balance });
  }
  const amount = rows.reduce((sum, row) => sum + row.amount, 0);
  const rent = rows.reduce((sum, row) => sum + row.rent, 0);
  const discount = rows.reduce((sum, row) => sum + row.discount, 0);
  const paid = rows.reduce((sum, row) => sum + row.paid, 0);
  return { opening, rows, rent, discount, amount, paid, closing: opening + amount - paid };
}
