/**
 * Schema do Monitor TV (playlists do player /monitor). Idempotente.
 *
 * Uso: node server/scripts/monitor/apply-schema.mjs
 *
 * Cria:
 *   - monitor_playlists       → playlist nomeada (slug único).
 *   - monitor_playlist_itens  → itens ordenados (painel, modo de região, top, tempo).
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
    console.log("→ monitor_playlists");
    await conn.execute(
      `CREATE TABLE IF NOT EXISTS \`monitor_playlists\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`slug\` VARCHAR(64) NOT NULL,
        \`nome\` VARCHAR(255) NOT NULL,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`monitor_playlists_slug_unique\` (\`slug\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    console.log("  ✓ monitor_playlists");

    console.log("\n→ monitor_playlist_itens");
    await conn.execute(
      `CREATE TABLE IF NOT EXISTS \`monitor_playlist_itens\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`playlistId\` INT NOT NULL,
        \`ordem\` INT NOT NULL,
        \`panelKey\` VARCHAR(64) NOT NULL,
        \`regionMode\` ENUM('unificado','estados','estados_unificado') NOT NULL DEFAULT 'estados_unificado',
        \`top\` INT NOT NULL DEFAULT 10,
        \`dwellSeconds\` INT NOT NULL DEFAULT 30,
        \`enabled\` TINYINT(1) NOT NULL DEFAULT 1,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`monitor_playlist_itens_playlist_ordem_unique\` (\`playlistId\`, \`ordem\`),
        KEY \`monitor_playlist_itens_playlist_idx\` (\`playlistId\`),
        CONSTRAINT \`monitor_playlist_itens_playlist_fk\` FOREIGN KEY (\`playlistId\`)
          REFERENCES \`monitor_playlists\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    console.log("  ✓ monitor_playlist_itens");

    console.log("\n✓ Schema do Monitor TV aplicado com sucesso.");
  } catch (err) {
    console.error("\n✗ Falha:", err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();
