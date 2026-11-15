CREATE TABLE "recurring_expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"vehicle_id" text,
	"owner_id" text,
	"amount" integer NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"frequency" text NOT NULL,
	"day_of_month" integer NOT NULL,
	"start_on" text NOT NULL,
	"end_on" text,
	"next_due_on" text NOT NULL,
	"auto_approve" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"actor_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "recurring_expense_id" text;--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_expenses_due_idx" ON "recurring_expenses" USING btree ("agency_id","status","next_due_on");--> statement-breakpoint
CREATE INDEX "recurring_expenses_vehicle_idx" ON "recurring_expenses" USING btree ("agency_id","vehicle_id");--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recurring_expense_id_recurring_expenses_id_fk" FOREIGN KEY ("recurring_expense_id") REFERENCES "public"."recurring_expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_recurring_period_uq" ON "expenses" USING btree ("recurring_expense_id","occurred_on");