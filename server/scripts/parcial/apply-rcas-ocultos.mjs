/**
 * RCAs ocultos por área no recorte (Envio de Parcial).
 *
 * Adiciona duas colunas em `parcial_envios`:
 *  - `rcasOcultos` (JSON): denylist de RCAs (nome de guerra) que NÃO aparecem no
 *    recorte por área. Vazio/NULL = todos visíveis. RCA novo entra visível.
 *  - `mediasGerenteRca` (JSON): {gerencia: {rca: media}} publicado pelo bot — fonte
 *    dos checkboxes de RCA por área no portal (read-only no portal).
 *
 * Uso:  node server/scripts/parcial/apply-rcas-ocultos.mjs
 * Idempotente: só adiciona coluna que ainda não existir.
 */

import "dotenv/config";
import mysql from "mysql2/promise";

async function addColIfMissing(conn, name, ddl) {
  const [col] = await conn.execute(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'parcial_envios' AND COLUMN_NAME = ?`,
    [name],
  );
  if (col.length === 0) {
    await conn.execute(ddl);
    console.log(`  ✓ coluna ${name} criada`);
  } else {
    console.log(`  • coluna ${name} já existe`);
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não definida no .env. Aborte.");
    process.exit(1);
  }

  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  try {
    console.log(
      `→ Aplicando rcasOcultos/mediasGerenteRca em ${process.env.DATABASE_URL.replace(/:[^:@]+@/, ":***@")}…\n`,
    );

    await addColIfMissing(
      conn,
      "rcasOcultos",
      "ALTER TABLE `parcial_envios` ADD COLUMN `rcasOcultos` JSON NULL COMMENT 'RCAs ocultos no recorte por área (denylist; vazio = todos visíveis)' AFTER `mediaBaseTodos`",
    );
    await addColIfMissing(
      conn,
      "mediasGerenteRca",
      "ALTER TABLE `parcial_envios` ADD COLUMN `mediasGerenteRca` JSON NULL COMMENT '{gerencia:{rca:media}} publicado pelo bot — fonte dos RCAs por área no portal' AFTER `medias`",
    );

    console.log("\n✓ rcasOcultos/mediasGerenteRca aplicados com sucesso.");
  } catch (err) {
    console.error("\n✗ Falha:", err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();
