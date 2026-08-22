/**
 * Schema do retrato semanal de Superestocados (Valor imobilizado + evolução). Idempotente.
 *
 * Uso: node server/scripts/superestocados/apply-resumo-semanal.mjs
 *
 * Cria/atualiza:
 *   - superestocados_resumo_semanal → 1 linha por (região, semana ISO).
 *   - Colunas por TIPO (valor por balde) p/ a faixa das 4 semanas ficar dinâmica conforme
 *     o filtro de tipo do painel. NULL = semana capturada antes deste recorte (sem dado por
 *     tipo); o total (`valorEstoqueTotal`) continua completo para a visão Unificada.
 */

import "dotenv/config";
import mysql from "mysql2/promise";

const COLUNAS_TIPO = [
  "valorMedicamento",
  "valorMedicamentoZerado",
  "valorNaoMedicamento",
  "valorNaoMedicamentoZerado",
];

/** Adiciona a coluna se ainda não existir (idempotente; ALTER ADD COLUMN não é IF NOT EXISTS em todo MySQL). */
async function addColumnIfMissing(conn, table, column, ddl) {
  const [rows] = await conn.execute(
    `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  if (Number(rows?.[0]?.n ?? 0) > 0) {
    console.log(`  = ${table}.${column} (já existe)`);
    return;
  }
  await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${ddl}`);
  console.log(`  + ${table}.${column}`);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não definida no .env. Aborte.");
    process.exit(1);
  }
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    console.log("→ superestocados_resumo_semanal");
    await conn.execute(
      `CREATE TABLE IF NOT EXISTS \`superestocados_resumo_semanal\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`region\` ENUM('SC','RS') NOT NULL,
        \`anoSemana\` VARCHAR(8) NOT NULL,
        \`valorEstoqueTotal\` DOUBLE NOT NULL DEFAULT 0,
        \`qtdProdutos\` INT NOT NULL DEFAULT 0,
        \`valorMedicamento\` DOUBLE NULL,
        \`valorMedicamentoZerado\` DOUBLE NULL,
        \`valorNaoMedicamento\` DOUBLE NULL,
        \`valorNaoMedicamentoZerado\` DOUBLE NULL,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`superestocados_resumo_semanal_region_semana_unique\` (\`region\`, \`anoSemana\`),
        KEY \`superestocados_resumo_semanal_region_idx\` (\`region\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    console.log("  ✓ superestocados_resumo_semanal");

    // Tabela pode já existir sem as colunas por tipo → adiciona idempotente.
    for (const col of COLUNAS_TIPO) await addColumnIfMissing(conn, "superestocados_resumo_semanal", col, "DOUBLE NULL");

    console.log("\n✓ Schema do resumo semanal aplicado com sucesso.");
  } catch (err) {
    console.error("\n✗ Falha:", err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();
