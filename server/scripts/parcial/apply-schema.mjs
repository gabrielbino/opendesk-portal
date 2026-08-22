/**
 * Cria as tabelas do control plane do submódulo "Envio de Parcial" (Comercial)
 * no banco MySQL apontado por DATABASE_URL.
 *
 * Uso:
 *   node server/scripts/parcial/apply-schema.mjs
 *
 * Idempotente: usa `CREATE TABLE IF NOT EXISTS` + `INSERT IGNORE` dos singletons,
 * então pode rodar múltiplas vezes sem efeito colateral.
 *
 * Contexto: o bot do WhatsApp roda no servidor Windows local (junto do conector)
 * e sincroniza com o portal por HTTPS (/api/parcial/*). Estas tabelas são o
 * "control plane" — substituem os arquivos bot_state.json / bot_log.json /
 * bot_qr.json / painel_output.png do projeto original. O portal lê/escreve via
 * tRPC; o bot lê/escreve via os endpoints-ponte.
 *
 * NOTA: criado em SQL puro para contornar o estado dessincronizado do
 * drizzle-kit/_journal.json (mesmo motivo do pescador-seed/apply-schema.mjs).
 * As definições espelho em drizzle/schema.ts servem só para tipagem das queries.
 */

import "dotenv/config";
import mysql from "mysql2/promise";

const MEDIAS_PADRAO = {
  "GV KA MICHEL": 133025.08,
  "GVSC CAPITAL": 82256.99,
  "GVSC OESTE": 54523.56,
  "GVSC NORTE": 51320.83,
};

// Horários fixos de envio nos dias úteis que NÃO são o último do mês.
const HORARIOS_PADRAO = [11, 13, 15, 17, 19, 20];

const STATEMENTS = [
  /* ─── parcial_estado (singleton id=1) ───
     Estado/config do bot. Escrito pelo portal (config + comandos) e pelo bot
     (status, heartbeat, ultimoEnvio). forcarEnvio é o flag de "enviar agora". */
  `CREATE TABLE IF NOT EXISTS \`parcial_estado\` (
    \`id\` INT NOT NULL,
    \`status\` VARCHAR(32) NOT NULL DEFAULT 'iniciando',
    \`pausado\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`grupo\` VARCHAR(255) NOT NULL DEFAULT 'SC - OpenDesk COMERCIAL',
    \`cron\` VARCHAR(64) NOT NULL DEFAULT '0 7-19 * * 1-5',
    \`horaInicio\` INT NOT NULL DEFAULT 7,
    \`horaFim\` INT NOT NULL DEFAULT 19,
    \`medias\` JSON,
    \`horariosPadrao\` JSON,
    \`forcarEnvio\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`ultimoEnvio\` TIMESTAMP NULL DEFAULT NULL,
    \`proximoEnvio\` TIMESTAMP NULL DEFAULT NULL,
    \`botOnline\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`ultimoHeartbeat\` TIMESTAMP NULL DEFAULT NULL,
    \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  /* ─── parcial_log ───
     Histórico de eventos (ok|info|warn|erro). Cap de 200 linhas é feito na
     camada de aplicação ao inserir (igual ao addLog original). */
  `CREATE TABLE IF NOT EXISTS \`parcial_log\` (
    \`id\` INT NOT NULL AUTO_INCREMENT,
    \`ts\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`nivel\` VARCHAR(8) NOT NULL DEFAULT 'info',
    \`msg\` VARCHAR(512) NOT NULL,
    PRIMARY KEY (\`id\`),
    KEY \`parcial_log_ts_idx\` (\`ts\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  /* ─── parcial_qr (singleton id=1) ───
     QR Code (dataURL base64) publicado pelo bot quando precisa autenticar;
     o portal lê para exibir no modal. Limpo (dataUrl=NULL) ao autenticar. */
  `CREATE TABLE IF NOT EXISTS \`parcial_qr\` (
    \`id\` INT NOT NULL,
    \`dataUrl\` MEDIUMTEXT,
    \`ts\` TIMESTAMP NULL DEFAULT NULL,
    \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  /* ─── parcial_imagem (singleton id=1) ───
     Última imagem gerada (PNG em base64) para o preview no portal. */
  `CREATE TABLE IF NOT EXISTS \`parcial_imagem\` (
    \`id\` INT NOT NULL,
    \`mimeType\` VARCHAR(32) NOT NULL DEFAULT 'image/png',
    \`base64\` LONGTEXT,
    \`geradoEm\` TIMESTAMP NULL DEFAULT NULL,
    \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

const SEEDS = [
  {
    label: "parcial_estado (singleton)",
    sql: "INSERT IGNORE INTO `parcial_estado` (`id`, `medias`, `horariosPadrao`) VALUES (1, ?, ?)",
    params: [JSON.stringify(MEDIAS_PADRAO), JSON.stringify(HORARIOS_PADRAO)],
  },
  {
    label: "parcial_qr (singleton)",
    sql: "INSERT IGNORE INTO `parcial_qr` (`id`) VALUES (1)",
    params: [],
  },
  {
    label: "parcial_imagem (singleton)",
    sql: "INSERT IGNORE INTO `parcial_imagem` (`id`) VALUES (1)",
    params: [],
  },
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não definida no .env. Aborte.");
    process.exit(1);
  }

  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  try {
    console.log(
      `→ Aplicando schema do Envio de Parcial em ${process.env.DATABASE_URL.replace(/:[^:@]+@/, ":***@")}…\n`,
    );

    for (let i = 0; i < STATEMENTS.length; i++) {
      const sql = STATEMENTS[i];
      const match = sql.match(/CREATE TABLE IF NOT EXISTS `([^`]+)`/);
      const tableName = match ? match[1] : `statement #${i + 1}`;
      try {
        await conn.execute(sql);
        console.log(`  ✓ ${tableName}`);
      } catch (err) {
        console.error(`  ✗ ${tableName}: ${err.message}`);
        throw err;
      }
    }

    // ── Migração idempotente: coluna horariosPadrao (regra de horários por dia útil) ──
    const [colRows] = await conn.execute(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'parcial_estado' AND COLUMN_NAME = 'horariosPadrao'`,
    );
    if (colRows.length === 0) {
      console.log("\n→ Adicionando coluna horariosPadrao em parcial_estado…");
      await conn.execute("ALTER TABLE `parcial_estado` ADD COLUMN `horariosPadrao` JSON AFTER `medias`");
      console.log("  ✓ coluna criada");
    }
    // Garante o valor padrão na linha singleton se ainda estiver nulo.
    await conn.execute(
      "UPDATE `parcial_estado` SET `horariosPadrao` = ? WHERE `id` = 1 AND `horariosPadrao` IS NULL",
      [JSON.stringify(HORARIOS_PADRAO)],
    );

    console.log("\n→ Semeando singletons (id=1)…");
    for (const seed of SEEDS) {
      await conn.execute(seed.sql, seed.params);
      console.log(`  ✓ ${seed.label}`);
    }

    console.log("\n✓ Schema do Envio de Parcial aplicado com sucesso.");
  } catch (err) {
    console.error("\n✗ Falha ao aplicar schema:", err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();
