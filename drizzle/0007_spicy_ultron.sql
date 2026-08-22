CREATE TABLE `permissionGroups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`permissions` json NOT NULL,
	`isDefault` boolean NOT NULL DEFAULT false,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `permissionGroups_id` PRIMARY KEY(`id`),
	CONSTRAINT `permissionGroups_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `groupId` int;