CREATE TABLE `external_vehicles` (
	`id` text PRIMARY KEY NOT NULL,
	`agency_id` text NOT NULL,
	`supplier_name` text NOT NULL,
	`supplier_phone` text NOT NULL,
	`make` text NOT NULL,
	`model` text NOT NULL,
	`year` integer NOT NULL,
	`plate` text NOT NULL,
	`color` text,
	`archived_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `external_vehicles_agency_plate_uq` ON `external_vehicles` (`agency_id`,`plate`);--> statement-breakpoint
CREATE INDEX `external_vehicles_agency_supplier_idx` ON `external_vehicles` (`agency_id`,`supplier_name`);