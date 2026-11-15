ALTER TABLE `customers` ADD `date_of_birth` text;--> statement-breakpoint
ALTER TABLE `customers` ADD `address` text;--> statement-breakpoint
ALTER TABLE `customers` ADD `cnic_expires_at` text;--> statement-breakpoint
ALTER TABLE `private_files` ADD `ocr_status` text;--> statement-breakpoint
ALTER TABLE `private_files` ADD `ocr_result` text;--> statement-breakpoint
ALTER TABLE `private_files` ADD `source_message_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `private_files_source_message_uq` ON `private_files` (`agency_id`,`source_message_id`);