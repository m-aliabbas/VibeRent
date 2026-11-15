CREATE TABLE `guarantors` (
	`id` text PRIMARY KEY NOT NULL,
	`agency_id` text NOT NULL,
	`name` text NOT NULL,
	`parentage` text NOT NULL,
	`cnic_normalized` text NOT NULL,
	`phone_normalized` text NOT NULL,
	`address` text NOT NULL,
	`car_amount` integer NOT NULL,
	`archived_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guarantors_agency_cnic_uq` ON `guarantors` (`agency_id`,`cnic_normalized`);--> statement-breakpoint
CREATE INDEX `guarantors_agency_name_idx` ON `guarantors` (`agency_id`,`name`);