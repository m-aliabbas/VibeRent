PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_guarantors` (
	`id` text PRIMARY KEY NOT NULL,
	`agency_id` text NOT NULL,
	`name` text NOT NULL,
	`parentage` text NOT NULL,
	`cnic_normalized` text,
	`phone_normalized` text NOT NULL,
	`address` text NOT NULL,
	`car_amount` integer NOT NULL,
	`archived_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_guarantors`("id", "agency_id", "name", "parentage", "cnic_normalized", "phone_normalized", "address", "car_amount", "archived_at", "created_at", "updated_at") SELECT "id", "agency_id", "name", "parentage", "cnic_normalized", "phone_normalized", "address", "car_amount", "archived_at", "created_at", "updated_at" FROM `guarantors`;--> statement-breakpoint
DROP TABLE `guarantors`;--> statement-breakpoint
ALTER TABLE `__new_guarantors` RENAME TO `guarantors`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `guarantors_agency_cnic_uq` ON `guarantors` (`agency_id`,`cnic_normalized`);--> statement-breakpoint
CREATE INDEX `guarantors_agency_name_idx` ON `guarantors` (`agency_id`,`name`);