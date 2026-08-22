CREATE TABLE `projectComments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`authorId` int NOT NULL,
	`authorName` varchar(255) NOT NULL,
	`content` text NOT NULL,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `projectComments_id` PRIMARY KEY(`id`)
);
