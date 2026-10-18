CREATE TABLE `web_drive_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`agency_id` text NOT NULL,
	`auth_user_id` text NOT NULL,
	`credentials_encrypted` text NOT NULL,
	`account_email` text,
	`folder_id` text,
	`last_backup_at` text,
	`last_backup_file_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`auth_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `web_drive_connections_agency_user_uq` ON `web_drive_connections` (`agency_id`,`auth_user_id`);