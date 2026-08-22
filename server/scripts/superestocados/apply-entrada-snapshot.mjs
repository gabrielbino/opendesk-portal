/**
 * Snapshot de entrada no painel de Superestocados. Idempotente.
 *
 * Uso: node server/scripts/superestocados/apply-entrada-snapshot.mjs
 *
 * Adiciona em `superestocados_produtos`:
 *   - diasEstoqueEntrada   (dias de estoque fixado quando o produto entrou no painel)
 *   - excessoEntradaReais  (excesso em R$ fixado na entrada — base da % de redução)
 *
 * ⚠️ Para os snapshots passarem a valer para TODOS os produtos, rode depois:
 *    reset-painel.mjs (limpa painel + permanência) e re-semeie pelo conector/API —
 *    aí todos "entram de novo" e o snapshot é gravado com os valores de hoje.
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
    console.log("→ Colunas de snapshot de entrada em superestocados_produtos:");
    await addColuna(conn, "diasEstoqueEntrada", "`diasEstoqueEntrada` INT NULL DEFAULT NULL AFTER `painelEntradaEm`");
    await addColuna(conn, "excessoEntradaReais", "`excessoEntradaReais` DOUBLE NULL DEFAULT NULL AFTER `diasEstoqueEntrada`");
    console.log("\n✓ Schema de snapshot de entrada aplicado com sucesso.");
  } catch (err) {
    console.error("\n✗ Falha:", err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();
