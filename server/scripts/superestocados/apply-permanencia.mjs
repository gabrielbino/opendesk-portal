/**
 * Schema da feature "estoque inicial por transferência + histórico de permanência"
 * do Superestocados. Idempotente.
 *
 * Uso: node server/scripts/superestocados/apply-permanencia.mjs
 *
 * Adiciona em `superestocados_produtos`:
 *   - painelEntradaEm  (data de entrada na permanência atual)
 *   - transfRecebidaAcum / transfEnviadaAcum (transferência nesta permanência)
 *   - transfProcessadaAte (controle: última data de transferência já aplicada)
 * E cria `superestocados_permanencia` (1 linha por passagem do produto pelo painel,
 * persiste mesmo após o produto sair).
 */

import "dotenv/config";
import mysql from "mysql2/promise";

async function colunaExiste(conn, tabela, coluna) {
  const [rows] = await conn.execute(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tabela, coluna],
  );
  return rows.length > 0;
}

async function addColuna(conn, coluna, ddl) {
  if (await colunaExiste(conn, "superestocados_produtos", coluna)) {
    console.log(`  • ${coluna} já existe`);
    return;
  }
  await conn.execute(`ALTER TABLE \`superestocados_produtos\` ADD COLUMN ${ddl}`);
  console.log(`  ✓ ${coluna} adicionada`);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não definida no .env. Aborte.");
    process.exit(1);
  }
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    console.log("→ Colunas em superestocados_produtos:");
    await addColuna(conn, "painelEntradaEm", "`painelEntradaEm` TIMESTAMP NULL DEFAULT NULL AFTER `estoqueAtual`");
    await addColuna(conn, "transfRecebidaAcum", "`transfRecebidaAcum` INT NOT NULL DEFAULT 0");
    await addColuna(conn, "transfEnviadaAcum", "`transfEnviadaAcum` INT NOT NULL DEFAULT 0");
    await addColuna(conn, "transfProcessadaAte", "`transfProcessadaAte` DATE NULL DEFAULT NULL");

    console.log("\n→ Tabela superestocados_permanencia:");
    await conn.execute(
      `CREATE TABLE IF NOT EXISTS \`superestocados_permanencia\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`codigo\` INT NOT NULL,
        \`region\` VARCHAR(8) NOT NULL,
        \`tipoProduto\` VARCHAR(32) NOT NULL,
        \`entrouEm\` TIMESTAMP NOT NULL,
        \`saiuEm\` TIMESTAMP NULL DEFAULT NULL,
        \`diasPermanencia\` INT NULL DEFAULT NULL,
        \`transfRecebida\` INT NOT NULL DEFAULT 0,
        \`transfEnviada\` INT NOT NULL DEFAULT 0,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`superestocados_permanencia_produto_idx\` (\`codigo\`, \`region\`, \`tipoProduto\`),
        KEY \`superestocados_permanencia_aberta_idx\` (\`codigo\`, \`region\`, \`tipoProduto\`, \`saiuEm\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    console.log("  ✓ superestocados_permanencia");

    console.log("\n✓ Schema de permanência aplicado com sucesso.");
  } catch (err) {
    console.error("\n✗ Falha:", err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();
