/**
 * Coluna `fornecedor` na Triagem do Pescador (API "fornecedor"). Idempotente.
 *
 * Uso: node server/scripts/pescador/apply-fornecedor.mjs
 *
 * O painel passa a exibir/filtrar por Fornecedor (antes usava o Fabricante/fantasia).
 * Depois de rodar, rodar o pescador-sync (ou o botão "Atualizar") pra popular.
 */

import "dotenv/config";
import mysql from "mysql2/promise";

async function colunaExiste(conn, coluna) {
  const [rows] = await conn.execute(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pescador_triagem' AND COLUMN_NAME = ?`,
    [coluna],
  );
  return rows.length > 0;
}

async function indiceExiste(conn, indice) {
  const [rows] = await conn.execute(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pescador_triagem' AND INDEX_NAME = ?`,
    [indice],
  );
  return rows.length > 0;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não definida no .env. Aborte.");
    process.exit(1);
  }
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    if (await colunaExiste(conn, "fornecedor")) {
      console.log("  • pescador_triagem.fornecedor já existe");
    } else {
      await conn.execute("ALTER TABLE `pescador_triagem` ADD COLUMN `fornecedor` VARCHAR(128) NULL DEFAULT NULL");
      console.log("  ✓ pescador_triagem.fornecedor adicionada");
    }

    if (await indiceExiste(conn, "pescador_triagem_fornecedor_idx")) {
      console.log("  • índice pescador_triagem_fornecedor_idx já existe");
    } else {
      await conn.execute("CREATE INDEX `pescador_triagem_fornecedor_idx` ON `pescador_triagem` (`fornecedor`)");
      console.log("  ✓ índice pescador_triagem_fornecedor_idx criado");
    }

    console.log("\n✓ Coluna fornecedor aplicada. Rode o pescador-sync pra popular.");
  } catch (err) {
    console.error("\n✗ Falha:", err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();
