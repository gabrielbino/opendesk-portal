/**
 * Cria as 5 tabelas Pescador no banco MySQL apontado por DATABASE_URL.
 *
 * Uso:
 *   node server/scripts/pescador-seed/apply-schema.mjs
 *
 * Idempotente: usa `CREATE TABLE IF NOT EXISTS`, então pode rodar múltiplas vezes.
 *
 * NOTA: criado para contornar o estado dessincronizado do drizzle-kit/_journal.json.
 * Quando o histórico de migrations for reconciliado (separadamente), este script
 * pode ser deletado — assim como o resto da pasta pescador-seed/.
 */

import "dotenv/config";
import mysql from "mysql2/promise";

const STATEMENTS = [
  /* ─── pescador_meta ─── */
  `CREATE TABLE IF NOT EXISTS \`pescador_meta\` (
    \`id\` INT NOT NULL AUTO_INCREMENT,
    \`geradoEm\` TIMESTAMP NOT NULL,
    \`estabelecimento\` VARCHAR(32) NOT NULL,
    \`cliente\` VARCHAR(64) NOT NULL,
    \`janela\` VARCHAR(128),
    \`totalTriagem\` INT NOT NULL DEFAULT 0,
    \`totalPedidos\` INT NOT NULL DEFAULT 0,
    \`totalHistorico\` INT NOT NULL DEFAULT 0,
    \`fonte\` VARCHAR(32) NOT NULL DEFAULT 'seed',
    \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  /* ─── pescador_triagem ─── */
  `CREATE TABLE IF NOT EXISTS \`pescador_triagem\` (
    \`id\` INT NOT NULL AUTO_INCREMENT,
    \`estabelecimento\` VARCHAR(16) NOT NULL,
    \`ean\` VARCHAR(32) NOT NULL,
    \`codInterno\` VARCHAR(32) NOT NULL,
    \`descricao\` VARCHAR(255) NOT NULL,
    \`fabricante\` VARCHAR(128),
    \`politica\` VARCHAR(96) NOT NULL,
    \`estoqueSc\` INT NOT NULL DEFAULT 0,
    \`custoCom\` DOUBLE,
    \`custoGer\` DOUBLE,
    \`curvaAbc\` VARCHAR(8),
    \`precoTabela\` DOUBLE,
    \`precoPromocional\` DOUBLE,
    \`descontoPerc\` DOUBLE,
    \`precoUnitario\` DOUBLE,
    \`origemPreco\` VARCHAR(32),
    \`giroMes\` DOUBLE,
    \`qtdVendidaMes\` INT DEFAULT 0,
    \`qtdVendidaMesAnterior\` INT DEFAULT 0,
    \`acompanhamento\` VARCHAR(32),
    \`dataD1\` DATE,
    \`vendaD1\` INT DEFAULT 0,
    \`dataD2\` DATE,
    \`vendaD2\` INT DEFAULT 0,
    \`dataD3\` DATE,
    \`vendaD3\` INT DEFAULT 0,
    \`dataD4\` DATE,
    \`vendaD4\` INT DEFAULT 0,
    \`dataD5\` DATE,
    \`vendaD5\` INT DEFAULT 0,
    \`codLote\` VARCHAR(64),
    \`loteEstoque\` INT DEFAULT 0,
    \`loteVencimento\` DATE,
    \`embalagem\` VARCHAR(32),
    \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`pescador_triagem_ean_politica_unique\` (\`ean\`, \`politica\`),
    KEY \`pescador_triagem_cod_interno_idx\` (\`codInterno\`),
    KEY \`pescador_triagem_fabricante_idx\` (\`fabricante\`),
    KEY \`pescador_triagem_politica_idx\` (\`politica\`),
    KEY \`pescador_triagem_curva_abc_idx\` (\`curvaAbc\`),
    KEY \`pescador_triagem_acompanhamento_idx\` (\`acompanhamento\`),
    KEY \`pescador_triagem_origem_preco_idx\` (\`origemPreco\`),
    KEY \`pescador_triagem_lote_vencimento_idx\` (\`loteVencimento\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  /* ─── pescador_pedidos ─── */
  `CREATE TABLE IF NOT EXISTS \`pescador_pedidos\` (
    \`id\` INT NOT NULL AUTO_INCREMENT,
    \`dataPedido\` DATE,
    \`numeroPedidoVenda\` VARCHAR(64) NOT NULL,
    \`codigoPedidoCliente\` VARCHAR(64),
    \`cnpjCliente\` VARCHAR(32),
    \`numeroDesdobramento\` INT,
    \`valorTotalPedido\` DOUBLE,
    \`motivoRejeicaoPedido\` VARCHAR(255),
    \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`pescador_pedidos_unique\` (\`cnpjCliente\`, \`codigoPedidoCliente\`, \`numeroDesdobramento\`),
    KEY \`pescador_pedidos_data_idx\` (\`dataPedido\`),
    KEY \`pescador_pedidos_cnpj_idx\` (\`cnpjCliente\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  /* ─── pescador_pedidos_itens ─── */
  `CREATE TABLE IF NOT EXISTS \`pescador_pedidos_itens\` (
    \`id\` INT NOT NULL AUTO_INCREMENT,
    \`pedidoId\` INT NOT NULL,
    \`codInterno\` VARCHAR(32) NOT NULL,
    \`ean\` VARCHAR(32),
    \`descricao\` VARCHAR(255),
    \`fabricante\` VARCHAR(128),
    \`politica\` VARCHAR(96),
    \`qtdSolicitada\` INT DEFAULT 0,
    \`qtdAtendida\` INT DEFAULT 0,
    \`statusAtendimento\` VARCHAR(32),
    \`motivoRejeicaoItem\` VARCHAR(255),
    \`precoUnitarioPedido\` DOUBLE,
    \`descontoPedidoPerc\` DOUBLE,
    \`valorTotalItemPedido\` DOUBLE,
    \`numeroNota\` VARCHAR(64),
    \`dataNota\` DATE,
    \`qtdFaturada\` INT DEFAULT 0,
    \`precoPraticadoNota\` DOUBLE,
    \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    KEY \`pescador_pedidos_itens_pedido_idx\` (\`pedidoId\`),
    KEY \`pescador_pedidos_itens_cod_interno_idx\` (\`codInterno\`),
    KEY \`pescador_pedidos_itens_status_idx\` (\`statusAtendimento\`),
    KEY \`pescador_pedidos_itens_motivo_idx\` (\`motivoRejeicaoItem\`),
    CONSTRAINT \`fk_pescador_pedidos_itens_pedido\` FOREIGN KEY (\`pedidoId\`) REFERENCES \`pescador_pedidos\`(\`id\`) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  /* ─── pescador_historico ─── */
  `CREATE TABLE IF NOT EXISTS \`pescador_historico\` (
    \`id\` INT NOT NULL AUTO_INCREMENT,
    \`estabelecimento\` VARCHAR(16) NOT NULL,
    \`numeroNota\` VARCHAR(64) NOT NULL,
    \`serieNota\` VARCHAR(16),
    \`dataEmissao\` DATE NOT NULL,
    \`layoutOrigem\` VARCHAR(64),
    \`pedidoVenda\` VARCHAR(64),
    \`seqItem\` INT NOT NULL,
    \`codInterno\` VARCHAR(32) NOT NULL,
    \`ean\` VARCHAR(32),
    \`descricao\` VARCHAR(255),
    \`fabricante\` VARCHAR(128),
    \`codLote\` VARCHAR(64),
    \`qtdFaturada\` INT DEFAULT 0,
    \`precoLiquido\` DOUBLE,
    \`valorStUnitario\` DOUBLE,
    \`precoFinal\` DOUBLE,
    \`descontoPerc\` DOUBLE,
    \`valorTotalItem\` DOUBLE,
    \`embalagem\` VARCHAR(32),
    \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`pescador_historico_unique\` (\`numeroNota\`, \`serieNota\`, \`seqItem\`),
    KEY \`pescador_historico_data_idx\` (\`dataEmissao\`),
    KEY \`pescador_historico_cod_interno_idx\` (\`codInterno\`),
    KEY \`pescador_historico_lote_idx\` (\`codLote\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não definida no .env. Aborte.");
    process.exit(1);
  }

  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  try {
    console.log(`→ Aplicando schema do Pescador em ${process.env.DATABASE_URL.replace(/:[^:@]+@/, ":***@")}…\n`);

    for (let i = 0; i < STATEMENTS.length; i++) {
      const sql = STATEMENTS[i];
      const match = sql.match(/CREATE TABLE IF NOT EXISTS `([^`]+)`/);
      const tableName = match ? match[1] : `statement #${i + 1}`;
      try {
        await conn.execute(sql);
        console.log(`  ✓ ${tableName}`);
      } catch (err) {
        console.error(`  ✗ ${tableName}: ${err.message}`);
        throw err;
      }
    }

    // ── Migração idempotente (2026-06-12): chave natural de pedidos ──
    // O UNIQUE antigo (numeroPedidoVenda, numeroDesdobramento) colapsava
    // pedidos rejeitados (NUMERO_PEDIDO_VENDA = '0'). Se a tabela existir
    // com o índice antigo, recria com a chave natural (CNPJ + CodPedCli +
    // Desdobramento). Após esta migração é OBRIGATÓRIO rodar o seed de novo.
    const [idxRows] = await conn.execute(
      `SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'pescador_pedidos'
         AND INDEX_NAME = 'pescador_pedidos_unique'
       GROUP BY INDEX_NAME`,
    );
    const idxCols = idxRows[0]?.cols ?? "";
    if (idxCols === "numeroPedidoVenda,numeroDesdobramento") {
      console.log("\n→ Índice antigo detectado em pescador_pedidos — migrando para chave natural…");
      // Dados de pedidos são 100% deriváveis do seed; trunca antes do ALTER
      // para evitar conflito de duplicatas ao criar o UNIQUE novo.
      await conn.execute("SET FOREIGN_KEY_CHECKS = 0");
      await conn.execute("TRUNCATE TABLE pescador_pedidos_itens");
      await conn.execute("TRUNCATE TABLE pescador_pedidos");
      await conn.execute("SET FOREIGN_KEY_CHECKS = 1");
      await conn.execute(`ALTER TABLE \`pescador_pedidos\` DROP INDEX \`pescador_pedidos_unique\``);
      await conn.execute(
        `ALTER TABLE \`pescador_pedidos\` ADD UNIQUE KEY \`pescador_pedidos_unique\` (\`cnpjCliente\`, \`codigoPedidoCliente\`, \`numeroDesdobramento\`)`,
      );
      console.log("  ✓ Índice migrado (tabelas de pedidos truncadas). Rode o seed novamente:");
      console.log("    node server/scripts/pescador-seed/seed.mjs");
    }

    console.log("\n✓ Schema do Pescador aplicado com sucesso.");
    console.log("Próximos passos:");
    console.log("  1. node server/scripts/pescador-seed/seed.mjs        (popular dados)");
    console.log("  2. node grant-pescador-admin.mjs                     (conceder permissão Admin)");
  } catch (err) {
    console.error("\n✗ Falha ao aplicar schema:", err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();
