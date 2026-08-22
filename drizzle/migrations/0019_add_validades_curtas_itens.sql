-- Create validades_curtas_itens table for storing ALL products with lot/expiry info
CREATE TABLE IF NOT EXISTS `validades_curtas_itens` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `codigo` int NOT NULL,
  `vcRegion` enum('SC','RS') NOT NULL,
  `vcTipoProduto` enum('medicamento','nao_medicamento') NOT NULL DEFAULT 'medicamento',
  `nomeProduto` varchar(255) NOT NULL,
  `fornecedor` varchar(255) NOT NULL,
  `codLote` varchar(64) NOT NULL,
  `vencimentoLote` date NOT NULL,
  `estoqueLote` int NOT NULL DEFAULT 0,
  `estoqueTotal` int NOT NULL DEFAULT 0,
  `vendaMedia` double NOT NULL DEFAULT 0,
  `valorCusto` double,
  `valorEstoqueCusto` double,
  `diasEstoque` double NOT NULL DEFAULT 0,
  `dataUltimaCompra` varchar(32),
  `syncedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE INDEX `vc_codigo_region_lote_uk` (`codigo`, `vcRegion`, `codLote`),
  INDEX `vc_region_idx` (`vcRegion`),
  INDEX `vc_vencimento_idx` (`vencimentoLote`),
  INDEX `vc_tipo_produto_idx` (`vcTipoProduto`),
  INDEX `vc_fornecedor_idx` (`fornecedor`)
);
