-- Migration: Add dataCadastroProduto, statusCampanha, estoqueIdealCongelado to superestoque
ALTER TABLE `superestoque` ADD COLUMN `dataCadastroProduto` VARCHAR(32) DEFAULT NULL;
ALTER TABLE `superestoque` ADD COLUMN `statusCampanha` ENUM('nao_participa', 'em_campanha') NOT NULL DEFAULT 'nao_participa';
ALTER TABLE `superestoque` ADD COLUMN `estoqueIdealCongelado` INT DEFAULT NULL;
