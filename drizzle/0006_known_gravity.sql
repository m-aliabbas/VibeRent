CREATE TABLE `agency_cities` (
	`id` text PRIMARY KEY NOT NULL,
	`agency_id` text NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agency_cities_name_uq` ON `agency_cities` (`agency_id`,`name`);--> statement-breakpoint
CREATE INDEX `agency_cities_agency_idx` ON `agency_cities` (`agency_id`,`active`);--> statement-breakpoint
CREATE TABLE `expense_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`agency_id` text NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expense_categories_name_uq` ON `expense_categories` (`agency_id`,`name`);--> statement-breakpoint
CREATE INDEX `expense_categories_agency_idx` ON `expense_categories` (`agency_id`,`active`);--> statement-breakpoint
ALTER TABLE `private_files` ADD `original_name` text DEFAULT 'attachment' NOT NULL;