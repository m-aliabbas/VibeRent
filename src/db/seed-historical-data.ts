/**
 * Seed historical dummy data (July–September 2026) for VibeRent.
 *
 * Run: npx tsx src/db/seed-historical-data.ts
 *
 * What it does:
 *   1. Creates auth account for abc@c.com (same password as abc@a.com)
 *   2. Grants abc@c.com, abc@a.com, abc@abc.com membership to BOTH agencies
 *   3. Adds vehicles, owners, agreements, customers to both agencies (skip on conflict)
 *   4. Seeds July / August / September 2026 bookings, inspections, transactions,
 *      expenses and owner payouts so the dashboard and reports have realistic history
 */

import { randomUUID } from "node:crypto";
import { db, sqlite } from "@/db/connection";
import {
  account,
  auditEvents,
  bookings,
  customers,
  expenses,
  financialTransactions,
  managementAgreements,
  member,
  memberBranchAccess,
  organization,
  ownerPayouts,
  owners,
  rentalInspections,
  user,
  users,
  vehicles,
  branches,
} from "@/db/schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowStr() { return new Date().toISOString(); }

function mustGet<T>(sql: string, ...params: unknown[]): T {
  const row = sqlite.prepare(sql).get(...params) as T | undefined;
  if (!row) throw new Error(`mustGet failed: ${sql} params=${JSON.stringify(params)}`);
  return row;
}

function maybeGet<T>(sql: string, ...params: unknown[]): T | undefined {
  return sqlite.prepare(sql).get(...params) as T | undefined;
}

// ---------------------------------------------------------------------------
// 1. Ensure abc@c.com auth account exists (copy password from abc@a.com)
// ---------------------------------------------------------------------------

function ensureAbcCUser() {
  const existing = maybeGet<{ id: string }>("SELECT id FROM user WHERE lower(email)='abc@c.com'");
  if (existing) { console.log("[abc@c.com] auth user already exists:", existing.id); return existing.id; }

  // Borrow the password hash from abc@a.com account
  const abcA = maybeGet<{ userId: string; password: string }>(
    "SELECT user_id AS userId, password FROM account WHERE user_id=(SELECT id FROM user WHERE lower(email)='abc@a.com' LIMIT 1) LIMIT 1"
  );
  const passwordHash = abcA?.password ?? "";

  const id = `auth_${randomUUID().replace(/-/g, "")}`;
  const nowDate = new Date();
  db.insert(user).values({ id, name: "Ali", email: "abc@c.com", emailVerified: true, createdAt: nowDate, updatedAt: nowDate }).run();
  db.insert(account).values({
    id: `acc_${randomUUID()}`,
    accountId: id,
    providerId: "credential",
    userId: id,
    password: passwordHash,
    createdAt: nowDate,
    updatedAt: nowDate,
  }).run();
  console.log("[abc@c.com] created auth user:", id);
  return id;
}

// ---------------------------------------------------------------------------
// 2. Grant all three users membership in an agency
// ---------------------------------------------------------------------------

function ensureMembership(authUserId: string, orgId: string, orgName: string, branchIds: string[]) {
  // Ensure organization row
  db.insert(organization).values({
    id: orgId, name: orgName, slug: orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-"), createdAt: new Date(),
  }).onConflictDoNothing().run();

  const existing = maybeGet<{ id: string }>("SELECT id FROM member WHERE organization_id=? AND user_id=?", orgId, authUserId);
  const memId = existing?.id ?? `mem_${randomUUID().replace(/-/g, "")}`;
  if (!existing) {
    db.insert(member).values({ id: memId, organizationId: orgId, userId: authUserId, role: "agency_owner", createdAt: new Date() }).run();
  }
  for (const brId of branchIds) {
    sqlite.prepare("INSERT OR IGNORE INTO member_branch_access (membership_id, branch_id) VALUES (?, ?)").run(memId, brId);
  }
  return memId;
}

function ensureStaffUser(authUserId: string, memId: string, agencyId: string, defaultBranchId: string, email: string) {
  const existing = maybeGet<{ id: string }>(
    "SELECT id FROM users WHERE agency_id=? AND (auth_user_id=? OR lower(email)=lower(?))",
    agencyId, authUserId, email
  );
  if (existing) {
    sqlite.prepare("UPDATE users SET auth_user_id=?, membership_id=?, updated_at=?, version=version+1 WHERE id=?")
      .run(authUserId, memId, nowStr(), existing.id);
    return existing.id;
  }
  const id = `usr_${randomUUID().replace(/-/g, "")}`;
  const now = nowStr();
  sqlite.prepare(`
    INSERT INTO users (id, auth_user_id, membership_id, agency_id, branch_id, email, name, role, active, version, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'Ali', 'agency_owner', 1, 1, ?, ?)
  `).run(id, authUserId, memId, agencyId, defaultBranchId, email.toLowerCase(), now, now);
  return id;
}

// ---------------------------------------------------------------------------
// 3. Agency-level data helpers
// ---------------------------------------------------------------------------

type AgencyContext = {
  agencyId: string;
  agencyName: string;
  branchIds: string[];
  branch1: string;
  branch2: string;
  actorId: string;
  customerMap: Record<string, string>; // key -> real DB id
  vehicleMap: Record<string, string>;
  ownerMap: Record<string, string>;
};

function buildAgencyContext(agencyId: string, agencyName: string): AgencyContext {
  const agencyBranches = sqlite.prepare("SELECT id FROM branches WHERE agency_id=? ORDER BY created_at").all(agencyId) as Array<{ id: string }>;
  const branchIds = agencyBranches.map(r => r.id);
  const branch1 = branchIds[0]!;
  const branch2 = branchIds[1] ?? branch1;
  const actorRow = mustGet<{ id: string }>("SELECT id FROM users WHERE agency_id=? AND active=1 LIMIT 1", agencyId);
  return { agencyId, agencyName, branchIds, branch1, branch2, actorId: actorRow.id, customerMap: {}, vehicleMap: {}, ownerMap: {} };
}

function seedOwners(ctx: AgencyContext, list: Array<{ key: string; name: string; phone: string; email?: string }>) {
  for (const o of list) {
    const existing = maybeGet<{ id: string }>("SELECT id FROM owners WHERE agency_id=? AND name=?", ctx.agencyId, o.name);
    if (existing) { ctx.ownerMap[o.key] = existing.id; continue; }
    const id = `own_${ctx.agencyId}_${o.key}`.slice(0, 64);
    db.insert(owners).values({ id, agencyId: ctx.agencyId, name: o.name, phone: o.phone, email: o.email, status: "active", createdAt: "2026-06-01T08:00:00.000Z", updatedAt: "2026-06-01T08:00:00.000Z" }).onConflictDoNothing().run();
    ctx.ownerMap[o.key] = id;
  }
}

function seedAgreements(ctx: AgencyContext, list: Array<{ key: string; ownerKey: string; sharePercent: number }>) {
  for (const a of list) {
    const ownerId = ctx.ownerMap[a.ownerKey]!;
    const existing = maybeGet<{ id: string }>("SELECT id FROM management_agreements WHERE agency_id=? AND owner_id=? AND version=1", ctx.agencyId, ownerId);
    if (existing) { continue; }
    const id = `agr_${ctx.agencyId}_${a.key}`.slice(0, 64);
    db.insert(managementAgreements).values({
      id, agencyId: ctx.agencyId, ownerId, version: 1,
      effectiveFrom: "2026-06-01", shareBasis: "percentage", ownerSharePercent: a.sharePercent,
      payoutFrequency: "monthly",
      createdAt: "2026-06-01T08:00:00.000Z", updatedAt: "2026-06-01T08:00:00.000Z",
    }).onConflictDoNothing().run();
  }
}

function getAgreementId(ctx: AgencyContext, ownerKey: string) {
  const ownerId = ctx.ownerMap[ownerKey];
  if (!ownerId) return null;
  const row = maybeGet<{ id: string }>("SELECT id FROM management_agreements WHERE agency_id=? AND owner_id=? LIMIT 1", ctx.agencyId, ownerId);
  return row?.id ?? null;
}

function seedCustomers(ctx: AgencyContext, list: Array<{ key: string; name: string; phone: string; cnic: string; email?: string; license?: string; licenseExpiry?: string; status?: string }>) {
  for (const c of list) {
    const existing = maybeGet<{ id: string }>("SELECT id FROM customers WHERE agency_id=? AND cnic_normalized=?", ctx.agencyId, c.cnic);
    if (existing) { ctx.customerMap[c.key] = existing.id; continue; }
    const id = `cus_${ctx.agencyId}_${c.key}`.slice(0, 64);
    db.insert(customers).values({
      id, agencyId: ctx.agencyId, name: c.name, phoneNormalized: c.phone, cnicNormalized: c.cnic,
      email: c.email, licenseNumber: c.license, licenseExpiresAt: c.licenseExpiry,
      status: c.status ?? "active",
      createdAt: "2026-06-15T10:00:00.000Z", updatedAt: "2026-06-15T10:00:00.000Z",
    }).onConflictDoNothing().run();
    ctx.customerMap[c.key] = id;
  }
}

function seedVehicles(ctx: AgencyContext, list: Array<{ key: string; plate: string; make: string; model: string; year: number; category: string; color: string; transmission: string; fuel: string; dailyRate: number; status: string; ownership: string; ownerKey?: string; branchKey?: "branch1" | "branch2" }>) {
  for (const v of list) {
    const branchId = v.branchKey === "branch2" ? ctx.branch2 : ctx.branch1;
    const ownerId = v.ownerKey ? ctx.ownerMap[v.ownerKey] : undefined;
    const agreementId = v.ownerKey ? getAgreementId(ctx, v.ownerKey) : undefined;

    const existing = maybeGet<{ id: string }>("SELECT id FROM vehicles WHERE agency_id=? AND plate=?", ctx.agencyId, v.plate);
    if (existing) { ctx.vehicleMap[v.key] = existing.id; continue; }
    const id = `veh_${ctx.agencyId}_${v.key}`.slice(0, 64);
    db.insert(vehicles).values({
      id, agencyId: ctx.agencyId, branchId, ownerId, agreementId,
      plate: v.plate, make: v.make, model: v.model, year: v.year,
      category: v.category, color: v.color, transmission: v.transmission, fuel: v.fuel,
      status: v.status, ownership: v.ownership, dailyRate: v.dailyRate,
      createdAt: "2026-06-10T09:00:00.000Z", updatedAt: "2026-06-10T09:00:00.000Z",
    }).onConflictDoNothing().run();
    ctx.vehicleMap[v.key] = id;
  }
}

// ---------------------------------------------------------------------------
// 4. Booking + transaction seeding
// ---------------------------------------------------------------------------

type BookingSeed = {
  id: string;
  vehicleKey: string;
  customerKey: string;
  branchKey: "branch1" | "branch2";
  destinationCity: string;
  pickupAt: string;
  returnAt: string;
  checkedOutAt?: string;
  completedAt?: string;
  status: "completed" | "checked_out" | "confirmed" | "cancelled" | "no_show";
  dailyRate: number;
  totalAmount: number;
  depositRequired: number;
  source: string;
  notes?: string;
  cancellationReason?: string;
  checkoutOdo?: number;
  checkinOdo?: number;
  paymentMethod?: string;
};

function seedBooking(ctx: AgencyContext, b: BookingSeed) {
  const agencyId = ctx.agencyId;
  const vehicleId = ctx.vehicleMap[b.vehicleKey];
  const customerId = ctx.customerMap[b.customerKey];
  const branchId = b.branchKey === "branch2" ? ctx.branch2 : ctx.branch1;

  if (!vehicleId) { console.warn(`[SKIP booking ${b.id}] vehicleKey "${b.vehicleKey}" not found`); return; }
  if (!customerId) { console.warn(`[SKIP booking ${b.id}] customerKey "${b.customerKey}" not found`); return; }

  const realId = `bkg_${agencyId}_${b.id}`.slice(0, 64);

  db.insert(bookings).values({
    id: realId, agencyId, branchId, vehicleId, customerId,
    destinationCity: b.destinationCity,
    pickupAt: b.pickupAt, returnAt: b.returnAt,
    checkedOutAt: b.checkedOutAt, completedAt: b.completedAt,
    status: b.status, dailyRate: b.dailyRate, totalAmount: b.totalAmount,
    depositRequired: b.depositRequired, source: b.source,
    notes: b.notes ?? "", cancellationReason: b.cancellationReason,
    createdAt: b.pickupAt,
    updatedAt: b.completedAt ?? b.checkedOutAt ?? b.pickupAt,
  }).onConflictDoNothing().run();

  const when = b.checkedOutAt ?? b.pickupAt;

  if (b.status === "completed" || b.status === "checked_out") {
    if (b.checkoutOdo) {
      db.insert(rentalInspections).values({
        id: `insp_${realId}_out`, agencyId, bookingId: realId, kind: "checkout",
        odometer: b.checkoutOdo, fuelLevel: "8/8 (Full)",
        conditionNotes: "Pre-rental walkthrough completed. No new damage observed. Spare wheel and toolkit verified.",
        actorId: ctx.actorId, occurredAt: when, createdAt: when, updatedAt: when,
      }).onConflictDoNothing().run();
    }

    if (b.depositRequired > 0) {
      db.insert(financialTransactions).values({
        id: `ft_dep_${realId}`, agencyId, bookingId: realId, customerId,
        kind: "deposit_received", amount: b.depositRequired,
        method: b.paymentMethod ?? "Cash",
        reference: `DEP-${realId.slice(-6).toUpperCase()}`,
        idempotencyKey: `idemp_dep_${realId}`,
        status: "posted", actorId: ctx.actorId,
        postedAt: when, createdAt: when, updatedAt: when,
      }).onConflictDoNothing().run();
    }

    const payWhen = b.status === "completed" ? (b.completedAt ?? b.returnAt) : when;
    db.insert(financialTransactions).values({
      id: `ft_pay_${realId}`, agencyId, bookingId: realId, customerId,
      kind: "payment", amount: b.totalAmount,
      method: b.paymentMethod ?? "Bank Transfer",
      reference: `PAY-${realId.slice(-6).toUpperCase()}`,
      idempotencyKey: `idemp_pay_${realId}`,
      status: "posted", actorId: ctx.actorId,
      postedAt: payWhen, createdAt: payWhen, updatedAt: payWhen,
    }).onConflictDoNothing().run();

    if (b.status === "completed") {
      if (b.checkinOdo) {
        db.insert(rentalInspections).values({
          id: `insp_${realId}_in`, agencyId, bookingId: realId, kind: "checkin",
          odometer: b.checkinOdo, fuelLevel: "8/8 (Full)",
          conditionNotes: "Returned in good condition. Engine normal, toolkit complete.",
          actorId: ctx.actorId, occurredAt: b.completedAt ?? b.returnAt,
          createdAt: b.completedAt ?? b.returnAt, updatedAt: b.completedAt ?? b.returnAt,
        }).onConflictDoNothing().run();
      }

      if (b.depositRequired > 0) {
        db.insert(financialTransactions).values({
          id: `ft_ref_${realId}`, agencyId, bookingId: realId, customerId,
          kind: "deposit_refunded", amount: b.depositRequired,
          method: "Cash",
          reference: `REF-${realId.slice(-6).toUpperCase()}`,
          idempotencyKey: `idemp_ref_${realId}`,
          status: "posted", actorId: ctx.actorId,
          postedAt: b.completedAt ?? b.returnAt,
          createdAt: b.completedAt ?? b.returnAt,
          updatedAt: b.completedAt ?? b.returnAt,
        }).onConflictDoNothing().run();
      }
    }
  }

  db.insert(auditEvents).values({
    id: `aud_${realId}`, agencyId, actorId: ctx.actorId,
    action: b.status === "completed" ? "booking.completed" : b.status === "checked_out" ? "booking.checked_out" : "booking.created",
    entityType: "booking", entityId: realId,
    metadata: { status: b.status, totalAmount: b.totalAmount, vehicleId, customerId },
    occurredAt: b.completedAt ?? b.checkedOutAt ?? b.pickupAt,
  }).onConflictDoNothing().run();
}

// ---------------------------------------------------------------------------
// 5. Expenses helper
// ---------------------------------------------------------------------------

function seedExpenses(ctx: AgencyContext, list: Array<{ id: string; vehicleKey?: string; amount: number; category: string; description: string; status: string; occurredOn: string }>) {
  for (const exp of list) {
    const vehicleId = exp.vehicleKey ? ctx.vehicleMap[exp.vehicleKey] : undefined;
    const realId = `exp_${ctx.agencyId}_${exp.id}`.slice(0, 64);
    const when = `${exp.occurredOn}T12:00:00.000Z`;
    db.insert(expenses).values({
      id: realId, agencyId: ctx.agencyId, vehicleId,
      amount: exp.amount, category: exp.category, description: exp.description,
      status: exp.status, occurredOn: exp.occurredOn,
      createdAt: when, updatedAt: when,
    }).onConflictDoNothing().run();

    db.insert(auditEvents).values({
      id: `aud_${realId}`, agencyId: ctx.agencyId, actorId: ctx.actorId,
      action: "expense.approved", entityType: "expense", entityId: realId,
      metadata: { amount: exp.amount, category: exp.category, description: exp.description },
      occurredAt: when,
    }).onConflictDoNothing().run();
  }
}

// ---------------------------------------------------------------------------
// 6. Owner payouts helper
// ---------------------------------------------------------------------------

function seedPayouts(ctx: AgencyContext, list: Array<{ ownerKey: string; periodFrom: string; periodTo: string; amount: number; method: string; reference: string; paidAt: string }>) {
  for (const po of list) {
    const ownerId = ctx.ownerMap[po.ownerKey];
    if (!ownerId) { console.warn(`[SKIP payout] ownerKey "${po.ownerKey}" not found`); continue; }
    const realId = `payout_${ctx.agencyId}_${po.ownerKey}_${po.periodFrom}`.slice(0, 64);
    db.insert(ownerPayouts).values({
      id: realId, agencyId: ctx.agencyId, ownerId,
      periodFrom: po.periodFrom, periodTo: po.periodTo, amount: po.amount,
      method: po.method, reference: po.reference,
      idempotencyKey: `idemp_${realId}`,
      status: "posted", actorId: ctx.actorId, paidAt: po.paidAt,
      createdAt: po.paidAt, updatedAt: po.paidAt,
    }).onConflictDoNothing().run();
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const abcCAuthId = ensureAbcCUser();
  const allAuthUsers = [
    { email: "abc@c.com", id: abcCAuthId },
    { email: "abc@a.com", id: sqlite.prepare("SELECT id FROM user WHERE lower(email)='abc@a.com'").pluck().get() as string },
    { email: "abc@abc.com", id: sqlite.prepare("SELECT id FROM user WHERE lower(email)='abc@abc.com'").pluck().get() as string },
  ].filter(u => u.id);

  // ---- Setup for both agencies ----
  const agencyDefs = [
    { id: "agy-viberent", name: "VibeRent Mobility" },
    { id: "dB5kgurYswaszKxcLJ98V9CXS4IYuZQ0", name: "Ali Rent a car" },
  ];

  for (const ag of agencyDefs) {
    const branchIds = (sqlite.prepare("SELECT id FROM branches WHERE agency_id=?").all(ag.id) as Array<{ id: string }>).map(r => r.id);
    for (const u of allAuthUsers) {
      const memId = ensureMembership(u.id, ag.id, ag.name, branchIds);
      ensureStaffUser(u.id, memId, ag.id, branchIds[0]!, u.email);
    }
  }

  // Extra branches for Ali Rent a car
  const aliId = "dB5kgurYswaszKxcLJ98V9CXS4IYuZQ0";
  db.insert(branches).values([
    { id: `br_${aliId}_isb`, agencyId: aliId, name: "Islamabad F-10", city: "Islamabad", address: "F-10 Markaz, Islamabad", active: true, createdAt: nowStr(), updatedAt: nowStr() },
    { id: `br_${aliId}_rwp`, agencyId: aliId, name: "Rawalpindi Saddar", city: "Rawalpindi", address: "Haider Road, Saddar, Rawalpindi", active: true, createdAt: nowStr(), updatedAt: nowStr() },
  ] as any[]).onConflictDoNothing().run();

  // ===========================================================================
  // AGENCY 1: agy-viberent
  // ===========================================================================
  const vr = buildAgencyContext("agy-viberent", "VibeRent Mobility");

  seedOwners(vr, [
    { key: "farhan", name: "Farhan Qureshi", phone: "+92 300 882 1940", email: "farhan.q@motors.pk" },
    { key: "hassan", name: "Hassan Motors", phone: "+92 321 770 5512", email: "info@hassanmotors.pk" },
    { key: "sana", name: "Sana Malik", phone: "+92 333 620 1178", email: "sana.malik@outlook.com" },
  ]);

  seedAgreements(vr, [
    { key: "farhan", ownerKey: "farhan", sharePercent: 80 },
    { key: "hassan", ownerKey: "hassan", sharePercent: 75 },
    { key: "sana", ownerKey: "sana", sharePercent: 80 },
  ]);

  seedCustomers(vr, [
    { key: "hamza", name: "Hamza Siddiqui", phone: "923215902741", cnic: "6110112345678", email: "hamza.siddiqui@gmail.com", license: "ICT-88420", licenseExpiry: "2028-03-14", status: "preferred" },
    { key: "areeba", name: "Areeba Khan", phone: "923008421190", cnic: "3520212345674", email: "areeba.khan@outlook.com", license: "LHR-77102", licenseExpiry: "2028-07-09" },
    { key: "maham", name: "Maham Ali", phone: "923337714028", cnic: "3740512345672", email: "maham.ali@yahoo.com", license: "RWP-33419", licenseExpiry: "2027-11-20", status: "preferred" },
    { key: "zain", name: "Zain Ahmed", phone: "923051186302", cnic: "4210112345676", email: "zain.ahmed@hotmail.com", license: "KHI-99214", licenseExpiry: "2028-01-18", status: "review" },
    { key: "bilal", name: "Bilal Tariq", phone: "923455123890", cnic: "3720112345671", email: "bilal.tariq@gmail.com", license: "ISB-55201", licenseExpiry: "2029-05-10" },
    { key: "usman", name: "Usman Ghani", phone: "923014499210", cnic: "3520112345679", email: "usman.ghani@live.com", license: "LHR-44102", licenseExpiry: "2027-09-02" },
  ]);

  seedVehicles(vr, [
    { key: "corolla", plate: "ICT-744", make: "Toyota", model: "Corolla Altis", year: 2022, category: "sedan", color: "Super White", transmission: "automatic", fuel: "petrol", dailyRate: 9500, status: "rented", ownership: "owned", branchKey: "branch1" },
    { key: "city", plate: "LEB-219", make: "Honda", model: "City Aspire", year: 2023, category: "sedan", color: "Lunar Silver", transmission: "automatic", fuel: "petrol", dailyRate: 11000, status: "available", ownership: "owned", branchKey: "branch1" },
    { key: "sportage", plate: "LHR-621", make: "KIA", model: "Sportage AWD", year: 2022, category: "suv", color: "Panthera Metal", transmission: "automatic", fuel: "petrol", dailyRate: 18000, status: "available", ownership: "managed", ownerKey: "farhan", branchKey: "branch2" },
    { key: "alto", plate: "RIK-115", make: "Suzuki", model: "Alto VXL", year: 2024, category: "economy", color: "Solid White", transmission: "automatic", fuel: "petrol", dailyRate: 7100, status: "available", ownership: "owned", branchKey: "branch1" },
    { key: "yaris", plate: "BKC-801", make: "Toyota", model: "Yaris ATIV X", year: 2023, category: "sedan", color: "Graphite Grey", transmission: "automatic", fuel: "petrol", dailyRate: 9250, status: "available", ownership: "managed", ownerKey: "hassan", branchKey: "branch2" },
    { key: "tucson", plate: "ISB-991", make: "Hyundai", model: "Tucson GLS", year: 2023, category: "suv", color: "Phantom Black", transmission: "automatic", fuel: "petrol", dailyRate: 19500, status: "available", ownership: "owned", branchKey: "branch1" },
    { key: "civic", plate: "KHI-402", make: "Honda", model: "Civic Oriel", year: 2022, category: "sedan", color: "Crystal Black", transmission: "automatic", fuel: "petrol", dailyRate: 16000, status: "available", ownership: "managed", ownerKey: "sana", branchKey: "branch2" },
  ]);

  // Bookings for agy-viberent
  const vrBookings: BookingSeed[] = [
    // July 2026
    { id: "jul1", vehicleKey: "corolla", customerKey: "hamza", branchKey: "branch1", destinationCity: "Islamabad", pickupAt: "2026-07-08T09:00:00.000Z", returnAt: "2026-07-12T09:00:00.000Z", checkedOutAt: "2026-07-08T09:15:00.000Z", completedAt: "2026-07-12T09:30:00.000Z", status: "completed", dailyRate: 9500, totalAmount: 38000, depositRequired: 25000, source: "counter", checkoutOdo: 31200, checkinOdo: 31750, paymentMethod: "Bank Transfer" },
    { id: "jul2", vehicleKey: "city", customerKey: "areeba", branchKey: "branch1", destinationCity: "Lahore", pickupAt: "2026-07-15T11:00:00.000Z", returnAt: "2026-07-19T11:00:00.000Z", checkedOutAt: "2026-07-15T11:10:00.000Z", completedAt: "2026-07-19T11:45:00.000Z", status: "completed", dailyRate: 11000, totalAmount: 44000, depositRequired: 25000, source: "phone", checkoutOdo: 18400, checkinOdo: 19100, paymentMethod: "Cash" },
    { id: "jul3", vehicleKey: "sportage", customerKey: "maham", branchKey: "branch2", destinationCity: "Murree", pickupAt: "2026-07-22T08:00:00.000Z", returnAt: "2026-07-26T18:00:00.000Z", checkedOutAt: "2026-07-22T08:20:00.000Z", completedAt: "2026-07-26T18:15:00.000Z", status: "completed", dailyRate: 18000, totalAmount: 72000, depositRequired: 40000, source: "whatsapp", checkoutOdo: 24100, checkinOdo: 24680, paymentMethod: "Raast" },
    { id: "jul4", vehicleKey: "tucson", customerKey: "bilal", branchKey: "branch1", destinationCity: "Naran / Kaghan", pickupAt: "2026-07-28T07:00:00.000Z", returnAt: "2026-08-02T18:00:00.000Z", checkedOutAt: "2026-07-28T07:15:00.000Z", completedAt: "2026-08-02T18:30:00.000Z", status: "completed", dailyRate: 19500, totalAmount: 97500, depositRequired: 45000, source: "counter", checkoutOdo: 14200, checkinOdo: 15340, paymentMethod: "Bank Transfer" },
    // August 2026
    { id: "aug1", vehicleKey: "alto", customerKey: "zain", branchKey: "branch1", destinationCity: "Rawalpindi", pickupAt: "2026-08-03T10:00:00.000Z", returnAt: "2026-08-07T10:00:00.000Z", checkedOutAt: "2026-08-03T10:15:00.000Z", completedAt: "2026-08-07T10:30:00.000Z", status: "completed", dailyRate: 7100, totalAmount: 28400, depositRequired: 20000, source: "counter", checkoutOdo: 8200, checkinOdo: 8610, paymentMethod: "Cash" },
    { id: "aug2", vehicleKey: "corolla", customerKey: "bilal", branchKey: "branch1", destinationCity: "Peshawar", pickupAt: "2026-08-10T09:00:00.000Z", returnAt: "2026-08-14T09:00:00.000Z", checkedOutAt: "2026-08-10T09:05:00.000Z", completedAt: "2026-08-14T09:10:00.000Z", status: "completed", dailyRate: 9500, totalAmount: 38000, depositRequired: 25000, source: "phone", checkoutOdo: 32300, checkinOdo: 32950, paymentMethod: "Bank Transfer" },
    { id: "aug3", vehicleKey: "yaris", customerKey: "usman", branchKey: "branch2", destinationCity: "Faisalabad", pickupAt: "2026-08-16T12:00:00.000Z", returnAt: "2026-08-21T12:00:00.000Z", checkedOutAt: "2026-08-16T12:20:00.000Z", completedAt: "2026-08-21T12:00:00.000Z", status: "completed", dailyRate: 9250, totalAmount: 46250, depositRequired: 25000, source: "counter", checkoutOdo: 19800, checkinOdo: 20550, paymentMethod: "Card" },
    { id: "aug4", vehicleKey: "civic", customerKey: "hamza", branchKey: "branch2", destinationCity: "Lahore", pickupAt: "2026-08-23T08:00:00.000Z", returnAt: "2026-08-27T18:00:00.000Z", checkedOutAt: "2026-08-23T08:15:00.000Z", completedAt: "2026-08-27T18:30:00.000Z", status: "completed", dailyRate: 16000, totalAmount: 64000, depositRequired: 35000, source: "website", checkoutOdo: 28100, checkinOdo: 28920, paymentMethod: "Bank Transfer" },
    { id: "aug5", vehicleKey: "alto", customerKey: "areeba", branchKey: "branch1", destinationCity: "Rawalpindi", pickupAt: "2026-08-29T10:00:00.000Z", returnAt: "2026-09-01T10:00:00.000Z", checkedOutAt: "2026-08-29T10:10:00.000Z", completedAt: "2026-09-01T10:25:00.000Z", status: "completed", dailyRate: 7100, totalAmount: 21300, depositRequired: 20000, source: "counter", checkoutOdo: 9000, checkinOdo: 9290, paymentMethod: "Cash" },
    // September 2026 (past)
    { id: "sep1", vehicleKey: "city", customerKey: "areeba", branchKey: "branch1", destinationCity: "Islamabad", pickupAt: "2026-09-02T10:00:00.000Z", returnAt: "2026-09-06T10:00:00.000Z", checkedOutAt: "2026-09-02T10:10:00.000Z", completedAt: "2026-09-06T10:25:00.000Z", status: "completed", dailyRate: 11000, totalAmount: 44000, depositRequired: 25000, source: "phone", checkoutOdo: 19600, checkinOdo: 20120, paymentMethod: "Cash" },
    { id: "sep2", vehicleKey: "sportage", customerKey: "bilal", branchKey: "branch2", destinationCity: "Sialkot", pickupAt: "2026-09-08T09:00:00.000Z", returnAt: "2026-09-12T18:00:00.000Z", checkedOutAt: "2026-09-08T09:20:00.000Z", completedAt: "2026-09-12T18:10:00.000Z", status: "completed", dailyRate: 18000, totalAmount: 72000, depositRequired: 40000, source: "whatsapp", checkoutOdo: 25200, checkinOdo: 25880, paymentMethod: "Raast" },
    { id: "sep3", vehicleKey: "alto", customerKey: "zain", branchKey: "branch1", destinationCity: "Rawalpindi", pickupAt: "2026-09-14T11:00:00.000Z", returnAt: "2026-09-18T11:00:00.000Z", checkedOutAt: "2026-09-14T11:15:00.000Z", completedAt: "2026-09-18T11:30:00.000Z", status: "completed", dailyRate: 7100, totalAmount: 28400, depositRequired: 20000, source: "counter", checkoutOdo: 9100, checkinOdo: 9460, paymentMethod: "Cash" },
    { id: "sep4", vehicleKey: "yaris", customerKey: "usman", branchKey: "branch2", destinationCity: "Gujranwala", pickupAt: "2026-09-19T08:00:00.000Z", returnAt: "2026-09-23T18:00:00.000Z", checkedOutAt: "2026-09-19T08:15:00.000Z", completedAt: "2026-09-23T18:15:00.000Z", status: "completed", dailyRate: 9250, totalAmount: 37000, depositRequired: 25000, source: "phone", checkoutOdo: 21100, checkinOdo: 21620, paymentMethod: "Bank Transfer" },
    // Cancelled
    { id: "sep_can", vehicleKey: "civic", customerKey: "hamza", branchKey: "branch2", destinationCity: "Lahore", pickupAt: "2026-09-11T09:00:00.000Z", returnAt: "2026-09-14T09:00:00.000Z", status: "cancelled", dailyRate: 16000, totalAmount: 48000, depositRequired: 30000, source: "phone", cancellationReason: "Customer trip postponed due to flight reschedule." },
    // Currently checked out (returns Sep 29)
    { id: "act1", vehicleKey: "corolla", customerKey: "hamza", branchKey: "branch1", destinationCity: "Islamabad", pickupAt: "2026-09-25T10:00:00.000Z", returnAt: "2026-09-29T18:00:00.000Z", checkedOutAt: "2026-09-25T10:15:00.000Z", status: "checked_out", dailyRate: 9500, totalAmount: 38000, depositRequired: 25000, source: "counter", checkoutOdo: 33500, paymentMethod: "Cash" },
    // Today's return (Sep 27 at 17:00 PKT = 12:00 UTC)
    { id: "today_ret", vehicleKey: "city", customerKey: "areeba", branchKey: "branch1", destinationCity: "Local", pickupAt: "2026-09-24T10:00:00.000Z", returnAt: "2026-09-27T12:00:00.000Z", checkedOutAt: "2026-09-24T10:05:00.000Z", status: "checked_out", dailyRate: 11000, totalAmount: 33000, depositRequired: 25000, source: "counter", checkoutOdo: 20400, paymentMethod: "Card" },
    // Today's pickup (Sep 27 at 15:00 PKT = 10:00 UTC)
    { id: "today_pk", vehicleKey: "sportage", customerKey: "bilal", branchKey: "branch2", destinationCity: "Islamabad", pickupAt: "2026-09-27T10:00:00.000Z", returnAt: "2026-09-30T10:00:00.000Z", status: "confirmed", dailyRate: 18000, totalAmount: 54000, depositRequired: 35000, source: "whatsapp" },
  ];

  for (const b of vrBookings) seedBooking(vr, b);

  // agy-viberent expenses
  seedExpenses(vr, [
    { id: "jul_1", vehicleKey: "corolla", amount: 8500, category: "Maintenance", description: "Periodic engine oil and filter service (Toyota Genuine 5W-30)", status: "approved", occurredOn: "2026-07-14" },
    { id: "jul_2", vehicleKey: "sportage", amount: 4500, category: "Cleaning", description: "Interior deep clean and shampoo post Murree family trip", status: "approved", occurredOn: "2026-07-28" },
    { id: "aug_1", vehicleKey: "city", amount: 14000, category: "Maintenance", description: "Front brake pads replacement (Nissin OEM)", status: "approved", occurredOn: "2026-08-08" },
    { id: "aug_2", amount: 6000, category: "Toll / Challan", description: "Fleet M-Tag motorway balance recharge (M-1 & M-2)", status: "approved", occurredOn: "2026-08-15" },
    { id: "aug_3", vehicleKey: "alto", amount: 3200, category: "Fuel", description: "Emergency fuel top-up before client delivery", status: "approved", occurredOn: "2026-08-20" },
    { id: "aug_4", vehicleKey: "civic", amount: 9500, category: "Maintenance", description: "AC cooling coil inspection, cabin air filter and gas top-up", status: "approved", occurredOn: "2026-08-28" },
    { id: "sep_1", vehicleKey: "tucson", amount: 16500, category: "Maintenance", description: "Transmission fluid flush & 40,000 km scheduled service", status: "approved", occurredOn: "2026-09-08" },
    { id: "sep_2", vehicleKey: "yaris", amount: 3800, category: "Cleaning", description: "Ceramic spray coating and exterior body detailing", status: "approved", occurredOn: "2026-09-17" },
    { id: "sep_3", vehicleKey: "corolla", amount: 42000, category: "Maintenance", description: "Two new Yokohama BlueEarth-Es 195/65 R15 tires", status: "approved", occurredOn: "2026-09-22" },
    { id: "sep_4", amount: 5000, category: "Toll / Challan", description: "M-Tag card recharge for northern route bookings", status: "approved", occurredOn: "2026-09-24" },
  ]);

  // agy-viberent owner payouts
  seedPayouts(vr, [
    { ownerKey: "farhan", periodFrom: "2026-07-01", periodTo: "2026-07-31", amount: 57600, method: "Bank Transfer", reference: "TRF-JUL26-F", paidAt: "2026-08-05T11:00:00.000Z" },
    { ownerKey: "hassan", periodFrom: "2026-08-01", periodTo: "2026-08-31", amount: 34688, method: "Bank Transfer", reference: "TRF-AUG26-H", paidAt: "2026-09-05T11:00:00.000Z" },
    { ownerKey: "sana", periodFrom: "2026-08-01", periodTo: "2026-08-31", amount: 51200, method: "Bank Transfer", reference: "TRF-AUG26-S", paidAt: "2026-09-05T12:00:00.000Z" },
  ]);

  // Today's revenue transaction for agy-viberent (so Today's Revenue metric is non-zero)
  const vrTodayBkgId = `bkg_agy-viberent_today_pk`.slice(0, 64);
  const vrTodayCust = vr.customerMap["bilal"];
  if (vrTodayCust) {
    db.insert(financialTransactions).values({
      id: `ft_today_vr`, agencyId: "agy-viberent",
      bookingId: vrTodayBkgId, customerId: vrTodayCust,
      kind: "payment", amount: 18000,
      method: "Cash", reference: "PAY-TODAY-VR",
      idempotencyKey: "idemp_today_vr",
      status: "posted", actorId: vr.actorId,
      postedAt: "2026-09-27T08:30:00.000Z",
      createdAt: "2026-09-27T08:30:00.000Z",
      updatedAt: "2026-09-27T08:30:00.000Z",
    }).onConflictDoNothing().run();
  }

  // ===========================================================================
  // AGENCY 2: dB5kgurYswaszKxcLJ98V9CXS4IYuZQ0  (Ali Rent a car)
  // ===========================================================================
  const ali = buildAgencyContext("dB5kgurYswaszKxcLJ98V9CXS4IYuZQ0", "Ali Rent a car");

  seedOwners(ali, [
    { key: "farhan", name: "Farhan Qureshi", phone: "+92 300 882 1940", email: "farhan.q@motors.pk" },
    { key: "hassan", name: "Hassan Motors", phone: "+92 321 770 5512", email: "info@hassanmotors.pk" },
    { key: "sana", name: "Sana Malik", phone: "+92 333 620 1178", email: "sana.malik@outlook.com" },
  ]);

  seedAgreements(ali, [
    { key: "farhan", ownerKey: "farhan", sharePercent: 80 },
    { key: "hassan", ownerKey: "hassan", sharePercent: 75 },
    { key: "sana", ownerKey: "sana", sharePercent: 80 },
  ]);

  seedCustomers(ali, [
    { key: "hamza", name: "Hamza Siddiqui", phone: "923215902741", cnic: "6110112345678", email: "hamza.siddiqui@gmail.com", license: "ICT-88420", licenseExpiry: "2028-03-14", status: "preferred" },
    { key: "areeba", name: "Areeba Khan", phone: "923008421190", cnic: "3520212345674", email: "areeba.khan@outlook.com", license: "LHR-77102", licenseExpiry: "2028-07-09" },
    { key: "maham", name: "Maham Ali", phone: "923337714028", cnic: "3740512345672", email: "maham.ali@yahoo.com", license: "RWP-33419", licenseExpiry: "2027-11-20", status: "preferred" },
    { key: "zain", name: "Zain Ahmed", phone: "923051186302", cnic: "4210112345676", email: "zain.ahmed@hotmail.com", license: "KHI-99214", licenseExpiry: "2028-01-18" },
    { key: "bilal", name: "Bilal Tariq", phone: "923455123890", cnic: "3720112345671", email: "bilal.tariq@gmail.com", license: "ISB-55201", licenseExpiry: "2029-05-10" },
    { key: "usman", name: "Usman Ghani", phone: "923014499210", cnic: "3520112345679", email: "usman.ghani@live.com", license: "LHR-44102", licenseExpiry: "2027-09-02" },
    { key: "anwaar", name: "Anwaar Hussain", phone: "923402040648", cnic: "3720312211212", status: "active" },
  ]);

  seedVehicles(ali, [
    { key: "city_og", plate: "BLE-213", make: "Honda", model: "City 1.3 MT", year: 2014, category: "sedan", color: "Red Wine", transmission: "manual", fuel: "petrol", dailyRate: 4000, status: "available", ownership: "owned", branchKey: "branch1" },
    { key: "mehran", plate: "TLG-101", make: "Suzuki", model: "Mehran VX", year: 2019, category: "economy", color: "White", transmission: "manual", fuel: "petrol", dailyRate: 3500, status: "available", ownership: "owned", branchKey: "branch1" },
    { key: "cultus", plate: "TLG-205", make: "Suzuki", model: "Cultus VXL", year: 2021, category: "economy", color: "Pearl Blue", transmission: "automatic", fuel: "petrol", dailyRate: 5500, status: "available", ownership: "owned", branchKey: "branch1" },
    { key: "corolla", plate: "TLG-312", make: "Toyota", model: "Corolla GLi", year: 2020, category: "sedan", color: "Silver", transmission: "automatic", fuel: "petrol", dailyRate: 7500, status: "available", ownership: "managed", ownerKey: "farhan", branchKey: "branch1" },
    { key: "hilux", plate: "TLG-444", make: "Toyota", model: "Hilux Revo", year: 2021, category: "suv", color: "Black", transmission: "automatic", fuel: "diesel", dailyRate: 18000, status: "available", ownership: "managed", ownerKey: "hassan", branchKey: "branch2" },
  ]);

  const aliBookings: BookingSeed[] = [
    // July 2026
    { id: "jul1", vehicleKey: "city_og", customerKey: "anwaar", branchKey: "branch1", destinationCity: "Islamabad", pickupAt: "2026-07-05T10:00:00.000Z", returnAt: "2026-07-08T10:00:00.000Z", checkedOutAt: "2026-07-05T10:10:00.000Z", completedAt: "2026-07-08T10:20:00.000Z", status: "completed", dailyRate: 4000, totalAmount: 12000, depositRequired: 10000, source: "counter", checkoutOdo: 52300, checkinOdo: 52580, paymentMethod: "Cash" },
    { id: "jul2", vehicleKey: "mehran", customerKey: "hamza", branchKey: "branch1", destinationCity: "Rawalpindi", pickupAt: "2026-07-12T09:00:00.000Z", returnAt: "2026-07-15T18:00:00.000Z", checkedOutAt: "2026-07-12T09:15:00.000Z", completedAt: "2026-07-15T18:10:00.000Z", status: "completed", dailyRate: 3500, totalAmount: 10500, depositRequired: 8000, source: "counter", checkoutOdo: 28000, checkinOdo: 28260, paymentMethod: "Cash" },
    { id: "jul3", vehicleKey: "corolla", customerKey: "areeba", branchKey: "branch1", destinationCity: "Lahore", pickupAt: "2026-07-19T08:00:00.000Z", returnAt: "2026-07-23T18:00:00.000Z", checkedOutAt: "2026-07-19T08:20:00.000Z", completedAt: "2026-07-23T18:30:00.000Z", status: "completed", dailyRate: 7500, totalAmount: 30000, depositRequired: 20000, source: "phone", checkoutOdo: 41200, checkinOdo: 41870, paymentMethod: "Bank Transfer" },
    // August 2026
    { id: "aug1", vehicleKey: "cultus", customerKey: "bilal", branchKey: "branch1", destinationCity: "Rawalpindi", pickupAt: "2026-08-04T11:00:00.000Z", returnAt: "2026-08-08T11:00:00.000Z", checkedOutAt: "2026-08-04T11:15:00.000Z", completedAt: "2026-08-08T11:25:00.000Z", status: "completed", dailyRate: 5500, totalAmount: 22000, depositRequired: 12000, source: "counter", checkoutOdo: 15400, checkinOdo: 15820, paymentMethod: "Cash" },
    { id: "aug2", vehicleKey: "city_og", customerKey: "maham", branchKey: "branch1", destinationCity: "Local", pickupAt: "2026-08-15T10:00:00.000Z", returnAt: "2026-08-18T10:00:00.000Z", checkedOutAt: "2026-08-15T10:05:00.000Z", completedAt: "2026-08-18T10:20:00.000Z", status: "completed", dailyRate: 4000, totalAmount: 12000, depositRequired: 10000, source: "counter", checkoutOdo: 53200, checkinOdo: 53450, paymentMethod: "Cash" },
    { id: "aug3", vehicleKey: "hilux", customerKey: "usman", branchKey: "branch2", destinationCity: "Attock", pickupAt: "2026-08-20T08:00:00.000Z", returnAt: "2026-08-25T18:00:00.000Z", checkedOutAt: "2026-08-20T08:15:00.000Z", completedAt: "2026-08-25T18:30:00.000Z", status: "completed", dailyRate: 18000, totalAmount: 90000, depositRequired: 40000, source: "phone", checkoutOdo: 62100, checkinOdo: 62890, paymentMethod: "Bank Transfer" },
    // September 2026 (past)
    { id: "sep1", vehicleKey: "corolla", customerKey: "zain", branchKey: "branch1", destinationCity: "Islamabad", pickupAt: "2026-09-03T09:00:00.000Z", returnAt: "2026-09-07T18:00:00.000Z", checkedOutAt: "2026-09-03T09:10:00.000Z", completedAt: "2026-09-07T18:15:00.000Z", status: "completed", dailyRate: 7500, totalAmount: 30000, depositRequired: 20000, source: "counter", checkoutOdo: 42800, checkinOdo: 43350, paymentMethod: "Cash" },
    { id: "sep2", vehicleKey: "cultus", customerKey: "areeba", branchKey: "branch1", destinationCity: "Local", pickupAt: "2026-09-10T10:00:00.000Z", returnAt: "2026-09-14T10:00:00.000Z", checkedOutAt: "2026-09-10T10:10:00.000Z", completedAt: "2026-09-14T10:20:00.000Z", status: "completed", dailyRate: 5500, totalAmount: 22000, depositRequired: 12000, source: "counter", checkoutOdo: 16200, checkinOdo: 16510, paymentMethod: "Cash" },
    { id: "sep3", vehicleKey: "mehran", customerKey: "anwaar", branchKey: "branch1", destinationCity: "Rawalpindi", pickupAt: "2026-09-16T11:00:00.000Z", returnAt: "2026-09-20T11:00:00.000Z", checkedOutAt: "2026-09-16T11:15:00.000Z", completedAt: "2026-09-20T11:30:00.000Z", status: "completed", dailyRate: 3500, totalAmount: 14000, depositRequired: 8000, source: "counter", checkoutOdo: 29500, checkinOdo: 29800, paymentMethod: "Cash" },
    // Existing Bookings (Ali's existing bookings – keeping them via onConflictDoNothing)
    // Today confirmed pickup
    { id: "today_pk", vehicleKey: "hilux", customerKey: "bilal", branchKey: "branch2", destinationCity: "Attock", pickupAt: "2026-09-27T10:00:00.000Z", returnAt: "2026-09-30T18:00:00.000Z", status: "confirmed", dailyRate: 18000, totalAmount: 54000, depositRequired: 35000, source: "phone" },
    // Currently checked out
    { id: "act1", vehicleKey: "corolla", customerKey: "hamza", branchKey: "branch1", destinationCity: "Islamabad", pickupAt: "2026-09-25T09:00:00.000Z", returnAt: "2026-09-29T09:00:00.000Z", checkedOutAt: "2026-09-25T09:15:00.000Z", status: "checked_out", dailyRate: 7500, totalAmount: 30000, depositRequired: 20000, source: "counter", checkoutOdo: 43800, paymentMethod: "Cash" },
  ];

  for (const b of aliBookings) seedBooking(ali, b);

  seedExpenses(ali, [
    { id: "jul_1", vehicleKey: "city_og", amount: 4500, category: "Maintenance", description: "Engine oil + air filter change (Mobil 1 10W-30)", status: "approved", occurredOn: "2026-07-10" },
    { id: "jul_2", vehicleKey: "mehran", amount: 2000, category: "Maintenance", description: "Carburettor cleaning and tuning", status: "approved", occurredOn: "2026-07-18" },
    { id: "aug_1", vehicleKey: "corolla", amount: 5500, category: "Maintenance", description: "Timing belt & water pump service", status: "approved", occurredOn: "2026-08-08" },
    { id: "aug_2", vehicleKey: "hilux", amount: 8000, category: "Maintenance", description: "Diesel engine service and turbo check (50,000 km)", status: "approved", occurredOn: "2026-08-22" },
    { id: "aug_3", amount: 2500, category: "Cleaning", description: "Fleet car wash and interior cleaning", status: "approved", occurredOn: "2026-08-31" },
    { id: "sep_1", vehicleKey: "cultus", amount: 3200, category: "Maintenance", description: "Brake disc and pad replacement (front axle)", status: "approved", occurredOn: "2026-09-09" },
    { id: "sep_2", vehicleKey: "city_og", amount: 1800, category: "Fuel", description: "Petrol fill for delivery to Rawalpindi customer", status: "approved", occurredOn: "2026-09-19" },
    { id: "sep_3", amount: 3000, category: "Toll / Challan", description: "M-Tag motorway balance top-up", status: "approved", occurredOn: "2026-09-24" },
  ]);

  seedPayouts(ali, [
    { ownerKey: "farhan", periodFrom: "2026-07-01", periodTo: "2026-07-31", amount: 24000, method: "Cash", reference: "CASH-JUL26-F", paidAt: "2026-08-06T11:00:00.000Z" },
    { ownerKey: "hassan", periodFrom: "2026-08-01", periodTo: "2026-08-31", amount: 67500, method: "Bank Transfer", reference: "TRF-AUG26-H", paidAt: "2026-09-06T11:00:00.000Z" },
  ]);

  // Today's revenue transaction for ali (so Today's Revenue metric is non-zero for this agency)
  const aliTodayBkgId = `bkg_dB5kgurYswaszKxcLJ98V9CXS4IYuZQ0_today_pk`.slice(0, 64);
  const aliTodayCust = ali.customerMap["bilal"];
  if (aliTodayCust) {
    db.insert(financialTransactions).values({
      id: "ft_today_ali", agencyId: aliId,
      bookingId: aliTodayBkgId, customerId: aliTodayCust,
      kind: "payment", amount: 18000,
      method: "Cash", reference: "PAY-TODAY-ALI",
      idempotencyKey: "idemp_today_ali",
      status: "posted", actorId: ali.actorId,
      postedAt: "2026-09-27T08:00:00.000Z",
      createdAt: "2026-09-27T08:00:00.000Z",
      updatedAt: "2026-09-27T08:00:00.000Z",
    }).onConflictDoNothing().run();
  }

  // ===========================================================================
  // Summary
  // ===========================================================================
  const totals = {
    bookings: (sqlite.prepare("SELECT count(*) AS n FROM bookings").get() as { n: number }).n,
    customers: (sqlite.prepare("SELECT count(*) AS n FROM customers").get() as { n: number }).n,
    vehicles: (sqlite.prepare("SELECT count(*) AS n FROM vehicles").get() as { n: number }).n,
    expenses: (sqlite.prepare("SELECT count(*) AS n FROM expenses").get() as { n: number }).n,
    transactions: (sqlite.prepare("SELECT count(*) AS n FROM financial_transactions").get() as { n: number }).n,
    payouts: (sqlite.prepare("SELECT count(*) AS n FROM owner_payouts").get() as { n: number }).n,
  };
  console.log("\n✅ Historical seed complete:", totals);
  console.log("   abc@c.com created and all 3 users (abc@c.com, abc@a.com, abc@abc.com) granted access to both agencies.");
  sqlite.close();
}

main().catch(err => { console.error("Seed error:", err); process.exit(1); });
