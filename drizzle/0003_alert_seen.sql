CREATE TABLE `alert_seen` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`budget_id` text NOT NULL,
	`cycle_start` text NOT NULL,
	`level` integer NOT NULL,
	`read_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`budget_id`) REFERENCES `budget`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `alert_seen_budget_cycle_level_idx` ON `alert_seen` (`budget_id`,`cycle_start`,`level`);--> statement-breakpoint
CREATE INDEX `alert_seen_user_cycle_idx` ON `alert_seen` (`user_id`,`cycle_start`);