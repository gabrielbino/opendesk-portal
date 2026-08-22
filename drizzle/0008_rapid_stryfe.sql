CREATE TABLE `dailyTasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`status` enum('Pendente','Em Andamento','Concluída') NOT NULL DEFAULT 'Pendente',
	`priority` enum('Baixa','Média','Alta','Crítica') NOT NULL DEFAULT 'Média',
	`assignedToId` int,
	`assignedToName` varchar(255),
	`dueDate` bigint,
	`completedAt` bigint,
	`createdById` int NOT NULL,
	`createdByName` varchar(255) NOT NULL,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `dailyTasks_id` PRIMARY KEY(`id`)
);
