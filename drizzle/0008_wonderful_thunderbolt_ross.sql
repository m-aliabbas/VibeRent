CREATE TABLE `whatsapp_settings` (
	`agency_id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`owner_phone_normalized` text,
	`listening_enabled` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_settings_session_id_unique` ON `whatsapp_settings` (`session_id`);