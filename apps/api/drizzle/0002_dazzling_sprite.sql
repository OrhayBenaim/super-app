CREATE TABLE `chains` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`name_he` text NOT NULL,
	`order_url` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chains_key_unique` ON `chains` (`key`);--> statement-breakpoint
CREATE TABLE `prices` (
	`store_id` text NOT NULL,
	`code` text NOT NULL,
	`price` real NOT NULL,
	`unit_price` real,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`store_id`, `code`),
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`code`) REFERENCES `products`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `prices_code_idx` ON `prices` (`code`);--> statement-breakpoint
CREATE TABLE `products` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`manufacturer` text,
	`unit_qty` text,
	`is_weighted` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stores` (
	`id` text PRIMARY KEY NOT NULL,
	`chain_id` text NOT NULL,
	`store_id` text NOT NULL,
	`sub_chain_id` text NOT NULL,
	`name` text NOT NULL,
	`address` text NOT NULL,
	`city` text NOT NULL,
	`lat` real,
	`lng` real,
	FOREIGN KEY (`chain_id`) REFERENCES `chains`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `stores_lat_lng_idx` ON `stores` (`lat`,`lng`);