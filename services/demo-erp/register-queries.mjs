#!/usr/bin/env node
/**
 * Registra as queries nomeadas (queries.json) na query-api via /admin.
 * Sem dependências (usa o fetch global do Node 18+).
 *
 * Uso:  node services/demo-erp/register-queries.mjs
 * Env:  QAPI_URL (default http://localhost:4000)
 *       QAPI_ADMIN_USER / QAPI_ADMIN_PASSWORD (default admin/admin)
 */
import { readFile } from "node:fs/promises";

const BASE = process.env.QAPI_URL || "http://localhost:4000";
const USER = process.env.QAPI_ADMIN_USER || "admin";
const PASS = process.env.QAPI_ADMIN_PASSWORD || "admin";

const queries = JSON.parse(await readFile(new URL("./queries.json", import.meta.url), "utf8"));

const login = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ usuario: USER, senha: PASS }),
});
if (!login.ok) {
  console.error(`✖ login admin falhou: HTTP ${login.status}`);
  process.exit(1);
}
const { token } = await login.json();

let ok = 0;
for (const q of queries) {
  const r = await fetch(`${BASE}/admin/queries/${encodeURIComponent(q.chave)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ descricao: q.descricao, sql_text: q.sql_text }),
  });
  if (r.ok) {
    console.log(`✔ ${q.chave}`);
    ok++;
  } else {
    console.error(`✖ ${q.chave}: HTTP ${r.status} ${await r.text()}`);
  }
}
console.log(`\n${ok}/${queries.length} queries registradas em ${BASE}.`);
