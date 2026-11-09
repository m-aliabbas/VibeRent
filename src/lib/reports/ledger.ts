export type LedgerEntryKind =
  | "Opening owner balance"
  | "Rental income"
  | "Owner share"
  | "Expense"
  | "Expense recovery"
  | "Fixed charge"
  | "Owner settlement"
  | "Source settlement";

export type LedgerEntry = {
  id: string;
  /** The main ledger date. Booking-linked rows use the booking start date so owners can match their trackers. */
  date: string;
  vehicleId: string | null;
  vehicle: string;
  plate?: string | null;
  /** Renter on booking-linked rows, or the customer an expense was charged to. */
  customer?: string | null;
  /** Full booking amount before the owner/agency split (owner share rows). */
  grossRent?: number;
  /** Odometer: check-in reading for rentals, service reading for maintenance expenses. */
  meter?: number | null;
  rentalDays?: number;
  rentalFrom?: string | null;
  rentalTo?: string | null;
  destinationCity?: string | null;
  city: string;
  ownership: "Owned" | "Managed";
  ownerId: string | null;
  owner: string | null;
  kind: LedgerEntryKind;
  /** For expense recoveries: the expense the money was returned against. */
  sourceId?: string;
  /** Expense head (category) for expenses and fixed charges. */
  category?: string | null;
  reference: string;
  description: string;
  income: number;
  expense: number;
  ownerMovement: number;
  operatingResult: number;
};

export type OwnerLedgerRowKind = "Opening balance" | "Rental share" | "Expense" | "Recovery" | "Fixed charge" | "Payout";

export type OwnerLedgerRow = {
  id: string;
  date: string;
  vehicleId: string | null;
  plate: string;
  kind: OwnerLedgerRowKind;
  days: number;
  rentalFrom: string | null;
  rentalTo: string | null;
  destination: string | null;
  head: string | null;
  customer: string | null;
  /** Full booking amount for rental rows; the owner's part is `income`. */
  rent: number;
  meter: number | null;
  opening: number;
  income: number;
  expense: number;
  paid: number;
  /** Running owner balance after this row, like a bank statement. */
  balance: number;
  reference: string;
  description: string;
};

const ownerRowKinds = new Set<LedgerEntryKind>(["Opening owner balance", "Owner share", "Expense", "Expense recovery", "Fixed charge", "Owner settlement"]);

/** Expenses the owner does not carry (and recoveries that credit nobody) stay off owner statements. */
function notOwnerRelevant(row: LedgerEntry) {
  return (row.kind === "Expense" && row.ownerMovement >= 0) || (row.kind === "Expense recovery" && row.ownerMovement <= 0);
}

/**
 * Owner statement rows: brought-forward balance, the owner's rental share, the owner's portion of costs,
 * fixed charges, and payouts, each with a cumulative running balance.
 */
export function ownerLedgerRows(entries: LedgerEntry[]): OwnerLedgerRow[] {
  let balance = 0;
  return entries
    .filter((row) => ownerRowKinds.has(row.kind) && !notOwnerRelevant(row))
    .map((row) => {
      balance += row.ownerMovement;
      const share = row.kind === "Owner share";
      return {
        id: row.id,
        date: row.date,
        vehicleId: row.vehicleId,
        plate: row.plate || "Owner account",
        kind: row.kind === "Opening owner balance" ? "Opening balance" : share ? "Rental share" : row.kind === "Owner settlement" ? "Payout" : row.kind === "Fixed charge" ? "Fixed charge" : row.kind === "Expense recovery" ? "Recovery" : "Expense",
        days: share ? row.rentalDays ?? 0 : 0,
        rentalFrom: share ? row.rentalFrom ?? null : null,
        rentalTo: share ? row.rentalTo ?? null : null,
        destination: share ? row.destinationCity ?? "Not recorded" : null,
        head: row.kind === "Expense" || row.kind === "Expense recovery" || row.kind === "Fixed charge" ? row.category ?? null : null,
        customer: row.customer ?? null,
        rent: share ? row.grossRent ?? row.ownerMovement : 0,
        meter: row.meter ?? null,
        opening: row.kind === "Opening owner balance" ? row.ownerMovement : 0,
        income: share ? row.ownerMovement : 0,
        expense: row.kind === "Expense" || row.kind === "Expense recovery" || row.kind === "Fixed charge" ? -row.ownerMovement : 0,
        paid: row.kind === "Owner settlement" ? -row.ownerMovement : 0,
        balance,
        reference: row.reference,
        description: row.description,
      };
    });
}

export type OwnerCarLedger = {
  key: string;
  vehicleId: string | null;
  plate: string;
  vehicle: string;
  rows: OwnerLedgerRow[];
  trips: number;
  days: number;
  opening: number;
  /** Full rent of the car's bookings ("Total Rent" on the owner's sheet). */
  rent: number;
  /** Agency's cut of that rent; `agencyPercent` is set when every booking used the same percentage. */
  agencyShare: number;
  agencyPercent: number | null;
  income: number;
  expense: number;
  paid: number;
  /** Everything paid out of the owner's money: expenses, fixed charges, and payouts ("Debit"). */
  debit: number;
  /** Owner share minus debit for the period ("Total"). */
  net: number;
  closing: number;
};

/** Splits an owner ledger into one running-balance statement per car (owner-level payouts get their own section). */
export function ownerLedgerByCar(entries: LedgerEntry[]): OwnerCarLedger[] {
  const groups = new Map<string, LedgerEntry[]>();
  for (const row of entries) {
    if (!ownerRowKinds.has(row.kind) || notOwnerRelevant(row)) continue;
    const key = row.vehicleId ?? "owner-account";
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()]
    .map(([key, rows]) => {
      const ledger = ownerLedgerRows(rows);
      const sample = rows.find((row) => row.plate) ?? rows[0];
      const rent = ledger.reduce((sum, row) => sum + row.rent, 0);
      const income = ledger.reduce((sum, row) => sum + row.income, 0);
      const expense = ledger.reduce((sum, row) => sum + row.expense, 0);
      const paid = ledger.reduce((sum, row) => sum + row.paid, 0);
      const percents = new Set(rows.filter((row) => row.kind === "Owner share").map((row) => row.description.match(/Owner earns ([\d.]+)%/)?.[1] ?? "x"));
      const ownerPercent = percents.size === 1 ? Number([...percents][0]) : Number.NaN;
      return {
        key,
        vehicleId: key === "owner-account" ? null : key,
        plate: key === "owner-account" ? "Owner account" : sample.plate || sample.vehicle,
        vehicle: key === "owner-account" ? "Payments not linked to a car" : sample.plate || sample.vehicle,
        rows: ledger,
        trips: ledger.filter((row) => row.kind === "Rental share").length,
        days: ledger.reduce((sum, row) => sum + row.days, 0),
        opening: ledger.reduce((sum, row) => sum + row.opening, 0),
        rent,
        agencyShare: rent - income,
        agencyPercent: Number.isFinite(ownerPercent) ? Math.round((100 - ownerPercent) * 100) / 100 : null,
        income,
        expense,
        paid,
        debit: expense + paid,
        net: income - expense - paid,
        closing: ledger.at(-1)?.balance ?? 0,
      };
    })
    .filter((car) => car.rows.length)
    .sort((a, b) => (a.key === "owner-account" ? 1 : b.key === "owner-account" ? -1 : a.plate.localeCompare(b.plate)));
}

export type LedgerSummary = {
  income: number;
  expenses: number;
  agencyExpenses: number;
  ownerExpenses: number;
  /** Money returned to the agency against approved expenses (already netted out of `expenses`). */
  recovered: number;
  fixedCharges: number;
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

export type LedgerEntryType = "all" | "income" | "expense" | "owner-payment";

function scopedEntries(source: LedgerEntry[], filters: LedgerFilters) {
  return source.filter((row) => matchesDimensions(row, filters) && matchesScope(row, filters.scope) && !(filters.scope.type === "owner" && (row.kind === "Rental income" || ((row.kind === "Expense" || row.kind === "Expense recovery") && row.ownerMovement === 0))));
}

export function buildLedgerEntries(source: LedgerEntry[], filters: LedgerFilters) {
  const scoped = scopedEntries(source, filters);
  const current = scoped.filter((row) => row.date >= filters.from && row.date <= filters.to);
  const opening = filters.scope.type === "vehicles" ? [] : ownerOpeningRows(scoped, filters.from, filters.scope);
  return [...opening, ...current].sort(compareEntries);
}

/** Net result carried forward from before the range, so the running balance continues like a bank statement. */
export function ledgerOpeningResult(source: LedgerEntry[], filters: LedgerFilters) {
  return scopedEntries(source, filters).filter((row) => row.date < filters.from).reduce((sum, row) => sum + row.operatingResult, 0);
}

/** Running balance (cumulative net result) after each entry, starting from the opening result. */
export function runningResultBalances(entries: LedgerEntry[], opening = 0) {
  let balance = opening;
  return new Map(entries.map((row) => [row.id, (balance += row.operatingResult)]));
}

/** Applies the entry-type and optional expense-head filters shared by the reports screen and PDF export. */
export function filterLedgerEntries(entries: LedgerEntry[], entryType: LedgerEntryType, ownerView: boolean, expenseHead = "") {
  return entries.filter((row) => {
    if (entryType === "income") return ownerView ? row.kind === "Owner share" : row.income !== 0;
    if (entryType === "expense") return (row.kind === "Expense" || row.kind === "Expense recovery" || row.kind === "Fixed charge") && (!expenseHead || row.category === expenseHead);
    if (entryType === "owner-payment") return row.kind === "Owner settlement" || row.kind === "Source settlement";
    return true;
  });
}

export function summarizeLedger(entries: LedgerEntry[]): LedgerSummary {
  return entries.reduce<LedgerSummary>(
    (sum, row) => ({
      income: sum.income + row.income,
      expenses: sum.expenses + row.expense,
      agencyExpenses: sum.agencyExpenses + (row.kind === "Expense" || row.kind === "Expense recovery" ? row.expense + row.ownerMovement : 0),
      ownerExpenses: sum.ownerExpenses + (row.kind === "Expense" || row.kind === "Expense recovery" || row.kind === "Fixed charge" ? -row.ownerMovement : 0),
      recovered: sum.recovered + (row.kind === "Expense recovery" ? -row.expense : 0),
      fixedCharges: sum.fixedCharges + (row.kind === "Fixed charge" ? -row.ownerMovement : 0),
      ownerShare: sum.ownerShare + (row.kind === "Rental income" || row.kind === "Owner share" ? row.ownerMovement : 0),
      ownerSettlements: sum.ownerSettlements + (["Owner settlement", "Source settlement"].includes(row.kind) ? Math.abs(row.ownerMovement) : 0),
      openingOwnerBalance: sum.openingOwnerBalance + (row.kind === "Opening owner balance" ? row.ownerMovement : 0),
      closingOwnerBalance: sum.closingOwnerBalance + row.ownerMovement,
      operatingResult: sum.operatingResult + row.operatingResult,
    }),
    {
      income: 0,
      expenses: 0,
      agencyExpenses: 0,
      ownerExpenses: 0,
      recovered: 0,
      fixedCharges: 0,
      ownerShare: 0,
      ownerSettlements: 0,
      openingOwnerBalance: 0,
      closingOwnerBalance: 0,
      operatingResult: 0,
    },
  );
}

export function compareEntries(a: LedgerEntry, b: LedgerEntry) {
  const byDate = a.date.localeCompare(b.date);
  if (byDate) return byDate;
  if (a.kind === "Opening owner balance" && b.kind !== "Opening owner balance") return -1;
  if (b.kind === "Opening owner balance" && a.kind !== "Opening owner balance") return 1;
  return a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id);
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

/** Brought-forward owner balances. An owner's own ledger carries one balance per car so each car statement continues. */
function ownerOpeningRows(source: LedgerEntry[], from: string, scope: Exclude<LedgerScope, { type: "vehicles" }>) {
  const perCar = scope.type === "owner";
  const balances = new Map<string, { ownerId: string; owner: string; amount: number; sample: LedgerEntry }>();
  for (const row of source) {
    if (row.date >= from || !row.ownerId || !row.owner || row.kind === "Opening owner balance") continue;
    const key = perCar ? `${row.ownerId}|${row.vehicleId ?? ""}` : row.ownerId;
    const existing = balances.get(key) ?? { ownerId: row.ownerId, owner: row.owner, amount: 0, sample: row };
    existing.amount += row.ownerMovement;
    if (!existing.sample.plate && row.plate) existing.sample = row;
    balances.set(key, existing);
  }
  return [...balances.entries()]
    .filter(([, row]) => row.amount !== 0 && (scope.type === "overall" || scope.ownerId === row.ownerId))
    .map(([key, row]): LedgerEntry => ({
      id: `OPEN-${key}-${from}`,
      date: from,
      vehicleId: perCar ? row.sample.vehicleId : null,
      vehicle: perCar && row.sample.vehicleId ? row.sample.vehicle : "Owner account",
      plate: perCar && row.sample.vehicleId ? row.sample.plate ?? null : null,
      city: perCar && row.sample.vehicleId ? row.sample.city : "All cities",
      ownership: "Managed",
      ownerId: row.ownerId,
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
