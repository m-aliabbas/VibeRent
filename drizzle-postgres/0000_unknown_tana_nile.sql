CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" bigint,
	"refresh_token_expires_at" bigint,
	"scope" text,
	"password" text,
	"created_at" bigint DEFAULT (extract(epoch from clock_timestamp()) * 1000)::bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agencies" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"public_email" text,
	"registration_number" text,
	"tax_number" text,
	"currency" text DEFAULT 'PKR' NOT NULL,
	"timezone" text DEFAULT 'Asia/Karachi' NOT NULL,
	"phone" text,
	"address" text,
	"agreement_header" text DEFAULT 'Rental Agreement' NOT NULL,
	"agreement_locale" text DEFAULT 'en' NOT NULL,
	"agreement_config" text,
	"rental_terms" text DEFAULT 'The renter must carry a valid driving licence and CNIC, use the vehicle lawfully, return it on time with the agreed fuel level, and report any accident or damage immediately.' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agency_cities" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"name" text NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"metadata" text,
	"occurred_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_blocks" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"vehicle_id" text NOT NULL,
	"start_at" text NOT NULL,
	"end_at" text NOT NULL,
	"kind" text NOT NULL,
	"reason" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"public_number" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" text NOT NULL,
	"consumed_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_number_counters" (
	"agency_id" text PRIMARY KEY NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"public_number" integer,
	"branch_id" text NOT NULL,
	"vehicle_id" text,
	"customer_id" text NOT NULL,
	"driver_id" text,
	"rental_mode" text DEFAULT 'self_drive' NOT NULL,
	"renter_skipped" integer DEFAULT 0 NOT NULL,
	"fulfillment_type" text DEFAULT 'fleet' NOT NULL,
	"external_supplier_name" text,
	"external_supplier_phone" text,
	"external_vehicle_make" text,
	"external_vehicle_model" text,
	"external_vehicle_year" integer,
	"external_vehicle_plate" text,
	"external_vehicle_color" text,
	"supplier_pricing_mode" text,
	"supplier_share_percent" double precision,
	"supplier_fixed_cost" integer,
	"supplier_payable" integer,
	"guarantor_name" text,
	"guarantor_parentage" text,
	"guarantor_cnic" text,
	"guarantor_phone" text,
	"guarantor_address" text,
	"guarantor_car_amount" integer,
	"destination_city" text DEFAULT 'Local' NOT NULL,
	"pickup_at" text NOT NULL,
	"return_at" text NOT NULL,
	"status" text NOT NULL,
	"daily_rate" integer NOT NULL,
	"pricing_mode" text DEFAULT 'vehicle_default' NOT NULL,
	"estimated_km" integer DEFAULT 0 NOT NULL,
	"mileage_rate" integer DEFAULT 0 NOT NULL,
	"rate_override_reason" text,
	"terms_snapshot" text DEFAULT '' NOT NULL,
	"extras" integer DEFAULT 0 NOT NULL,
	"discount" integer DEFAULT 0 NOT NULL,
	"total_amount" integer NOT NULL,
	"deposit_required" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'counter' NOT NULL,
	"notes" text,
	"cancellation_reason" text,
	"checked_out_at" text,
	"completed_at" text,
	"archived_at" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"address" text NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"name" text NOT NULL,
	"father_name" text,
	"phone_normalized" text NOT NULL,
	"cnic_normalized" text NOT NULL,
	"email" text,
	"date_of_birth" text,
	"address" text,
	"cnic_expires_at" text,
	"license_number" text,
	"license_expires_at" text,
	"status" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"name" text NOT NULL,
	"phone_normalized" text NOT NULL,
	"cnic_normalized" text NOT NULL,
	"address" text NOT NULL,
	"license_number" text NOT NULL,
	"license_expires_at" text,
	"status" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"name" text NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"vehicle_id" text,
	"booking_id" text,
	"customer_id" text,
	"owner_id" text,
	"amount" integer NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"status" text NOT NULL,
	"occurred_on" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"receipt_number" integer,
	"booking_id" text,
	"customer_id" text,
	"kind" text NOT NULL,
	"amount" integer NOT NULL,
	"method" text NOT NULL,
	"reference" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"linked_transaction_id" text,
	"status" text DEFAULT 'posted' NOT NULL,
	"actor_id" text,
	"posted_at" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" bigint NOT NULL,
	"created_at" bigint DEFAULT (extract(epoch from clock_timestamp()) * 1000)::bigint NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation_branch_access" (
	"invitation_id" text NOT NULL,
	"branch_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "management_agreements" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"version" integer NOT NULL,
	"effective_from" text NOT NULL,
	"effective_to" text,
	"share_basis" text NOT NULL,
	"owner_share_percent" double precision,
	"owner_share_amount" integer,
	"expense_responsibility" text DEFAULT 'shared' NOT NULL,
	"payout_frequency" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'rental_agent' NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_branch_access" (
	"membership_id" text NOT NULL,
	"branch_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"created_at" bigint NOT NULL,
	"metadata" text,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "owner_payouts" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"vehicle_id" text,
	"period_from" text NOT NULL,
	"period_to" text NOT NULL,
	"amount" integer NOT NULL,
	"method" text NOT NULL,
	"reference" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'posted' NOT NULL,
	"paid_at" text NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "owners" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"status" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_receipt_counters" (
	"agency_id" text PRIMARY KEY NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "private_files" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"original_name" text DEFAULT 'attachment' NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"classification" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"ocr_status" text,
	"ocr_result" text,
	"source_message_id" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rental_inspections" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"booking_id" text NOT NULL,
	"kind" text NOT NULL,
	"odometer" integer NOT NULL,
	"fuel_level" text NOT NULL,
	"condition_notes" text NOT NULL,
	"actor_id" text NOT NULL,
	"occurred_at" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" bigint NOT NULL,
	"token" text NOT NULL,
	"created_at" bigint DEFAULT (extract(epoch from clock_timestamp()) * 1000)::bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "source_payouts" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"booking_id" text NOT NULL,
	"supplier_name" text NOT NULL,
	"amount" integer NOT NULL,
	"method" text NOT NULL,
	"reference" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'posted' NOT NULL,
	"paid_at" text NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" integer DEFAULT 0 NOT NULL,
	"image" text,
	"created_at" bigint DEFAULT (extract(epoch from clock_timestamp()) * 1000)::bigint NOT NULL,
	"updated_at" bigint DEFAULT (extract(epoch from clock_timestamp()) * 1000)::bigint NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"auth_user_id" text,
	"membership_id" text,
	"agency_id" text NOT NULL,
	"branch_id" text,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"role" text NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_rate_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"vehicle_id" text NOT NULL,
	"destination_city" text NOT NULL,
	"daily_rate" integer NOT NULL,
	"per_km_rate" integer DEFAULT 0 NOT NULL,
	"minimum_days" integer DEFAULT 1 NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"owner_id" text,
	"agreement_id" text,
	"plate" text NOT NULL,
	"chassis_number" text,
	"engine_number" text,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"year" integer NOT NULL,
	"category" text DEFAULT 'sedan' NOT NULL,
	"color" text DEFAULT 'Not specified' NOT NULL,
	"transmission" text DEFAULT 'automatic' NOT NULL,
	"fuel" text DEFAULT 'petrol' NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"ownership" text DEFAULT 'owned' NOT NULL,
	"daily_rate" integer NOT NULL,
	"with_driver_rate" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"created_at" bigint DEFAULT (extract(epoch from clock_timestamp()) * 1000)::bigint NOT NULL,
	"updated_at" bigint DEFAULT (extract(epoch from clock_timestamp()) * 1000)::bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_settings" (
	"agency_id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"owner_phone_normalized" text,
	"listening_enabled" integer DEFAULT 0 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "whatsapp_settings_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_cities" ADD CONSTRAINT "agency_cities_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_blocks" ADD CONSTRAINT "availability_blocks_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_blocks" ADD CONSTRAINT "availability_blocks_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_drafts" ADD CONSTRAINT "booking_drafts_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_drafts" ADD CONSTRAINT "booking_drafts_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_number_counters" ADD CONSTRAINT "booking_number_counters_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_branch_access" ADD CONSTRAINT "invitation_branch_access_invitation_id_invitation_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_branch_access" ADD CONSTRAINT "invitation_branch_access_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "management_agreements" ADD CONSTRAINT "management_agreements_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "management_agreements" ADD CONSTRAINT "management_agreements_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_branch_access" ADD CONSTRAINT "member_branch_access_membership_id_member_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_branch_access" ADD CONSTRAINT "member_branch_access_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_payouts" ADD CONSTRAINT "owner_payouts_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_payouts" ADD CONSTRAINT "owner_payouts_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_payouts" ADD CONSTRAINT "owner_payouts_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_payouts" ADD CONSTRAINT "owner_payouts_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owners" ADD CONSTRAINT "owners_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_receipt_counters" ADD CONSTRAINT "payment_receipt_counters_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_files" ADD CONSTRAINT "private_files_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_inspections" ADD CONSTRAINT "rental_inspections_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_inspections" ADD CONSTRAINT "rental_inspections_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_inspections" ADD CONSTRAINT "rental_inspections_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_payouts" ADD CONSTRAINT "source_payouts_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_payouts" ADD CONSTRAINT "source_payouts_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_payouts" ADD CONSTRAINT "source_payouts_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_auth_user_id_user_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_membership_id_member_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_rate_rules" ADD CONSTRAINT "vehicle_rate_rules_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_rate_rules" ADD CONSTRAINT "vehicle_rate_rules_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_agreement_id_management_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."management_agreements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_settings" ADD CONSTRAINT "whatsapp_settings_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agency_cities_name_uq" ON "agency_cities" USING btree ("agency_id","name");--> statement-breakpoint
CREATE INDEX "agency_cities_agency_idx" ON "agency_cities" USING btree ("agency_id","active");--> statement-breakpoint
CREATE INDEX "audit_agency_time_idx" ON "audit_events" USING btree ("agency_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_events" USING btree ("agency_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "blocks_vehicle_interval_idx" ON "availability_blocks" USING btree ("agency_id","vehicle_id","start_at","end_at");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_drafts_agency_number_uq" ON "booking_drafts" USING btree ("agency_id","public_number");--> statement-breakpoint
CREATE INDEX "booking_drafts_actor_status_idx" ON "booking_drafts" USING btree ("agency_id","actor_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_agency_public_number_uq" ON "bookings" USING btree ("agency_id","public_number");--> statement-breakpoint
CREATE INDEX "bookings_vehicle_interval_idx" ON "bookings" USING btree ("agency_id","vehicle_id","pickup_at","return_at");--> statement-breakpoint
CREATE INDEX "bookings_customer_idx" ON "bookings" USING btree ("agency_id","customer_id");--> statement-breakpoint
CREATE INDEX "branches_agency_idx" ON "branches" USING btree ("agency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_agency_cnic_uq" ON "customers" USING btree ("agency_id","cnic_normalized");--> statement-breakpoint
CREATE INDEX "customers_phone_idx" ON "customers" USING btree ("agency_id","phone_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "drivers_agency_cnic_uq" ON "drivers" USING btree ("agency_id","cnic_normalized");--> statement-breakpoint
CREATE INDEX "drivers_agency_status_idx" ON "drivers" USING btree ("agency_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "expense_categories_name_uq" ON "expense_categories" USING btree ("agency_id","name");--> statement-breakpoint
CREATE INDEX "expense_categories_agency_idx" ON "expense_categories" USING btree ("agency_id","active");--> statement-breakpoint
CREATE INDEX "expenses_agency_date_idx" ON "expenses" USING btree ("agency_id","occurred_on");--> statement-breakpoint
CREATE INDEX "expenses_customer_idx" ON "expenses" USING btree ("agency_id","customer_id");--> statement-breakpoint
CREATE INDEX "transactions_booking_idx" ON "financial_transactions" USING btree ("agency_id","booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_agency_receipt_uq" ON "financial_transactions" USING btree ("agency_id","receipt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_agency_idempotency_uq" ON "financial_transactions" USING btree ("agency_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "invitation_organizationId_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_branch_access_uq" ON "invitation_branch_access" USING btree ("invitation_id","branch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agreements_owner_version_uq" ON "management_agreements" USING btree ("owner_id","version");--> statement-breakpoint
CREATE INDEX "agreements_effective_idx" ON "management_agreements" USING btree ("owner_id","effective_from","effective_to");--> statement-breakpoint
CREATE INDEX "member_organizationId_idx" ON "member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "member_userId_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "member_org_user_uq" ON "member" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "member_branch_access_uq" ON "member_branch_access" USING btree ("membership_id","branch_id");--> statement-breakpoint
CREATE INDEX "member_branch_access_branch_idx" ON "member_branch_access" USING btree ("branch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "owner_payouts_agency_idempotency_uq" ON "owner_payouts" USING btree ("agency_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "owner_payouts_owner_idx" ON "owner_payouts" USING btree ("agency_id","owner_id","paid_at");--> statement-breakpoint
CREATE INDEX "owner_payouts_vehicle_idx" ON "owner_payouts" USING btree ("agency_id","vehicle_id","paid_at");--> statement-breakpoint
CREATE INDEX "owners_agency_idx" ON "owners" USING btree ("agency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "private_files_storage_key_uq" ON "private_files" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "private_files_entity_idx" ON "private_files" USING btree ("agency_id","entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "private_files_source_message_uq" ON "private_files" USING btree ("agency_id","source_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rental_inspections_booking_kind_uq" ON "rental_inspections" USING btree ("booking_id","kind");--> statement-breakpoint
CREATE INDEX "rental_inspections_agency_idx" ON "rental_inspections" USING btree ("agency_id","booking_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_payouts_agency_idempotency_uq" ON "source_payouts" USING btree ("agency_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "source_payouts_booking_idx" ON "source_payouts" USING btree ("agency_id","booking_id","paid_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_agency_email_uq" ON "users" USING btree ("agency_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_agency_auth_user_uq" ON "users" USING btree ("agency_id","auth_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_membership_uq" ON "users" USING btree ("membership_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_rate_rules_destination_uq" ON "vehicle_rate_rules" USING btree ("agency_id","vehicle_id","destination_city");--> statement-breakpoint
CREATE INDEX "vehicle_rate_rules_vehicle_idx" ON "vehicle_rate_rules" USING btree ("agency_id","vehicle_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_agency_plate_uq" ON "vehicles" USING btree ("agency_id","plate");--> statement-breakpoint
CREATE INDEX "vehicles_branch_status_idx" ON "vehicles" USING btree ("agency_id","branch_id","status");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");