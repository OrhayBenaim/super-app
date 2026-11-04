CREATE TABLE `promotion_items` (
	`promotion_id` integer NOT NULL,
	`code` text NOT NULL,
	PRIMARY KEY(`promotion_id`, `code`),
	FOREIGN KEY (`promotion_id`) REFERENCES `promotions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `promotion_items_code_idx` ON `promotion_items` (`code`);--> statement-breakpoint
CREATE TABLE `promotions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`store_id` text NOT NULL,
	`promotion_id` text NOT NULL,
	`description` text NOT NULL,
	`kind` text NOT NULL,
	`min_qty` real NOT NULL,
	`amount` real NOT NULL,
	`audience` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`days` text,
	`limit_qty` real,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `promotions_store_promotion_idx` ON `promotions` (`store_id`,`promotion_id`);--> statement-breakpoint
ALTER TABLE `sync_chain_results` ADD `promotions_loaded` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_chain_results` ADD `promotion_status` text;--> statement-breakpoint
ALTER TABLE `sync_chain_results` ADD `promotion_error` text;