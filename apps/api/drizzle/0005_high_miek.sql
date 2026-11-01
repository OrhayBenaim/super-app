CREATE TABLE `sync_chain_results` (
	`sync_run_id` integer NOT NULL,
	`chain_id` text NOT NULL,
	`status` text NOT NULL,
	`files_downloaded` integer NOT NULL,
	`stores_loaded` integer NOT NULL,
	`prices_loaded` integer NOT NULL,
	`stores_geocoded` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`error` text,
	PRIMARY KEY(`sync_run_id`, `chain_id`),
	FOREIGN KEY (`sync_run_id`) REFERENCES `sync_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chain_id`) REFERENCES `chains`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trigger` text NOT NULL,
	`status` text NOT NULL,
	`skip_reason` text,
	`scheduled_at` integer,
	`requested_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer
);
