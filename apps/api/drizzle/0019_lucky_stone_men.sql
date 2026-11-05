CREATE TABLE `browse_group_data` (
	`id` integer PRIMARY KEY NOT NULL,
	`group_types` blob NOT NULL,
	`group_stores` blob NOT NULL
);
--> statement-breakpoint
CREATE TABLE `browse_names` (
	`id` integer PRIMARY KEY NOT NULL,
	`names` blob NOT NULL,
	`name_ends` blob NOT NULL
);
--> statement-breakpoint
INSERT INTO `browse_group_data` (`id`, `group_types`, `group_stores`) SELECT `id`, `group_types`, `group_stores` FROM `browse_catalog`;--> statement-breakpoint
INSERT INTO `browse_names` (`id`, `names`, `name_ends`) SELECT `id`, `names`, `name_ends` FROM `browse_catalog`;--> statement-breakpoint
ALTER TABLE `browse_catalog` DROP COLUMN `group_types`;--> statement-breakpoint
ALTER TABLE `browse_catalog` DROP COLUMN `group_stores`;--> statement-breakpoint
ALTER TABLE `browse_catalog` DROP COLUMN `names`;--> statement-breakpoint
ALTER TABLE `browse_catalog` DROP COLUMN `name_ends`;