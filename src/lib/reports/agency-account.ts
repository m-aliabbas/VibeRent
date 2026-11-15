/**
 * Agency account: the money the agency itself owns, as opposed to cash it holds for owners or suppliers.
 *
 * - Own cars: the full rental.
 * - Managed cars: the agency's cut under the owner agreement (rental − owner share).
 * - External (sourced) cars: the commission (rental − supplier payable).
 * - Other income: external income entries not linked to a booking.
 * - Agency expenses: the part of approved costs the agency carries (owner-allocated portions excluded),
 *   net of the agency's part of any recoveries.
 */
export type AgencyAccountSource = "Own car" | "Managed car" | "External car" | "Other income" | "Agency expense" | "Expense recovery";

export type AgencyAccountEntry = {
  id: string;
  date: string;
  source: AgencyAccountSource;
  city: string;
  vehicle: string;
  customer: string | null;
  reference: string;
  description: string;
  /** Full rental or full expense, before any owner/supplier split. */
  gross: number;
  /** Signed effect on the agency account. */
  amount: number;
};

export type AgencyAccountSummary = {
  ownCars: number;
  managedShare: number;
  externalCommission: number;
  otherIncome: number;
  expenses: number;
  net: number;
};

export function filterAgencyEntries(entries: AgencyAccountEntry[], from: string, to: string, city: string) {
  return entries.filter((row) => row.date >= from && row.date <= to && (city === "All cities" || row.city === city || row.city === "All cities"));
}

export function agencyOpeningBalance(entries: AgencyAccountEntry[], from: string, city: string) {
  return entries.filter((row) => row.date < from && (city === "All cities" || row.city === city || row.city === "All cities")).reduce((sum, row) => sum + row.amount, 0);
}

export function summarizeAgencyAccount(entries: AgencyAccountEntry[]): AgencyAccountSummary {
  const sum = (sources: AgencyAccountSource[]) => entries.filter((row) => sources.includes(row.source)).reduce((total, row) => total + row.amount, 0);
  const ownCars = sum(["Own car"]);
  const managedShare = sum(["Managed car"]);
  const externalCommission = sum(["External car"]);
  const otherIncome = sum(["Other income"]);
  const expenses = 0 - sum(["Agency expense", "Expense recovery"]) || 0;
  return { ownCars, managedShare, externalCommission, otherIncome, expenses, net: ownCars + managedShare + externalCommission + otherIncome - expenses };
}
