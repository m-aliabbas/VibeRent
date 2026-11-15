CREATE TABLE `booking_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`agency_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`public_number` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `booking_drafts_agency_number_uq` ON `booking_drafts` (`agency_id`,`public_number`);--> statement-breakpoint
CREATE INDEX `booking_drafts_actor_status_idx` ON `booking_drafts` (`agency_id`,`actor_id`,`status`);--> statement-breakpoint
CREATE TABLE `booking_number_counters` (
	`agency_id` text PRIMARY KEY NOT NULL,
	`next_number` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `bookings` ADD `public_number` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `bookings_agency_public_number_uq` ON `bookings` (`agency_id`,`public_number`);