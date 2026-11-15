ALTER TABLE `agencies` ADD `agreement_header` text DEFAULT 'Rental Agreement' NOT NULL;--> statement-breakpoint
ALTER TABLE `agencies` ADD `agreement_locale` text DEFAULT 'en' NOT NULL;