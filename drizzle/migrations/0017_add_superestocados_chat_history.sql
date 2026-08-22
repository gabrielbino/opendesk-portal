-- Criar tabela de histórico de chat do assistente IA de Superestocados
CREATE TABLE IF NOT EXISTS `superestocados_chat_history` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `region` enum('SC','RS') NOT NULL,
  `messages` json NOT NULL,
  `title` varchar(255),
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `superestocados_chat_history_id` PRIMARY KEY(`id`),
  CONSTRAINT `fk_chat_history_user` FOREIGN KEY (`userId`) REFERENCES `sys_usuarios`(`id`) ON DELETE CASCADE
);

CREATE INDEX `chat_history_user_region_idx` ON `superestocados_chat_history` (`userId`, `region`);
CREATE INDEX `chat_history_created_at_idx` ON `superestocados_chat_history` (`createdAt`);
