import { randomUUID } from "node:crypto";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { hashPassword } from "better-auth/crypto";
import { db, sqlite } from "@/db/connection";
import { account, agencies, branches, customers, member, memberBranchAccess, organization, owners, user, users, vehicles } from "@/db/schema";

async function main() {
migrate(db, { migrationsFolder: "drizzle" });
const now = new Date().toISOString();

db.insert(agencies).values({ id: "agy-viberent", name: "VibeRent Mobility", currency: "PKR", timezone: "Asia/Karachi", createdAt: now, updatedAt: now }).onConflictDoNothing().run();
db.insert(branches).values([
  { id: "br-lahore", agencyId: "agy-viberent", name: "Lahore Gulberg", city: "Lahore", address: "Main Boulevard, Gulberg III", createdAt: now, updatedAt: now },
  { id: "br-islamabad", agencyId: "agy-viberent", name: "Islamabad Blue Area", city: "Islamabad", address: "Jinnah Avenue, Blue Area", createdAt: now, updatedAt: now },
  { id: "br-rawalpindi", agencyId: "agy-viberent", name: "Rawalpindi Saddar", city: "Rawalpindi", address: "Mall Road, Saddar", createdAt: now, updatedAt: now },
  { id: "br-karachi", agencyId: "agy-viberent", name: "Karachi Clifton", city: "Karachi", address: "Block 5, Clifton", createdAt: now, updatedAt: now },
]).onConflictDoNothing().run();
db.insert(users).values({ id: "usr-demo-owner", agencyId: "agy-viberent", branchId: "br-lahore", email: "owner@viberent.local", name: "Ali Raza", role: "agency_owner", createdAt: now, updatedAt: now }).onConflictDoNothing().run();

const seedEmail = process.env.SEED_AUTH_EMAIL?.trim().toLowerCase();
const seedPassword = process.env.SEED_AUTH_PASSWORD;
if ((seedEmail && !seedPassword) || (!seedEmail && seedPassword)) throw new Error("Set both SEED_AUTH_EMAIL and SEED_AUTH_PASSWORD, or neither.");
if (seedEmail && seedPassword) {
  if (seedPassword.length < 10) throw new Error("SEED_AUTH_PASSWORD must contain at least 10 characters.");
  const existingAuth = sqlite.prepare("SELECT id FROM user WHERE lower(email)=lower(?)").get(seedEmail) as { id: string } | undefined;
  const authUserId = existingAuth?.id ?? `auth_${randomUUID()}`;
  const membershipId = `mem_${randomUUID()}`;
  const nowDate = new Date();
  if (!existingAuth) {
    db.insert(user).values({ id: authUserId, name: "Demo Agency Owner", email: seedEmail, emailVerified: true, createdAt: nowDate, updatedAt: nowDate }).run();
    db.insert(account).values({ id: `acc_${randomUUID()}`, accountId: authUserId, providerId: "credential", userId: authUserId, password: await hashPassword(seedPassword), createdAt: nowDate, updatedAt: nowDate }).run();
  }
  db.insert(organization).values({ id: "agy-viberent", name: "VibeRent Mobility", slug: "viberent-mobility", createdAt: nowDate }).onConflictDoNothing().run();
  const existingMember = sqlite.prepare("SELECT id FROM member WHERE organization_id=? AND user_id=?").get("agy-viberent", authUserId) as { id: string } | undefined;
  const resolvedMembershipId = existingMember?.id ?? membershipId;
  if (!existingMember) db.insert(member).values({ id: resolvedMembershipId, organizationId: "agy-viberent", userId: authUserId, role: "agency_owner", createdAt: nowDate }).run();
  sqlite.prepare("UPDATE users SET auth_user_id=?,membership_id=?,email=?,name='Demo Agency Owner',active=1,updated_at=? WHERE id='usr-demo-owner'").run(authUserId, resolvedMembershipId, seedEmail, now);
  db.insert(memberBranchAccess).values({ membershipId: resolvedMembershipId, branchId: "br-lahore" }).onConflictDoNothing().run();
}
db.insert(owners).values([
  { id: "OWN-1", agencyId: "agy-viberent", name: "Farhan Qureshi", phone: "+92 300 882 1940", createdAt: now, updatedAt: now },
  { id: "OWN-2", agencyId: "agy-viberent", name: "Hassan Motors", phone: "+92 321 770 5512", createdAt: now, updatedAt: now },
  { id: "OWN-3", agencyId: "agy-viberent", name: "Sana Malik", phone: "+92 333 620 1178", createdAt: now, updatedAt: now },
  { id: "OWN-4", agencyId: "agy-viberent", name: "Usman Raza", phone: "+92 305 441 8300", createdAt: now, updatedAt: now },
]).onConflictDoNothing().run();
db.insert(customers).values([
  { id: "cus-hamza", agencyId: "agy-viberent", name: "Hamza Siddiqui", phoneNormalized: "923215902741", cnicNormalized: "6110112345678", email: "hamza@example.pk", licenseNumber: "ICT-88420", licenseExpiresAt: "2028-03-14", createdAt: now, updatedAt: now },
  { id: "cus-areeba", agencyId: "agy-viberent", name: "Areeba Khan", phoneNormalized: "923008421190", cnicNormalized: "3520212345674", email: "areeba@example.pk", licenseNumber: "LHR-77102", licenseExpiresAt: "2028-07-09", createdAt: now, updatedAt: now },
  { id: "CUS-176", agencyId: "agy-viberent", name: "Maham Ali", phoneNormalized: "923337714028", cnicNormalized: "3740512345672", email: "maham@example.pk", status: "preferred", createdAt: now, updatedAt: now },
  { id: "CUS-143", agencyId: "agy-viberent", name: "Zain Ahmed", phoneNormalized: "923051186302", cnicNormalized: "4210112345676", email: "zain@example.pk", status: "review", createdAt: now, updatedAt: now },
]).onConflictDoNothing().run();

db.insert(vehicles).values([
  { id: "veh-corolla", agencyId: "agy-viberent", branchId: "br-islamabad", plate: "ICT-704", make: "Toyota", model: "Corolla", year: 2022, category: "sedan", color: "Super White", transmission: "automatic", fuel: "petrol", status: "available", ownership: "owned", dailyRate: 9500, createdAt: now, updatedAt: now },
  { id: "veh-city", agencyId: "agy-viberent", branchId: "br-lahore", plate: "LEB-218", make: "Honda", model: "City", year: 2023, category: "sedan", color: "Lunar Silver", transmission: "automatic", fuel: "petrol", status: "available", ownership: "owned", dailyRate: 11000, createdAt: now, updatedAt: now },
  { id: "veh-sportage", agencyId: "agy-viberent", branchId: "br-lahore", plate: "LHR-529", make: "KIA", model: "Sportage", year: 2022, category: "suv", color: "Black", transmission: "automatic", fuel: "petrol", status: "available", ownership: "owned", dailyRate: 18000, createdAt: now, updatedAt: now },
  { id: "veh-alto", agencyId: "agy-viberent", branchId: "br-rawalpindi", plate: "RIK-113", make: "Suzuki", model: "Alto", year: 2024, category: "economy", color: "White", transmission: "automatic", fuel: "petrol", status: "available", ownership: "owned", dailyRate: 7100, createdAt: now, updatedAt: now },
  { id: "veh-yaris", agencyId: "agy-viberent", branchId: "br-karachi", plate: "BKC-882", make: "Toyota", model: "Yaris", year: 2023, category: "sedan", color: "Graphite Grey", transmission: "automatic", fuel: "petrol", status: "available", ownership: "owned", dailyRate: 9250, createdAt: now, updatedAt: now },
]).onConflictDoNothing().run();

console.log(JSON.stringify({ ok: true, database: sqlite.name, seedRun: randomUUID() }, null, 2));
sqlite.close();
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
