ALTER TABLE "agencies" ADD COLUMN "owner_fixed_charge_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "owner_fixed_charge_label" text DEFAULT 'Fixed charges' NOT NULL;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "owner_fixed_charge_from" text;