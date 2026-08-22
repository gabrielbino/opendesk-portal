CREATE TABLE `activities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticketId` int NOT NULL,
	`type` enum('status_change','priority_change','assignment','comment','created','sector_change') NOT NULL,
	`authorId` int NOT NULL,
	`authorName` varchar(255) NOT NULL,
	`oldValue` varchar(255),
	`newValue` varchar(255),
	`description` text,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `activities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `announcements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`content` text,
	`type` enum('info','warning','success','error') NOT NULL DEFAULT 'info',
	`isActive` int NOT NULL DEFAULT 1,
	`createdById` int NOT NULL,
	`createdAt` bigint NOT NULL,
	`expiresAt` bigint,
	CONSTRAINT `announcements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticketId` int NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`fileUrl` text NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`mimeType` varchar(128),
	`fileSize` int,
	`uploadedById` int NOT NULL,
	`uploadedByName` varchar(255) NOT NULL,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `attachments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticketId` int NOT NULL,
	`authorId` int NOT NULL,
	`authorName` varchar(255) NOT NULL,
	`content` text NOT NULL,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tickets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticketId` varchar(32) NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`category` enum('Técnico','Acesso','Funcionalidade','Dúvida','Outro') NOT NULL DEFAULT 'Técnico',
	`priority` enum('Baixa','Média','Alta','Crítica') NOT NULL DEFAULT 'Média',
	`status` enum('Aberto','Em Progresso','Aguardando','Resolvido','Fechado') NOT NULL DEFAULT 'Aberto',
	`sector` enum('TI','RH','Financeiro','Comercial','Suporte','Operações') NOT NULL DEFAULT 'TI',
	`createdById` int NOT NULL,
	`createdByName` varchar(255) NOT NULL,
	`assignedToId` int,
	`assignedToName` varchar(255),
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `tickets_id` PRIMARY KEY(`id`),
	CONSTRAINT `tickets_ticketId_unique` UNIQUE(`ticketId`)
);
