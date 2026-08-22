/**
 * Migração: modelo singleton → multi-envio (multi-região).
 *
 * Cria a tabela `parcial_envios` e `parcial_imagens`, migra os dados do
 * singleton `parcial_estado` para o primeiro envio (SC), e cria o envio RS.
 *
 * Uso:
 *   node server/scripts/parcial/migrate-multi-envio.mjs
 *
 * Idempotente: usa CREATE TABLE IF NOT EXISTS e INSERT IGNORE.
 */

import "dotenv/config";
import mysql from "mysql2/promise";

const ENVIOS_SEED = [
  {
    id: 1,
    slug: "sc",
    nome: "Santa Catarina",
    grupo: "SC - OpenDesk COMERCIAL",
    gerentes: JSON.stringify(["GV KA MICHEL", "GVSC CAPITAL", "GVSC OESTE", "GVSC NORTE"]),
    queryKey: "sc",
    codEstabelecimentos: JSON.stringify([1, 2]),
    horaInicio: 7,
    horaFim: 19,
    horariosPadrao: JSON.stringify([11, 13, 15, 17, 19, 20]),
    habilitado: true,
  },
  {
    id: 2,
    slug: "rs",
    nome: "Rio Grande do Sul",
    // ⚠️ confirmar o NOME EXATO do grupo do WhatsApp do RS antes de habilitar.
    grupo: "RS - OpenDesk COMERCIAL",
    // gerentes/codEstabelecimentos são INFORMATIVOS — o filtro real está no SQL
    // verbatim em bot-envio-parcial/queries/rs-*.sql (RS = estabe 2, sem filtro de
    // gerente). A ordem das linhas na imagem vem dos gerentes retornados pela query.
    gerentes: JSON.stringify(["GV KA MICHEL", "GVRS NORTE", "GVRS CAPITAL", "GVRS SUL"]),
    queryKey: "rs",
    codEstabelecimentos: JSON.stringify([2]),
    horaInicio: 7,
    horaFim: 19,
    horariosPadrao: JSON.stringify([11, 13, 15, 17, 19, 20]),
    habilitado: false, // habilitar só após confirmar o nome do grupo RS
  },
];

const STATEMENTS = [
  /* ─── parcial_envios (multi-região) ─── */
  `CREATE TABLE IF NOT EXISTS \`parcial_envios\` (
    \`id\` INT NOT NULL AUTO_INCREMENT,
    \`slug\` VARCHAR(32) NOT NULL,
    \`nome\` VARCHAR(128) NOT NULL,
    \`grupo\` VARCHAR(255) NOT NULL,
    \`gerentes\` JSON NOT NULL COMMENT 'Lista de gerentes (nomes exatos do banco ERP)',
    \`queryKey\` VARCHAR(32) NOT NULL COMMENT 'Chave para o bot saber qual SQL/filtro usar',
    \`codEstabelecimentos\` JSON NOT NULL DEFAULT (JSON_ARRAY(1, 2)) COMMENT 'Cod_Estabe para filtro SQL',
    \`horaInicio\` INT NOT NULL DEFAULT 7,
    \`horaFim\` INT NOT NULL DEFAULT 19,
    \`horariosPadrao\` JSON COMMENT 'Horários fixos de envio (horas 0-23)',
    \`medias\` JSON COMMENT 'Médias calculadas pelo bot (read-only no portal)',
    \`forcarEnvio\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`pausado\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`status\` VARCHAR(32) NOT NULL DEFAULT 'iniciando',
    \`botOnline\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`ultimoHeartbeat\` TIMESTAMP NULL DEFAULT NULL,
    \`ultimoEnvio\` TIMESTAMP NULL DEFAULT NULL,
    \`proximoEnvio\` TIMESTAMP NULL DEFAULT NULL,
    \`habilitado\` BOOLEAN NOT NULL DEFAULT TRUE,
    \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`parcial_envios_slug_uk\` (\`slug\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  /* ─── parcial_imagens (por envio) ─── */
  `CREATE TABLE IF NOT EXISTS \`parcial_imagens\` (
    \`id\` INT NOT NULL AUTO_INCREMENT,
    \`envioId\` INT NOT NULL,
    \`mimeType\` VARCHAR(32) NOT NULL DEFAULT 'image/png',
    \`base64\` LONGTEXT,
    \`geradoEm\` TIMESTAMP NULL DEFAULT NULL,
    \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`parcial_imagens_envio_uk\` (\`envioId\`),
    CONSTRAINT \`fk_parcial_imagens_envio\` FOREIGN KEY (\`envioId\`) REFERENCES \`parcial_envios\`(\`id\`) ON DELETE CASCADE
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
      `→ Migrando para multi-envio em ${process.env.DATABASE_URL.replace(/:[^:@]+@/, ":***@")}…\n`,
    );

    // 1. Criar tabelas
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

    // 2. Migrar dados do singleton parcial_estado para o primeiro envio (SC)
    const [existingEnvios] = await conn.execute(
      "SELECT COUNT(*) as cnt FROM `parcial_envios`",
    );
    if (existingEnvios[0].cnt === 0) {
      console.log("\n→ Semeando envios (SC + RS)…");

      // Tenta puxar dados do singleton existente
      let singletonData = null;
      try {
        const [rows] = await conn.execute("SELECT * FROM `parcial_estado` WHERE id = 1");
        if (rows.length > 0) singletonData = rows[0];
      } catch {
        // tabela pode não existir
      }

      for (const envio of ENVIOS_SEED) {
        // Se é SC e temos dados do singleton, usa os valores existentes
        if (envio.slug === "sc" && singletonData) {
          envio.grupo = singletonData.grupo || envio.grupo;
          envio.horaInicio = singletonData.horaInicio ?? envio.horaInicio;
          envio.horaFim = singletonData.horaFim ?? envio.horaFim;
          if (singletonData.horariosPadrao) {
            envio.horariosPadrao =
              typeof singletonData.horariosPadrao === "string"
                ? singletonData.horariosPadrao
                : JSON.stringify(singletonData.horariosPadrao);
          }
          if (singletonData.medias) {
            envio.medias =
              typeof singletonData.medias === "string"
                ? singletonData.medias
                : JSON.stringify(singletonData.medias);
          }
        }

        await conn.execute(
          `INSERT IGNORE INTO \`parcial_envios\`
           (\`id\`, \`slug\`, \`nome\`, \`grupo\`, \`gerentes\`, \`queryKey\`, \`codEstabelecimentos\`,
            \`horaInicio\`, \`horaFim\`, \`horariosPadrao\`, \`medias\`, \`habilitado\`)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            envio.id,
            envio.slug,
            envio.nome,
            envio.grupo,
            envio.gerentes,
            envio.queryKey,
            envio.codEstabelecimentos,
            envio.horaInicio,
            envio.horaFim,
            envio.horariosPadrao,
            envio.medias || null,
            envio.habilitado,
          ],
        );
        console.log(`  ✓ envio "${envio.nome}" (slug: ${envio.slug})`);
      }

      // 3. Criar imagens placeholder para cada envio
      for (const envio of ENVIOS_SEED) {
        await conn.execute(
          "INSERT IGNORE INTO `parcial_imagens` (`envioId`) VALUES (?)",
          [envio.id],
        );
      }
      console.log("  ✓ parcial_imagens (placeholders)");

      // 4. Migrar a última imagem do singleton para SC
      try {
        const [imgRows] = await conn.execute(
          "SELECT `base64`, `mimeType`, `geradoEm` FROM `parcial_imagem` WHERE id = 1",
        );
        if (imgRows.length > 0 && imgRows[0].base64) {
          await conn.execute(
            "UPDATE `parcial_imagens` SET `base64` = ?, `mimeType` = ?, `geradoEm` = ? WHERE `envioId` = 1",
            [imgRows[0].base64, imgRows[0].mimeType || "image/png", imgRows[0].geradoEm],
          );
          console.log("  ✓ imagem do singleton migrada para SC");
        }
      } catch {
        // tabela parcial_imagem pode não existir
      }
    } else {
      console.log("\n→ Envios já existem — pulando seed.");
    }

    console.log("\n✓ Migração multi-envio concluída com sucesso.");
  } catch (err) {
    console.error("\n✗ Falha na migração:", err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();
