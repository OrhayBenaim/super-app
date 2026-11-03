DROP INDEX `prices_code_idx`;--> statement-breakpoint
CREATE INDEX `prices_code_store_price_idx` ON `prices` (`code`,`store_id`,`price`);