CREATE TABLE `error_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` integer NOT NULL,
	`route` text NOT NULL,
	`code` text NOT NULL,
	`message` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `error_log_at_idx` ON `error_log` (`at`);