CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(50) NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`category` varchar(100),
	`unit` varchar(20) NOT NULL DEFAULT 'UN',
	`minStock` int DEFAULT 0,
	`currentStock` int DEFAULT 0,
	`status` enum('Ativo','Inativo') NOT NULL DEFAULT 'Ativo',
	`requiresPrescription` boolean DEFAULT false,
	`notes` text,
	`createdById` int NOT NULL,
	`createdByName` varchar(255) NOT NULL,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `products_id` PRIMARY KEY(`id`),
	CONSTRAINT `products_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `purchaseOrderItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`purchaseOrderId` int NOT NULL,
	`productId` int NOT NULL,
	`productCode` varchar(50) NOT NULL,
	`productName` varchar(255) NOT NULL,
	`quantity` int NOT NULL,
	`unitPrice` int NOT NULL,
	`totalPrice` int NOT NULL,
	`receivedQuantity` int NOT NULL DEFAULT 0,
	`notes` text,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `purchaseOrderItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchaseOrders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderNumber` varchar(32) NOT NULL,
	`supplierId` int NOT NULL,
	`supplierName` varchar(255) NOT NULL,
	`status` enum('Rascunho','Pendente','Aprovado','Enviado','Recebido Parcial','Recebido','Cancelado') NOT NULL DEFAULT 'Rascunho',
	`totalAmount` int NOT NULL,
	`expectedDelivery` bigint,
	`actualDelivery` bigint,
	`paymentTerms` varchar(100),
	`notes` text,
	`approvedById` int,
	`approvedByName` varchar(255),
	`approvedAt` bigint,
	`createdById` int NOT NULL,
	`createdByName` varchar(255) NOT NULL,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `purchaseOrders_id` PRIMARY KEY(`id`),
	CONSTRAINT `purchaseOrders_orderNumber_unique` UNIQUE(`orderNumber`)
);
--> statement-breakpoint
CREATE TABLE `quotations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`quotationNumber` varchar(32) NOT NULL,
	`supplierId` int NOT NULL,
	`supplierName` varchar(255) NOT NULL,
	`productId` int NOT NULL,
	`productName` varchar(255) NOT NULL,
	`quantity` int NOT NULL,
	`unitPrice` int NOT NULL,
	`totalPrice` int NOT NULL,
	`deliveryDays` int,
	`status` enum('Pendente','Aprovada','Rejeitada','Expirada') NOT NULL DEFAULT 'Pendente',
	`validUntil` bigint,
	`notes` text,
	`createdById` int NOT NULL,
	`createdByName` varchar(255) NOT NULL,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `quotations_id` PRIMARY KEY(`id`),
	CONSTRAINT `quotations_quotationNumber_unique` UNIQUE(`quotationNumber`)
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`cnpj` varchar(18),
	`email` varchar(320),
	`phone` varchar(20),
	`address` text,
	`city` varchar(100),
	`state` varchar(2),
	`zipCode` varchar(10),
	`contactPerson` varchar(255),
	`status` enum('Ativo','Inativo','Bloqueado') NOT NULL DEFAULT 'Ativo',
	`notes` text,
	`createdById` int NOT NULL,
	`createdByName` varchar(255) NOT NULL,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `suppliers_id` PRIMARY KEY(`id`),
	CONSTRAINT `suppliers_cnpj_unique` UNIQUE(`cnpj`)
);
