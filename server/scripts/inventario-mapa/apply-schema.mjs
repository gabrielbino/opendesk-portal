/**
 * Schema do Mapa de Inventário (submódulo do Almoxarifado de TI). Idempotente.
 *
 * Uso: node server/scripts/inventario-mapa/apply-schema.mjs
 *
 * Cria:
 *   - inventario_mapa_areas        → áreas (maior divisão do galpão).
 *   - inventario_mapa_setores      → setores (opcionalmente dentro de uma área).
 *   - inventario_mapa_equipamentos → computadores (periféricos em coluna JSON).
 *
 * Hierarquia: Área → Setor → Equipamento → Periféricos. IDs são strings
 * (nanoid) geradas no cliente. Espelha as definições em drizzle/schema.ts.
 * FKs com ON DELETE SET NULL funcionam como rede de segurança; a conversão
 * de posição relativa→absoluta ao remover um pai é feita no servidor (router).
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
    console.log("→ inventario_mapa_areas");
    await conn.execute(
      `CREATE TABLE IF NOT EXISTS \`inventario_mapa_areas\` (
        \`id\` VARCHAR(36) NOT NULL,
        \`nome\` VARCHAR(255) NOT NULL,
        \`cor\` VARCHAR(16) NOT NULL,
        \`posX\` DOUBLE NOT NULL,
        \`posY\` DOUBLE NOT NULL,
        \`width\` DOUBLE NOT NULL,
        \`height\` DOUBLE NOT NULL,
        \`createdAt\` BIGINT NOT NULL,
        \`updatedAt\` BIGINT NOT NULL,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    console.log("  ✓ inventario_mapa_areas");

    console.log("\n→ inventario_mapa_setores");
    await conn.execute(
      `CREATE TABLE IF NOT EXISTS \`inventario_mapa_setores\` (
        \`id\` VARCHAR(36) NOT NULL,
        \`nome\` VARCHAR(255) NOT NULL,
        \`cor\` VARCHAR(16) NOT NULL,
        \`areaId\` VARCHAR(36) NULL,
        \`posX\` DOUBLE NOT NULL,
        \`posY\` DOUBLE NOT NULL,
        \`width\` DOUBLE NOT NULL,
        \`height\` DOUBLE NOT NULL,
        \`createdAt\` BIGINT NOT NULL,
        \`updatedAt\` BIGINT NOT NULL,
        PRIMARY KEY (\`id\`),
        KEY \`inventario_mapa_setores_area_idx\` (\`areaId\`),
        CONSTRAINT \`inventario_mapa_setores_area_fk\` FOREIGN KEY (\`areaId\`)
          REFERENCES \`inventario_mapa_areas\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    console.log("  ✓ inventario_mapa_setores");

    console.log("\n→ inventario_mapa_equipamentos");
    await conn.execute(
      `CREATE TABLE IF NOT EXISTS \`inventario_mapa_equipamentos\` (
        \`id\` VARCHAR(36) NOT NULL,
        \`tipo\` VARCHAR(32) NOT NULL DEFAULT 'Computador',
        \`setorId\` VARCHAR(36) NULL,
        \`posX\` DOUBLE NOT NULL,
        \`posY\` DOUBLE NOT NULL,
        \`nome\` VARCHAR(255) NOT NULL,
        \`patrimonio\` VARCHAR(100) NULL,
        \`mac\` VARCHAR(64) NULL,
        \`sistemaOperacional\` VARCHAR(128) NULL,
        \`responsavel\` VARCHAR(255) NULL,
        \`departamento\` VARCHAR(255) NULL,
        \`status\` ENUM('Online','Offline','Alerta','Manutencao') NOT NULL DEFAULT 'Offline',
        \`perifericos\` JSON NULL,
        \`createdAt\` BIGINT NOT NULL,
        \`updatedAt\` BIGINT NOT NULL,
        PRIMARY KEY (\`id\`),
        KEY \`inventario_mapa_equip_setor_idx\` (\`setorId\`),
        KEY \`inventario_mapa_equip_status_idx\` (\`status\`),
        CONSTRAINT \`inventario_mapa_equip_setor_fk\` FOREIGN KEY (\`setorId\`)
          REFERENCES \`inventario_mapa_setores\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    console.log("  ✓ inventario_mapa_equipamentos");

    console.log("\n✓ Schema do Mapa de Inventário aplicado com sucesso.");
  } catch (err) {
    console.error("\n✗ Falha:", err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();
