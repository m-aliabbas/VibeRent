import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
};

// Better Auth owns global identities and sessions. VibeRent's existing
// `users` table below remains the agency-scoped staff/actor record.
export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).default(false).notNull(),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`).$onUpdate(() => new Date()).notNull(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).$onUpdate(() => new Date()).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  activeOrganizationId: text("active_organization_id"),
}, table => [index("session_userId_idx").on(table.userId)]);

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"), refreshToken: text("refresh_token"), idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
  scope: text("scope"), password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).$onUpdate(() => new Date()).notNull(),
}, table => [index("account_userId_idx").on(table.userId)]);

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(), identifier: text("identifier").notNull(), value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`).$onUpdate(() => new Date()).notNull(),
}, table => [index("verification_identifier_idx").on(table.identifier)]);

export const organization = sqliteTable("organization", {
  id: text("id").primaryKey(), name: text("name").notNull(), slug: text("slug").notNull().unique(),
  logo: text("logo"), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(), metadata: text("metadata"),
});

export const member = sqliteTable("member", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  role: text("role").default("rental_agent").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, table => [index("member_organizationId_idx").on(table.organizationId), index("member_userId_idx").on(table.userId), uniqueIndex("member_org_user_uq").on(table.organizationId, table.userId)]);

export const invitation = sqliteTable("invitation", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  email: text("email").notNull(), role: text("role"), status: text("status").default("pending").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`).notNull(),
  inviterId: text("inviter_id").notNull().references(() => user.id, { onDelete: "cascade" }),
}, table => [index("invitation_organizationId_idx").on(table.organizationId), index("invitation_email_idx").on(table.email)]);

export const agencies = sqliteTable("agencies", {
  id: text("id").primaryKey(), name: text("name").notNull(), currency: text("currency").notNull().default("PKR"), timezone: text("timezone").notNull().default("Asia/Karachi"), phone:text("phone"), address:text("address"), version:integer("version").notNull().default(1), ...timestamps,
});
export const branches = sqliteTable("branches", {
  id: text("id").primaryKey(), agencyId: text("agency_id").notNull().references(() => agencies.id), name: text("name").notNull(), city: text("city").notNull(), address: text("address").notNull(), active: integer("active", { mode:"boolean" }).notNull().default(true), version:integer("version").notNull().default(1), ...timestamps,
}, t => [index("branches_agency_idx").on(t.agencyId)]);
export const invitationBranchAccess = sqliteTable("invitation_branch_access", {
  invitationId: text("invitation_id").notNull().references(() => invitation.id, { onDelete: "cascade" }),
  branchId: text("branch_id").notNull().references(() => branches.id, { onDelete: "cascade" }),
}, table => [uniqueIndex("invitation_branch_access_uq").on(table.invitationId, table.branchId)]);
export const users = sqliteTable("users", {
  id:text("id").primaryKey(), authUserId:text("auth_user_id").references(()=>user.id,{onDelete:"cascade"}), membershipId:text("membership_id").references(()=>member.id,{onDelete:"cascade"}), agencyId:text("agency_id").notNull().references(()=>agencies.id), branchId:text("branch_id").references(()=>branches.id), email:text("email").notNull(), name:text("name").notNull(), role:text("role",{enum:["agency_owner","fleet_manager","rental_agent","accountant"]}).notNull(), active:integer("active",{mode:"boolean"}).notNull().default(true), version:integer("version").notNull().default(1), ...timestamps,
}, t => [uniqueIndex("users_agency_email_uq").on(t.agencyId,t.email), uniqueIndex("users_agency_auth_user_uq").on(t.agencyId,t.authUserId), uniqueIndex("users_membership_uq").on(t.membershipId)]);

export const memberBranchAccess = sqliteTable("member_branch_access", {
  membershipId: text("membership_id").notNull().references(() => member.id, { onDelete: "cascade" }),
  branchId: text("branch_id").notNull().references(() => branches.id, { onDelete: "cascade" }),
}, table => [uniqueIndex("member_branch_access_uq").on(table.membershipId, table.branchId), index("member_branch_access_branch_idx").on(table.branchId)]);
export const owners = sqliteTable("owners", {
  id:text("id").primaryKey(), agencyId:text("agency_id").notNull().references(()=>agencies.id), name:text("name").notNull(), phone:text("phone").notNull(), email:text("email"), status:text("status").notNull().default("active"), version:integer("version").notNull().default(1), ...timestamps,
}, t => [index("owners_agency_idx").on(t.agencyId)]);
export const managementAgreements = sqliteTable("management_agreements", {
  id:text("id").primaryKey(), agencyId:text("agency_id").notNull().references(()=>agencies.id), ownerId:text("owner_id").notNull().references(()=>owners.id), version:integer("version").notNull(), effectiveFrom:text("effective_from").notNull(), effectiveTo:text("effective_to"), shareBasis:text("share_basis").notNull(), ownerSharePercent:real("owner_share_percent"), ownerShareAmount:integer("owner_share_amount"), expenseResponsibility:text("expense_responsibility").notNull().default("shared"), payoutFrequency:text("payout_frequency").notNull(), ...timestamps,
}, t => [uniqueIndex("agreements_owner_version_uq").on(t.ownerId,t.version), index("agreements_effective_idx").on(t.ownerId,t.effectiveFrom,t.effectiveTo)]);
export const vehicles = sqliteTable("vehicles", {
  id:text("id").primaryKey(), agencyId:text("agency_id").notNull().references(()=>agencies.id), branchId:text("branch_id").notNull().references(()=>branches.id), ownerId:text("owner_id").references(()=>owners.id), agreementId:text("agreement_id").references(()=>managementAgreements.id), plate:text("plate").notNull(), make:text("make").notNull(), model:text("model").notNull(), year:integer("year").notNull(), category:text("category").notNull().default("sedan"), color:text("color").notNull().default("Not specified"), transmission:text("transmission").notNull().default("automatic"), fuel:text("fuel").notNull().default("petrol"), status:text("status").notNull().default("available"), ownership:text("ownership").notNull().default("owned"), dailyRate:integer("daily_rate").notNull(), version:integer("version").notNull().default(1), archivedAt:text("archived_at"), ...timestamps,
}, t => [uniqueIndex("vehicles_agency_plate_uq").on(t.agencyId,t.plate), index("vehicles_branch_status_idx").on(t.agencyId,t.branchId,t.status)]);
export const customers = sqliteTable("customers", {
  id:text("id").primaryKey(), agencyId:text("agency_id").notNull().references(()=>agencies.id), name:text("name").notNull(), phoneNormalized:text("phone_normalized").notNull(), cnicNormalized:text("cnic_normalized").notNull(), email:text("email"), licenseNumber:text("license_number"), licenseExpiresAt:text("license_expires_at"), status:text("status").notNull().default("active"), version:integer("version").notNull().default(1), archivedAt:text("archived_at"), ...timestamps,
}, t => [uniqueIndex("customers_agency_cnic_uq").on(t.agencyId,t.cnicNormalized), index("customers_phone_idx").on(t.agencyId,t.phoneNormalized)]);
export const bookings = sqliteTable("bookings", {
  id:text("id").primaryKey(), agencyId:text("agency_id").notNull().references(()=>agencies.id), branchId:text("branch_id").notNull().references(()=>branches.id), vehicleId:text("vehicle_id").notNull().references(()=>vehicles.id), customerId:text("customer_id").notNull().references(()=>customers.id), pickupAt:text("pickup_at").notNull(), returnAt:text("return_at").notNull(), status:text("status",{enum:["draft","confirmed","checked_out","completed","cancelled","no_show"]}).notNull(), dailyRate:integer("daily_rate").notNull(), extras:integer("extras").notNull().default(0), discount:integer("discount").notNull().default(0), totalAmount:integer("total_amount").notNull(), depositRequired:integer("deposit_required").notNull().default(0), source:text("source").notNull().default("counter"), notes:text("notes"), cancellationReason:text("cancellation_reason"), checkedOutAt:text("checked_out_at"), completedAt:text("completed_at"), version:integer("version").notNull().default(1), ...timestamps,
}, t => [index("bookings_vehicle_interval_idx").on(t.agencyId,t.vehicleId,t.pickupAt,t.returnAt), index("bookings_customer_idx").on(t.agencyId,t.customerId)]);
export const availabilityBlocks = sqliteTable("availability_blocks", {
  id:text("id").primaryKey(), agencyId:text("agency_id").notNull().references(()=>agencies.id), vehicleId:text("vehicle_id").notNull().references(()=>vehicles.id), startAt:text("start_at").notNull(), endAt:text("end_at").notNull(), kind:text("kind").notNull(), reason:text("reason").notNull(), version:integer("version").notNull().default(1), archivedAt:text("archived_at"), ...timestamps,
}, t => [index("blocks_vehicle_interval_idx").on(t.agencyId,t.vehicleId,t.startAt,t.endAt)]);
export const financialTransactions = sqliteTable("financial_transactions", {
  id:text("id").primaryKey(), agencyId:text("agency_id").notNull().references(()=>agencies.id), bookingId:text("booking_id").references(()=>bookings.id), customerId:text("customer_id").references(()=>customers.id), kind:text("kind").notNull(), amount:integer("amount").notNull(), method:text("method").notNull(), reference:text("reference").notNull(), idempotencyKey:text("idempotency_key").notNull(), linkedTransactionId:text("linked_transaction_id"), status:text("status").notNull().default("posted"), actorId:text("actor_id").references(()=>users.id), postedAt:text("posted_at").notNull(), ...timestamps,
}, t => [index("transactions_booking_idx").on(t.agencyId,t.bookingId), uniqueIndex("transactions_agency_idempotency_uq").on(t.agencyId,t.idempotencyKey)]);
export const expenses = sqliteTable("expenses", {
  id:text("id").primaryKey(), agencyId:text("agency_id").notNull().references(()=>agencies.id), vehicleId:text("vehicle_id").references(()=>vehicles.id), bookingId:text("booking_id").references(()=>bookings.id), ownerId:text("owner_id").references(()=>owners.id), amount:integer("amount").notNull(), category:text("category").notNull(), description:text("description").notNull(), status:text("status").notNull(), occurredOn:text("occurred_on").notNull(), version:integer("version").notNull().default(1), ...timestamps,
}, t => [index("expenses_agency_date_idx").on(t.agencyId,t.occurredOn)]);
export const privateFiles = sqliteTable("private_files", {
  id:text("id").primaryKey(), agencyId:text("agency_id").notNull().references(()=>agencies.id), entityType:text("entity_type").notNull(), entityId:text("entity_id").notNull(), storageKey:text("storage_key").notNull(), mimeType:text("mime_type").notNull(), size:integer("size").notNull(), classification:text("classification").notNull(), status:text("status").notNull().default("pending"), ...timestamps,
}, t => [uniqueIndex("private_files_storage_key_uq").on(t.storageKey), index("private_files_entity_idx").on(t.agencyId,t.entityType,t.entityId)]);
export const auditEvents = sqliteTable("audit_events", {
  id:text("id").primaryKey(), agencyId:text("agency_id").notNull().references(()=>agencies.id), actorId:text("actor_id").references(()=>users.id), action:text("action").notNull(), entityType:text("entity_type").notNull(), entityId:text("entity_id").notNull(), metadata:text("metadata",{mode:"json"}).$type<Record<string,unknown>>(), occurredAt:text("occurred_at").notNull(),
}, t => [index("audit_agency_time_idx").on(t.agencyId,t.occurredAt), index("audit_entity_idx").on(t.agencyId,t.entityType,t.entityId)]);

export const rentalInspections = sqliteTable("rental_inspections", {
  id:text("id").primaryKey(), agencyId:text("agency_id").notNull().references(()=>agencies.id), bookingId:text("booking_id").notNull().references(()=>bookings.id), kind:text("kind",{enum:["checkout","checkin"]}).notNull(), odometer:integer("odometer").notNull(), fuelLevel:text("fuel_level").notNull(), conditionNotes:text("condition_notes").notNull(), actorId:text("actor_id").notNull().references(()=>users.id), occurredAt:text("occurred_at").notNull(), ...timestamps,
}, t => [uniqueIndex("rental_inspections_booking_kind_uq").on(t.bookingId,t.kind), index("rental_inspections_agency_idx").on(t.agencyId,t.bookingId)]);

export const ownerPayouts = sqliteTable("owner_payouts", {
  id:text("id").primaryKey(), agencyId:text("agency_id").notNull().references(()=>agencies.id), ownerId:text("owner_id").notNull().references(()=>owners.id), periodFrom:text("period_from").notNull(), periodTo:text("period_to").notNull(), amount:integer("amount").notNull(), method:text("method").notNull(), reference:text("reference").notNull(), idempotencyKey:text("idempotency_key").notNull(), status:text("status").notNull().default("posted"), paidAt:text("paid_at").notNull(), actorId:text("actor_id").notNull().references(()=>users.id), ...timestamps,
}, t => [uniqueIndex("owner_payouts_agency_idempotency_uq").on(t.agencyId,t.idempotencyKey), index("owner_payouts_owner_idx").on(t.agencyId,t.ownerId,t.paidAt)]);
