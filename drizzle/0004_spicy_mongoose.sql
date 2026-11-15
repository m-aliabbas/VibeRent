CREATE TABLE `invitation_branch_access` (
	`invitation_id` text NOT NULL,
	`branch_id` text NOT NULL,
	FOREIGN KEY (`invitation_id`) REFERENCES `invitation`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitation_branch_access_uq` ON `invitation_branch_access` (`invitation_id`,`branch_id`);