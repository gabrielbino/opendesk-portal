CREATE TABLE `notificationPreferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`stockCriticalAlert` boolean NOT NULL DEFAULT true,
	`stockLowAlert` boolean NOT NULL DEFAULT true,
	`requestApproved` boolean NOT NULL DEFAULT true,
	`requestRejected` boolean NOT NULL DEFAULT true,
	`requestDelivered` boolean NOT NULL DEFAULT true,
	`requestPending` boolean NOT NULL DEFAULT false,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `notificationPreferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `notificationPreferences_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`type` enum('stock_critical','stock_low','request_approved','request_rejected','request_delivered','request_pending') NOT NULL,
	`title` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`relatedEntityType` enum('stock_item','stock_request','ticket'),
	`relatedEntityId` int,
	`isRead` boolean NOT NULL DEFAULT false,
	`actionUrl` varchar(500),
	`createdAt` bigint NOT NULL,
	`readAt` bigint,
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
