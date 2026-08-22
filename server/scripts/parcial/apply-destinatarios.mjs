/**
 * Destinatários múltiplos por envio (Envio de Parcial) — schema + migração.
 *
 * Cria:
 *   - `parcial_contatos`        — cadastro central reutilizável (grupo | contato).
 *   - `parcial_contato_envios`  — vínculo N:N contato↔envio + filtro de áreas.
 *   - `parcial_grupos_wa`       — singleton: lista de grupos do WhatsApp (publicada
 *                                 pelo bot) que alimenta o dropdown do portal.
 *
 * Migração idempotente: para cada `parcial_envios`, garante um contato tipo=grupo
 * com o nome do grupo atual + um vínculo (filtroTipo='todos'), preservando o
 * comportamento atual (o grupo continua recebendo o painel cheio).
 *
 * Uso:  node server/scripts/parcial/apply-destinatarios.mjs
 *
 * SQL puro (drizzle-kit está dessincronizado — ver CLAUDE.md). Idempotente:
 * CREATE TABLE IF NOT EXISTS + INSERT IGNORE apoiados nas UNIQUE keys.
 */

import "dotenv/config";
import mysql from "mysql2/promise";

const STATEMENTS = [
  /* ─── parcial_contatos — cadastro central reutilizável ─── */
  `CREATE TABLE IF NOT EXISTS \`parcial_contatos\` (
    \`id\` INT NOT NULL AUTO_INCREMENT,
    \`tipo\` VARCHAR(16) NOT NULL COMMENT 'grupo | contato',
    \`identificador\` VARCHAR(255) NOT NULL COMMENT 'nome do grupo OU numero E.164 (so digitos)',
    \`nome\` VARCHAR(128) NOT NULL COMMENT 'rotulo amigavel exibido no portal',
    \`ativo\` BOOLEAN NOT NULL DEFAULT TRUE,
    \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`parcial_contatos_tipo_ident_uk\` (\`tipo\`, \`identificador\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  /* ─── parcial_contato_envios — vínculo N:N + filtro de áreas ─── */
  `CREATE TABLE IF NOT EXISTS \`parcial_contato_envios\` (
    \`id\` INT NOT NULL AUTO_INCREMENT,
    \`contatoId\` INT NOT NULL,
    \`envioId\` INT NOT NULL,
    \`filtroTipo\` VARCHAR(16) NOT NULL DEFAULT 'todos' COMMENT 'todos | gerencia | rca',
    \`filtroValores\` JSON NOT NULL COMMENT 'lista de gerencias/RCAs; vazio quando filtroTipo=todos',
    \`habilitado\` BOOLEAN NOT NULL DEFAULT TRUE,
    \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`parcial_contato_envios_uk\` (\`contatoId\`, \`envioId\`),
    KEY \`parcial_contato_envios_envio_idx\` (\`envioId\`),
    CONSTRAINT \`fk_pce_contato\` FOREIGN KEY (\`contatoId\`) REFERENCES \`parcial_contatos\`(\`id\`) ON DELETE CASCADE,
    CONSTRAINT \`fk_pce_envio\` FOREIGN KEY (\`envioId\`) REFERENCES \`parcial_envios\`(\`id\`) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  /* ─── parcial_grupos_wa — lista de grupos do WhatsApp (singleton id=1) ─── */
  `CREATE TABLE IF NOT EXISTS \`parcial_grupos_wa\` (
    \`id\` INT NOT NULL,
    \`grupos\` JSON COMMENT 'array de nomes de grupos que a conta participa',
    \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  /* ─── parcial_previews — preview por recorte (1 linha por filtro distinto) ─── */
  `CREATE TABLE IF NOT EXISTS \`parcial_previews\` (
    \`id\` INT NOT NULL AUTO_INCREMENT,
    \`envioId\` INT NOT NULL,
    \`sig\` VARCHAR(80) NOT NULL COMMENT 'completo | gerencia:AREA1|AREA2 ...',
    \`label\` VARCHAR(255) NOT NULL,
    \`mimeType\` VARCHAR(32) NOT NULL DEFAULT 'image/png',
    \`base64\` LONGTEXT,
    \`geradoEm\` TIMESTAMP NULL DEFAULT NULL,
    \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`parcial_previews_envio_sig_uk\` (\`envioId\`, \`sig\`),
    CONSTRAINT \`fk_pp_envio\` FOREIGN KEY (\`envioId\`) REFERENCES \`parcial_envios\`(\`id\`) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não definida no .env. Aborte.");
    process.exit(1);
  }

  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  try {
    console.log(
      `→ Aplicando destinatários do Envio de Parcial em ${process.env.DATABASE_URL.replace(/:[^:@]+@/, ":***@")}…\n`,
    );

    for (const sql of STATEMENTS) {
      const match = sql.match(/CREATE TABLE IF NOT EXISTS `([^`]+)`/);
      const tableName = match ? match[1] : "statement";
      try {
        await conn.execute(sql);
        console.log(`  ✓ ${tableName}`);
      } catch (err) {
        console.error(`  ✗ ${tableName}: ${err.message}`);
        throw err;
      }
    }

    // Singleton da lista de grupos.
    await conn.execute("INSERT IGNORE INTO `parcial_grupos_wa` (`id`, `grupos`) VALUES (1, JSON_ARRAY())");
    console.log("  ✓ parcial_grupos_wa (singleton)");

    // Migração idempotente: coluna forcarEnvio no vínculo (envio/teste por destinatário).
    const [colForcar] = await conn.execute(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'parcial_contato_envios' AND COLUMN_NAME = 'forcarEnvio'`,
    );
    if (colForcar.length === 0) {
      await conn.execute(
        "ALTER TABLE `parcial_contato_envios` ADD COLUMN `forcarEnvio` BOOLEAN NOT NULL DEFAULT FALSE",
      );
      console.log("  ✓ coluna forcarEnvio em parcial_contato_envios");
    }

    // Migração: cada envio existente vira um contato tipo=grupo + vínculo 'todos',
    // preservando o envio atual ao grupo (idempotente via UNIQUE keys).
    let envios = [];
    try {
      const [rows] = await conn.execute("SELECT `id`, `grupo` FROM `parcial_envios`");
      envios = rows;
    } catch {
      console.log("\n→ Tabela parcial_envios ausente — rode migrate-multi-envio.mjs antes. Pulando migração de grupos.");
    }

    if (envios.length > 0) {
      console.log("\n→ Migrando grupos atuais para contatos/vínculos…");
      for (const envio of envios) {
        const grupo = (envio.grupo || "").trim();
        if (!grupo) continue;

        await conn.execute(
          "INSERT IGNORE INTO `parcial_contatos` (`tipo`, `identificador`, `nome`) VALUES ('grupo', ?, ?)",
          [grupo, grupo],
        );
        const [crows] = await conn.execute(
          "SELECT `id` FROM `parcial_contatos` WHERE `tipo` = 'grupo' AND `identificador` = ? LIMIT 1",
          [grupo],
        );
        const contatoId = crows[0]?.id;
        if (!contatoId) continue;

        await conn.execute(
          "INSERT IGNORE INTO `parcial_contato_envios` (`contatoId`, `envioId`, `filtroTipo`, `filtroValores`) VALUES (?, ?, 'todos', JSON_ARRAY())",
          [contatoId, envio.id],
        );
        console.log(`  ✓ grupo "${grupo}" → envio #${envio.id}`);
      }
    }

    console.log("\n✓ Destinatários do Envio de Parcial aplicados com sucesso.");
  } catch (err) {
    console.error("\n✗ Falha ao aplicar destinatários:", err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();
