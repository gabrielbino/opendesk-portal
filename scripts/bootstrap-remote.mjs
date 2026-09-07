#!/usr/bin/env node
/**
 * Bootstrap de um MySQL REMOTO (ex.: TiDB Cloud Serverless) — cria os bancos
 * `opendesk` e `demo_erp` e aplica schema + seeds + queries nomeadas.
 *
 * Rode da sua máquina (você controla a senha; ela nunca sai do seu terminal):
 *   DATABASE_URL="mysql://USER:SENHA@HOST:4000/test" node scripts/bootstrap-remote.mjs
 *
 * TiDB exige TLS — este script ativa automático quando o host é *.tidbcloud.com.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import mysql from "mysql2/promise";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✖ Defina DATABASE_URL (string de conexão do TiDB).");
  process.exit(1);
}
const useSsl = process.env.DATABASE_SSL === "true" || /tidbcloud\.com/i.test(url);

const read = (rel) => readFile(path.join(ROOT, rel), "utf8");

// Ordem importa. Cada item: rótulo + SQL a aplicar (com o contexto de banco certo).
async function run() {
  const conn = await mysql.createConnection({
    uri: url,
    multipleStatements: true,
    ...(useSsl ? { ssl: { minVersion: "TLSv1.2" } } : {}),
  });
  try {
    const steps = [
      ["criar banco opendesk", "CREATE DATABASE IF NOT EXISTS `opendesk` CHARACTER SET utf8mb4;"],
      ["schema opendesk (108 tabelas)", "USE `opendesk`;\n" + (await read("scripts/bootstrap/schema.sql"))],
      ["seed opendesk (admin + singletons)", "USE `opendesk`;\n" + (await read("scripts/bootstrap/seed.sql"))],
      ["demo_erp (tabelas + dados)", await read("services/demo-erp/seed.sql")],
      ["queries nomeadas", await read("services/demo-erp/queries-seed.sql")],
    ];
    for (const [label, sqlText] of steps) {
      process.stdout.write(`→ ${label}… `);
      await conn.query(sqlText);
      console.log("ok");
    }
    // Sanidade
    const [[t]] = await conn.query(
      "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema='opendesk'",
    );
    const [[q]] = await conn.query("SELECT COUNT(*) AS n FROM demo_erp.qapi_queries");
    console.log(`\n✅ Pronto. opendesk: ${t.n} tabelas · demo_erp queries: ${q.n}`);
    console.log("   Admin: admin@opendesk.local / admin123 (troque após o 1º acesso).");
  } finally {
    await conn.end();
  }
}
run().catch((e) => {
  console.error("\n✖ Falhou:", e.message);
  process.exit(1);
});
