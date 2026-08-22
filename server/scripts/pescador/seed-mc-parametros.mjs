/**
 * Semeia as premissas da MC do Pescador em `sys_parametros` (módulo "pescador"). Idempotente:
 * só insere o que ainda não existe (INSERT IGNORE) — NÃO sobrescreve valores que o admin já ajustou.
 *
 * Uso: node server/scripts/pescador/seed-mc-parametros.mjs
 *
 * Depois de rodar, os parâmetros aparecem editáveis em Admin→Parâmetros (filtro "pescador").
 * O sync (`loadMcParams`) passa a usar esses valores; o próximo `pescador-sync` reflete.
 */

import "dotenv/config";
import mysql from "mysql2/promise";

const PARAMS = [
  ["PESCADOR_MC_EMPRESA", "OpenDeskSC", "string", "MC · Empresa (parâmetro da consulta pescador_3)"],
  ["PESCADOR_MC_ID_POLCOM", "88371, 88372", "string", "MC · Políticas comerciais (idPolCom), separadas por vírgula"],
  ["PESCADOR_MC_REGIAO_TRIBUTARIA", "200", "string", "MC · Região tributária"],
  ["PESCADOR_MC_VAR_FRETE", "0.04", "number", "MC · Frete (fração; 0.04 = 4%)"],
  ["PESCADOR_MC_VAR_PERDAS_VENCIDOS", "0.01", "number", "MC · Perdas/vencidos (fração; 0.01 = 1%)"],
  ["PESCADOR_MC_VAR_CONTRATOS", "0.005", "number", "MC · Contratos (fração; 0.005 = 0,5%)"],
  ["PESCADOR_MC_VAR_INVEST_EMP", "0", "number", "MC · Investimento empresa (fração)"],
  ["PESCADOR_MC_VAR_ASSOCIATIVISMO", "0", "number", "MC · Associativismo (fração)"],
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não definida no .env. Aborte.");
    process.exit(1);
  }
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    for (const [chave, valor, tipo, descricao] of PARAMS) {
      const [res] = await conn.execute(
        `INSERT IGNORE INTO \`sys_parametros\` (chave, valor, tipo, modulo, descricao, updatedBy)
         VALUES (?, ?, ?, 'pescador', ?, 'seed')`,
        [chave, valor, tipo, descricao],
      );
      console.log(`  ${res.affectedRows ? "✓ inserido" : "• já existe"}: ${chave} = ${valor}`);
    }
    console.log("\n✓ Premissas da MC semeadas em sys_parametros (módulo 'pescador').");
  } catch (err) {
    console.error("\n✗ Falha:", err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();
