CREATE TABLE `drivers` (
	`id` text PRIMARY KEY NOT NULL,
	`agency_id` text NOT NULL,
	`name` text NOT NULL,
	`phone_normalized` text NOT NULL,
	`cnic_normalized` text NOT NULL,
	`address` text NOT NULL,
	`license_number` text NOT NULL,
	`license_expires_at` text,
	`status` text DEFAULT 'active' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`archived_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `drivers_agency_cnic_uq` ON `drivers` (`agency_id`,`cnic_normalized`);--> statement-breakpoint
CREATE INDEX `drivers_agency_status_idx` ON `drivers` (`agency_id`,`status`);--> statement-breakpoint
ALTER TABLE `bookings` ADD `driver_id` text REFERENCES drivers(id);--> statement-breakpoint
ALTER TABLE `bookings` ADD `rental_mode` text DEFAULT 'self_drive' NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `renter_skipped` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `vehicles` ADD `chassis_number` text;--> statement-breakpoint
ALTER TABLE `vehicles` ADD `engine_number` text;--> statement-breakpoint
ALTER TABLE `vehicles` ADD `with_driver_rate` integer;