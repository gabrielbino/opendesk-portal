-- ============================================================================
-- OpenDesk — demo-erp: banco "ERP de cliente" sintético.
-- Alimenta as queries nomeadas (ver services/demo-erp/queries.json) que os
-- painéis do portal consomem. Dados FICTÍCIOS, gerados para cobrir os estados
-- interessantes: zerados (Rupturas), alto giro (Superestocados), validade curta
-- (Validades Curtas), pedidos por rede (Indicadores) e CNPJs (Associativismo).
--
-- Rodar (banco de dev já de pé):
--   docker exec -i opendesk-dev-mysql mysql -uroot -pdev < services/demo-erp/seed.sql
-- ============================================================================

CREATE DATABASE IF NOT EXISTS demo_erp CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
USE demo_erp;

DROP TABLE IF EXISTS erp_vendas;
DROP TABLE IF EXISTS erp_produtos;
DROP TABLE IF EXISTS erp_pedidos_layout;
DROP TABLE IF EXISTS erp_grupo_clientes;

-- ─────────────────────────── Produtos / estoque ───────────────────────────
CREATE TABLE erp_produtos (
  codigo INT PRIMARY KEY,
  cod_estabe INT NOT NULL,                    -- 1 = SC, 2 = RS
  nome VARCHAR(160) NOT NULL,
  categoria VARCHAR(40) NOT NULL,             -- 'Medicamentos' | 'Outros'
  fornecedor VARCHAR(120) NOT NULL,           -- razão social (marca)
  fabricante VARCHAR(120) NOT NULL,           -- fantasia
  qtd_estoque INT NOT NULL,
  dias_estoque DECIMAL(10,2) NOT NULL,
  venda_media_mes DECIMAL(10,2) NOT NULL,
  custo_medio_liquido DECIMAL(12,4) NOT NULL,
  valor_estoque_custo DECIMAL(14,2) NOT NULL,
  data_ultima_compra DATE NULL,
  lote VARCHAR(30) NULL,
  validade_lote DATE NULL,
  estoque_lote INT NULL,
  data_ultima_transferencia DATE NULL,
  qtd_venda_mes_atual INT NOT NULL,
  qtd_venda_mes_anterior INT NOT NULL,
  qtd_venda_2m_anterior INT NOT NULL,
  qtd_projetado_mes_atual INT NOT NULL,
  preco_politica DECIMAL(12,4) NULL
) ENGINE=InnoDB;

INSERT INTO erp_produtos
WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n < 80)
SELECT
  1000 + n AS codigo,
  IF(n <= 50, 1, 2) AS cod_estabe,
  CONCAT(
    ELT(1 + MOD(n,10),'DIPIRONA','PARACETAMOL','AMOXICILINA','OMEPRAZOL','LOSARTANA',
                       'METFORMINA','IBUPROFENO','VITAMINA C','DICLOFENACO','AZITROMICINA'),
    ' ',
    ELT(1 + MOD(n,4),'500MG','750MG','20CPR','1G')
  ) AS nome,
  IF(MOD(n,6)=0,'Outros','Medicamentos') AS categoria,
  ELT(1 + MOD(n,6),'EMS S.A.','MEDLEY FARMA LTDA','EUROFARMA LABS','NEO QUIMICA','LABORATORIO ACHE','SANOFI MEDLEY') AS fornecedor,
  ELT(1 + MOD(n,6),'EMS','MEDLEY','EUROFARMA','NEOQUIMICA','ACHE','SANOFI') AS fabricante,
  -- Estoque em UNIDADES: bucket 0 (zerado), alto (superestocado) ou normal.
  CASE WHEN MOD(n,7)=0 THEN 0
       WHEN MOD(n,7) IN (1,2) THEN 800 + (n*7)
       ELSE 40 + MOD(n*3,120) END AS qtd_estoque,
  -- Dias de estoque: 0 (ruptura), alto (superestocado) ou normal.
  CASE WHEN MOD(n,7)=0 THEN 0.00
       WHEN MOD(n,7) IN (1,2) THEN 210.00 + MOD(n*11,180)
       ELSE 6.00 + MOD(n*2,28) END AS dias_estoque,
  5 + MOD(n*3,60) AS venda_media_mes,
  ROUND(2.50 + MOD(n*7,90) + (n%10)/10, 4) AS custo_medio_liquido,
  0 AS valor_estoque_custo,  -- preenchido abaixo
  DATE_SUB(CURDATE(), INTERVAL MOD(n*5,150) DAY) AS data_ultima_compra,
  CONCAT('L', 1000 + n) AS lote,
  -- Validade: alguns bem curtos (validades curtas), maioria longa.
  CASE WHEN MOD(n,7) IN (1,2) THEN DATE_ADD(CURDATE(), INTERVAL (15 + MOD(n*13,150)) DAY)
       ELSE DATE_ADD(CURDATE(), INTERVAL (200 + MOD(n*17,500)) DAY) END AS validade_lote,
  GREATEST(0, CASE WHEN MOD(n,7)=0 THEN 0 WHEN MOD(n,7) IN (1,2) THEN 800 + (n*7) ELSE 40 + MOD(n*3,120) END - MOD(n,15)) AS estoque_lote,
  DATE_SUB(CURDATE(), INTERVAL MOD(n*2,40) DAY) AS data_ultima_transferencia,
  5 + MOD(n*3,55) AS qtd_venda_mes_atual,
  6 + MOD(n*4,60) AS qtd_venda_mes_anterior,
  4 + MOD(n*5,50) AS qtd_venda_2m_anterior,
  5 + MOD(n*3,58) AS qtd_projetado_mes_atual,
  ROUND((2.50 + MOD(n*7,90)) * 1.35, 4) AS preco_politica
FROM seq;

UPDATE erp_produtos SET valor_estoque_custo = ROUND(qtd_estoque * custo_medio_liquido, 2);
-- Zerados não têm lote/validade coerentes:
UPDATE erp_produtos SET lote = NULL, validade_lote = NULL, estoque_lote = NULL WHERE qtd_estoque = 0;

-- ─────────────────────────── Vendas por dia (15 dias) ───────────────────────────
CREATE TABLE erp_vendas (
  cod_estabe INT NOT NULL,
  cod_produto INT NOT NULL,
  descricao_produto VARCHAR(160) NOT NULL,
  data DATE NOT NULL,
  qtd_venda INT NOT NULL,
  quantidade_saida INT NOT NULL,
  quantidade_entrada INT NOT NULL,
  KEY (cod_estabe, cod_produto, data)
) ENGINE=InnoDB;

INSERT INTO erp_vendas (cod_estabe, cod_produto, descricao_produto, data, qtd_venda, quantidade_saida, quantidade_entrada)
WITH RECURSIVE d(k) AS (SELECT 0 UNION ALL SELECT k+1 FROM d WHERE k < 14)
SELECT
  p.cod_estabe, p.codigo, p.nome,
  DATE_SUB(CURDATE(), INTERVAL d.k DAY) AS data,
  GREATEST(0, FLOOR(p.venda_media_mes/22 * (0.4 + (MOD(p.codigo + d.k, 10)/10)))) AS qtd_venda,
  GREATEST(0, FLOOR(p.venda_media_mes/22 * (0.4 + (MOD(p.codigo + d.k, 10)/10)))) AS quantidade_saida,
  IF(MOD(p.codigo + d.k, 6)=0, 30, 0) AS quantidade_entrada
FROM erp_produtos p CROSS JOIN d
WHERE p.qtd_estoque > 0;

-- ─────────────────────────── Pedidos por rede/layout (hoje) ───────────────────────────
CREATE TABLE erp_pedidos_layout (
  estado VARCHAR(2) NOT NULL,
  layout VARCHAR(60) NOT NULL,
  status VARCHAR(12) NOT NULL,          -- 'aceito' | 'cortado'
  qt_ped INT NOT NULL,
  vl_pedido DECIMAL(14,2) NOT NULL,
  dt_hora DATETIME NOT NULL
) ENGINE=InnoDB;

INSERT INTO erp_pedidos_layout (estado, layout, status, qt_ped, vl_pedido, dt_hora) VALUES
 ('SC','REDE CLAMED','aceito', 42, 128500.00, CONCAT(CURDATE(),' 09:12:00')),
 ('SC','FARMA PONTE','aceito', 18,  54230.00, CONCAT(CURDATE(),' 10:41:00')),
 ('SC','DROGA SUL','aceito',   27,  81900.00, CONCAT(CURDATE(),' 08:55:00')),
 ('SC','PANVEL SC','aceito',   9,   22100.00, CONCAT(CURDATE(),' 11:20:00')),
 ('SC','SÃO JOÃO SC','aceito', 33,  99750.00, CONCAT(CURDATE(),' 07:48:00')),
 ('SC','REDE CLAMED','cortado', 4,  9800.00,  CONCAT(CURDATE(),' 09:30:00')),
 ('SC','DROGA SUL','cortado',   2,  5400.00,  CONCAT(CURDATE(),' 09:05:00')),
 ('RS','PANVEL RS','aceito',   51, 176300.00, CONCAT(CURDATE(),' 09:02:00')),
 ('RS','SÃO JOÃO RS','aceito', 44, 151200.00, CONCAT(CURDATE(),' 08:30:00')),
 ('RS','AGAFARMA','aceito',    12,  36700.00, CONCAT(CURDATE(),' 10:15:00')),
 ('RS','ASSOCIADOS RS','aceito',7,  15400.00, CONCAT(CURDATE(),' 11:50:00')),
 ('RS','PANVEL RS','cortado',   6, 18900.00,  CONCAT(CURDATE(),' 09:22:00')),
 ('RS','AGAFARMA','cortado',    1,  2100.00,  CONCAT(CURDATE(),' 10:20:00'));

-- ─────────────────────────── Grupos de clientes (associativismo) ───────────────────────────
CREATE TABLE erp_grupo_clientes (
  cnpj VARCHAR(14) PRIMARY KEY,
  cod_grupo INT NOT NULL,
  des_grupo VARCHAR(80) NOT NULL
) ENGINE=InnoDB;

INSERT INTO erp_grupo_clientes (cnpj, cod_grupo, des_grupo)
WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n < 45)
SELECT
  LPAD(CAST(10000000000000 + n*37 AS CHAR), 14, '0') AS cnpj,
  1 + MOD(n,4) AS cod_grupo,
  ELT(1 + MOD(n,4),'ASSOCIACAO ALFA','REDE BETA FARMA','GRUPO GAMA SAUDE','COOP DELTA') AS des_grupo
FROM seq;
