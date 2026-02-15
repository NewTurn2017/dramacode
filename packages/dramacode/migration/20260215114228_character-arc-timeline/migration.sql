CREATE TABLE `character_arc` (
	`id` text PRIMARY KEY,
	`drama_id` text NOT NULL,
	`character_id` text NOT NULL,
	`episode_id` text NOT NULL,
	`emotion` text NOT NULL,
	`intensity` integer NOT NULL,
	`description` text,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	CONSTRAINT `fk_character_arc_drama_id_drama_id_fk` FOREIGN KEY (`drama_id`) REFERENCES `drama`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_character_arc_character_id_character_id_fk` FOREIGN KEY (`character_id`) REFERENCES `character`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_character_arc_episode_id_episode_id_fk` FOREIGN KEY (`episode_id`) REFERENCES `episode`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `plot_point` ADD `linked_plot_id` text;--> statement-breakpoint
CREATE INDEX `character_arc_drama_idx` ON `character_arc` (`drama_id`);--> statement-breakpoint
CREATE INDEX `character_arc_character_idx` ON `character_arc` (`character_id`);--> statement-breakpoint
CREATE INDEX `character_arc_episode_idx` ON `character_arc` (`episode_id`);