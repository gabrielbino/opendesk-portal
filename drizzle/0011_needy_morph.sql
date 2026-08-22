CREATE TABLE `departments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `departments_id` PRIMARY KEY(`id`),
	CONSTRAINT `departments_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `departmentId` int;--> statement-breakpoint
CREATE INDEX `name_idx` ON `departments` (`name`);--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `sector`;