export type OwnerExpenseTerms = {
  /** The expense was explicitly assigned to the owner. */
  assignedToOwner: boolean;
  expenseResponsibility: string | null;
  shareBasis: string | null;
  ownerSharePercent: number | null;
};

/**
 * Owner's percentage of an approved expense. Expenses assigned to an owner are fully theirs; vehicle
 * expenses follow the agreement: owner pays all, agency pays none, shared splits by the owner's revenue
 * percentage (half for fixed-monthly agreements, which have no revenue percentage).
 */
export function ownerExpensePercent(terms: OwnerExpenseTerms) {
  if (terms.assignedToOwner) return 100;
  const responsibility = (terms.expenseResponsibility ?? "shared").toLowerCase();
  if (responsibility === "owner") return 100;
  if (responsibility === "agency") return 0;
  return terms.shareBasis === "percentage" ? terms.ownerSharePercent ?? 0 : 50;
}

export function ownerExpenseAmount(amount: number, percent: number) {
  return Math.round(amount * percent / 100);
}

export function formatPercent(value: number) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}
