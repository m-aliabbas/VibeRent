import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
};

export const agencies = sqliteTable("agencies", {
  id: text("id").primaryKey(), name: text("name").notNull(), currency: text("currency").notNull().default("PKR"), timezone: text("timezone").notNull().default("Asia/Karachi"), ...timestamps,
});
export const branches = sqliteTable("branches", {
  id: text("id").primaryKey(), agencyId: text("agency_id").notNull().references(() => agencies.id), name: text("name").notNull(), city: text("city").notNull(), address: text("address").notNull(), active: integer("active", { mode:"boolean" }).notNull().default(true), ...timestamps,
}, t => [index("branches_agency_idx").on(t.agencyId)]);
export const users = sqliteTable("users", {
  id:text("id").primaryKey(), agencyId:text("agency_id").notNull().references(()=>agencies.id), branchId:text("branch_id").references(()=>branches.id), email:text("email").notNull(), name:text("name").notNull(), role:text("role",{enum:["agency_owner","fleet_manager","rental_agent","accountant"]}).notNull(), active:integer("active",{mode:"boolean"}).notNull().default(true), ...timestamps,
}, t => [uniqueIndex("users_agency_email_uq").on(t.agencyId,t.email)]);
export const owners = sqliteTable("owners", {
  id:text("id").primaryKey(), agencyId:text("agency_id").notNull().references(()=>agencies.id), name:text("name").notNull(), phone:text("phone").notNull(), email:text("email"), status:text("status").notNull().default("active"), ...timestamps,
}, t => [index("owners_agency_idx").on(t.agencyId)]);
export const managementAgreements = sqliteTable("management_agreements", {
  id:text("id").primaryKey(), agencyId:text("agency_id").notNull().references(()=>agencies.id), ownerId:text("owner_id").notNull().references(()=>owners.id), version:integer("version").notNull(), effectiveFrom:text("effective_from").notNull(), effectiveTo:text("effective_to"), shareBasis:text("share_basis").notNull(), ownerSharePercent:real("owner_share_percent"), payoutFrequency:text("payout_frequency").notNull(), ...timestamps,
}, t => [uniqueIndex("agreements_owner_version_uq").on(t.ownerId,t.version), index("agreements_effective_idx").on(t.ownerId,t.effectiveFrom,t.effectiveTo)]);
export const vehicles = sqliteTable("vehicles", {
  id:text("id").primaryKey(), agencyId:text("agency_id").notNull().references(()=>agencies.id), branchId:text("branch_id").notNull().references(()=>branches.id), ownerId:text("owner_id").references(()=>owners.id), agreementId:text("agreement_id").references(()=>managementAgreements.id), plate:text("plate").notNull(), make:text("make").notNull(), model:text("model").notNull(), year:integer("year").notNull(), status:text("status").notNull().default("available"), ownership:text("ownership").notNull().default("owned"), dailyRate:integer("daily_rate").notNull(), archivedAt:text("archived_at"), ...timestamps,
}, t => [uniqueIndex("vehicles_agency_plate_uq").on(t.agencyId,t.plate), index("vehicles_branch_status_idx").on(t.agencyId,t.branchId,t.status)]);
export const customers = sqliteTable("customers", {
  id:text("id").primaryKey(), agencyId:text("agency_id").notNull().references(()=>agencies.id), name:text("name").notNull(), phoneNormalized:text("phone_normalized").notNull(), cnicNormalized:text("cnic_normalized").notNull(), email:text("email"), licenseNumber:text("license_number"), licenseExpiresAt:text("license_expires_at"), status:text("status").notNull().default("active"), ...timestamps,
}, t => [uniqueIndex("customers_agency_cnic_uq").on(t.agencyId,t.cnicNormalized), index("customers_phone_idx").on(t.agencyId,t.phoneNormalized)]);
export const bookings = sqliteTable("bookings", {
  id:text("id").primaryKey(), agencyId:text("agency_id").notNull().references(()=>agencies.id), branchId:text("branch_id").notNull().references(()=>branches.id), vehicleId:text("vehicle_id").notNull().references(()=>vehicles.id), customerId:text("customer_id").notNull().references(()=>customers.id), pickupAt:text("pickup_at").notNull(), returnAt:text("return_at").notNull(), status:text("status",{enum:["draft","confirmed","checked_out","completed","cancelled","no_show"]}).notNull(), dailyRate:integer("daily_rate").notNull(), totalAmount:integer("total_amount").notNull(), depositRequired:integer("deposit_required").notNull().default(0), source:text("source").notNull().default("counter"), notes:text("notes"), ...timestamps,
}, t => [index("bookings_vehicle_interval_idx").on(t.agencyId,t.vehicleId,t.pickupAt,t.returnAt), index("bookings_customer_idx").on(t.agencyId,t.customerId)]);
export const availabilityBlocks = sqliteTable("availability_blocks", {
  id:text("id").primaryKey(), agencyId:text("agency_id").notNull().references(()=>agencies.id), vehicleId:text("vehicle_id").notNull().references(()=>vehicles.id), startAt:text("start_at").notNull(), endAt:text("end_at").notNull(), kind:text("kind").notNull(), reason:text("reason").notNull(), ...timestamps,
}, t => [index("blocks_vehicle_interval_idx").on(t.agencyId,t.vehicleId,t.startAt,t.endAt)]);
export const financialTransactions = sqliteTable("financial_transactions", {
  id:text("id").primaryKey(), agencyId:text("agency_id").notNull().references(()=>agencies.id), bookingId:text("booking_id").references(()=>bookings.id), customerId:text("customer_id").references(()=>customers.id), kind:text("kind").notNull(), amount:integer("amount").notNull(), method:text("method").notNull(), reference:text("reference").notNull(), linkedTransactionId:text("linked_transaction_id"), postedAt:text("posted_at").notNull(), ...timestamps,
}, t => [index("transactions_booking_idx").on(t.agencyId,t.bookingId)]);
export const expenses = sqliteTable("expenses", {
  id:text("id").primaryKey(), agencyId:text("agency_id").notNull().references(()=>agencies.id), vehicleId:text("vehicle_id").references(()=>vehicles.id), bookingId:text("booking_id").references(()=>bookings.id), ownerId:text("owner_id").references(()=>owners.id), amount:integer("amount").notNull(), category:text("category").notNull(), description:text("description").notNull(), status:text("status").notNull(), occurredOn:text("occurred_on").notNull(), ...timestamps,
}, t => [index("expenses_agency_date_idx").on(t.agencyId,t.occurredOn)]);
export const privateFiles = sqliteTable("private_files", {
  id:text("id").primaryKey(), agencyId:text("agency_id").notNull().references(()=>agencies.id), entityType:text("entity_type").notNull(), entityId:text("entity_id").notNull(), storageKey:text("storage_key").notNull(), mimeType:text("mime_type").notNull(), size:integer("size").notNull(), classification:text("classification").notNull(), ...timestamps,
}, t => [uniqueIndex("private_files_storage_key_uq").on(t.storageKey), index("private_files_entity_idx").on(t.agencyId,t.entityType,t.entityId)]);
export const auditEvents = sqliteTable("audit_events", {
  id:text("id").primaryKey(), agencyId:text("agency_id").notNull().references(()=>agencies.id), actorId:text("actor_id").references(()=>users.id), action:text("action").notNull(), entityType:text("entity_type").notNull(), entityId:text("entity_id").notNull(), metadata:text("metadata",{mode:"json"}).$type<Record<string,unknown>>(), occurredAt:text("occurred_at").notNull(),
}, t => [index("audit_agency_time_idx").on(t.agencyId,t.occurredAt), index("audit_entity_idx").on(t.agencyId,t.entityType,t.entityId)]);
