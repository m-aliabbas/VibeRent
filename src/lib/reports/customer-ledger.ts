export type CustomerLedgerBooking = { id: string; vehicle: string; plate: string; status: string; pickupAt: string; returnAt: string; totalAmount: number; paid: number };

export type CustomerLedgerRow = CustomerLedgerBooking & {
  /** Expenses charged to the customer sit in the ledger as charges; money they returned counts as paid. */
  kind: "booking" | "expense";
  description: string;
  /** Amount charged; cancelled, no-show, and draft bookings charge nothing. */
  amount: number;
  /** Running balance after this booking, like a bank statement. Negative means the customer is in credit. */
  balance: number;
};

const voided = (status: string) => ["cancelled", "no_show", "draft"].includes(status);

/**
 * Customer statement in booking order: each row adds its charge and subtracts what was paid, so the balance
 * accumulates (6,000 → 9,000 → 24,000) instead of being recalculated per booking.
 */
export function customerLedger(bookings: CustomerLedgerBooking[], filters: { from?: string; to?: string; plate?: string } = {}, expenses: Array<{ id: string; date: string; head: string; description: string; plate: string | null; amount: number; recovered: number }> = []) {
  const charges: Array<CustomerLedgerBooking & { kind: "booking" | "expense"; description: string }> = [
    ...bookings.map((row) => ({ ...row, kind: "booking" as const, description: "" })),
    ...expenses.map((row) => ({ id: row.id, vehicle: "", plate: row.plate ?? "", status: "expense", pickupAt: row.date, returnAt: row.date, totalAmount: row.amount, paid: row.recovered, kind: "expense" as const, description: `${row.head}: ${row.description}` })),
  ];
  const ordered = charges
    .filter((row) => !filters.plate || row.plate === filters.plate)
    .sort((a, b) => a.pickupAt.localeCompare(b.pickupAt) || a.id.localeCompare(b.id));
  let opening = 0;
  let balance = 0;
  const rows: CustomerLedgerRow[] = [];
  for (const booking of ordered) {
    const amount = voided(booking.status) ? 0 : booking.totalAmount;
    if (filters.from && booking.returnAt.slice(0, 10) < filters.from) {
      opening += amount - booking.paid;
      continue;
    }
    if (filters.to && booking.pickupAt.slice(0, 10) > filters.to) continue;
    if (!rows.length) balance = opening;
    balance += amount - booking.paid;
    rows.push({ ...booking, amount, balance });
  }
  const amount = rows.reduce((sum, row) => sum + row.amount, 0);
  const paid = rows.reduce((sum, row) => sum + row.paid, 0);
  return { opening, rows, amount, paid, closing: opening + amount - paid };
}
