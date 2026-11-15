CREATE TABLE "web_drive_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"auth_user_id" text NOT NULL,
	"credentials_encrypted" text NOT NULL,
	"account_email" text,
	"folder_id" text,
	"last_backup_at" text,
	"last_backup_file_id" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "web_drive_connections" ADD CONSTRAINT "web_drive_connections_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_drive_connections" ADD CONSTRAINT "web_drive_connections_auth_user_id_user_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "web_drive_connections_agency_user_uq" ON "web_drive_connections" USING btree ("agency_id","auth_user_id");