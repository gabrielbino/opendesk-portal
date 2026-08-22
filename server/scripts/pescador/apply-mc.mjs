/**
 * Colunas da MC (Margem de Contribuição) — consulta `pescador_3` / codigoQuery 15. Idempotente.
 *
 * Uso: node server/scripts/pescador/apply-mc.mjs
 *
 * Adiciona em `pescador_triagem`: mc, percMc, giroEstoque, vlrCustoMedio + os 9 percentuais
 * efetivos (icms/pis/cofins/comissao/frete/invest/assoc/perdas/contratos) + percRepasse.
 * Adiciona em `pescador_meta`: as premissas da MC usadas na carga (empresa, regiãoTributária,
 * varFrete/PerdasVencidos/Contratos/InvestEmp/Associativismo).
 */

import "dotenv/config";
import mysql from "mysql2/promise";

async function colunaExiste(conn, tabela, coluna) {
  const [rows] = await conn.execute(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tabela, coluna],
  );
  return rows.length > 0;
}

async function addColuna(conn, tabela, coluna, ddl) {
  if (await colunaExiste(conn, tabela, coluna)) {
    console.log(`  • ${tabela}.${coluna} já existe`);
    return;
  }
  await conn.execute(`ALTER TABLE \`${tabela}\` ADD COLUMN ${ddl}`);
  console.log(`  ✓ ${tabela}.${coluna} adicionada`);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não definida no .env. Aborte.");
    process.exit(1);
  }
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    console.log("→ Colunas da MC em pescador_triagem:");
    const triagemDouble = [
      "mc", "percMc", "giroEstoque", "vlrCustoMedio",
      "percIcms", "percPis", "percCofins", "percComissao", "percFrete",
      "percInvestEmp", "percAssociativismo", "percPerdasVencidos", "percContratos", "percRepasse",
    ];
    for (const c of triagemDouble) {
      await addColuna(conn, "pescador_triagem", c, `\`${c}\` DOUBLE NULL DEFAULT NULL`);
    }

    console.log("\n→ Premissas da MC em pescador_meta:");
    await addColuna(conn, "pescador_meta", "mcEmpresa", "`mcEmpresa` VARCHAR(32) NULL DEFAULT NULL");
    await addColuna(conn, "pescador_meta", "mcRegiaoTributaria", "`mcRegiaoTributaria` VARCHAR(16) NULL DEFAULT NULL");
    for (const c of ["mcVarFrete", "mcVarPerdasVencidos", "mcVarContratos", "mcVarInvestEmp", "mcVarAssociativismo"]) {
      await addColuna(conn, "pescador_meta", c, `\`${c}\` DOUBLE NULL DEFAULT NULL`);
    }

    console.log("\n✓ Schema da MC (pescador_3) aplicado com sucesso.");
  } catch (err) {
    console.error("\n✗ Falha:", err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();
