// FASE B (na VM, DEPOIS de importar o dump e copiar os arquivos baixados para o LOCAL_STORAGE_DIR):
// Reaponta as URLs de anexo no banco para o storage LOCAL (`${PUBLIC_BASE_URL}/local-storage/<key>`).
// Não baixa nada — só reescreve o banco. Idempotente (pula o que já é local).
//
// Pré-requisito: os arquivos de `anexos-backup/<key>` (Fase A) já copiados para LOCAL_STORAGE_DIR,
// preservando a estrutura de pastas (as `key`s batem com o `fileKey`).
//
// Uso (na VM):
//   node server/scripts/migracao/reapontar-anexos-local.mjs --dry-run
//   node server/scripts/migracao/reapontar-anexos-local.mjs
//
// Env: DATABASE_URL (banco local), PUBLIC_BASE_URL (base pública do portal).

import "dotenv/config";
import mysql from "mysql2/promise";

const DRY = process.argv.includes("--dry-run");
const BASE = (process.env.PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");

const TABELAS = [
  { tabela: "suporte_anexos", keyCol: "fileKey", urlCol: "fileUrl" },
  { tabela: "projetos_anexos", keyCol: "fileKey", urlCol: "fileUrl" },
  { tabela: "admin_assinaturas_anexos", keyCol: "fileKey", urlCol: "fileUrl" },
  { tabela: "comercial_uploads", keyCol: "fileKey", urlCol: "fileUrl" },
];

const localUrl = (key) => `${BASE}/local-storage/${key}`;
const jaLocal = (u) => !!u && (u.startsWith("/local-storage/") || (BASE && u.startsWith(`${BASE}/local-storage/`)));

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL ausente.");
  if (!BASE) console.warn("[aviso] PUBLIC_BASE_URL vazio — URLs ficarão relativas (ok p/ UI, ruim p/ fetch server-side como verifyBackup).");
  const conn = await mysql.createConnection({ uri: process.env.DATABASE_URL });
  const resumo = { atualizados: 0, pulados: 0 };

  for (const { tabela, keyCol, urlCol } of TABELAS) {
    let rows;
    try {
      [rows] = await conn.execute(`SELECT id, \`${keyCol}\` AS k, \`${urlCol}\` AS u FROM \`${tabela}\``);
    } catch (e) {
      console.warn(`[skip] ${tabela}: ${e.message}`);
      continue;
    }
    for (const row of rows) {
      if (!row.k || jaLocal(row.u)) { resumo.pulados++; continue; }
      if (!DRY) await conn.execute(`UPDATE \`${tabela}\` SET \`${urlCol}\` = ? WHERE id = ?`, [localUrl(row.k), row.id]);
      resumo.atualizados++;
    }
  }

  // chat_mensagens: deriva a key da URL antiga (/manus-storage/<key>)
  try {
    const [rows] = await conn.execute(
      "SELECT id, attachmentUrl AS u FROM chat_mensagens WHERE attachmentUrl IS NOT NULL AND attachmentUrl <> ''",
    );
    for (const row of rows) {
      if (jaLocal(row.u)) { resumo.pulados++; continue; }
      const m = /\/manus-storage\/(.+)$/.exec(row.u);
      const key = m ? decodeURIComponent(m[1]) : null;
      if (!key) { resumo.pulados++; continue; }
      if (!DRY) await conn.execute("UPDATE chat_mensagens SET attachmentUrl = ? WHERE id = ?", [localUrl(key), row.id]);
      resumo.atualizados++;
    }
  } catch (e) {
    console.warn(`[skip] chat_mensagens: ${e.message}`);
  }

  await conn.end();
  console.log(`Resumo: ${resumo.atualizados} ${DRY ? "seriam reapontados (DRY-RUN)" : "reapontados"} · ${resumo.pulados} pulados.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
