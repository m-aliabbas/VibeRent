CREATE TABLE "external_vehicles" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"supplier_name" text NOT NULL,
	"supplier_phone" text NOT NULL,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"year" integer NOT NULL,
	"plate" text NOT NULL,
	"color" text,
	"archived_at" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guarantors" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"name" text NOT NULL,
	"parentage" text NOT NULL,
	"cnic_normalized" text,
	"phone_normalized" text NOT NULL,
	"address" text NOT NULL,
	"car_amount" integer NOT NULL,
	"archived_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "external_vehicles" ADD CONSTRAINT "external_vehicles_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guarantors" ADD CONSTRAINT "guarantors_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "external_vehicles_agency_plate_uq" ON "external_vehicles" USING btree ("agency_id","plate");--> statement-breakpoint
CREATE INDEX "external_vehicles_agency_supplier_idx" ON "external_vehicles" USING btree ("agency_id","supplier_name");--> statement-breakpoint
CREATE UNIQUE INDEX "guarantors_agency_cnic_uq" ON "guarantors" USING btree ("agency_id","cnic_normalized");--> statement-breakpoint
CREATE INDEX "guarantors_agency_name_idx" ON "guarantors" USING btree ("agency_id","name");