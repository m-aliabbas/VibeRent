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
ALTER TABLE `vehicles` ADD `oil_change_interval_km` integer DEFAULT 5000 NOT NULL;