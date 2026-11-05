ALTER TABLE `products` ADD `store_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `products` SET `store_count` = (SELECT count(*) FROM `prices` WHERE `prices`.`code` = `products`.`code`);--> statement-breakpoint
CREATE INDEX `products_store_count_idx` ON `products` (store_count DESC,`code`);--> statement-breakpoint
CREATE INDEX `products_type_store_count_idx` ON `products` (`product_type`,store_count DESC,`code`);