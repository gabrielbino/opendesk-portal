ALTER TABLE `users` MODIFY COLUMN `openId` varchar(64);--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `name` varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `email` varchar(320) NOT NULL;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `loginMethod` enum('internal','oauth') NOT NULL DEFAULT 'internal';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `lastSignedIn` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `approvalStatus` enum('pending','approved','rejected') DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `sector` enum('TI','RH','Financeiro','Comercial','Suporte','Operações','Outro') DEFAULT 'Outro';--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_email_unique` UNIQUE(`email`);