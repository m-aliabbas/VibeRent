CREATE TABLE "customer_guarantors" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"guarantor_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotation_number_counters" (
	"agency_id" text PRIMARY KEY NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotations" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"public_number" integer NOT NULL,
	"customer_id" text,
	"customer_name" text NOT NULL,
	"customer_phone" text DEFAULT '' NOT NULL,
	"vehicle_id" text,
	"vehicle_label" text NOT NULL,
	"rental_mode" text DEFAULT 'self_drive' NOT NULL,
	"destination_city" text DEFAULT '' NOT NULL,
	"pickup_at" text NOT NULL,
	"return_at" text NOT NULL,
	"days" integer NOT NULL,
	"daily_rate" integer NOT NULL,
	"extras" integer DEFAULT 0 NOT NULL,
	"discount" integer DEFAULT 0 NOT NULL,
	"total_amount" integer NOT NULL,
	"deposit_required" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"valid_until" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"booking_id" text,
	"actor_id" text,
	"archived_at" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "guarantor_id" text;--> statement-breakpoint
ALTER TABLE "guarantors" ADD COLUMN "license_number" text;--> statement-breakpoint
ALTER TABLE "guarantors" ADD COLUMN "license_expires_at" text;--> statement-breakpoint
ALTER TABLE "customer_guarantors" ADD CONSTRAINT "customer_guarantors_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_guarantors" ADD CONSTRAINT "customer_guarantors_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_guarantors" ADD CONSTRAINT "customer_guarantors_guarantor_id_guarantors_id_fk" FOREIGN KEY ("guarantor_id") REFERENCES "public"."guarantors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_number_counters" ADD CONSTRAINT "quotation_number_counters_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_guarantors_pair_uq" ON "customer_guarantors" USING btree ("agency_id","customer_id","guarantor_id");--> statement-breakpoint
CREATE INDEX "customer_guarantors_guarantor_idx" ON "customer_guarantors" USING btree ("agency_id","guarantor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quotations_agency_number_uq" ON "quotations" USING btree ("agency_id","public_number");--> statement-breakpoint
CREATE INDEX "quotations_agency_status_idx" ON "quotations" USING btree ("agency_id","status","created_at");--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_guarantor_id_guarantors_id_fk" FOREIGN KEY ("guarantor_id") REFERENCES "public"."guarantors"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
UPDATE bookings SET guarantor_id = (SELECT g.id FROM guarantors g WHERE g.agency_id = bookings.agency_id AND g.cnic_normalized IS NOT NULL AND g.cnic_normalized <> '' AND g.cnic_normalized = replace(replace(bookings.guarantor_cnic, '-', ''), ' ', '') LIMIT 1) WHERE guarantor_id IS NULL AND guarantor_cnic IS NOT NULL AND guarantor_cnic <> '';--> statement-breakpoint
INSERT INTO customer_guarantors (id, agency_id, customer_id, guarantor_id, created_at, updated_at) SELECT 'cgl_' || b.customer_id || '_' || b.guarantor_id, b.agency_id, b.customer_id, b.guarantor_id, min(b.created_at), min(b.created_at) FROM bookings b WHERE b.guarantor_id IS NOT NULL AND b.renter_skipped = 0 GROUP BY b.agency_id, b.customer_id, b.guarantor_id ON CONFLICT DO NOTHING;