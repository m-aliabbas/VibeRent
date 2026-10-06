ALTER TABLE `expenses` ADD `customer_id` text REFERENCES customers(id);--> statement-breakpoint
CREATE INDEX `expenses_customer_idx` ON `expenses` (`agency_id`,`customer_id`);