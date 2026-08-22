CREATE TABLE `backups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`filename` varchar(255) NOT NULL,
	`fileSize` bigint NOT NULL,
	`checksum` varchar(64) NOT NULL,
	`status` enum('completed','failed','in_progress') NOT NULL DEFAULT 'in_progress',
	`s3Key` varchar(512) NOT NULL,
	`s3Url` varchar(1024) NOT NULL,
	`tablesBackedUp` json,
	`recordCount` int NOT NULL DEFAULT 0,
	`createdAt` bigint NOT NULL,
	`createdBy` varchar(255) NOT NULL,
	CONSTRAINT `backups_id` PRIMARY KEY(`id`)
);
