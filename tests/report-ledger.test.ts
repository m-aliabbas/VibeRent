import assert from "node:assert/strict";
import test from "node:test";
import { buildLedgerEntries, filterLedgerEntries, ledgerOpeningResult, ownerLedgerByCar, ownerLedgerRows, runningResultBalances, summarizeLedger } from "../src/lib/reports/ledger";
import { customerLedger } from "../src/lib/reports/customer-ledger";
import { summarizeAccount } from "../src/lib/reports/account-summary";
import type { LedgerEntry } from "../src/lib/reports/ledger";

const source: LedgerEntry[] = [
  entry({ id: "old-rent", date: "2026-08-20", vehicleId: "car-a", vehicle: "Honda City", ownerId: "owner-a", owner: "Sana Malik", kind: "Rental income", income: 50_000, operatingResult: 50_000 }),
  entry({ id: "old-share", date: "2026-08-20", vehicleId: "car-a", vehicle: "Honda City", plate: "LEA-123", rentalDays: 4, ownerId: "owner-a", owner: "Sana Malik", kind: "Owner share", ownerMovement: 25_000 }),
  entry({ id: "old-cost", date: "2026-08-25", vehicleId: "car-a", vehicle: "Honda City", ownerId: "owner-a", owner: "Sana Malik", kind: "Expense", expense: 5_000, ownerMovement: -5_000 }),
  entry({ id: "rent-a", date: "2026-09-05", vehicleId: "car-a", vehicle: "Honda City", ownerId: "owner-a", owner: "Sana Malik", kind: "Rental income", income: 40_000, operatingResult: 40_000 }),
  entry({ id: "share-a", date: "2026-09-05", vehicleId: "car-a", vehicle: "Honda City", plate: "LEA-123", rentalDays: 3, rentalFrom: "2026-09-02T09:00:00Z", rentalTo: "2026-09-05T09:00:00Z", destinationCity: "Islamabad", ownerId: "owner-a", owner: "Sana Malik", kind: "Owner share", ownerMovement: 20_000 }),
  entry({ id: "cost-a", date: "2026-09-07", vehicleId: "car-a", vehicle: "Honda City", plate: "LEA-123", ownerId: "owner-a", owner: "Sana Malik", kind: "Expense", expense: 6_000, ownerMovement: -2_000 }),
  entry({ id: "agency-cost-a", date: "2026-09-08", vehicleId: "car-a", vehicle: "Honda City", plate: "LEA-123", ownerId: "owner-a", owner: "Sana Malik", kind: "Expense", expense: 1_000, ownerMovement: 0 }),
  entry({ id: "rent-b", date: "2026-09-06", vehicleId: "car-b", vehicle: "Toyota Corolla", kind: "Rental income", income: 30_000, operatingResult: 30_000 }),
  entry({ id: "payout", date: "2026-09-10", vehicleId: null, vehicle: "Owner account", ownerId: "owner-a", owner: "Sana Malik", kind: "Owner settlement", ownerMovement: -20_000 }),
];

test("owner range carries the previous balance and shows a settlement posted inside the range", () => {
  const rows = buildLedgerEntries(source, { from: "2026-09-01", to: "2026-09-30", city: "All cities", ownership: "All ownership", scope: { type: "owner", ownerId: "owner-a" } });
  assert.deepEqual(rows.map((row) => row.kind), ["Opening owner balance", "Owner share", "Expense", "Owner settlement"]);
  assert.equal(rows[0].ownerMovement, 20_000);
  assert.deepEqual(ownerLedgerRows(rows).map(({kind,plate,days,opening,income,expense,paid,balance})=>({kind,plate,days,opening,income,expense,paid,balance})),[
    {kind:"Opening balance",plate:"LEA-123",days:0,opening:20_000,income:0,expense:0,paid:0,balance:20_000},
    {kind:"Rental share",plate:"LEA-123",days:3,opening:0,income:20_000,expense:0,paid:0,balance:40_000},
    {kind:"Expense",plate:"LEA-123",days:0,opening:0,income:0,expense:2_000,paid:0,balance:38_000},
    {kind:"Payout",plate:"Owner account",days:0,opening:0,income:0,expense:0,paid:20_000,balance:18_000},
  ]);
  const share=ownerLedgerRows(rows).find(row=>row.kind==="Rental share")!;
  assert.equal(share.destination,"Islamabad");
  assert.equal(share.rentalFrom,"2026-09-02T09:00:00Z");
  assert.equal(share.rentalTo,"2026-09-05T09:00:00Z");
  const summary = summarizeLedger(rows);
  assert.equal(summary.ownerShare,20_000);
  assert.equal(summary.ownerExpenses,2_000);
  assert.equal(summary.ownerSettlements, 20_000);
  assert.equal(summary.closingOwnerBalance, 18_000);
});

test("multi-car range contains only the selected cars and never adds an owner payout", () => {
  const rows = buildLedgerEntries(source, { from: "2026-09-01", to: "2026-09-30", city: "All cities", ownership: "All ownership", scope: { type: "vehicles", vehicleIds: ["car-a", "car-b"] } });
  assert.deepEqual(rows.map((row) => row.id), ["share-a", "rent-a", "rent-b", "cost-a", "agency-cost-a"]);
  assert.equal(rows.some((row) => row.kind === "Owner settlement"), false);
});

test("customer ledger balance accumulates like a bank statement", () => {
  const booking = (id: string, pickupAt: string, totalAmount: number, paid: number, status = "completed") => ({ id, vehicle: "Honda City", plate: "LEA-123", status, pickupAt, returnAt: pickupAt, totalAmount, paid });
  const ledger = customerLedger([booking("b3", "2026-09-10", 27_000, 12_000), booking("b1", "2026-09-01", 6_000, 0), booking("b2", "2026-09-05", 3_000, 0), booking("b4", "2026-09-12", 5_000, 0, "cancelled")]);
  assert.deepEqual(ledger.rows.map((row) => row.balance), [6_000, 9_000, 24_000, 24_000]);
  assert.equal(ledger.closing, 24_000);
  const ranged = customerLedger([booking("b1", "2026-09-01", 6_000, 0), booking("b2", "2026-09-05", 3_000, 0), booking("b3", "2026-09-10", 27_000, 12_000)], { from: "2026-09-04" });
  assert.equal(ranged.opening, 6_000);
  assert.deepEqual(ranged.rows.map((row) => row.balance), [9_000, 24_000]);
});

test("owner statement splits per car with each car's running balance", () => {
  const extra = [
    ...source,
    entry({ id: "share-c", date: "2026-09-12", vehicleId: "car-c", vehicle: "Suzuki Alto", plate: "LEB-9", rentalDays: 2, ownerId: "owner-a", owner: "Sana Malik", kind: "Owner share", ownerMovement: 8_000 }),
    entry({ id: "FIX-car-c-2026-09", date: "2026-09-01", vehicleId: "car-c", vehicle: "Suzuki Alto", plate: "LEB-9", ownerId: "owner-a", owner: "Sana Malik", kind: "Fixed charge", category: "Tracker", ownerMovement: -1_500 }),
  ];
  const rows = buildLedgerEntries(extra, { from: "2026-09-01", to: "2026-09-30", city: "All cities", ownership: "All ownership", scope: { type: "owner", ownerId: "owner-a" } });
  const cars = ownerLedgerByCar(rows);
  assert.deepEqual(cars.map((car) => [car.plate, car.closing]), [["LEA-123", 38_000], ["LEB-9", 6_500], ["Owner account", -20_000]]);
  assert.equal(cars[1].rows[0].head, "Tracker");
  assert.equal(summarizeLedger(rows).fixedCharges, 1_500);
  assert.equal(summarizeLedger(rows).closingOwnerBalance, 24_500);
  assert.deepEqual(filterLedgerEntries(rows, "expense", true, "Tracker").map((row) => row.id), ["FIX-car-c-2026-09"]);
});

test("whole-system balance carries the result from before the range", () => {
  const filters = { from: "2026-09-01", to: "2026-09-30", city: "All cities", ownership: "All ownership", scope: { type: "overall" as const } };
  const opening = ledgerOpeningResult(source, filters);
  assert.equal(opening, 50_000);
  const rows = buildLedgerEntries(source, filters);
  const balances = runningResultBalances(rows, opening);
  assert.equal(balances.get(rows.at(-1)!.id), 50_000 + 40_000 + 30_000);
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

test("owner car sheet totals follow the paper sheet: rent, agency %, debit, total, remaining, grand", () => {
  const owner = { vehicleId: "car-s", vehicle: "343", plate: "343", ownerId: "owner-s", owner: "Adil Rauf" };
  const sheet: LedgerEntry[] = [
    entry({ ...owner, id: "prev", date: "2026-07-20", kind: "Owner share", grossRent: 737_756, ownerMovement: 590_205, description: "Owner earns 80% of full rental" }),
    entry({ ...owner, id: "r1", date: "2026-08-01", customer: "Usman", destinationCity: "Sakhi Sultan", kind: "Owner share", grossRent: 3_000, ownerMovement: 2_400, description: "Owner earns 80% of full rental PKR 3,000" }),
    entry({ ...owner, id: "r2", date: "2026-08-02", customer: "Israr Shah", destinationCity: "Kohat", kind: "Owner share", grossRent: 4_000, ownerMovement: 3_200, description: "Owner earns 80% of full rental PKR 4,000" }),
    entry({ ...owner, id: "c1", date: "2026-08-02", kind: "Expense", category: "Puncture", expense: 500, ownerMovement: -500 }),
    entry({ ...owner, id: "c2", date: "2026-08-25", kind: "Expense", category: "Oil filter", meter: 269_340, expense: 5_200, ownerMovement: -5_200 }),
    entry({ ...owner, id: "back", date: "2026-08-26", kind: "Expense recovery", category: "Oil filter", expense: -1_000, ownerMovement: 1_000, operatingResult: 1_000 }),
    entry({ ...owner, id: "p1", date: "2026-08-15", kind: "Owner settlement", ownerMovement: -1_000 }),
  ];
  const rows = buildLedgerEntries(sheet, { from: "2026-08-01", to: "2026-08-31", city: "All cities", ownership: "All ownership", scope: { type: "owner", ownerId: "owner-s" } });
  const [car] = ownerLedgerByCar(rows);
  assert.equal(car.plate, "343");
  assert.equal(car.vehicle, "343", "ledgers identify cars by number only");
  assert.equal(car.opening, 590_205);
  assert.equal(car.rent, 7_000);
  assert.equal(car.agencyPercent, 20);
  assert.equal(car.agencyShare, 1_400);
  assert.equal(car.debit, 500 + 5_200 - 1_000 + 1_000);
  assert.equal(car.net, 5_600 - car.debit);
  assert.equal(car.closing, car.opening + car.net);
  const share = car.rows.find((row) => row.id === "r1")!;
  assert.deepEqual([share.customer, share.rent, share.income], ["Usman", 3_000, 2_400]);
  assert.equal(car.rows.find((row) => row.id === "c2")!.meter, 269_340);
  assert.equal(car.rows.find((row) => row.id === "back")!.kind, "Recovery");
  assert.equal(car.rows.find((row) => row.id === "back")!.expense, -1_000);
});

test("expense recoveries net out of expenses and the whole-system result", () => {
  const rows = [
    entry({ id: "cost", date: "2026-09-01", vehicleId: null, vehicle: "Agency-wide", kind: "Expense", expense: 6_000, operatingResult: -6_000 }),
    entry({ id: "back", date: "2026-09-03", vehicleId: null, vehicle: "Agency-wide", kind: "Expense recovery", expense: -2_500, operatingResult: 2_500 }),
  ];
  const summary = summarizeLedger(rows);
  assert.equal(summary.expenses, 3_500);
  assert.equal(summary.recovered, 2_500);
  assert.equal(summary.operatingResult, -3_500);
  assert.deepEqual(filterLedgerEntries(rows, "expense", false).map((row) => row.id), ["cost", "back"]);
});

test("account summary nets recoveries and skips void bookings", () => {
  const summary = summarizeAccount(
    [{ status: "completed", totalAmount: 10_000, paid: 8_000 }, { status: "cancelled", totalAmount: 5_000, paid: 0 }],
    [{ id: "e1", date: "2026-09-01", head: "Fuel", description: "Top-up", plate: "LEA-1", bookingId: "b1", amount: 3_000, recovered: 1_000 }],
  );
  assert.deepEqual(summary, { rent: 10_000, received: 8_000, expenses: 3_000, recovered: 1_000, netExpense: 2_000, net: 6_000 });
});

test("an unreturned customer expense stays due after all rent is paid", () => {
  const bookings = [{ id: "B1", vehicle: "", plate: "LEA-1", status: "completed", pickupAt: "2026-09-01T09:00:00Z", returnAt: "2026-09-03T09:00:00Z", totalAmount: 10_000, paid: 10_000 }];
  const expenses = [{ id: "EXP-1", date: "2026-09-04", head: "Damage", description: "Bumper", plate: "LEA-1", amount: 4_000, recovered: 1_500 }];
  const ledger = customerLedger(bookings, {}, expenses);
  assert.deepEqual(ledger.rows.map((row) => [row.kind, row.amount, row.paid, row.balance]), [["booking", 10_000, 10_000, 0], ["expense", 4_000, 1_500, 2_500]]);
  assert.equal(ledger.closing, 2_500);
});

test("with dated payments, each payment is its own row on the day it was received", () => {
  const bookings = [
    { id: "B1", vehicle: "", plate: "LEA-1", status: "completed", pickupAt: "2026-09-01T09:00:00Z", returnAt: "2026-09-03T09:00:00Z", totalAmount: 10_000, paid: 10_000 },
    { id: "B2", vehicle: "", plate: "LEA-1", status: "completed", pickupAt: "2026-09-05T09:00:00Z", returnAt: "2026-09-06T09:00:00Z", totalAmount: 6_000, paid: 2_000 },
  ];
  const payments = [
    { id: "P1", date: "2026-09-10", amount: 10_000, bookingId: "B1", plate: "LEA-1", description: "Payment received · #1" },
    { id: "P2", date: "2026-09-10", amount: 2_000, bookingId: "B2", plate: "LEA-1", description: "Payment received · #2" },
  ];
  const ledger = customerLedger(bookings, {}, [], payments);
  assert.deepEqual(ledger.rows.map((row) => [row.kind, row.id, row.amount, row.paid, row.balance]), [
    ["booking", "B1", 10_000, 0, 10_000],
    ["booking", "B2", 6_000, 0, 16_000],
    ["payment", "P1", 0, 10_000, 6_000],
    ["payment", "P2", 0, 2_000, 4_000],
  ]);
  assert.equal(ledger.closing, 4_000);
  // Same closing balance as the booking-based view.
  assert.equal(customerLedger(bookings).closing, 4_000);
  // A period after the rentals opens with what was owed and shows only the payments in it.
  const later = customerLedger(bookings, { from: "2026-09-08" }, [], payments);
  assert.equal(later.opening, 16_000);
  assert.deepEqual(later.rows.map((row) => row.id), ["P1", "P2"]);
});
