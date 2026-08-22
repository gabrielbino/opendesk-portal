CREATE TABLE `projectPhases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`status` enum('Pendente','Em Andamento','Concluída','Atrasada') NOT NULL DEFAULT 'Pendente',
	`order` int NOT NULL,
	`startDate` bigint,
	`endDate` bigint,
	`completedAt` bigint,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `projectPhases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` varchar(32) NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`status` enum('Planejamento','Em Andamento','Em Pausa','Concluído','Cancelado') NOT NULL DEFAULT 'Planejamento',
	`priority` enum('Baixa','Média','Alta','Crítica') NOT NULL DEFAULT 'Média',
	`ownerId` int NOT NULL,
	`ownerName` varchar(255) NOT NULL,
	`sector` enum('TI','RH','Financeiro','Comercial','Suporte','Operações') NOT NULL DEFAULT 'TI',
	`startDate` bigint,
	`endDate` bigint,
	`progress` int NOT NULL DEFAULT 0,
	`createdById` int NOT NULL,
	`createdByName` varchar(255) NOT NULL,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`),
	CONSTRAINT `projects_projectId_unique` UNIQUE(`projectId`)
);
