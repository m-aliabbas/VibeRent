CREATE TABLE "notification_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"kind" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"channel" text DEFAULT 'whatsapp' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"recipient_phone" text,
	"recipient_name" text,
	"payload" text DEFAULT '{}' NOT NULL,
	"document_file_id" text,
	"message_text" text,
	"file_name" text,
	"caption" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error_code" text,
	"wa_message_id" text,
	"idempotency_key" text NOT NULL,
	"requested_by" text,
	"sent_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_auth_credentials" (
	"session_id" text PRIMARY KEY NOT NULL,
	"payload" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_auth_keys" (
	"session_id" text NOT NULL,
	"key_type" text NOT NULL,
	"key_id" text NOT NULL,
	"payload" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "whatsapp_auth_keys_session_id_key_type_key_id_pk" PRIMARY KEY("session_id","key_type","key_id")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_message_cache" (
	"session_id" text NOT NULL,
	"remote_jid" text NOT NULL,
	"message_id" text NOT NULL,
	"payload" text NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "whatsapp_message_cache_session_id_remote_jid_message_id_pk" PRIMARY KEY("session_id","remote_jid","message_id")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_session_leases" (
	"session_id" text PRIMARY KEY NOT NULL,
	"holder_id" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_sessions" (
	"agency_id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"desired_state" text DEFAULT 'disconnected' NOT NULL,
	"status" text DEFAULT 'idle' NOT NULL,
	"qr_payload" text,
	"qr_updated_at" text,
	"linked_jid" text,
	"last_error" text,
	"holder_id" text,
	"heartbeat_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "whatsapp_sessions_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_document_file_id_private_files_id_fk" FOREIGN KEY ("document_file_id") REFERENCES "public"."private_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_sessions" ADD CONSTRAINT "whatsapp_sessions_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_deliveries_idempotency_uq" ON "notification_deliveries" USING btree ("agency_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "notification_deliveries_entity_idx" ON "notification_deliveries" USING btree ("agency_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "notification_deliveries_status_idx" ON "notification_deliveries" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "whatsapp_message_cache_message_idx" ON "whatsapp_message_cache" USING btree ("session_id","message_id");--> statement-breakpoint
CREATE INDEX "whatsapp_message_cache_created_idx" ON "whatsapp_message_cache" USING btree ("created_at");