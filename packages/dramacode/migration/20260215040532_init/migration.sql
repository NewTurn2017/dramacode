CREATE TABLE `character` (
	`id` text PRIMARY KEY,
	`drama_id` text NOT NULL,
	`name` text NOT NULL,
	`role` text,
	`age` text,
	`occupation` text,
	`personality` text,
	`backstory` text,
	`arc` text,
	`relationships` text,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	CONSTRAINT `fk_character_drama_id_drama_id_fk` FOREIGN KEY (`drama_id`) REFERENCES `drama`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `drama` (
	`id` text PRIMARY KEY,
	`title` text NOT NULL,
	`logline` text,
	`genre` text,
	`setting` text,
	`tone` text,
	`total_episodes` integer,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `episode` (
	`id` text PRIMARY KEY,
	`drama_id` text NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`synopsis` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	CONSTRAINT `fk_episode_drama_id_drama_id_fk` FOREIGN KEY (`drama_id`) REFERENCES `drama`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `plot_point` (
	`id` text PRIMARY KEY,
	`drama_id` text NOT NULL,
	`episode_id` text,
	`type` text NOT NULL,
	`description` text NOT NULL,
	`resolved` integer DEFAULT false,
	`resolved_episode_id` text,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	CONSTRAINT `fk_plot_point_drama_id_drama_id_fk` FOREIGN KEY (`drama_id`) REFERENCES `drama`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_plot_point_episode_id_episode_id_fk` FOREIGN KEY (`episode_id`) REFERENCES `episode`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_plot_point_resolved_episode_id_episode_id_fk` FOREIGN KEY (`resolved_episode_id`) REFERENCES `episode`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `scene_character` (
	`scene_id` text NOT NULL,
	`character_id` text NOT NULL,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	CONSTRAINT `scene_character_pk` PRIMARY KEY(`scene_id`, `character_id`),
	CONSTRAINT `fk_scene_character_scene_id_scene_id_fk` FOREIGN KEY (`scene_id`) REFERENCES `scene`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_scene_character_character_id_character_id_fk` FOREIGN KEY (`character_id`) REFERENCES `character`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `scene` (
	`id` text PRIMARY KEY,
	`episode_id` text NOT NULL,
	`number` integer NOT NULL,
	`location` text,
	`time_of_day` text,
	`description` text,
	`dialogue` text,
	`notes` text,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	CONSTRAINT `fk_scene_episode_id_episode_id_fk` FOREIGN KEY (`episode_id`) REFERENCES `episode`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `world` (
	`id` text PRIMARY KEY,
	`drama_id` text NOT NULL,
	`category` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	CONSTRAINT `fk_world_drama_id_drama_id_fk` FOREIGN KEY (`drama_id`) REFERENCES `drama`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `message` (
	`id` text PRIMARY KEY,
	`session_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	CONSTRAINT `fk_message_session_id_session_id_fk` FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY,
	`title` text NOT NULL,
	`drama_id` text,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `character_drama_idx` ON `character` (`drama_id`);--> statement-breakpoint
CREATE INDEX `episode_drama_idx` ON `episode` (`drama_id`);--> statement-breakpoint
CREATE INDEX `plot_point_drama_idx` ON `plot_point` (`drama_id`);--> statement-breakpoint
CREATE INDEX `plot_point_episode_idx` ON `plot_point` (`episode_id`);--> statement-breakpoint
CREATE INDEX `scene_character_scene_idx` ON `scene_character` (`scene_id`);--> statement-breakpoint
CREATE INDEX `scene_character_character_idx` ON `scene_character` (`character_id`);--> statement-breakpoint
CREATE INDEX `scene_episode_idx` ON `scene` (`episode_id`);--> statement-breakpoint
CREATE INDEX `world_drama_idx` ON `world` (`drama_id`);--> statement-breakpoint
CREATE INDEX `message_session_idx` ON `message` (`session_id`);--> statement-breakpoint
CREATE INDEX `session_drama_idx` ON `session` (`drama_id`);