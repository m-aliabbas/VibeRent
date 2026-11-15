CREATE TABLE `expense_recoveries` (
	`id` text PRIMARY KEY NOT NULL,
	`agency_id` text NOT NULL,
	`expense_id` text NOT NULL,
	`amount` integer NOT NULL,
	`received_on` text NOT NULL,
	`source` text NOT NULL,
	`method` text DEFAULT 'cash' NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`note` text,
	`idempotency_key` text NOT NULL,
	`status` text DEFAULT 'posted' NOT NULL,
	`actor_id` text NOT NULL,
	`reversed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expense_recoveries_agency_idempotency_uq` ON `expense_recoveries` (`agency_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `expense_recoveries_expense_idx` ON `expense_recoveries` (`agency_id`,`expense_id`,`status`);--> statement-breakpoint
CREATE INDEX `expense_recoveries_date_idx` ON `expense_recoveries` (`agency_id`,`received_on`);