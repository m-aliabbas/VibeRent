import { chargedNow } from "@/lib/reports/customer-ledger";

/** An approved expense charged to a customer or incurred on a driver's booking, with what came back. */
export type AccountExpense = { id: string; date: string; head: string; description: string; plate: string | null; bookingId: string | null; amount: number; recovered: number };

export type AccountSummary = {
  /** Booking amounts charged (void bookings excluded; reserved and on-rent bookings are charged on return). */
  rent: number;
  /** Payments received against those bookings. */
  received: number;
  expenses: number;
  /** Returned to the agency against those expenses. */
  recovered: number;
  /** Expenses still carried by the agency after recoveries. */
  netExpense: number;
  /** Cash view: received minus unrecovered expenses. */
  net: number;
};

export function summarizeAccount(bookings: Array<{ status: string; totalAmount: number; paid: number }>, expenses: AccountExpense[]): AccountSummary {
  const rent = bookings.reduce((sum, row) => sum + (chargedNow(row.status) ? row.totalAmount : 0), 0);
  const received = bookings.reduce((sum, row) => sum + row.paid, 0);
  const total = expenses.reduce((sum, row) => sum + row.amount, 0);
  const recovered = expenses.reduce((sum, row) => sum + row.recovered, 0);
  return { rent, received, expenses: total, recovered, netExpense: total - recovered, net: received - (total - recovered) };
}

/** Keeps the account ledger and its summary on the same date range and car filter. */
export function filterAccountExpenses(expenses: AccountExpense[], filters: { from?: string; to?: string; plate?: string } = {}) {
  return expenses.filter((row) => (!filters.from || row.date >= filters.from) && (!filters.to || row.date <= filters.to) && (!filters.plate || row.plate === filters.plate));
}
