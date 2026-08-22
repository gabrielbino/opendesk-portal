-- Adicionar campos de campanha na tabela superestocados_produtos
ALTER TABLE `superestocados_produtos` ADD COLUMN `campanhaDescricao` text;
ALTER TABLE `superestocados_produtos` ADD COLUMN `campanhaInicio` date;
ALTER TABLE `superestocados_produtos` ADD COLUMN `campanhaFim` date;
ALTER TABLE `superestocados_produtos` ADD COLUMN `campanhaObservacao` text;

-- Criar tabela de histórico de campanhas
CREATE TABLE IF NOT EXISTS `superestocados_campanha_historico` (
  `id` int AUTO_INCREMENT NOT NULL,
  `superestoqueId` int NOT NULL,
  `descricao` text NOT NULL,
  `dataInicio` date,
  `dataFim` date,
  `criadoEm` timestamp NOT NULL DEFAULT (now()),
  `finalizadoEm` timestamp,
  CONSTRAINT `superestocados_campanha_historico_id` PRIMARY KEY(`id`),
  CONSTRAINT `campanha_hist_superestoque_fk` FOREIGN KEY (`superestoqueId`) REFERENCES `superestocados_produtos`(`id`) ON DELETE CASCADE
);

CREATE INDEX `campanha_hist_superestoque_idx` ON `superestocados_campanha_historico` (`superestoqueId`);
CREATE INDEX `campanha_hist_criado_idx` ON `superestocados_campanha_historico` (`criadoEm`);
