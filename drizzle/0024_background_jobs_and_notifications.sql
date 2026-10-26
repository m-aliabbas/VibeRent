CREATE TABLE `background_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`data` text DEFAULT '{}' NOT NULL,
	`singleton_key` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`run_at` text NOT NULL,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `background_jobs_due_idx` ON `background_jobs` (`status`,`run_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `background_jobs_singleton_uq` ON `background_jobs` (`name`,`singleton_key`) WHERE status IN ('pending','active') AND singleton_key IS NOT NULL;--> statement-breakpoint
CREATE TABLE `notification_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`agency_id` text NOT NULL,
	`kind` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`channel` text DEFAULT 'whatsapp' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`recipient_phone` text,
	`recipient_name` text,
	`payload` text DEFAULT '{}' NOT NULL,
	`document_file_id` text,
	`message_text` text,
	`file_name` text,
	`caption` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error_code` text,
	`wa_message_id` text,
	`idempotency_key` text NOT NULL,
	`requested_by` text,
	`sent_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_file_id`) REFERENCES `private_files`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_deliveries_idempotency_uq` ON `notification_deliveries` (`agency_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `notification_deliveries_entity_idx` ON `notification_deliveries` (`agency_id`,`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `notification_deliveries_status_idx` ON `notification_deliveries` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `whatsapp_sessions` (
	`agency_id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`desired_state` text DEFAULT 'disconnected' NOT NULL,
	`status` text DEFAULT 'idle' NOT NULL,
	`qr_payload` text,
	`qr_updated_at` text,
	`linked_jid` text,
	`last_error` text,
	`holder_id` text,
	`heartbeat_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_sessions_session_id_unique` ON `whatsapp_sessions` (`session_id`);