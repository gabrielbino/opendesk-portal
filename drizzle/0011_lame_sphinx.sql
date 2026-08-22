CREATE TABLE `stockItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`category` enum('Computador','Monitor','Teclado','Mouse','Impressora','Notebook','Headset','Webcam','Hub USB','Cabo','Adaptador','Outro') NOT NULL DEFAULT 'Outro',
	`brand` varchar(100),
	`model` varchar(100),
	`serialNumber` varchar(100),
	`quantity` int NOT NULL DEFAULT 0,
	`minQuantity` int NOT NULL DEFAULT 5,
	`location` varchar(255),
	`status` enum('Disponível','Reservado','Em Manutenção','Descartado') NOT NULL DEFAULT 'Disponível',
	`unitPrice` decimal(10,2),
	`notes` text,
	`imageUrl` varchar(500),
	`createdById` int NOT NULL,
	`createdByName` varchar(255) NOT NULL,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `stockItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stockMovements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`stockItemId` int NOT NULL,
	`type` enum('Entrada','Saída','Ajuste','Solicitação') NOT NULL,
	`quantity` int NOT NULL,
	`previousQuantity` int NOT NULL,
	`newQuantity` int NOT NULL,
	`reason` text,
	`relatedTicketId` int,
	`performedById` int NOT NULL,
	`performedByName` varchar(255) NOT NULL,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `stockMovements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stockRequests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`stockItemId` int NOT NULL,
	`requestedQuantity` int NOT NULL,
	`justification` text,
	`status` enum('Pendente','Aprovado','Rejeitado','Entregue') NOT NULL DEFAULT 'Pendente',
	`ticketId` int,
	`requestedById` int NOT NULL,
	`requestedByName` varchar(255) NOT NULL,
	`approvedById` int,
	`approvedByName` varchar(255),
	`approvedAt` bigint,
	`deliveredAt` bigint,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `stockRequests_id` PRIMARY KEY(`id`)
);
