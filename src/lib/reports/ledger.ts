export type LedgerEntryKind =
  | "Opening owner balance"
  | "Rental income"
  | "Booking adjustment"
  | "Expense"
  | "Owner settlement"
  | "Source settlement";

export type LedgerEntry = {
  id: string;
  date: string;
  vehicleId: string | null;
  vehicle: string;
  city: string;
  ownership: "Owned" | "Managed";
  ownerId: string | null;
  owner: string | null;
  kind: LedgerEntryKind;
  reference: string;
  description: string;
  income: number;
  expense: number;
  ownerMovement: number;
  operatingResult: number;
};

export type LedgerSummary = {
  income: number;
  expenses: number;
  agencyExpenses: number;
  ownerExpenses: number;
  ownerShare: number;
  ownerSettlements: number;
  openingOwnerBalance: number;
  closingOwnerBalance: number;
  operatingResult: number;
};

export type LedgerScope =
  | { type: "overall" }
  | { type: "owner"; ownerId: string }
  | { type: "vehicles"; vehicleIds: string[] };

export type LedgerFilters = {
  from: string;
  to: string;
  city: string;
  ownership: string;
  scope: LedgerScope;
};

export function buildLedgerEntries(source: LedgerEntry[], filters: LedgerFilters) {
  const scoped = source.filter((row) => matchesDimensions(row, filters) && matchesScope(row, filters.scope));
  const current = scoped.filter((row) => row.date >= filters.from && row.date <= filters.to);
  const opening = filters.scope.type === "vehicles" ? [] : ownerOpeningRows(scoped, filters.from, filters.scope);
  return [...opening, ...current].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate) return byDate;
    if (a.kind === "Opening owner balance" && b.kind !== "Opening owner balance") return -1;
    if (b.kind === "Opening owner balance" && a.kind !== "Opening owner balance") return 1;
    return a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id);
  });
}

export function summarizeLedger(entries: LedgerEntry[]): LedgerSummary {
  return entries.reduce<LedgerSummary>(
    (sum, row) => ({
      income: sum.income + row.income,
      expenses: sum.expenses + row.expense,
      agencyExpenses: sum.agencyExpenses + (row.kind === "Expense" && !row.ownerId ? row.expense : 0),
      ownerExpenses: sum.ownerExpenses + (row.kind === "Expense" && row.ownerId ? row.expense : 0),
      ownerShare: sum.ownerShare + (row.kind === "Rental income" ? row.ownerMovement : 0),
      ownerSettlements: sum.ownerSettlements + (["Owner settlement","Source settlement"].includes(row.kind) ? Math.abs(row.ownerMovement) : 0),
      openingOwnerBalance: sum.openingOwnerBalance + (row.kind === "Opening owner balance" ? row.ownerMovement : 0),
      closingOwnerBalance: sum.closingOwnerBalance + row.ownerMovement,
      operatingResult: sum.operatingResult + row.operatingResult,
    }),
    {
      income: 0,
      expenses: 0,
      agencyExpenses: 0,
      ownerExpenses: 0,
      ownerShare: 0,
      ownerSettlements: 0,
      openingOwnerBalance: 0,
      closingOwnerBalance: 0,
      operatingResult: 0,
    },
  );
}

function matchesDimensions(row: LedgerEntry, filters: LedgerFilters) {
  return (filters.city === "All cities" || row.city === filters.city)
    && (filters.ownership === "All ownership" || row.ownership === filters.ownership);
}

function matchesScope(row: LedgerEntry, scope: LedgerScope) {
  if (scope.type === "overall") return true;
  if (scope.type === "owner") return row.ownerId === scope.ownerId;
  return Boolean(row.vehicleId && scope.vehicleIds.includes(row.vehicleId));
}

function ownerOpeningRows(source: LedgerEntry[], from: string, scope: Exclude<LedgerScope, { type: "vehicles" }>) {
  const balances = new Map<string, { owner: string; amount: number }>();
  for (const row of source) {
    if (row.date >= from || !row.ownerId || !row.owner || row.kind === "Opening owner balance") continue;
    const existing = balances.get(row.ownerId) ?? { owner: row.owner, amount: 0 };
    existing.amount += row.ownerMovement;
    balances.set(row.ownerId, existing);
  }
  return [...balances.entries()]
    .filter(([ownerId, row]) => row.amount !== 0 && (scope.type === "overall" || scope.ownerId === ownerId))
    .map(([ownerId, row]): LedgerEntry => ({
      id: `OPEN-${ownerId}-${from}`,
      date: from,
      vehicleId: null,
      vehicle: "Owner account",
      city: "All cities",
      ownership: "Managed",
      ownerId,
      owner: row.owner,
      kind: "Opening owner balance",
      reference: "Carry forward",
      description: "Balance brought forward from activity before this date range",
      income: 0,
      expense: 0,
      ownerMovement: row.amount,
      operatingResult: 0,
    }));
}
