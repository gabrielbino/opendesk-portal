/**
 * Cria a tabela de HISTÓRICO do painel "Pedidos por Layout" (Indicadores) — prefixo `indicadores_`.
 *
 * Uso:
 *   node server/scripts/indicadores/apply-schema.mjs
 *
 * Idempotente (`CREATE TABLE IF NOT EXISTS`), pode rodar múltiplas vezes.
 *
 * Contexto: o painel é pass-through AO VIVO (a API é "do dia", sem parâmetro de data). Para habilitar
 * comparação vs. período anterior + sparkline, gravamos FOTOS periódicas (a cada 30 min, janela
 * 08:00–22:00 SP) do agregado por (estado, layout). O histórico é DAQUI PRA FRENTE (não retroativo).
 * Cada foto guarda o acumulado do dia até `hhmm`; a leitura "mesmo horário do dia" compara maçã com
 * maçã (hoje até agora × dias anteriores até o mesmo horário). Ver docs/indicadores-handoff.md.
 *
 * NOTA: SQL puro (drizzle-kit dessincronizado — ver CLAUDE.md). Espelho em drizzle/schema.ts só p/ tipagem.
 */

import "dotenv/config";
import mysql from "mysql2/promise";

const STATEMENTS = [
  /* ─── indicadores_pedido_layout_hist ───
     Uma linha por (dia, hhmm, estado, layout). Guardamos só SC e RS (Unificado = soma na leitura).
     `hhmm` = slot de 30 min (ex.: '08:00','08:30'…'22:00'). Chave natural (dia, hhmm, estado, layout)
     → o snapshot faz UPSERT (re-disparo no mesmo slot só atualiza os valores). Valores acumulados do
     dia (monótonos). */
  `CREATE TABLE IF NOT EXISTS \`indicadores_pedido_layout_hist\` (
    \`id\` INT NOT NULL AUTO_INCREMENT,
    \`dia\` VARCHAR(10) NOT NULL,
    \`hhmm\` VARCHAR(5) NOT NULL,
    \`estado\` VARCHAR(8) NOT NULL,
    \`layout\` VARCHAR(120) NOT NULL,
    \`qtdPedidos\` INT NOT NULL DEFAULT 0,
    \`valorPedido\` DOUBLE NOT NULL DEFAULT 0,
    \`qtdCortados\` INT NOT NULL DEFAULT 0,
    \`valorCortados\` DOUBLE NOT NULL DEFAULT 0,
    \`qtdTotal\` INT NOT NULL DEFAULT 0,
    \`capturadoEm\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`ipl_hist_dia_hhmm_estado_layout_unique\` (\`dia\`, \`hhmm\`, \`estado\`, \`layout\`),
    KEY \`ipl_hist_dia_idx\` (\`dia\`),
    KEY \`ipl_hist_estado_layout_idx\` (\`estado\`, \`layout\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  /* ─── indicadores_alerta_cfv_config (singleton) ───
     Config do alerta de "layout sem pedidos" (overlay em tela + WhatsApp). Antes só existia no
     espelho drizzle (sem DDL versionado); agora criado aqui. `destinatarioIds` = usuários do portal
     que veem o overlay; `destinoIds` = destinos WhatsApp (monarq_destino) que recebem por WhatsApp;
     `waAlertaEm`/`waUltimoAlertaEm` = estado do disparo server-side (re-alerta agregado). */
  `CREATE TABLE IF NOT EXISTS \`indicadores_alerta_cfv_config\` (
    \`id\` INT NOT NULL AUTO_INCREMENT,
    \`layouts\` JSON NOT NULL,
    \`regioes\` JSON NOT NULL,
    \`gapMinutos\` INT NOT NULL DEFAULT 30,
    \`horaInicio\` INT NOT NULL DEFAULT 8,
    \`horaFim\` INT NOT NULL DEFAULT 18,
    \`diasSemana\` JSON NOT NULL,
    \`destinatarioIds\` JSON NOT NULL,
    \`destinoIds\` JSON NULL,
    \`waRealertaMin\` INT NOT NULL DEFAULT 60,
    \`waAlertaEm\` TIMESTAMP NULL DEFAULT NULL,
    \`waUltimoAlertaEm\` TIMESTAMP NULL DEFAULT NULL,
    \`ativo\` BOOLEAN NOT NULL DEFAULT TRUE,
    \`criadoEm\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`atualizadoEm\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

/* Migrações idempotentes de coluna (tabela, coluna, DDL) — para bancos já criados antes destas colunas. */
const COLUNAS = [
  { tabela: "indicadores_pedido_layout_hist", coluna: "qtdTotal", ddl: "ADD COLUMN `qtdTotal` INT NOT NULL DEFAULT 0" },
  { tabela: "indicadores_alerta_cfv_config", coluna: "destinoIds", ddl: "ADD COLUMN `destinoIds` JSON NULL" },
  { tabela: "indicadores_alerta_cfv_config", coluna: "waRealertaMin", ddl: "ADD COLUMN `waRealertaMin` INT NOT NULL DEFAULT 60" },
  { tabela: "indicadores_alerta_cfv_config", coluna: "waAlertaEm", ddl: "ADD COLUMN `waAlertaEm` TIMESTAMP NULL DEFAULT NULL" },
  { tabela: "indicadores_alerta_cfv_config", coluna: "waUltimoAlertaEm", ddl: "ADD COLUMN `waUltimoAlertaEm` TIMESTAMP NULL DEFAULT NULL" },
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não definida no .env. Aborte.");
    process.exit(1);
  }
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    console.log(
      `→ Aplicando schema de Indicadores em ${process.env.DATABASE_URL.replace(/:[^:@]+@/, ":***@")}…\n`,
    );
    for (let i = 0; i < STATEMENTS.length; i++) {
      const sql = STATEMENTS[i];
      const match = sql.match(/CREATE TABLE IF NOT EXISTS `([^`]+)`/);
      const tableName = match ? match[1] : `statement #${i + 1}`;
      await conn.execute(sql);
      console.log(`  ✓ ${tableName}`);
    }

    console.log("\n→ Migrações de coluna (idempotentes)…");
    for (const c of COLUNAS) {
      const [rows] = await conn.execute(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [c.tabela, c.coluna],
      );
      if (rows.length === 0) {
        await conn.execute(`ALTER TABLE \`${c.tabela}\` ${c.ddl}`);
        console.log(`  ✓ ${c.tabela}.${c.coluna} adicionada`);
      } else {
        console.log(`  • ${c.tabela}.${c.coluna} já existe`);
      }
    }

    console.log("\n✓ Schema de Indicadores aplicado com sucesso.");
  } catch (err) {
    console.error("\n✗ Falha ao aplicar schema:", err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();
