CREATE TABLE `payment_receipt_counters` (
	`agency_id` text PRIMARY KEY NOT NULL,
	`next_number` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `financial_transactions` ADD `receipt_number` integer;--> statement-breakpoint
WITH `numbered_payments` AS (
	SELECT `id`, row_number() OVER (PARTITION BY `agency_id` ORDER BY `posted_at`, `created_at`, `id`) AS `receipt_number`
	FROM `financial_transactions`
	WHERE lower(`kind`) = 'payment'
)
UPDATE `financial_transactions`
SET `receipt_number` = (SELECT `receipt_number` FROM `numbered_payments` WHERE `numbered_payments`.`id` = `financial_transactions`.`id`)
WHERE lower(`kind`) = 'payment';--> statement-breakpoint
INSERT INTO `payment_receipt_counters` (`agency_id`,`next_number`,`created_at`,`updated_at`)
SELECT `agency_id`, max(`receipt_number`) + 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM `financial_transactions`
WHERE `receipt_number` IS NOT NULL
GROUP BY `agency_id`;--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_agency_receipt_uq` ON `financial_transactions` (`agency_id`,`receipt_number`);
--> statement-breakpoint
CREATE TRIGGER `financial_transactions_payment_receipt_required_insert`
BEFORE INSERT ON `financial_transactions`
WHEN lower(NEW.`kind`) = 'payment' AND NEW.`receipt_number` IS NULL
BEGIN
	SELECT RAISE(ABORT, 'payment receipt number is required');
END;
--> statement-breakpoint
CREATE TRIGGER `financial_transactions_payment_receipt_required_update`
BEFORE UPDATE OF `kind`, `receipt_number` ON `financial_transactions`
WHEN lower(NEW.`kind`) = 'payment' AND NEW.`receipt_number` IS NULL
BEGIN
	SELECT RAISE(ABORT, 'payment receipt number is required');
END;
