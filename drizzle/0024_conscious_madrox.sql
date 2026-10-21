CREATE TABLE `recurring_expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`agency_id` text NOT NULL,
	`vehicle_id` text,
	`owner_id` text,
	`amount` integer NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`frequency` text NOT NULL,
	`day_of_month` integer NOT NULL,
	`start_on` text NOT NULL,
	`end_on` text,
	`next_due_on` text NOT NULL,
	`auto_approve` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`actor_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `recurring_expenses_due_idx` ON `recurring_expenses` (`agency_id`,`status`,`next_due_on`);--> statement-breakpoint
CREATE INDEX `recurring_expenses_vehicle_idx` ON `recurring_expenses` (`agency_id`,`vehicle_id`);--> statement-breakpoint
ALTER TABLE `expenses` ADD `recurring_expense_id` text REFERENCES recurring_expenses(id);--> statement-breakpoint
CREATE UNIQUE INDEX `expenses_recurring_period_uq` ON `expenses` (`recurring_expense_id`,`occurred_on`);