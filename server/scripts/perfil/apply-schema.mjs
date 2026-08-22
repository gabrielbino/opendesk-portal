/**
 * Schema do Perfil do usuário (auto-serviço). Idempotente.
 *
 * Uso: node server/scripts/perfil/apply-schema.mjs
 *
 * Adiciona a `sys_usuarios`:
 *   - avatarUrl TEXT      → foto de perfil (data URI pequeno, redimensionado no cliente).
 *   - whatsapp  VARCHAR(20) → WhatsApp corporativo (E.164), espelhado na base de contatos.
 *
 * MySQL 8 não tem "ADD COLUMN IF NOT EXISTS"; por isso checamos o information_schema antes.
 */

import "dotenv/config";
import mysql from "mysql2/promise";

async function addColumnIfMissing(conn, table, column, definition) {
  const [rows] = await conn.execute(
    `SELECT COUNT(*) AS n FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column],
  );
  if (Number(rows[0]?.n) > 0) {
    console.log(`  • ${table}.${column} já existe — pulando`);
    return;
  }
  await conn.execute(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  console.log(`  ✓ ${table}.${column} adicionada`);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não definida no .env. Aborte.");
    process.exit(1);
  }
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    console.log("→ sys_usuarios (perfil)");
    await addColumnIfMissing(conn, "sys_usuarios", "avatarUrl", "TEXT NULL");
    await addColumnIfMissing(conn, "sys_usuarios", "whatsapp", "VARCHAR(20) NULL");
    console.log("\n✓ Schema de Perfil aplicado com sucesso.");
  } catch (err) {
    console.error("\n✗ Falha:", err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();
