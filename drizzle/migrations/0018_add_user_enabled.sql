-- Add enabled column to sys_usuarios for disable/enable user functionality
ALTER TABLE sys_usuarios ADD COLUMN IF NOT EXISTS `enabled` boolean NOT NULL DEFAULT true;
