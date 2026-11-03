DROP INDEX `products_group_key_idx`;--> statement-breakpoint
ALTER TABLE `products` DROP COLUMN `group_key`;--> statement-breakpoint
ALTER TABLE `items` ADD `group_ref` text;