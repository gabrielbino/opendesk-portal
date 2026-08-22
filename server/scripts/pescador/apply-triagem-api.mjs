/**
 * Colunas novas da Triagem do Pescador para a integração com a API OpenDesk. Idempotente.
 *
 * Uso: node server/scripts/pescador/apply-triagem-api.mjs
 *
 * Adiciona em `pescador_triagem`:
 *   - dataD6..dataD15 / vendaD6..vendaD15 (janela completa de 15 dias úteis)
 *   - margem (API: "Margem")
 *   - precoPraticado (API: "Preco Final")
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
  if (await colunaExiste(conn, "pescador_triagem", coluna)) {
    console.log(`  • ${coluna} já existe`);
    return;
  }
  await conn.execute(`ALTER TABLE \`pescador_triagem\` ADD COLUMN ${ddl}`);
  console.log(`  ✓ ${coluna} adicionada`);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não definida no .env. Aborte.");
    process.exit(1);
  }
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    console.log("→ Colunas da janela D6–D15 em pescador_triagem:");
    for (let d = 6; d <= 15; d++) {
      await addColuna(conn, `dataD${d}`, `\`dataD${d}\` DATE NULL DEFAULT NULL`);
      await addColuna(conn, `vendaD${d}`, `\`vendaD${d}\` INT NULL DEFAULT 0`);
    }

    console.log("\n→ Margem, preço praticado e status de validade:");
    await addColuna(conn, "margem", "`margem` DOUBLE NULL DEFAULT NULL");
    await addColuna(conn, "precoPraticado", "`precoPraticado` DOUBLE NULL DEFAULT NULL");
    await addColuna(conn, "markup", "`markup` DOUBLE NULL DEFAULT NULL");
    await addColuna(conn, "valorUltimaCompraIpi", "`valorUltimaCompraIpi` DOUBLE NULL DEFAULT NULL");
    await addColuna(conn, "statusValidadeLote", "`statusValidadeLote` VARCHAR(32) NULL DEFAULT NULL");

    console.log("\n✓ Schema da Triagem (API) aplicado com sucesso.");
  } catch (err) {
    console.error("\n✗ Falha:", err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();
