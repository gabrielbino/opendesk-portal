/**
 * Gerências VISÍVEIS no painel completo (Envio de Parcial) — modelo ALLOWLIST.
 *
 * Inverte o modelo antigo (`gerentesOcultos`, denylist) para uma allowlist
 * (`gerentesVisiveis`): SÓ as gerências marcadas aparecem no painel completo.
 * Assim, **gerência nova entra DESMARCADA** (não aparece sozinha) — o operador
 * decide se exibe, marcando o chip no portal.
 *
 * O que faz (idempotente):
 *   1. Cria a coluna `gerentesVisiveis` (JSON) se ainda não existir.
 *   2. SEED SEM REGRESSÃO: onde `gerentesVisiveis` está NULL, semeia com as
 *      gerências HOJE VISÍVEIS = união(chaves de `medias`, lista `gerentes`)
 *      menos as que estavam em `gerentesOcultos` (denylist antiga). Ou seja, o
 *      que já aparecia continua aparecendo; só o comportamento para gerências
 *      NOVAS muda (passam a entrar desmarcadas).
 *
 * A coluna `gerentesOcultos` é mantida (não é dropada) para rollback/histórico,
 * mas deixa de ser a fonte da verdade — o bot e o portal passam a usar
 * `gerentesVisiveis`.
 *
 * Uso:  node server/scripts/parcial/apply-gerentes-visiveis.mjs
 */

import "dotenv/config";
import mysql from "mysql2/promise";

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

function keysOf(v) {
  if (v && typeof v === "object" && !Array.isArray(v)) return Object.keys(v);
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v);
      return p && typeof p === "object" ? Object.keys(p) : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não definida no .env. Aborte.");
    process.exit(1);
  }

  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  try {
    console.log(
      `→ Aplicando gerentesVisiveis em ${process.env.DATABASE_URL.replace(/:[^:@]+@/, ":***@")}…\n`,
    );

    // 1. Cria a coluna se não existir (após gerentesOcultos, para manter agrupado).
    const [col] = await conn.execute(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'parcial_envios' AND COLUMN_NAME = 'gerentesVisiveis'`,
    );
    if (col.length === 0) {
      await conn.execute(
        "ALTER TABLE `parcial_envios` ADD COLUMN `gerentesVisiveis` JSON NULL COMMENT 'gerências visíveis no painel completo (allowlist; nova entra desmarcada)' AFTER `gerentesOcultos`",
      );
      console.log("  ✓ coluna gerentesVisiveis criada");
    } else {
      console.log("  • coluna gerentesVisiveis já existe");
    }

    // 2. Seed sem regressão: só onde ainda está NULL.
    const [rows] = await conn.execute(
      "SELECT `id`, `nome`, `gerentes`, `gerentesOcultos`, `medias`, `gerentesVisiveis` FROM `parcial_envios`",
    );
    let semeados = 0;
    for (const r of rows) {
      if (r.gerentesVisiveis !== null && r.gerentesVisiveis !== undefined) continue; // já definido
      const ocultos = new Set(asArray(r.gerentesOcultos));
      const universo = new Set([...keysOf(r.medias), ...asArray(r.gerentes)]);
      const visiveis = [...universo]
        .filter((g) => !ocultos.has(g))
        .sort((a, b) => a.localeCompare(b, "pt-BR"));
      await conn.execute(
        "UPDATE `parcial_envios` SET `gerentesVisiveis` = ? WHERE `id` = ?",
        [JSON.stringify(visiveis), r.id],
      );
      console.log(
        `  ✓ envio "${r.nome}" (id ${r.id}) semeado com ${visiveis.length} gerência(s): ${
          visiveis.join(", ") || "(nenhuma)"
        }`,
      );
      semeados++;
    }
    if (semeados === 0) console.log("  • nenhum envio para semear (todos já tinham gerentesVisiveis)");

    console.log("\n✓ gerentesVisiveis aplicado com sucesso.");
  } catch (err) {
    console.error("\n✗ Falha ao aplicar gerentesVisiveis:", err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();
