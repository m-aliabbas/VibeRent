CREATE TABLE `source_payouts` (
	`id` text PRIMARY KEY NOT NULL,
	`agency_id` text NOT NULL,
	`booking_id` text NOT NULL,
	`supplier_name` text NOT NULL,
	`amount` integer NOT NULL,
	`method` text NOT NULL,
	`reference` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`status` text DEFAULT 'posted' NOT NULL,
	`paid_at` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_payouts_agency_idempotency_uq` ON `source_payouts` (`agency_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `source_payouts_booking_idx` ON `source_payouts` (`agency_id`,`booking_id`,`paid_at`);--> statement-breakpoint
ALTER TABLE `owner_payouts` ADD `vehicle_id` text REFERENCES vehicles(id);--> statement-breakpoint
CREATE INDEX `owner_payouts_vehicle_idx` ON `owner_payouts` (`agency_id`,`vehicle_id`,`paid_at`);