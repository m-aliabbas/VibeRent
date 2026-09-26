CREATE TABLE `agencies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`currency` text DEFAULT 'PKR' NOT NULL,
	`timezone` text DEFAULT 'Asia/Karachi' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`agency_id` text NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`metadata` text,
	`occurred_at` text NOT NULL,
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_agency_time_idx` ON `audit_events` (`agency_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_events` (`agency_id`,`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `availability_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`agency_id` text NOT NULL,
	`vehicle_id` text NOT NULL,
	`start_at` text NOT NULL,
	`end_at` text NOT NULL,
	`kind` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `blocks_vehicle_interval_idx` ON `availability_blocks` (`agency_id`,`vehicle_id`,`start_at`,`end_at`);--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`agency_id` text NOT NULL,
	`branch_id` text NOT NULL,
	`vehicle_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`pickup_at` text NOT NULL,
	`return_at` text NOT NULL,
	`status` text NOT NULL,
	`daily_rate` integer NOT NULL,
	`total_amount` integer NOT NULL,
	`deposit_required` integer DEFAULT 0 NOT NULL,
	`source` text DEFAULT 'counter' NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `bookings_vehicle_interval_idx` ON `bookings` (`agency_id`,`vehicle_id`,`pickup_at`,`return_at`);--> statement-breakpoint
CREATE INDEX `bookings_customer_idx` ON `bookings` (`agency_id`,`customer_id`);--> statement-breakpoint
CREATE TABLE `branches` (
	`id` text PRIMARY KEY NOT NULL,
	`agency_id` text NOT NULL,
	`name` text NOT NULL,
	`city` text NOT NULL,
	`address` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `branches_agency_idx` ON `branches` (`agency_id`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`agency_id` text NOT NULL,
	`name` text NOT NULL,
	`phone_normalized` text NOT NULL,
	`cnic_normalized` text NOT NULL,
	`email` text,
	`license_number` text,
	`license_expires_at` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customers_agency_cnic_uq` ON `customers` (`agency_id`,`cnic_normalized`);--> statement-breakpoint
CREATE INDEX `customers_phone_idx` ON `customers` (`agency_id`,`phone_normalized`);--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`agency_id` text NOT NULL,
	`vehicle_id` text,
	`booking_id` text,
	`owner_id` text,
	`amount` integer NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`status` text NOT NULL,
	`occurred_on` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `expenses_agency_date_idx` ON `expenses` (`agency_id`,`occurred_on`);--> statement-breakpoint
CREATE TABLE `financial_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`agency_id` text NOT NULL,
	`booking_id` text,
	`customer_id` text,
	`kind` text NOT NULL,
	`amount` integer NOT NULL,
	`method` text NOT NULL,
	`reference` text NOT NULL,
	`linked_transaction_id` text,
	`posted_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `transactions_booking_idx` ON `financial_transactions` (`agency_id`,`booking_id`);--> statement-breakpoint
CREATE TABLE `management_agreements` (
	`id` text PRIMARY KEY NOT NULL,
	`agency_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`version` integer NOT NULL,
	`effective_from` text NOT NULL,
	`effective_to` text,
	`share_basis` text NOT NULL,
	`owner_share_percent` real,
	`payout_frequency` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agreements_owner_version_uq` ON `management_agreements` (`owner_id`,`version`);--> statement-breakpoint
CREATE INDEX `agreements_effective_idx` ON `management_agreements` (`owner_id`,`effective_from`,`effective_to`);--> statement-breakpoint
CREATE TABLE `owners` (
	`id` text PRIMARY KEY NOT NULL,
	`agency_id` text NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`email` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `owners_agency_idx` ON `owners` (`agency_id`);--> statement-breakpoint
CREATE TABLE `private_files` (
	`id` text PRIMARY KEY NOT NULL,
	`agency_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`storage_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`classification` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `private_files_storage_key_uq` ON `private_files` (`storage_key`);--> statement-breakpoint
CREATE INDEX `private_files_entity_idx` ON `private_files` (`agency_id`,`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`agency_id` text NOT NULL,
	`branch_id` text,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_agency_email_uq` ON `users` (`agency_id`,`email`);--> statement-breakpoint
CREATE TABLE `vehicles` (
	`id` text PRIMARY KEY NOT NULL,
	`agency_id` text NOT NULL,
	`branch_id` text NOT NULL,
	`owner_id` text,
	`agreement_id` text,
	`plate` text NOT NULL,
	`make` text NOT NULL,
	`model` text NOT NULL,
	`year` integer NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`ownership` text DEFAULT 'owned' NOT NULL,
	`daily_rate` integer NOT NULL,
	`archived_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agreement_id`) REFERENCES `management_agreements`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vehicles_agency_plate_uq` ON `vehicles` (`agency_id`,`plate`);--> statement-breakpoint
CREATE INDEX `vehicles_branch_status_idx` ON `vehicles` (`agency_id`,`branch_id`,`status`);