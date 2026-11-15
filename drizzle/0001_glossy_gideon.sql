ALTER TABLE `management_agreements` ADD `owner_share_amount` integer;--> statement-breakpoint
ALTER TABLE `management_agreements` ADD `expense_responsibility` text DEFAULT 'shared' NOT NULL;--> statement-breakpoint
ALTER TABLE `vehicles` ADD `category` text DEFAULT 'sedan' NOT NULL;--> statement-breakpoint
ALTER TABLE `vehicles` ADD `color` text DEFAULT 'Not specified' NOT NULL;--> statement-breakpoint
ALTER TABLE `vehicles` ADD `transmission` text DEFAULT 'automatic' NOT NULL;--> statement-breakpoint
ALTER TABLE `vehicles` ADD `fuel` text DEFAULT 'petrol' NOT NULL;--> statement-breakpoint
ALTER TABLE `vehicles` ADD `version` integer DEFAULT 1 NOT NULL;