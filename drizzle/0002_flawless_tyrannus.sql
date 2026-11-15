CREATE TABLE `owner_payouts` (
	`id` text PRIMARY KEY NOT NULL,
	`agency_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`period_from` text NOT NULL,
	`period_to` text NOT NULL,
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
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `owner_payouts_agency_idempotency_uq` ON `owner_payouts` (`agency_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `owner_payouts_owner_idx` ON `owner_payouts` (`agency_id`,`owner_id`,`paid_at`);--> statement-breakpoint
CREATE TABLE `rental_inspections` (
	`id` text PRIMARY KEY NOT NULL,
	`agency_id` text NOT NULL,
	`booking_id` text NOT NULL,
	`kind` text NOT NULL,
	`odometer` integer NOT NULL,
	`fuel_level` text NOT NULL,
	`condition_notes` text NOT NULL,
	`actor_id` text NOT NULL,
	`occurred_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rental_inspections_booking_kind_uq` ON `rental_inspections` (`booking_id`,`kind`);--> statement-breakpoint
CREATE INDEX `rental_inspections_agency_idx` ON `rental_inspections` (`agency_id`,`booking_id`);--> statement-breakpoint
ALTER TABLE `agencies` ADD `phone` text;--> statement-breakpoint
ALTER TABLE `agencies` ADD `address` text;--> statement-breakpoint
ALTER TABLE `agencies` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `availability_blocks` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `availability_blocks` ADD `archived_at` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `extras` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `discount` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `cancellation_reason` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `checked_out_at` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `completed_at` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `branches` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `archived_at` text;--> statement-breakpoint
ALTER TABLE `expenses` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE TABLE `__new_financial_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`agency_id` text NOT NULL,
	`booking_id` text,
	`customer_id` text,
	`kind` text NOT NULL,
	`amount` integer NOT NULL,
	`method` text NOT NULL,
	`reference` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`linked_transaction_id` text,
	`status` text DEFAULT 'posted' NOT NULL,
	`actor_id` text,
	`posted_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_financial_transactions` (`id`,`agency_id`,`booking_id`,`customer_id`,`kind`,`amount`,`method`,`reference`,`idempotency_key`,`linked_transaction_id`,`status`,`actor_id`,`posted_at`,`created_at`,`updated_at`)
SELECT `id`,`agency_id`,`booking_id`,`customer_id`,`kind`,`amount`,`method`,`reference`,'legacy-' || `id`,`linked_transaction_id`,'posted',NULL,`posted_at`,`created_at`,`updated_at` FROM `financial_transactions`;--> statement-breakpoint
DROP TABLE `financial_transactions`;--> statement-breakpoint
ALTER TABLE `__new_financial_transactions` RENAME TO `financial_transactions`;--> statement-breakpoint
CREATE INDEX `transactions_booking_idx` ON `financial_transactions` (`agency_id`,`booking_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_agency_idempotency_uq` ON `financial_transactions` (`agency_id`,`idempotency_key`);--> statement-breakpoint
ALTER TABLE `owners` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `private_files` ADD `status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `version` integer DEFAULT 1 NOT NULL;
