ALTER TABLE `stores` ADD `published_address` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `stores` ADD `published_city` text DEFAULT '' NOT NULL;--> statement-breakpoint
-- Until the next Price sync, what the Chain published is what Grocer has.
UPDATE `stores` SET `published_address` = `address`, `published_city` = `city`;