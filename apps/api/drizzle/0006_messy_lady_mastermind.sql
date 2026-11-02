ALTER TABLE `products` ADD `group_key` text;--> statement-breakpoint
CREATE INDEX `products_group_key_idx` ON `products` (`group_key`);