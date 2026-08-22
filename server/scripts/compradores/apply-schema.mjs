/**
 * Schema da Compradores (compartilhado — painéis de estoque). Idempotente.
 *
 * Uso: node server/scripts/compradores/apply-schema.mjs
 *
 * Cria:
 *   - gn_compradores       → comprador (entidade).
 *   - gn_comprador_marcas  → vínculo marca→comprador (UNIQUE por marca: 1 marca = 1 comprador).
 *   - gn_marcas            → catálogo de marcas da base (dropdown de atribuição).
 *   - gn_marca_aliases     → de/para variante→razão canônica (normalização de marca).
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
    console.log("→ gn_compradores");
    await conn.execute(
      `CREATE TABLE IF NOT EXISTS \`gn_compradores\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`nome\` VARCHAR(255) NOT NULL,
        \`ativo\` TINYINT(1) NOT NULL DEFAULT 1,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`gn_compradores_nome_unique\` (\`nome\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    console.log("  ✓ gn_compradores");

    console.log("\n→ gn_comprador_marcas");
    await conn.execute(
      `CREATE TABLE IF NOT EXISTS \`gn_comprador_marcas\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`compradorId\` INT NOT NULL,
        \`marca\` VARCHAR(255) NOT NULL,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`gn_comprador_marcas_marca_unique\` (\`marca\`),
        KEY \`gn_comprador_marcas_comprador_idx\` (\`compradorId\`),
        CONSTRAINT \`gn_comprador_marcas_comprador_fk\` FOREIGN KEY (\`compradorId\`)
          REFERENCES \`gn_compradores\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    console.log("  ✓ gn_comprador_marcas");

    console.log("\n→ gn_marcas");
    await conn.execute(
      `CREATE TABLE IF NOT EXISTS \`gn_marcas\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`marca\` VARCHAR(255) NOT NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`gn_marcas_marca_unique\` (\`marca\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    console.log("  ✓ gn_marcas");

    console.log("\n→ gn_marca_aliases");
    await conn.execute(
      `CREATE TABLE IF NOT EXISTS \`gn_marca_aliases\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`variante\` VARCHAR(255) NOT NULL,
        \`canonica\` VARCHAR(255) NOT NULL,
        \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`gn_marca_aliases_variante_unique\` (\`variante\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    console.log("  ✓ gn_marca_aliases");

    console.log("\n✓ Schema de Compradores aplicado com sucesso.");
  } catch (err) {
    console.error("\n✗ Falha:", err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();
