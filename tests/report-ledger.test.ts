import assert from "node:assert/strict";
import test from "node:test";
import { buildLedgerEntries, summarizeLedger } from "../src/lib/reports/ledger";
import type { LedgerEntry } from "../src/lib/reports/ledger";

const source: LedgerEntry[] = [
  entry({ id: "old-rent", date: "2026-08-20", vehicleId: "car-a", vehicle: "Honda City", ownerId: "owner-a", owner: "Sana Malik", kind: "Rental income", income: 50_000, ownerMovement: 25_000, operatingResult: 25_000 }),
  entry({ id: "old-cost", date: "2026-08-25", vehicleId: "car-a", vehicle: "Honda City", ownerId: "owner-a", owner: "Sana Malik", kind: "Expense", expense: 5_000, ownerMovement: -5_000 }),
  entry({ id: "rent-a", date: "2026-09-05", vehicleId: "car-a", vehicle: "Honda City", ownerId: "owner-a", owner: "Sana Malik", kind: "Rental income", income: 40_000, ownerMovement: 20_000, operatingResult: 20_000 }),
  entry({ id: "rent-b", date: "2026-09-06", vehicleId: "car-b", vehicle: "Toyota Corolla", kind: "Rental income", income: 30_000, operatingResult: 30_000 }),
  entry({ id: "payout", date: "2026-09-10", vehicleId: null, vehicle: "Owner account", ownerId: "owner-a", owner: "Sana Malik", kind: "Owner settlement", ownerMovement: -20_000 }),
];

test("owner range carries the previous balance and shows a settlement posted inside the range", () => {
  const rows = buildLedgerEntries(source, { from: "2026-09-01", to: "2026-09-30", city: "All cities", ownership: "All ownership", scope: { type: "owner", ownerId: "owner-a" } });
  assert.deepEqual(rows.map((row) => row.kind), ["Opening owner balance", "Rental income", "Owner settlement"]);
  assert.equal(rows[0].ownerMovement, 20_000);
  const summary = summarizeLedger(rows);
  assert.equal(summary.ownerSettlements, 20_000);
  assert.equal(summary.closingOwnerBalance, 20_000);
});

test("multi-car range contains only the selected cars and never adds an owner payout", () => {
  const rows = buildLedgerEntries(source, { from: "2026-09-01", to: "2026-09-30", city: "All cities", ownership: "All ownership", scope: { type: "vehicles", vehicleIds: ["car-a", "car-b"] } });
  assert.deepEqual(rows.map((row) => row.id), ["rent-a", "rent-b"]);
  assert.equal(rows.some((row) => row.kind === "Owner settlement"), false);
});

function entry(overrides: Partial<LedgerEntry> & Pick<LedgerEntry, "id" | "date" | "vehicleId" | "vehicle" | "kind">): LedgerEntry {
  return {
    city: "Lahore",
    ownership: overrides.ownerId ? "Managed" : "Owned",
    ownerId: null,
    owner: null,
    reference: overrides.id,
    description: overrides.kind,
    income: 0,
    expense: 0,
    ownerMovement: 0,
    operatingResult: 0,
    ...overrides,
  };
}
