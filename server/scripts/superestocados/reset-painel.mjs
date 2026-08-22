/**
 * RESET do painel de Superestocados — APAGA todos os produtos e o histórico de
 * permanência para reiniciar o rastreamento (data de entrada, permanências,
 * transferências) do zero.
 *
 * ⚠️ DESTRUTIVO. Rode UMA vez, e logo em seguida rode a tarefa do conector que
 * envia os arquivos dias_estoque (a rotação re-insere todos como entradas novas:
 * painelEntradaEm = agora, permanências abertas). O sync de vendas repopula o
 * histórico de vendas e passa a aplicar transferências.
 *
 * Uso: node server/scripts/superestocados/reset-painel.mjs
 */

import "dotenv/config";
import mysql from "mysql2/promise";

const TABELAS = [
  "superestocados_lotes",
  "superestocados_historico_vendas",
  "superestocados_permanencia",
  "superestocados_produtos",
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não definida no .env. Aborte.");
    process.exit(1);
  }
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    console.log(
      `⚠️  RESET do painel de Superestocados em ${process.env.DATABASE_URL.replace(/:[^:@]+@/, ":***@")}\n`,
    );
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const t of TABELAS) {
      const [r] = await conn.query(`DELETE FROM \`${t}\``);
      console.log(`  ✓ ${t}: ${r.affectedRows} linha(s) removida(s)`);
    }
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
    console.log("\n✓ Painel zerado. Próximo passo:");
    console.log("  Rode a tarefa do conector (dias_estoque) para re-popular o painel.");
  } catch (err) {
    console.error("\n✗ Falha no reset:", err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();
