CREATE TABLE `writer_style` (
	`id` text PRIMARY KEY,
	`category` text NOT NULL,
	`observation` text NOT NULL,
	`confidence` integer DEFAULT 1 NOT NULL,
	`drama_id` text,
	`session_id` text,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `writer_style_category_idx` ON `writer_style` (`category`);