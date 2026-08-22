CREATE TABLE `kanban_column_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`module` varchar(50) NOT NULL,
	`columnKey` varchar(50) NOT NULL,
	`customName` varchar(100) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `kanban_column_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `user_module_column_idx` ON `kanban_column_settings` (`userId`,`module`,`columnKey`);