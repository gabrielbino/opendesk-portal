/**
 * Gerências ocultas no painel completo (Envio de Parcial).
 *
 * Adiciona a coluna `gerentesOcultos` (JSON) em `parcial_envios`: lista de nomes
 * de gerência que NÃO devem aparecer no painel completo daquele envio (denylist).
 * Padrão: vazio = mostra todas as gerências que a consulta retornar.
 *
 * Uso:  node server/scripts/parcial/apply-gerentes-ocultos.mjs
 *
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
      `→ Aplicando gerentesOcultos em ${process.env.DATABASE_URL.replace(/:[^:@]+@/, ":***@")}…\n`,
    );

    const [col] = await conn.execute(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'parcial_envios' AND COLUMN_NAME = 'gerentesOcultos'`,
    );
    if (col.length === 0) {
      await conn.execute(
        "ALTER TABLE `parcial_envios` ADD COLUMN `gerentesOcultos` JSON NULL COMMENT 'gerências ocultas no painel completo (denylist)' AFTER `gerentes`",
      );
      console.log("  ✓ coluna gerentesOcultos criada");
    } else {
      console.log("  • coluna gerentesOcultos já existe — nada a fazer");
    }

    // Garante um default coerente (array vazio) onde estiver NULL.
    await conn.execute(
      "UPDATE `parcial_envios` SET `gerentesOcultos` = JSON_ARRAY() WHERE `gerentesOcultos` IS NULL",
    );

    console.log("\n✓ gerentesOcultos aplicado com sucesso.");
  } catch (err) {
    console.error("\n✗ Falha ao aplicar gerentesOcultos:", err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();
