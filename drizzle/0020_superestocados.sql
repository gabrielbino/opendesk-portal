-- Tabela de superestoque (medicamentos em excesso por região)
CREATE TABLE IF NOT EXISTS `superestoque` (
  `id` int AUTO_INCREMENT NOT NULL,
  `codigo` int NOT NULL,
  `superestoqueRegion` enum('SC','RS') NOT NULL,
  `nomeProduto` varchar(255) NOT NULL,
  `fornecedor` varchar(255) NOT NULL,
  `diasEstoque` int NOT NULL DEFAULT 0,
  `estoqueInicial` int NOT NULL,
  `estoqueAtual` int NOT NULL,
  `valorCusto` double,
  `vendaMedia` double NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `superestoque_id` PRIMARY KEY(`id`),
  CONSTRAINT `superestoque_codigo_region_unique` UNIQUE(`codigo`,`superestoqueRegion`)
);

CREATE INDEX `superestoque_region_idx` ON `superestoque` (`superestoqueRegion`);
CREATE INDEX `superestoque_nome_produto_idx` ON `superestoque` (`nomeProduto`);

-- Tabela de histórico de vendas (vinculada ao superestoque)
CREATE TABLE IF NOT EXISTS `historicoVendas` (
  `id` int AUTO_INCREMENT NOT NULL,
  `superestoqueId` int NOT NULL,
  `dataVenda` date NOT NULL,
  `quantidade` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `historicoVendas_id` PRIMARY KEY(`id`),
  CONSTRAINT `historico_vendas_superestoque_data_unique` UNIQUE(`superestoqueId`,`dataVenda`),
  CONSTRAINT `historicoVendas_superestoqueId_superestoque_id_fk` FOREIGN KEY (`superestoqueId`) REFERENCES `superestoque`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX `historico_vendas_superestoque_idx` ON `historicoVendas` (`superestoqueId`);
CREATE INDEX `historico_vendas_data_idx` ON `historicoVendas` (`dataVenda`);
