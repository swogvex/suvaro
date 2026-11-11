CREATE TABLE `email_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`user_id` text,
	`scheduled_for` text NOT NULL,
	`sent_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `email_queue_day_idx` ON `email_queue` (`scheduled_for`);--> statement-breakpoint
CREATE TABLE `recurring_pending` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`recurring_id` text NOT NULL,
	`due_date` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recurring_id`) REFERENCES `recurring`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recurring_pending_recurring_due_idx` ON `recurring_pending` (`recurring_id`,`due_date`);--> statement-breakpoint
CREATE INDEX `recurring_pending_user_idx` ON `recurring_pending` (`user_id`,`due_date`);