CREATE TABLE `browse_catalog` (
	`id` integer PRIMARY KEY NOT NULL,
	`groups` blob NOT NULL,
	`per_unit` blob NOT NULL,
	`weighted` blob NOT NULL,
	`stores` blob NOT NULL,
	`group_types` blob NOT NULL,
	`group_stores` blob NOT NULL,
	`names` blob NOT NULL,
	`name_ends` blob NOT NULL
);
--> statement-breakpoint
CREATE TABLE `browse_groups` (
	`id` integer PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`ref` text,
	`name` text NOT NULL,
	`measure` text NOT NULL,
	`size` real NOT NULL,
	`sold_by` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `browse_products` (
	`id` integer PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`words` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `browse_products_code_unique` ON `browse_products` (`code`);--> statement-breakpoint
CREATE TABLE `chain_promotions` (
	`id` integer PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`chain_id` text NOT NULL,
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
	`min_purchase` real
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chain_promotions_key_unique` ON `chain_promotions` (`key`);--> statement-breakpoint
CREATE TABLE `store_browse` (
	`store_id` text PRIMARY KEY NOT NULL,
	`products` blob NOT NULL,
	`prices` blob NOT NULL,
	`offer_products` blob NOT NULL,
	`offer_promotions` blob NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
