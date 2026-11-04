CREATE TABLE `product_types` (
	`id` text PRIMARY KEY NOT NULL,
	`position` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `products` ADD `product_type` text REFERENCES product_types(id);--> statement-breakpoint
ALTER TABLE `sync_runs` ADD `products_typed` integer;--> statement-breakpoint
ALTER TABLE `sync_runs` ADD `products_other` integer;--> statement-breakpoint
ALTER TABLE `sync_runs` ADD `type_requests_failed` integer;