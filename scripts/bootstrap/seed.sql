-- ============================================================================
-- OpenDesk — seed do banco do PORTAL (idempotente). Roda DEPOIS de schema.sql.
-- No docker-compose o MySQL usa MYSQL_DATABASE=opendesk, então o banco padrão já
-- é `opendesk` (não precisa de USE). Para rodar à mão: mysql ... opendesk < seed.sql
-- ============================================================================

-- ── Singletons de configuração (o app faz UPDATE nessas linhas; sem elas, fica "vazio") ──
INSERT IGNORE INTO `monarq_coletor` (`id`) VALUES (1);
INSERT IGNORE INTO `monarq_backup_config` (`id`, `extensoesZip`) VALUES (1, '["._rm"]');
INSERT IGNORE INTO `monarq_wa_conta` (`id`, `nome`) VALUES ('monitor', 'Monitor de Integrações');
INSERT IGNORE INTO `monarq_resumo_config` (`id`, `diasSemana`) VALUES (1, '[1,2,3,4,5]');
INSERT IGNORE INTO `monarq_alerta_tela_config` (`id`, `ativo`, `destinatarioIds`) VALUES (1, TRUE, '[]');
INSERT IGNORE INTO `parcial_estado` (`id`, `medias`, `horariosPadrao`) VALUES (1, '{}', '{}');
INSERT IGNORE INTO `parcial_qr` (`id`) VALUES (1);
INSERT IGNORE INTO `parcial_imagem` (`id`) VALUES (1);

-- ── Admin de demonstração (login: admin@opendesk.local / admin123) ──
-- Hash bcrypt de "admin123" (custo 10). Troque a senha após o primeiro acesso.
INSERT IGNORE INTO `sys_usuarios`
  (`name`, `email`, `passwordHash`, `loginMethod`, `role`, `approvalStatus`, `enabled`, `permissions`)
VALUES
  ('Administrador Demo', 'admin@opendesk.local',
   '$2b$10$Zn0drd1imIYq9GR8z8AOQOYZpoXCnyzTS6911yYTo9pp9DamLRP32',
   'internal', 'admin', 'approved', 1, '[]');

-- ── Departamentos de exemplo ──
INSERT IGNORE INTO `sys_departamentos` (`name`) VALUES
  ('Tecnologia'), ('Suporte'), ('Comercial'), ('Financeiro'), ('Operações');
