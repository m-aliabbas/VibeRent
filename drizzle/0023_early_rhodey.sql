CREATE TABLE `legacy_import_records` (
	`id` text PRIMARY KEY NOT NULL,
	`agency_id` text NOT NULL,
	`source_agency_id` text NOT NULL,
	`source_table` text NOT NULL,
	`source_id` text NOT NULL,
	`row_json` text NOT NULL,
	`imported_at` text NOT NULL,
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legacy_import_records_source_uq` ON `legacy_import_records` (`agency_id`,`source_agency_id`,`source_table`,`source_id`);--> statement-breakpoint
CREATE TABLE `recurring_expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`agency_id` text NOT NULL,
	`vehicle_id` text,
	`owner_id` text,
	`amount` integer NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`frequency` text NOT NULL,
	`day_of_month` integer NOT NULL,
	`start_on` text NOT NULL,
	`end_on` text,
	`next_due_on` text NOT NULL,
	`auto_approve` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`actor_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `recurring_expenses_due_idx` ON `recurring_expenses` (`agency_id`,`status`,`next_due_on`);--> statement-breakpoint
CREATE INDEX `recurring_expenses_vehicle_idx` ON `recurring_expenses` (`agency_id`,`vehicle_id`);--> statement-breakpoint
CREATE TABLE `vehicle_service_records` (
	`id` text PRIMARY KEY NOT NULL,
	`agency_id` text NOT NULL,
	`vehicle_id` text NOT NULL,
	`kind` text DEFAULT 'oil_change' NOT NULL,
	`serviced_on` text NOT NULL,
	`odometer` integer NOT NULL,
	`cost` integer DEFAULT 0 NOT NULL,
	`workshop` text NOT NULL,
	`notes` text,
	`expense_id` text,
	`actor_id` text NOT NULL,
	`voided_at` text,
	`void_reason` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `vehicle_service_records_vehicle_idx` ON `vehicle_service_records` (`agency_id`,`vehicle_id`,`kind`,`odometer`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `web_drive_connections_agency_user_uq` ON `web_drive_connections` (`agency_id`,`auth_user_id`);--> statement-breakpoint
DROP INDEX `drivers_agency_cnic_uq`;--> statement-breakpoint
CREATE UNIQUE INDEX `drivers_agency_cnic_uq` ON `drivers` (`agency_id`,`cnic_normalized`) WHERE "drivers"."cnic_normalized" <> '';--> statement-breakpoint
ALTER TABLE `expenses` ADD `recurring_expense_id` text REFERENCES recurring_expenses(id);--> statement-breakpoint
CREATE UNIQUE INDEX `expenses_recurring_period_uq` ON `expenses` (`recurring_expense_id`,`occurred_on`);--> statement-breakpoint
ALTER TABLE `vehicles` ADD `oil_change_interval_km` integer DEFAULT 5000 NOT NULL;