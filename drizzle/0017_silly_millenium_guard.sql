CREATE TABLE `purchasing_tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`status` enum('todo','quoting','awaiting_approval','ordered','received','completed') NOT NULL DEFAULT 'todo',
	`priority` enum('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
	`assignedToId` int,
	`tags` json,
	`dueDate` date,
	`position` int NOT NULL DEFAULT 0,
	`createdById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `purchasing_tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `status_idx` ON `purchasing_tasks` (`status`);--> statement-breakpoint
CREATE INDEX `assigned_to_idx` ON `purchasing_tasks` (`assignedToId`);