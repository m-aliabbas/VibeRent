CREATE TABLE "vehicle_service_records" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"vehicle_id" text NOT NULL,
	"kind" text DEFAULT 'oil_change' NOT NULL,
	"serviced_on" text NOT NULL,
	"odometer" integer NOT NULL,
	"cost" integer DEFAULT 0 NOT NULL,
	"workshop" text NOT NULL,
	"notes" text,
	"expense_id" text,
	"actor_id" text NOT NULL,
	"voided_at" text,
	"void_reason" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "oil_change_interval_km" integer DEFAULT 5000 NOT NULL;--> statement-breakpoint
ALTER TABLE "vehicle_service_records" ADD CONSTRAINT "vehicle_service_records_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_service_records" ADD CONSTRAINT "vehicle_service_records_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_service_records" ADD CONSTRAINT "vehicle_service_records_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_service_records" ADD CONSTRAINT "vehicle_service_records_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vehicle_service_records_vehicle_idx" ON "vehicle_service_records" USING btree ("agency_id","vehicle_id","kind","odometer");