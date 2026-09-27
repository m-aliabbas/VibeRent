CREATE TABLE `vehicle_rate_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`agency_id` text NOT NULL,
	`vehicle_id` text NOT NULL,
	`destination_city` text NOT NULL,
	`daily_rate` integer NOT NULL,
	`per_km_rate` integer DEFAULT 0 NOT NULL,
	`minimum_days` integer DEFAULT 1 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vehicle_rate_rules_destination_uq` ON `vehicle_rate_rules` (`agency_id`,`vehicle_id`,`destination_city`);--> statement-breakpoint
CREATE INDEX `vehicle_rate_rules_vehicle_idx` ON `vehicle_rate_rules` (`agency_id`,`vehicle_id`,`active`);--> statement-breakpoint
ALTER TABLE `agencies` ADD `rental_terms` text DEFAULT 'The renter must carry a valid driving licence and CNIC, use the vehicle lawfully, return it on time with the agreed fuel level, and report any accident or damage immediately.' NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `destination_city` text DEFAULT 'Local' NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `pricing_mode` text DEFAULT 'vehicle_default' NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `estimated_km` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `mileage_rate` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `rate_override_reason` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `terms_snapshot` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `phone` text;