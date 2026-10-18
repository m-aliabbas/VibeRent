CREATE TABLE `legacy_import_records` (
	`id` text PRIMARY KEY NOT NULL,
	`agency_id` text NOT NULL,
	`source_agency_id` text NOT NULL,
	`source_table` text NOT NULL,
	`source_id` text NOT NULL,
	`row_json` text NOT NULL,
	`imported_at` text NOT NULL,
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legacy_import_records_source_uq` ON `legacy_import_records` (`agency_id`,`source_agency_id`,`source_table`,`source_id`);