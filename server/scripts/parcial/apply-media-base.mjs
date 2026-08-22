/**
 * Base da Média diária de Venda (Envio de Parcial).
 *
 * Adiciona a coluna `mediaBaseTodos` (BOOLEAN) em `parcial_envios`: define se as
 * imagens somam a Média diária de Venda de **todos os vendedores da área** (padrão,
 * = planilha) ou **só dos que têm pedido** no momento da consulta.
 *
 * - TRUE  (padrão): painel completo soma todos os vendedores por gerência (já era assim)
 *                   e o recorte por área LISTA todos os vendedores (sem pedido = "R$ -").
 * - FALSE: painel e recorte consideram só os RCAs com pedido no momento.
 *
 * Uso:  node server/scripts/parcial/apply-media-base.mjs
 * Idempotente: só adiciona a coluna se ainda não existir.
 */

import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não definida no .env. Aborte.");
    process.exit(1);
  }

  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  try {
    console.log(
      `→ Aplicando mediaBaseTodos em ${process.env.DATABASE_URL.replace(/:[^:@]+@/, ":***@")}…\n`,
    );

    const [col] = await conn.execute(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'parcial_envios' AND COLUMN_NAME = 'mediaBaseTodos'`,
    );
    if (col.length === 0) {
      await conn.execute(
        "ALTER TABLE `parcial_envios` ADD COLUMN `mediaBaseTodos` BOOLEAN NOT NULL DEFAULT TRUE COMMENT 'Média soma todos os vendedores da área (true) ou só os com pedido (false)' AFTER `gerentesVisiveis`",
      );
      console.log("  ✓ coluna mediaBaseTodos criada (padrão TRUE)");
    } else {
      console.log("  • coluna mediaBaseTodos já existe — nada a fazer");
    }

    console.log("\n✓ mediaBaseTodos aplicado com sucesso.");
  } catch (err) {
    console.error("\n✗ Falha ao aplicar mediaBaseTodos:", err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();
