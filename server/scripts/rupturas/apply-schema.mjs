/**
 * Schema do submódulo de Rupturas (Gestão de Negócios). Idempotente.
 *
 * Uso: node server/scripts/rupturas/apply-schema.mjs
 *
 * Cria:
 *   - rupturas_produtos     → itens EM RUPTURA (zerado OU < 7 dias), por região.
 *   - rupturas_marca_resumo → agregado por marca/região (denominador da % de ruptura).
 *   - rupturas_compradores  → vínculo editável fornecedor → comprador responsável.
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
    console.log("→ rupturas_produtos");
    await conn.execute(
      `CREATE TABLE IF NOT EXISTS \`rupturas_produtos\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`codigo\` INT NOT NULL,
        \`region\` ENUM('SC','RS') NOT NULL,
        \`fornecedor\` VARCHAR(255) NOT NULL,
        \`nomeProduto\` VARCHAR(255) NOT NULL,
        \`tipoProduto\` ENUM('medicamento','nao_medicamento') NOT NULL DEFAULT 'medicamento',
        \`diasEstoque\` DOUBLE NOT NULL DEFAULT 0,
        \`estoqueAtual\` INT NOT NULL DEFAULT 0,
        \`vendaMedia\` DOUBLE NOT NULL DEFAULT 0,
        \`valorCusto\` DOUBLE NULL,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`rupturas_produtos_codigo_region_unique\` (\`codigo\`, \`region\`),
        KEY \`rupturas_produtos_region_idx\` (\`region\`),
        KEY \`rupturas_produtos_fornecedor_idx\` (\`fornecedor\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    console.log("  ✓ rupturas_produtos");

    console.log("\n→ rupturas_marca_resumo");
    await conn.execute(
      `CREATE TABLE IF NOT EXISTS \`rupturas_marca_resumo\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`region\` ENUM('SC','RS') NOT NULL,
        \`fornecedor\` VARCHAR(255) NOT NULL,
        \`totalAtivos\` INT NOT NULL DEFAULT 0,
        \`qtdRuptura\` INT NOT NULL DEFAULT 0,
        \`qtdZerados\` INT NOT NULL DEFAULT 0,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`rupturas_marca_resumo_region_fornecedor_unique\` (\`region\`, \`fornecedor\`),
        KEY \`rupturas_marca_resumo_region_idx\` (\`region\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    console.log("  ✓ rupturas_marca_resumo");

    console.log("\n→ rupturas_compradores");
    await conn.execute(
      `CREATE TABLE IF NOT EXISTS \`rupturas_compradores\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`fornecedor\` VARCHAR(255) NOT NULL,
        \`comprador\` VARCHAR(255) NOT NULL,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`rupturas_compradores_fornecedor_unique\` (\`fornecedor\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    console.log("  ✓ rupturas_compradores");

    console.log("\n✓ Schema de rupturas aplicado com sucesso.");
  } catch (err) {
    console.error("\n✗ Falha:", err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();
