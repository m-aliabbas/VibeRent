CREATE TABLE `booking_charges` (
	`id` text PRIMARY KEY NOT NULL,
	`agency_id` text NOT NULL,
	`booking_id` text NOT NULL,
	`kind` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`amount` integer NOT NULL,
	`actor_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `booking_charges_booking_idx` ON `booking_charges` (`agency_id`,`booking_id`);--> statement-breakpoint
ALTER TABLE `bookings` ADD `trip_charges` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `owners` ADD `cnic_normalized` text;--> statement-breakpoint
ALTER TABLE `owners` ADD `address` text;--> statement-breakpoint
ALTER TABLE `vehicles` ADD `vehicle_value` integer;