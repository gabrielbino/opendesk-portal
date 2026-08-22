-- Responsibility Tags - Categories/Tags for responsibilities
CREATE TABLE IF NOT EXISTS `responsibility_tags` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `name` varchar(100) NOT NULL UNIQUE,
  `description` text,
  `color` varchar(7) NOT NULL DEFAULT '#3b82f6',
  `icon` varchar(50),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `tag_name_idx` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Person Responsibilities - Vincula pessoas a responsabilidades
CREATE TABLE IF NOT EXISTS `person_responsibilities` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL,
  `tagId` int NOT NULL,
  `level` enum('junior','pleno','senior','especialista') NOT NULL DEFAULT 'pleno',
  `isPrimary` boolean NOT NULL DEFAULT false,
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `person_resp_user_idx` (`userId`),
  KEY `person_resp_tag_idx` (`tagId`),
  KEY `person_resp_user_tag_idx` (`userId`, `tagId`),
  FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`tagId`) REFERENCES `responsibility_tags` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ticket Responsibilities - Vincula chamados a pessoas responsáveis
CREATE TABLE IF NOT EXISTS `ticket_responsibilities` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `ticketId` int NOT NULL,
  `userId` int NOT NULL,
  `role` enum('primary','secondary','reviewer') NOT NULL DEFAULT 'primary',
  `isActive` boolean NOT NULL DEFAULT true,
  `estimatedHours` int,
  `actualHours` int,
  `notes` text,
  `assignedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `ticket_resp_ticket_idx` (`ticketId`),
  KEY `ticket_resp_user_idx` (`userId`),
  KEY `ticket_resp_ticket_user_idx` (`ticketId`, `userId`),
  KEY `ticket_resp_active_idx` (`isActive`),
  FOREIGN KEY (`ticketId`) REFERENCES `tickets` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Task Responsibilities - Vincula tarefas a pessoas responsáveis
CREATE TABLE IF NOT EXISTS `task_responsibilities` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `taskId` int NOT NULL,
  `userId` int NOT NULL,
  `role` enum('owner','collaborator') NOT NULL DEFAULT 'owner',
  `isActive` boolean NOT NULL DEFAULT true,
  `estimatedHours` int,
  `actualHours` int,
  `notes` text,
  `assignedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `task_resp_task_idx` (`taskId`),
  KEY `task_resp_user_idx` (`userId`),
  KEY `task_resp_task_user_idx` (`taskId`, `userId`),
  KEY `task_resp_active_idx` (`isActive`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Responsibility History - Auditoria de mudanças em responsabilidades
CREATE TABLE IF NOT EXISTS `responsibility_history` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `changeType` enum('created','updated','deleted','assigned','unassigned') NOT NULL,
  `entityType` enum('tag','person_responsibility','ticket_responsibility','task_responsibility') NOT NULL,
  `entityId` int NOT NULL,
  `changedById` int NOT NULL,
  `changedByName` varchar(255) NOT NULL,
  `oldValues` json,
  `newValues` json,
  `description` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `history_entity_idx` (`entityType`, `entityId`),
  KEY `history_user_idx` (`changedById`),
  KEY `history_created_at_idx` (`createdAt`),
  FOREIGN KEY (`changedById`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
