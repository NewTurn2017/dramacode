CREATE TABLE `scrap` (
	`id` text PRIMARY KEY,
	`drama_id` text NOT NULL,
	`content` text NOT NULL,
	`memo` text,
	`source_session_id` text,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `scene` ADD `image` text;--> statement-breakpoint
ALTER TABLE `message` ADD `images` text;--> statement-breakpoint
CREATE INDEX `scrap_drama_idx` ON `scrap` (`drama_id`);