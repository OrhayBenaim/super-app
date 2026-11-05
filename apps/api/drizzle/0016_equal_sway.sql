CREATE TABLE `group_names` (
	`ref` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `group_products` (
	`ref` text NOT NULL,
	`code` text NOT NULL,
	`added` integer NOT NULL,
	PRIMARY KEY(`ref`, `code`),
	FOREIGN KEY (`code`) REFERENCES `products`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `made_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`product_type` text NOT NULL,
	`measure` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`product_type`) REFERENCES `product_types`(`id`) ON UPDATE no action ON DELETE no action
);
