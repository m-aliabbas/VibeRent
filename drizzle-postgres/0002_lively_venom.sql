CREATE TABLE "legacy_import_records" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"source_agency_id" text NOT NULL,
	"source_table" text NOT NULL,
	"source_id" text NOT NULL,
	"row_json" text NOT NULL,
	"imported_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "legacy_import_records" ADD CONSTRAINT "legacy_import_records_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_import_records_source_uq" ON "legacy_import_records" USING btree ("agency_id","source_agency_id","source_table","source_id");