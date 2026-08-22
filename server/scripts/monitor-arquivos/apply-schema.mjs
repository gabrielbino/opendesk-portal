/**
 * Cria as tabelas do submódulo "Monitor de Integrações" (Indicadores) — prefixo `monarq_`
 * (monitor de arquivos; o módulo nasce em pedidos e cresce para listas de preço).
 *
 * Uso:
 *   node server/scripts/monitor-arquivos/apply-schema.mjs
 *
 * Idempotente: `CREATE TABLE IF NOT EXISTS` + `INSERT IGNORE` no singleton do coletor,
 * então pode rodar múltiplas vezes sem efeito colateral.
 *
 * Arquitetura (ver docs/monitor-arquivos-handoff.md):
 *  - O COLETOR (agente na VM) só varre pastas e reporta o snapshot via /api/monitor-arquivos/*.
 *  - O CÉREBRO vive AQUI no portal: reconciliação da máquina de estados, SLA, alertas.
 *  - O WA GATEWAY (agente na VM) drena `monarq_wa_outbox` e envia pelo WhatsApp.
 *
 * NOTA: SQL puro por causa do drizzle-kit dessincronizado (ver CLAUDE.md). O bloco espelho
 * em drizzle/schema.ts serve só para tipagem das queries.
 */

import "dotenv/config";
import mysql from "mysql2/promise";

const STATEMENTS = [
  /* ─── monarq_config ───
     Um caminho monitorado + suas regras (tudo editável na modal do painel por quem tem
     permissão de escrita). `extensoesPendente` = caiu mas não lido; `extensaoLida` = lido
     pelo ERP. Agenda (diasSemana/horaInicio/horaFim) segue @shared/agenda. */
  `CREATE TABLE IF NOT EXISTS \`monarq_config\` (
    \`id\` INT NOT NULL AUTO_INCREMENT,
    \`nome\` VARCHAR(160) NOT NULL,
    \`caminho\` VARCHAR(512) NOT NULL,
    \`tipoMonitoramento\` VARCHAR(16) NOT NULL DEFAULT 'pedidos',
    \`extensoesPendente\` JSON NOT NULL,
    \`extensaoLida\` VARCHAR(32) NOT NULL DEFAULT '._RM',
    \`intervaloVarreduraSeg\` INT NOT NULL DEFAULT 60,
    \`slaLeituraMin\` INT NOT NULL DEFAULT 30,
    \`gapSemPedidoMin\` INT NOT NULL DEFAULT 60,
    \`realertaMin\` INT NOT NULL DEFAULT 30,
    \`diasSemana\` JSON,
    \`horaInicio\` INT NOT NULL DEFAULT 0,
    \`horaFim\` INT NOT NULL DEFAULT 24,
    \`waContaId\` VARCHAR(64) NOT NULL DEFAULT 'monitor',
    \`ativo\` BOOLEAN NOT NULL DEFAULT TRUE,
    \`ultimaVarreduraEm\` TIMESTAMP NULL DEFAULT NULL,
    \`ultimaPastaMtime\` TIMESTAMP NULL DEFAULT NULL,
    \`alertaPedidoEm\` TIMESTAMP NULL DEFAULT NULL,
    \`alertaPedidoUltimoEm\` TIMESTAMP NULL DEFAULT NULL,
    \`alertaListaEm\` TIMESTAMP NULL DEFAULT NULL,
    \`alertaListaUltimoEm\` TIMESTAMP NULL DEFAULT NULL,
    \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    KEY \`monarq_config_ativo_idx\` (\`ativo\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  /* ─── monarq_evento ───
     Máquina de estados por ARQUIVO (= um pedido). Chave natural (configId, nomeBase):
     para pedidos SÓ a extensão muda (PEDIDO123.ped → PEDIDO123._RM). `caiuEm` = mtime do
     arquivo pendente; `lidoEm` = observação da transição para a extensão lida. */
  `CREATE TABLE IF NOT EXISTS \`monarq_evento\` (
    \`id\` INT NOT NULL AUTO_INCREMENT,
    \`configId\` INT NOT NULL,
    \`nomeBase\` VARCHAR(255) NOT NULL,
    \`arquivoPendente\` VARCHAR(300) NULL,
    \`extensaoPendente\` VARCHAR(32) NULL,
    \`caiuEm\` TIMESTAMP NOT NULL,
    \`lidoEm\` TIMESTAMP NULL DEFAULT NULL,
    \`estado\` VARCHAR(16) NOT NULL DEFAULT 'pendente',
    \`alertadoEm\` TIMESTAMP NULL DEFAULT NULL,
    \`ultimoAlertaEm\` TIMESTAMP NULL DEFAULT NULL,
    \`resolvidoAvisado\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`monarq_evento_config_base_unique\` (\`configId\`, \`nomeBase\`),
    KEY \`monarq_evento_config_estado_idx\` (\`configId\`, \`estado\`),
    KEY \`monarq_evento_config_caiu_idx\` (\`configId\`, \`caiuEm\`),
    CONSTRAINT \`monarq_evento_config_fk\` FOREIGN KEY (\`configId\`)
      REFERENCES \`monarq_config\` (\`id\`) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  /* ─── monarq_lista ───
     Modo 'geracao' (Fase 4): uma LISTA a acompanhar (preço/estoque/rota…) dentro de uma integração
     (monarq_config). Uma config-mãe pode ter N listas (o "+" do formulário), cada uma com seu
     CAMINHO próprio + extensões + horário limite (deadline). "Gerada" = arquivo da extensão com mtime
     de HOJE (SP). A geração é o sucesso (não há etapa pós). Estado do dia (aguardando/gerado/
     atrasado) é dirigido por snapshot e reseta a cada dia via `diaRef`. */
  `CREATE TABLE IF NOT EXISTS \`monarq_lista\` (
    \`id\` INT NOT NULL AUTO_INCREMENT,
    \`configId\` INT NOT NULL,
    \`rotulo\` VARCHAR(120) NOT NULL,
    \`caminho\` VARCHAR(512) NOT NULL,
    \`modoIdentificacao\` VARCHAR(12) NOT NULL DEFAULT 'extensao',
    \`nomeArquivo\` VARCHAR(300) NULL DEFAULT NULL,
    \`extensoes\` JSON NOT NULL,
    \`quantidadeEsperada\` INT NOT NULL DEFAULT 1,
    \`horaAlvo\` INT NOT NULL DEFAULT 8,
    \`minutoAlvo\` INT NOT NULL DEFAULT 0,
    \`realertaMin\` INT NOT NULL DEFAULT 60,
    \`ordem\` INT NOT NULL DEFAULT 0,
    \`ativo\` BOOLEAN NOT NULL DEFAULT TRUE,
    \`qtdGeradaHoje\` INT NOT NULL DEFAULT 0,
    \`deteccao\` VARCHAR(10) NULL DEFAULT NULL,
    \`ultimaGeracaoEm\` TIMESTAMP NULL DEFAULT NULL,
    \`ultimoArquivo\` VARCHAR(300) NULL DEFAULT NULL,
    \`ultimaVarreduraEm\` TIMESTAMP NULL DEFAULT NULL,
    \`diaRef\` VARCHAR(10) NULL DEFAULT NULL,
    \`estadoDia\` VARCHAR(16) NOT NULL DEFAULT 'aguardando',
    \`alertadoEm\` TIMESTAMP NULL DEFAULT NULL,
    \`ultimoAlertaEm\` TIMESTAMP NULL DEFAULT NULL,
    \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    KEY \`monarq_lista_config_idx\` (\`configId\`),
    KEY \`monarq_lista_ativo_idx\` (\`ativo\`),
    CONSTRAINT \`monarq_lista_config_fk\` FOREIGN KEY (\`configId\`)
      REFERENCES \`monarq_config\` (\`id\`) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  /* ─── monarq_destino ───
     Cadastro reutilizável de destino WhatsApp (grupo|contato), por conta do gateway.
     N:N com config via monarq_config_destino. */
  `CREATE TABLE IF NOT EXISTS \`monarq_destino\` (
    \`id\` INT NOT NULL AUTO_INCREMENT,
    \`waContaId\` VARCHAR(64) NOT NULL DEFAULT 'monitor',
    \`tipo\` VARCHAR(8) NOT NULL,
    \`identificador\` VARCHAR(255) NOT NULL,
    \`nome\` VARCHAR(160) NOT NULL,
    \`ativo\` BOOLEAN NOT NULL DEFAULT TRUE,
    \`universal\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`monarq_destino_conta_tipo_ident_unique\` (\`waContaId\`, \`tipo\`, \`identificador\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  /* ─── monarq_config_destino (N:N) ───
     Quais destinos recebem os alertas de cada caminho. */
  `CREATE TABLE IF NOT EXISTS \`monarq_config_destino\` (
    \`id\` INT NOT NULL AUTO_INCREMENT,
    \`configId\` INT NOT NULL,
    \`destinoId\` INT NOT NULL,
    \`habilitado\` BOOLEAN NOT NULL DEFAULT TRUE,
    \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`monarq_config_destino_unique\` (\`configId\`, \`destinoId\`),
    KEY \`monarq_config_destino_destino_idx\` (\`destinoId\`),
    CONSTRAINT \`monarq_cd_config_fk\` FOREIGN KEY (\`configId\`)
      REFERENCES \`monarq_config\` (\`id\`) ON DELETE CASCADE,
    CONSTRAINT \`monarq_cd_destino_fk\` FOREIGN KEY (\`destinoId\`)
      REFERENCES \`monarq_destino\` (\`id\`) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  /* ─── monarq_wa_outbox ───
     Fila de saída: o CÉREBRO enfileira a mensagem; o WA GATEWAY (Fase 2) drena por
     /api/monitor-arquivos/wa/pull (read-and-clear) e reporta o resultado. Desacopla o
     portal (cloud) do envio (VM). Enquanto o gateway não existir, as linhas só acumulam. */
  `CREATE TABLE IF NOT EXISTS \`monarq_wa_outbox\` (
    \`id\` INT NOT NULL AUTO_INCREMENT,
    \`waContaId\` VARCHAR(64) NOT NULL DEFAULT 'monitor',
    \`tipo\` VARCHAR(8) NOT NULL,
    \`identificador\` VARCHAR(255) NOT NULL,
    \`mensagem\` TEXT NOT NULL,
    \`eventoId\` INT NULL DEFAULT NULL,
    \`categoria\` VARCHAR(16) NOT NULL DEFAULT 'alerta',
    \`status\` VARCHAR(12) NOT NULL DEFAULT 'pendente',
    \`tentativas\` INT NOT NULL DEFAULT 0,
    \`erro\` VARCHAR(512) NULL DEFAULT NULL,
    \`criadoEm\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`enviadoEm\` TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (\`id\`),
    KEY \`monarq_wa_outbox_status_idx\` (\`status\`, \`criadoEm\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  /* ─── monarq_coletor (singleton id=1) ───
     Heartbeat do coletor: o painel usa isto para não mostrar "verde falso" quando o
     agente está caído (status vira "coletor offline"). */
  `CREATE TABLE IF NOT EXISTS \`monarq_coletor\` (
    \`id\` INT NOT NULL,
    \`online\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`ultimoHeartbeat\` TIMESTAMP NULL DEFAULT NULL,
    \`versao\` VARCHAR(32) NULL DEFAULT NULL,
    \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  /* ─── monarq_wa_conta ───
     Uma conta de WhatsApp do WA GATEWAY (Fase 2). `id` = waContaId (ex.: 'monitor'). O gateway
     na VM publica QR/status/grupos e drena a fila `monarq_wa_outbox` dessa conta. Multi-conta:
     basta inserir mais linhas. `logoutSolicitado` = flag one-shot (portal → gateway: despareia
     e gera novo QR), consumida no heartbeat. */
  `CREATE TABLE IF NOT EXISTS \`monarq_wa_conta\` (
    \`id\` VARCHAR(64) NOT NULL,
    \`nome\` VARCHAR(120) NOT NULL,
    \`status\` VARCHAR(24) NOT NULL DEFAULT 'aguardando_qr',
    \`qrDataUrl\` MEDIUMTEXT NULL DEFAULT NULL,
    \`qrTs\` TIMESTAMP NULL DEFAULT NULL,
    \`grupos\` JSON NULL,
    \`online\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`ultimoHeartbeat\` TIMESTAMP NULL DEFAULT NULL,
    \`logoutSolicitado\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`ativo\` BOOLEAN NOT NULL DEFAULT TRUE,
    \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  /* ─── monarq_log ───
     Histórico de eventos do módulo (info|ok|warn|erro) para auditoria/depuração.
     Cap de 200 linhas feito na aplicação ao inserir. */
  `CREATE TABLE IF NOT EXISTS \`monarq_log\` (
    \`id\` INT NOT NULL AUTO_INCREMENT,
    \`ts\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`nivel\` VARCHAR(8) NOT NULL DEFAULT 'info',
    \`msg\` VARCHAR(512) NOT NULL,
    PRIMARY KEY (\`id\`),
    KEY \`monarq_log_ts_idx\` (\`ts\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  /* ─── monarq_backup_config (singleton id=1) ───
     Config do BACKUP de pedidos por RETENÇÃO. Ajustes PELO PORTAL (admin): `extensoesZip` (quais
     extensões arquivar; default ['._rm']), `manterDias`+`manterUnidade` (manter na pasta só os
     últimos N dias úteis/corridos; arquiva o mais antigo) e `retencaoZipMeses` (apaga pastas-mês
     de backup mais velhas que isto; default 12). O QUANDO rodar é do systemd timer na VM (não é
     tempo real). As colunas `ultimo*` guardam o resultado do último backup para a notificação +
     linha "só leitura" no painel. Ver docs/monitor-arquivos-backup.md. */
  `CREATE TABLE IF NOT EXISTS \`monarq_backup_config\` (
    \`id\` INT NOT NULL,
    \`extensoesZip\` JSON,
    \`manterDias\` INT NOT NULL DEFAULT 5,
    \`manterUnidade\` VARCHAR(8) NOT NULL DEFAULT 'uteis',
    \`retencaoZipMeses\` INT NOT NULL DEFAULT 12,
    \`caminhosExtras\` JSON NULL,
    \`ultimoCorte\` VARCHAR(10) NULL DEFAULT NULL,
    \`ultimaExecucaoEm\` TIMESTAMP NULL DEFAULT NULL,
    \`ultimoOk\` BOOLEAN NULL DEFAULT NULL,
    \`ultimoResumo\` JSON NULL,
    \`ultimoErros\` JSON NULL,
    \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  /* ─── monarq_resumo_config (singleton id=1) ───
     Config do RESUMO DIÁRIO por imagem no WhatsApp: uma imagem com o cenário de integrações
     (pedidos + listas) enviada no fim da última janela (horário configurável no painel). O gatilho
     é o heartbeat do coletor (sem cron no portal): quando o dia está marcado e já passou de
     `hora:minuto` (fuso SP) e ainda não enviou hoje (`diaRef`), o cérebro monta o payload e
     enfileira em monarq_wa_outbox (categoria='resumo'); a VM renderiza a imagem (Pillow) e envia.
     `destinoIds` vazio/nulo = todos os destinos universais. Ver docs/monitor-arquivos-handoff.md. */
  `CREATE TABLE IF NOT EXISTS \`monarq_resumo_config\` (
    \`id\` INT NOT NULL,
    \`ativo\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`hora\` INT NOT NULL DEFAULT 21,
    \`minuto\` INT NOT NULL DEFAULT 0,
    \`diasSemana\` JSON,
    \`incluirPedidos\` BOOLEAN NOT NULL DEFAULT TRUE,
    \`incluirListas\` BOOLEAN NOT NULL DEFAULT TRUE,
    \`destinoIds\` JSON,
    \`diaRef\` VARCHAR(10) NULL DEFAULT NULL,
    \`ultimoEnvioEm\` TIMESTAMP NULL DEFAULT NULL,
    \`ultimoOk\` BOOLEAN NULL DEFAULT NULL,
    \`ultimoDetalhe\` VARCHAR(512) NULL DEFAULT NULL,
    \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  /* ─── monarq_alerta_tela_config (singleton id=1) ───
     Alerta EM TELA (overlay + aba + som) de PEDIDOS travados: define QUEM (usuários do portal)
     recebe o aviso quando QUALQUER integração de pedidos fica vermelha (SLA estourado). Listas
     ficam de fora (só pedidos). O WhatsApp agregado por integração segue independente. Espelha o
     modelo do alerta CFV (Pedidos por Layout). Ver docs/monitor-arquivos-handoff.md. */
  `CREATE TABLE IF NOT EXISTS \`monarq_alerta_tela_config\` (
    \`id\` INT NOT NULL,
    \`ativo\` BOOLEAN NOT NULL DEFAULT TRUE,
    \`destinatarioIds\` JSON,
    \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

const SEEDS = [
  {
    label: "monarq_coletor (singleton)",
    sql: "INSERT IGNORE INTO `monarq_coletor` (`id`) VALUES (1)",
    params: [],
  },
  {
    label: "monarq_backup_config (singleton)",
    sql: "INSERT IGNORE INTO `monarq_backup_config` (`id`, `extensoesZip`) VALUES (1, ?)",
    params: [JSON.stringify(["._rm"])],
  },
  {
    label: "monarq_wa_conta (conta padrão 'monitor')",
    sql: "INSERT IGNORE INTO `monarq_wa_conta` (`id`, `nome`) VALUES ('monitor', ?)",
    params: ["Monitor de Integrações"],
  },
  {
    label: "monarq_resumo_config (singleton, dias úteis)",
    sql: "INSERT IGNORE INTO `monarq_resumo_config` (`id`, `diasSemana`) VALUES (1, ?)",
    params: [JSON.stringify([1, 2, 3, 4, 5])],
  },
  {
    label: "monarq_alerta_tela_config (singleton, sem destinatários)",
    sql: "INSERT IGNORE INTO `monarq_alerta_tela_config` (`id`, `ativo`, `destinatarioIds`) VALUES (1, TRUE, ?)",
    params: [JSON.stringify([])],
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
      `→ Aplicando schema do Monitor de Integrações em ${process.env.DATABASE_URL.replace(/:[^:@]+@/, ":***@")}…\n`,
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

    // Migrações idempotentes de COLUNA: o CREATE TABLE IF NOT EXISTS não altera tabela já
    // existente, então colunas adicionadas depois entram por ALTER (checando information_schema).
    const COLUNAS = [
      {
        tabela: "monarq_destino",
        coluna: "universal",
        ddl: "ADD COLUMN `universal` BOOLEAN NOT NULL DEFAULT FALSE",
      },
      // monarq_lista: identificação da lista (nome exato x contagem de extensão) — Fase 4.
      {
        tabela: "monarq_lista",
        coluna: "modoIdentificacao",
        ddl: "ADD COLUMN `modoIdentificacao` VARCHAR(12) NOT NULL DEFAULT 'extensao'",
      },
      {
        tabela: "monarq_lista",
        coluna: "nomeArquivo",
        ddl: "ADD COLUMN `nomeArquivo` VARCHAR(300) NULL DEFAULT NULL",
      },
      {
        tabela: "monarq_lista",
        coluna: "quantidadeEsperada",
        ddl: "ADD COLUMN `quantidadeEsperada` INT NOT NULL DEFAULT 1",
      },
      {
        tabela: "monarq_lista",
        coluna: "qtdGeradaHoje",
        ddl: "ADD COLUMN `qtdGeradaHoje` INT NOT NULL DEFAULT 0",
      },
      // Como a geração foi detectada: 'arquivo' (reconheceu o arquivo) | 'pasta' (mtime da pasta).
      {
        tabela: "monarq_lista",
        coluna: "deteccao",
        ddl: "ADD COLUMN `deteccao` VARCHAR(10) NULL DEFAULT NULL",
      },
      // monarq_config: estado do ciclo de ALERTA AGREGADO por integração (1 mensagem, não por evento).
      {
        tabela: "monarq_config",
        coluna: "alertaPedidoEm",
        ddl: "ADD COLUMN `alertaPedidoEm` TIMESTAMP NULL DEFAULT NULL",
      },
      {
        tabela: "monarq_config",
        coluna: "alertaPedidoUltimoEm",
        ddl: "ADD COLUMN `alertaPedidoUltimoEm` TIMESTAMP NULL DEFAULT NULL",
      },
      {
        tabela: "monarq_config",
        coluna: "alertaListaEm",
        ddl: "ADD COLUMN `alertaListaEm` TIMESTAMP NULL DEFAULT NULL",
      },
      {
        tabela: "monarq_config",
        coluna: "alertaListaUltimoEm",
        ddl: "ADD COLUMN `alertaListaUltimoEm` TIMESTAMP NULL DEFAULT NULL",
      },
      // monarq_backup_config: caminhos EXTRAS de backup (ex.: pastas de listas), cada um com a sua
      // própria extensão — a retenção/poda é a mesma dos pedidos.
      {
        tabela: "monarq_backup_config",
        coluna: "caminhosExtras",
        ddl: "ADD COLUMN `caminhosExtras` JSON NULL",
      },
      // monarq_config: mtime da PRÓPRIA pasta (fallback visual quando não há arquivos reconhecidos).
      {
        tabela: "monarq_config",
        coluna: "ultimaPastaMtime",
        ddl: "ADD COLUMN `ultimaPastaMtime` TIMESTAMP NULL DEFAULT NULL AFTER `ultimaVarreduraEm`",
      },
    ];

    // Tabelas adicionais (CREATE IF NOT EXISTS — idempotente).
    const TABELAS_EXTRAS = [
      `CREATE TABLE IF NOT EXISTS \`monarq_historico_dia\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`configId\` INT NOT NULL,
        \`dia\` VARCHAR(10) NOT NULL,
        \`tevePedido\` BOOLEAN NOT NULL DEFAULT FALSE,
        \`qtdPedidos\` INT NOT NULL DEFAULT 0,
        \`qtdLidos\` INT NOT NULL DEFAULT 0,
        \`criadoEm\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`atualizadoEm\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`monarq_historico_dia_config_dia_idx\` (\`configId\`, \`dia\`),
        CONSTRAINT \`monarq_historico_dia_configId_fk\` FOREIGN KEY (\`configId\`) REFERENCES \`monarq_config\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    ];

    console.log("\n→ Migrações de coluna (idempotentes)…");
    for (const ddl of TABELAS_EXTRAS) {
      await conn.execute(ddl);
    }
    console.log("  ✓ Tabelas extras verificadas (monarq_historico_dia)");
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

    console.log("\n→ Semeando singleton (id=1)…");
    for (const seed of SEEDS) {
      await conn.execute(seed.sql, seed.params);
      console.log(`  ✓ ${seed.label}`);
    }

    console.log("\n✓ Schema do Monitor de Integrações aplicado com sucesso.");
  } catch (err) {
    console.error("\n✗ Falha ao aplicar schema:", err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();
