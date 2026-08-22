/**
 * Bot "Envio de Parcial" — Panorama de Pedidos Sem ST (OpenDesk)
 * ═══════════════════════════════════════════════════════════════
 * MULTI-ENVIO (v2): itera os envios habilitados no portal, cada um com seu
 * grupo WhatsApp, gerentes, query key e estabelecimentos.
 *
 * Roda no SERVIDOR WINDOWS LOCAL (junto do conector). Sincroniza com o portal
 * (helpdesk no Manus) por HTTPS via /api/parcial/v2/* (Bearer token).
 *
 * Rode com:  node index.js   (ou via PM2 — ver README.md)
 */

require("dotenv").config();

const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcodeTerminal = require("qrcode-terminal");
const QRCode = require("qrcode");
const cron = require("node-cron");
const sql = require("mssql");
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

// Carimbo de versão — aparece no log ao subir, para confirmar qual código está rodando.
const BOT_VERSION = "2026-07-02b · temporários em .painel-tmp + limpeza no boot; gerências ocultas";

// ── Configuração via .env ─────────────────────────────────────────────────────
const HELPDESK_URL = (process.env.HELPDESK_URL || "http://localhost:3000").replace(/\/+$/, "");
const BOT_TOKEN = process.env.PARCIAL_BOT_TOKEN || "";
const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS || 3000);
const PYTHON_BIN = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");

const DB = {
  server: process.env.DB_SERVER || "SRV-ERP-DB\\SQL2012",
  database: process.env.DB_DATABASE || "DMD",
  user: process.env.DB_USER || "ti",
  password: process.env.DB_PASSWORD || "",
  options: { encrypt: false, trustServerCertificate: true },
  port: Number(process.env.DB_PORT || 1433),
};

// ── Estado em memória ─────────────────────────────────────────────────────────
/** Lista de envios habilitados (recebida do portal via heartbeat v2). */
let envios = [];
/** Fase de conexão do WhatsApp. */
let connPhase = "iniciando"; // iniciando | aguardando_qr | rodando | reconectando
let dbError = false;
let sending = false;
let clienteWA = null;
let cronJob = null;
let ultimoEnvio = null; // ISO string

/**
 * Fila de envios forçados pendentes.
 * Quando o portal solicita "Enviar agora" mas o bot está ocupado ou o WhatsApp
 * não está pronto, o envio é enfileirado aqui e processado assim que possível.
 */
const filaEnviosForcados = [];


/** Deriva o status reportado a partir da conexão + flags. */
function statusAtual() {
  if (connPhase !== "rodando") return connPhase;
  if (dbError) return "erro_banco";
  return "rodando";
}

// ── Cliente HTTP da ponte ─────────────────────────────────────────────────────
async function api(endpoint, body) {
  const res = await fetch(`${HELPDESK_URL}/api/parcial/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${BOT_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} em /api/parcial/${endpoint}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

function logIcon(nivel) {
  return nivel === "ok" ? "✔" : nivel === "erro" ? "✘" : nivel === "warn" ? "⚠" : "ℹ";
}

/** Log no console + publica no portal (fire-and-forget). */
function addLog(nivel, msg) {
  console.log(`  ${logIcon(nivel)} [${nivel.toUpperCase()}] ${msg}`);
  api("log", { nivel, msg: String(msg).slice(0, 512) }).catch((e) =>
    console.error("  [log] falha ao publicar:", e.message),
  );
}

/** Aplica a lista de envios recebida no heartbeat v2. */
function aplicarEnvios(data) {
  if (!Array.isArray(data)) return;
  envios = data;
}

// ── Regra de agendamento ──────────────────────────────────────────────────────
const TZ = "America/Sao_Paulo";

/** Partes de data/hora no fuso de São Paulo (independe do fuso do servidor). */
function partesSP(date = new Date()) {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .formatToParts(date)
    .reduce((acc, x) => ((acc[x.type] = x.value), acc), {});
  return {
    ano: Number(p.year),
    mes: Number(p.month),
    dia: Number(p.day),
    hora: Number(p.hour),
    minuto: Number(p.minute),
    diaSemana: p.weekday, // "Mon".."Sun"
  };
}

/** Dia (1-31) do último dia ÚTIL (seg-sex) do mês. Não considera feriados. */
function ultimoDiaUtilDoMes(ano, mes /* 1-12 */) {
  const d = new Date(Date.UTC(ano, mes, 0)); // último dia do mês
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.getUTCDate();
}

/**
 * Verifica se um envio deve disparar agora, baseado nos seus horários.
 * Regra (sempre "em ponto", só dias úteis seg-sex):
 *  - último dia útil do mês → de hora em hora, das horaInicio às horaFim;
 *  - demais dias úteis      → apenas nos horários de horariosPadrao.
 */
function deveEnviarAgora(envio) {
  const { ano, mes, dia, hora, minuto, diaSemana } = partesSP();
  if (minuto !== 0) return false;
  if (diaSemana === "Sat" || diaSemana === "Sun") return false;
  if (envio.pausado) return false;
  if (dia === ultimoDiaUtilDoMes(ano, mes)) {
    return hora >= (envio.horaInicio ?? 7) && hora <= (envio.horaFim ?? 19);
  }
  const lista = Array.isArray(envio.horariosPadrao) ? envio.horariosPadrao : [11, 13, 15, 17, 19, 20];
  return lista.includes(hora);
}

/** Agenda o disparo horário (uma vez). A decisão de enviar fica em deveEnviarAgora(). */
function agendarMaster() {
  if (cronJob) return;
  cronJob = cron.schedule(
    "0 * * * *",
    () => {
      for (const envio of envios) {
        if (deveEnviarAgora(envio)) {
          enfileirarEnvio(envio, "agendado");
        }
      }
    },
    { timezone: TZ },
  );
  addLog("info", "Agendador ativo (horarios fixos nos dias uteis; hora em hora no ultimo dia util)");
}

// ── Heartbeat (polling) — V2 MULTI-ENVIO ─────────────────────────────────────
async function heartbeat() {
  try {
    const payload = { status: statusAtual() };
    if (ultimoEnvio) payload.ultimoEnvio = ultimoEnvio;
    const r = await api("v2/heartbeat", payload);
    aplicarEnvios(r.data);

    // Verifica se algum envio tem forcarEnvio (envio geral — todos os destinos)
    for (const envio of envios) {
      if (envio.forcarEnvio === true) {
        addLog("info", `Envio imediato solicitado pelo portal para: ${envio.nome}`);
        enfileirarEnvio(envio, "portal");
      }
    }

    // Verifica destinatários com envio/teste INDIVIDUAL solicitado (forcar por vínculo)
    for (const envio of envios) {
      if (Array.isArray(envio.destinatarios)) {
        for (const dest of envio.destinatarios) {
          if (dest && dest.forcar === true) enfileirarDestino(envio, dest);
        }
      }
    }

    // Verifica se o portal solicitou reiniciar o bot
    let deveSoftRestart = false;
    if (r.data && Array.isArray(r.data)) {
      for (const envio of r.data) {
        if (envio.reiniciarBot === true) {
          deveSoftRestart = true;
          break;
        }
      }
    }
    if (r.reiniciarBot === true) deveSoftRestart = true;

    // Verifica se o portal solicitou DESCONECTAR a conta do WhatsApp (logout + novo QR)
    let deveLogout = false;
    if (r.data && Array.isArray(r.data)) {
      for (const envio of r.data) {
        if (envio.logoutBot === true) { deveLogout = true; break; }
      }
    }
    if (r.logoutBot === true) deveLogout = true;

    // Verifica se o portal solicitou REINICIAR O PROCESSO (hard restart)
    let deveHardRestart = false;
    if (r.data && Array.isArray(r.data)) {
      for (const envio of r.data) {
        if (envio.hardRestart === true) { deveHardRestart = true; break; }
      }
    }
    if (r.hardRestart === true) deveHardRestart = true;

    if (deveHardRestart) {
      addLog("info", "Reinicio de PROCESSO solicitado pelo portal — encerrando (a Tarefa Agendada sobe de novo)...");
      // Dá tempo do log ser publicado antes de sair. process.exit(1) = falha →
      // a Tarefa Agendada (RestartCount/Interval) reinicia o processo ~1 min.
      setTimeout(() => process.exit(1), 1500);
      return;
    }

    if (deveLogout) {
      addLog("info", "Desconexao solicitada pelo portal — saindo da conta do WhatsApp...");
      await desconectarWhatsapp();
      return;
    }

    if (deveSoftRestart) {
      addLog("info", "Reinicio solicitado pelo portal — executando soft-restart...");
      await softRestart();
      return;
    }
  } catch (e) {
    console.error("  [heartbeat]", e.message);
  }
}

// ── Fila de envios (resolve o problema de concorrência e WhatsApp não pronto) ─
/**
 * Enfileira um envio para processamento sequencial.
 * Se o WhatsApp não estiver pronto, o envio fica na fila e será processado
 * quando o WhatsApp ficar ready (evento 'ready') ou no próximo ciclo de drenagem.
 */
function enfileirarEnvio(envio, origem = "desconhecido") {
  // Evita duplicatas na fila (mesmo envio.id)
  const jaNaFila = filaEnviosForcados.some((item) => item.envio.id === envio.id);
  if (jaNaFila) {
    addLog("info", `Envio ${envio.nome} ja esta na fila — ignorando duplicata (${origem})`);
    return;
  }
  filaEnviosForcados.push({ envio, origem, ts: Date.now() });
  addLog("info", `Envio ${envio.nome} enfileirado (origem: ${origem}, fila: ${filaEnviosForcados.length})`);
  // Tenta drenar imediatamente
  drenarFila();
}

/**
 * Drena a fila de envios sequencialmente.
 * Processa um envio por vez (respeitando o lock `sending`).
 * Se o WhatsApp não estiver pronto, para e tenta novamente quando ficar ready.
 */
async function drenarFila() {
  if (sending) return; // já tem um envio em andamento, será chamado novamente ao terminar
  if (filaEnviosForcados.length === 0) return;

  // Verifica se WhatsApp está pronto
  if (!clienteWA || connPhase !== "rodando") {
    addLog("info", `WhatsApp nao pronto (${connPhase}) — ${filaEnviosForcados.length} envio(s) aguardando na fila`);
    return; // será drenado quando o WhatsApp ficar ready
  }

  // Pega o próximo da fila
  const { envio, origem } = filaEnviosForcados.shift();
  addLog("info", `Processando envio da fila: ${envio.nome} (origem: ${origem})`);
  await buscarEEnviarPorEnvio(envio);

  // Após terminar, tenta drenar o próximo (recursivo com delay para não travar)
  if (filaEnviosForcados.length > 0) {
    setTimeout(drenarFila, 1000);
  }
}

// ── Fila de envios POR DESTINATÁRIO (botão "enviar/testar" do portal) ────────
/** Itens { envio, dest } enfileirados para envio individual (1 destino). */
const filaDestinos = [];

function enfileirarDestino(envio, dest) {
  // Evita duplicar o mesmo vínculo na fila.
  if (filaDestinos.some((it) => it.dest.vinculoId === dest.vinculoId)) return;
  filaDestinos.push({ envio, dest });
  addLog("info", `Envio individual enfileirado: ${dest.nome} (${envio.nome})`);
  drenarDestinos();
}

async function drenarDestinos() {
  if (sending) return;
  if (filaDestinos.length === 0) return;
  if (!clienteWA || connPhase !== "rodando") {
    addLog("info", `WhatsApp nao pronto (${connPhase}) — ${filaDestinos.length} envio(s) individual(is) aguardando`);
    return;
  }
  sending = true;
  try {
    const { envio, dest } = filaDestinos.shift();
    await enviarDestinoUnico(envio, dest);
  } finally {
    sending = false;
    if (filaDestinos.length > 0) setTimeout(drenarDestinos, 1500);
    else if (filaEnviosForcados.length > 0) setTimeout(drenarFila, 1500);
  }
}

/** Gera o recorte do destinatário e envia só para ele (usado pelo "enviar/testar"). */
async function enviarDestinoUnico(envio, dest) {
  const dados = await buscarDados(envio);
  if (!dados) return;
  const { rows, medias, mediasRca, mediasGerRca } = dados;
  if (!rows || rows.length === 0) {
    addLog("warn", `Sem pedidos hoje — envio individual cancelado (${dest.nome})`);
    return;
  }
  const ft = dest.filtroTipo || "todos";
  let imgPath;
  if (ft === "todos") {
    // Painel completo COM a separação das gerências cross-estado (igual ao ciclo).
    const { rowsPainel, mediasPainel } = montarPainelCompleto(envio, rows, medias, mediasGerRca);
    const ordem = ordemPainel(envio, rowsPainel, mediasPainel);
    imgPath = gerarImagem(rowsPainel, mediasPainel, envio, "painel", ordem, "ind");
  } else {
    const areas = [...(dest.filtroValores || [])].sort();
    const { rows: filtradas, medias: mediasUsar } = await montarLinhasRecorte(
      { rows, mediasRca, mediasGerRca },
      areas,
      envio.mediaBaseTodos !== false,
      envio.rcasOcultos || [],
    );
    if (filtradas.length === 0) {
      addLog("warn", `Sem linhas para ${dest.nome} [${areas.join(", ")}]`);
      return;
    }
    const tag = "ind_" + areas.join("-").replace(/[^\w-]/g, "_").slice(0, 34);
    imgPath = gerarImagem(filtradas, mediasUsar, envio, "area", areas, tag);
  }
  if (!imgPath || !fs.existsSync(imgPath)) {
    addLog("erro", `Falha ao gerar imagem individual (${dest.nome})`);
    return;
  }
  await enviarParaDestino(dest, imgPath, envio);
}

// ── Queries por região (SQL verbatim das planilhas oficiais) ─────────────────
// Cada região tem 2 SQLs fiéis às planilhas, em queries/<queryKey>-<tipo>.sql:
//   <key>-pedidos.sql → pedidos do dia (Valor Sem ST)
//   <key>-media.sql   → média por FATURAMENTO ÷ nº de dias úteis com venda
// Mantém zero divergência: o SQL é o mesmo das planilhas (só datas → "hoje" e
// aliases em ASCII). Para uma região nova, basta criar os 2 arquivos .sql.
const _queryCache = {};
function loadQuery(queryKey, tipo) {
  const cacheKey = `${queryKey}-${tipo}`;
  if (!(cacheKey in _queryCache)) {
    let content = fs.readFileSync(
      path.join(__dirname, "queries", `${cacheKey}.sql`),
      "utf8",
    );
    // Remove BOM UTF-8 (\uFEFF) que o Windows pode adicionar ao salvar arquivos
    content = content.replace(/^\uFEFF/, "");
    _queryCache[cacheKey] = content;
  }
  return _queryCache[cacheKey];
}

/**
 * Soma a média por gerente. A query de média retorna 1 linha por RCA
 * (gerente, MediaVenda); a média do gerente é a soma das médias dos seus RCAs.
 */
function montarMedias(recordset) {
  const medias = {};
  for (const r of recordset) {
    const g = r.Gerente ?? r.gerente;
    if (!g) continue;
    medias[g] = (medias[g] || 0) + (Number(r.MediaVenda ?? r["Média_Venda"]) || 0);
  }
  return medias;
}

/**
 * Médias por RCA (usada no recorte por área — layout expandido). A query de
 * média retorna 1 linha por RCA; aqui mantemos o valor individual (sem agregar).
 */
function montarMediasRca(recordset) {
  const m = {};
  for (const r of recordset) {
    const rca = r.Rca ?? r.rca;
    if (!rca) continue;
    m[rca] = Number(r.MediaVenda ?? r["Média_Venda"]) || 0;
  }
  return m;
}

/** Médias por gerente→RCA (preserva a gerência; usado para separar cross-estado). */
function montarMediasGerenteRca(recordset) {
  const m = {};
  for (const r of recordset) {
    const g = r.Gerente ?? r.gerente;
    const rca = r.Rca ?? r.rca;
    if (!g || !rca) continue;
    if (!m[g]) m[g] = {};
    m[g][rca] = Number(r.MediaVenda ?? r["Média_Venda"]) || 0;
  }
  return m;
}

async function publicarMedias(slug, medias) {
  try {
    await api(`v2/medias/${slug}`, { medias });
  } catch (e) {
    console.error(`  [medias/${slug}] falha ao publicar:`, e.message);
  }
}

/** Publica os RCAs por gerência ({gerencia:{rca:media}}) — fonte dos checkboxes
 *  de "RCAs por área" no portal. */
async function publicarMediasRca(slug, mediasGerRca) {
  try {
    await api(`v2/rcas/${slug}`, { mediasGerenteRca: mediasGerRca || {} });
  } catch (e) {
    console.error(`  [rcas/${slug}] falha ao publicar:`, e.message);
  }
}

function lerBase64(p) {
  return fs.readFileSync(p).toString("base64");
}

/** Publica os previews por recorte (substitui o conjunto atual do envio no portal). */
async function publicarPreviews(slug, previews) {
  try {
    await api(`v2/previews/${slug}`, { previews });
  } catch (e) {
    addLog("warn", `Falha ao publicar previews (${slug}): ${e.message}`);
  }
}

/**
 * Busca pedidos + médias (por gerente e por RCA) do SQL Server para um envio.
 * Retorna null em erro de banco (já loga). Reutilizado pelo ciclo normal e pelo
 * envio/teste por destinatário.
 */
async function buscarDados(envio) {
  try {
    const pool = await sql.connect(DB);
    const result = await pool.request().query(loadQuery(envio.queryKey, "pedidos"));
    const rows = result.recordset;
    const mres = await pool.request().query(loadQuery(envio.queryKey, "media"));
    const medias = montarMedias(mres.recordset);
    const mediasRca = montarMediasRca(mres.recordset);
    const mediasGerRca = montarMediasGerenteRca(mres.recordset);
    await sql.close();
    dbError = false;
    return { rows, medias, mediasRca, mediasGerRca };
  } catch (err) {
    dbError = true;
    addLog("erro", `Falha no banco (${envio.nome}): ${err.message}`);
    try { await sql.close(); } catch {}
    return null;
  }
}

/**
 * Gerências "cross-estado": o recorte por área dessas une os RCAs de SC e RS
 * numa imagem só (cada RCA com a média do seu estado). Ex.: GV KA MICHEL (key
 * account, vende em SC e RS) — o contato do gerente recebe SC + RS juntos.
 */
const GERENCIAS_COMBINADAS = ["GV KA MICHEL"];

/**
 * Une os RCAs de uma gerência nas consultas SC (estabe 1) e RS (estabe 2),
 * cada RCA com a média do seu estado. Dedupe por RCA priorizando o RS (estado
 * "casa" dos RCAs RS; evita duplicar quando a consulta SC traz estabe 2).
 */
async function buscarGerenteCombinado(nomeGerente, todosVendedores = true, rcasOcultos = new Set()) {
  const ocultos = rcasOcultos instanceof Set ? rcasOcultos : new Set(rcasOcultos || []);
  const rs = await buscarDados({ queryKey: "rs", nome: `${nomeGerente} (RS)` });
  const sc = await buscarDados({ queryKey: "sc", nome: `${nomeGerente} (SC)` });
  const scRows = (sc?.rows ?? []).filter((r) => r.Gerente === nomeGerente);
  const rsRows = (rs?.rows ?? []).filter((r) => r.Gerente === nomeGerente);
  const scMed = sc?.mediasRca ?? {};
  const rsMed = rs?.mediasRca ?? {};

  // Cada RCA usa o ESTADO DE ORIGEM pelo prefixo do nome de guerra: "RS " → RS
  // (pedido+média estabe 2); senão → SC (estabe 1). Bate com os painéis de cada
  // estado mesmo quando o RCA aparece nas duas consultas (ex.: KA ELOA é SC; RS
  // FERNANDO é RS). Mesma regra usada na separação do painel completo.
  const rows = [];
  const mediasRca = {};
  const rcas = new Set([...scRows, ...rsRows].map((r) => r.Rca || "").filter(Boolean));
  // "Todos os vendedores": inclui também os RCAs da gerência que têm média mas
  // não têm pedido hoje (linha zerada), em ambos os estados.
  if (todosVendedores) {
    for (const rca of Object.keys((rs?.mediasGerRca || {})[nomeGerente] || {})) rcas.add(rca);
    for (const rca of Object.keys((sc?.mediasGerRca || {})[nomeGerente] || {})) rcas.add(rca);
  }
  for (const rca of rcas) {
    if (ocultos.has(rca)) continue; // RCA oculto (denylist) não entra no recorte
    const ehRs = rcaEhRs(rca);
    const fonte = ehRs ? rsRows : scRows;
    const row =
      fonte.find((r) => (r.Rca || "") === rca) ||
      scRows.find((r) => (r.Rca || "") === rca) ||
      rsRows.find((r) => (r.Rca || "") === rca);
    if (row) rows.push(row);
    else if (todosVendedores)
      rows.push({ Gerente: nomeGerente, Rca: rca, ValorST: 0, ValorPedidos: 0, ValorSemST: 0, QtdPalm: 0 });
    else continue;
    mediasRca[rca] = ehRs ? rsMed[rca] || 0 : scMed[rca] || 0;
  }
  return { rows, mediasRca };
}

/** Um RCA é "da casa RS" quando o nome de guerra começa com "RS " (estado dele). */
function rcaEhRs(rca) {
  return (rca || "").startsWith("RS ");
}

/**
 * Monta o painel completo aplicando a separação das gerências cross-estado (GV KA
 * MICHEL): no envio SC ficam só os RCAs SC; no RS só os RS; a média do gerente é
 * recalculada apenas com os RCAs da casa. Auto-contido (não refaz consulta).
 * Usado TANTO no ciclo agendado quanto no envio/teste por destinatário.
 */
function montarPainelCompleto(envio, rows, medias, mediasGerRca) {
  const estado = envio.queryKey === "rs" ? "RS" : "SC";
  const ehDaCasa = (rca) => (estado === "RS" ? rcaEhRs(rca) : !rcaEhRs(rca));
  const isCombinada = (g) => GERENCIAS_COMBINADAS.includes(g);
  const ocultos = new Set(Array.isArray(envio.rcasOcultos) ? envio.rcasOcultos : []);
  const soComPedido = envio.mediaBaseTodos === false;

  // Linhas do painel: separa cross-estado (só RCAs "da casa" do envio) e remove os
  // RCAs escondidos (denylist) — não contam no Valor Sem ST nem aparecem.
  let rowsPainel = rows;
  for (const g of GERENCIAS_COMBINADAS) {
    if (!rows.some((r) => r.Gerente === g)) continue;
    rowsPainel = rowsPainel.filter((r) => r.Gerente !== g || ehDaCasa(r.Rca || ""));
  }
  if (ocultos.size > 0) rowsPainel = rowsPainel.filter((r) => !ocultos.has(r.Rca || ""));

  // RCAs com pedido hoje, por gerência (usado no modo "só com pedido").
  const comPedidoPorGer = {};
  for (const r of rows) (comPedidoPorGer[r.Gerente] ||= new Set()).add(r.Rca || "");

  // Média por gerência: soma de mediasGerRca respeitando a casa (cross-estado), os
  // RCAs escondidos (denylist) e a flag Todos/Só com pedido. No padrão (todos, sem
  // ocultos) isto equivale a somar todos os vendedores da gerência (= montarMedias).
  const mediasPainel = {};
  for (const g of Object.keys(mediasGerRca || {})) {
    const gerRca = mediasGerRca[g] || {};
    let soma = 0;
    for (const [rca, m] of Object.entries(gerRca)) {
      if (ocultos.has(rca)) continue;
      if (isCombinada(g) && !ehDaCasa(rca)) continue;
      if (soComPedido && !(comPedidoPorGer[g] && comPedidoPorGer[g].has(rca))) continue;
      soma += m || 0;
    }
    mediasPainel[g] = soma;
  }

  // Gerências VISÍVEIS (allowlist do envio): só as marcadas aparecem no painel
  // completo. Gerência nova (fora da allowlist) NÃO aparece — entra desmarcada,
  // o operador escolhe exibir no portal. `gerentesVisiveis` null/ausente = legado
  // (sem allowlist definida) ⇒ mostra todas, sem filtrar (evita regressão).
  const visiveis = Array.isArray(envio.gerentesVisiveis) ? new Set(envio.gerentesVisiveis) : null;
  if (visiveis) {
    rowsPainel = rowsPainel.filter((r) => visiveis.has(r.Gerente));
    for (const g of Object.keys(mediasPainel)) if (!visiveis.has(g)) delete mediasPainel[g];
  }

  return { rowsPainel, mediasPainel };
}

/**
 * Ordem/lista de gerências do painel completo. Em "todos os vendedores" (padrão)
 * lista TODAS as gerências visíveis (com média), inclusive as SEM pedido hoje
 * (aparecem com "R$ -" e contam no Total Geral — igual à planilha). Em "só com
 * pedido" lista apenas as que têm pedido hoje.
 */
function ordemPainel(envio, rowsPainel, mediasPainel) {
  const comPedido = [...new Set(rowsPainel.map((r) => r.Gerente).filter(Boolean))];
  if (envio.mediaBaseTodos === false) return comPedido;
  // mediasPainel já respeita a allowlist (gerentesVisiveis) e a separação cross-estado.
  return [...new Set([...Object.keys(mediasPainel), ...comPedido])];
}

/**
 * Monta as linhas + médias de um recorte por área. Áreas normais saem do dataset
 * do próprio envio; áreas cross-estado (GERENCIAS_COMBINADAS) unem SC + RS.
 */
async function montarLinhasRecorte(dadosEnvio, areas, todosVendedores = true, rcasOcultos = []) {
  const linhas = [];
  const medias = {};
  const ocultos = rcasOcultos instanceof Set ? rcasOcultos : new Set(rcasOcultos || []);
  const normais = areas.filter((a) => !GERENCIAS_COMBINADAS.includes(a));
  const combinadas = areas.filter((a) => GERENCIAS_COMBINADAS.includes(a));
  if (normais.length > 0) {
    Object.assign(medias, dadosEnvio.mediasRca);
    for (const area of normais) {
      // RCAs ocultos (denylist do envio) não entram no recorte nem no Total.
      const pedidosDaArea = dadosEnvio.rows.filter(
        (r) => r.Gerente === area && !ocultos.has(r.Rca || ""),
      );
      for (const r of pedidosDaArea) linhas.push(r);
      // "Todos os vendedores": completa a área com os RCAs que têm média mas não
      // têm pedido hoje (linha zerada → "R$ -"/-100%, igual à planilha).
      if (todosVendedores) {
        const comPedido = new Set(pedidosDaArea.map((r) => r.Rca || ""));
        const todosRcas = Object.keys((dadosEnvio.mediasGerRca || {})[area] || {});
        for (const rca of todosRcas) {
          if (!comPedido.has(rca) && !ocultos.has(rca)) {
            linhas.push({ Gerente: area, Rca: rca, ValorST: 0, ValorPedidos: 0, ValorSemST: 0, QtdPalm: 0 });
          }
        }
      }
    }
  }
  for (const g of combinadas) {
    const comb = await buscarGerenteCombinado(g, todosVendedores, ocultos);
    linhas.push(...comb.rows);
    Object.assign(medias, comb.mediasRca);
  }
  return { rows: linhas, medias };
}

// ── Geração e publicação da imagem ────────────────────────────────────────────

// Arquivos temporários (JSON de transporte p/ o Python + PNG de saída) ficam
// numa subpasta isolada, não na raiz do bot.
const TMP_DIR = path.join(__dirname, ".painel-tmp");

/**
 * Garante a subpasta temporária e limpa lixo antigo: zera a subpasta e remove
 * órfãos legados (painel_*.json/png) que versões antigas geravam na RAIZ do bot.
 * Chamado no boot.
 */
function limparTemporarios() {
  try { fs.mkdirSync(TMP_DIR, { recursive: true }); } catch {}
  try {
    for (const f of fs.readdirSync(TMP_DIR)) fs.rmSync(path.join(TMP_DIR, f), { force: true });
  } catch {}
  try {
    for (const f of fs.readdirSync(__dirname)) {
      if (/^painel_.*\.(json|png)$/.test(f)) fs.rmSync(path.join(__dirname, f), { force: true });
    }
  } catch {}
}

/**
 * Gera a imagem do painel.
 *   modo "painel" → painel recolhido por gerente (grupos); medias = por gerente.
 *   modo "area"   → recorte expandido por RCA + subtotal por área; medias = por RCA.
 * `ordem` define a ordem dos blocos/linhas; `tag` separa arquivos quando há
 * mais de uma imagem por envio (1 por assinatura de filtro).
 * Os JSON de entrada são apagados após o Python rodar (são só transporte).
 */
function gerarImagem(rows, mediasArg, envio, modo = "painel", ordemArg = null, tag = null) {
  const payload = rows.map((r) => ({
    Gerente: r.Gerente,
    Rca: r.Rca || "",
    ValorST: Number(r.ValorST) || 0,
    ValorPedidos: Number(r.ValorPedidos) || 0,
    ValorSemST: Number(r.ValorSemST) || 0,
    QtdPalm: Number(r.QtdPalm) || 0,
  }));

  const sufixo = tag ? `${envio.slug}_${tag}` : envio.slug;
  const tmpData = path.join(TMP_DIR, `painel_dados_${sufixo}.json`);
  const tmpMedias = path.join(TMP_DIR, `painel_medias_${sufixo}.json`);
  const tmpOrdem = path.join(TMP_DIR, `painel_ordem_${sufixo}.json`);
  const outFile = path.join(TMP_DIR, `painel_${sufixo}.png`);

  try { fs.mkdirSync(TMP_DIR, { recursive: true }); } catch {}
  fs.writeFileSync(tmpData, JSON.stringify(payload, null, 2));
  fs.writeFileSync(tmpMedias, JSON.stringify(mediasArg, null, 2));
  // Ordem das linhas/blocos. Em "painel": gerentes presentes no resultado (igual
  // à planilha). Em "area": as áreas escolhidas, na ordem passada.
  const ordem = ordemArg ?? [...new Set(rows.map((r) => r.Gerente).filter(Boolean))];
  fs.writeFileSync(tmpOrdem, JSON.stringify(ordem, null, 2));

  try {
    const cmd = `${PYTHON_BIN} "${path.join(__dirname, "gerar_imagem.py")}" "${tmpData}" "${tmpMedias}" "${tmpOrdem}" "${outFile}" ${modo}`;
    execSync(cmd, { timeout: 30000, stdio: "pipe" });
    return outFile;
  } catch (err) {
    addLog("erro", `gerar_imagem.py falhou (${envio.slug}/${modo}): ${err.message}`);
    return null;
  } finally {
    // Os JSON são só transporte pro Python — apaga (o PNG fica até ser enviado).
    for (const f of [tmpData, tmpMedias, tmpOrdem]) {
      try { fs.rmSync(f, { force: true }); } catch {}
    }
  }
}

/**
 * Envia uma imagem para um destino (grupo por nome OU contato por número),
 * com retry. Um destino que falha não interrompe os demais.
 */
async function enviarParaDestino(dest, imagePath, envio) {
  const MAX_TENTATIVAS = 3;
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      const media = MessageMedia.fromFilePath(imagePath);
      if (dest.tipo === "grupo") {
        const chats = await clienteWA.getChats();
        const grupo = chats.find((c) => c.isGroup && c.name === dest.identificador);
        if (!grupo) {
          addLog("erro", `Grupo "${dest.identificador}" nao encontrado (${envio.nome})`);
          return false;
        }
        await grupo.sendMessage(media, { caption: "" });
      } else {
        const num = String(dest.identificador).replace(/\D/g, "");
        const numberId = await clienteWA.getNumberId(num);
        if (!numberId) {
          addLog("erro", `Numero de ${dest.nome} (${num}) nao esta no WhatsApp (${envio.nome})`);
          return false;
        }
        await clienteWA.sendMessage(numberId._serialized, media, { caption: "" });
      }
      addLog("ok", `Enviado para ${dest.nome} (${envio.nome})`);
      return true;
    } catch (err) {
      addLog("warn", `Tentativa ${tentativa} falhou para ${dest.nome} (${envio.nome}): ${err.message}`);
      if (tentativa === MAX_TENTATIVAS) {
        addLog("erro", `Envio falhou apos ${MAX_TENTATIVAS} tentativas: ${dest.nome} (${envio.nome})`);
        return false;
      }
      await new Promise((r) => setTimeout(r, 8000));
    }
  }
  return false;
}

/** Publica no portal a lista de grupos de que a conta participa (dropdown da UI). */
async function publicarGruposWa() {
  try {
    const chats = await clienteWA.getChats();
    const grupos = [...new Set(chats.filter((c) => c.isGroup).map((c) => c.name).filter(Boolean))];
    await api("v2/grupos", { grupos });
    addLog("info", `${grupos.length} grupos do WhatsApp publicados no portal`);
  } catch (e) {
    addLog("warn", `Falha ao publicar lista de grupos: ${e.message}`);
  }
}

async function publicarPreview(slug, imagePath) {
  try {
    const buf = fs.readFileSync(imagePath);
    const base64 = buf.toString("base64");
    await api(`v2/imagem/${slug}`, { base64, mimeType: "image/png", geradoEm: new Date().toISOString() });
  } catch (e) {
    addLog("warn", `Falha ao publicar preview (${slug}): ${e.message}`);
  }
}

// ── Pipeline de envio (por envio/região) ─────────────────────────────────────

async function buscarEEnviarPorEnvio(envio) {
  if (sending) {
    // Não deveria chegar aqui se a fila está funcionando, mas por segurança:
    addLog("warn", `Ciclo de envio ja em andamento — reenfileirando (${envio.nome})`);
    filaEnviosForcados.unshift({ envio, origem: "reenfileirado", ts: Date.now() });
    return;
  }
  if (!envio.queryKey) {
    addLog("erro", `Envio sem queryKey — ignorado (${envio.nome})`);
    return;
  }
  if (envio.pausado) {
    addLog("warn", `Envio pausado — ignorado (${envio.nome})`);
    return;
  }
  if (!clienteWA || connPhase !== "rodando") {
    addLog("warn", `WhatsApp nao pronto (${connPhase}) — reenfileirando (${envio.nome})`);
    filaEnviosForcados.unshift({ envio, origem: "wa-nao-pronto", ts: Date.now() });
    return;
  }

  sending = true;
  try {
    addLog("info", `Iniciando ciclo de envio para: ${envio.nome}`);

    // 1. Dados (SQL Server local)
    const dados = await buscarDados(envio);
    if (!dados) return; // erro de banco já logado
    const { rows, medias, mediasRca, mediasGerRca } = dados;
    if (!rows || rows.length === 0) {
      addLog("warn", `Nenhum pedido encontrado hoje — envio cancelado (${envio.nome})`);
      return;
    }
    addLog("ok", `${rows.length} linhas retornadas do banco (${envio.nome})`);

    // Painel completo COM separação das gerências cross-estado (GV KA MICHEL):
    // no painel SC ficam só os RCAs SC, no RS só os RS. Mesmo helper do envio/teste
    // por destinatário. O recorte por área (Michel) segue combinado SC+RS à parte.
    const { rowsPainel, mediasPainel } = montarPainelCompleto(envio, rows, medias, mediasGerRca);
    await publicarMedias(envio.slug, mediasPainel);
    // Publica os RCAs por área (fonte dos checkboxes de "RCAs por área" no portal).
    await publicarMediasRca(envio.slug, mediasGerRca);

    // 2. Destinatários: fallback ao grupo único (envio.grupo) se ainda não houver
    // vínculos cadastrados (retrocompat / antes de rodar apply-destinatarios.mjs).
    const destinatarios =
      Array.isArray(envio.destinatarios) && envio.destinatarios.length > 0
        ? envio.destinatarios
        : [{ tipo: "grupo", identificador: envio.grupo, nome: envio.grupo, filtroTipo: "todos", filtroValores: [] }];

    // 3. Painel completo (1º preview + base dos destinos "todos").
    const ordemFull = ordemPainel(envio, rowsPainel, mediasPainel);
    const imagemFull = gerarImagem(rowsPainel, mediasPainel, envio, "painel", ordemFull, null);
    if (!imagemFull || !fs.existsSync(imagemFull)) {
      addLog("erro", `Falha ao gerar imagem do painel (${envio.nome})`);
      return;
    }
    addLog("ok", `Imagem gerada com sucesso (${envio.nome})`);

    // 4. Dedupe por assinatura de filtro → 1 imagem por conjunto distinto de áreas.
    const porFiltro = new Map();
    for (const dest of destinatarios) {
      const ft = dest.filtroTipo || "todos";
      const areas = ft === "todos" ? [] : [...(dest.filtroValores || [])].sort();
      const sig = ft === "todos" ? "completo" : `gerencia:${areas.join("|")}`;
      if (!porFiltro.has(sig)) porFiltro.set(sig, { filtroTipo: ft, areas, destinos: [] });
      porFiltro.get(sig).destinos.push(dest);
    }

    // 5. Gera a imagem de cada filtro, coleta os previews e envia aos destinos.
    const previews = [{ sig: "completo", label: "Painel completo", base64: lerBase64(imagemFull) }];
    let algumEnvio = false;
    for (const [sig, { filtroTipo, areas, destinos }] of porFiltro.entries()) {
      let imgPath = imagemFull;
      if (filtroTipo !== "todos") {
        const { rows: filtradas, medias: mediasUsar } = await montarLinhasRecorte(
          { rows, mediasRca, mediasGerRca },
          areas,
          envio.mediaBaseTodos !== false,
          envio.rcasOcultos || [],
        );
        if (filtradas.length === 0) {
          addLog("warn", `Sem linhas para [${areas.join(", ")}] — pulando (${envio.nome})`);
          continue;
        }
        const tag = areas.join("-").replace(/[^\w-]/g, "_").slice(0, 40);
        imgPath = gerarImagem(filtradas, mediasUsar, envio, "area", areas, tag);
        if (!imgPath || !fs.existsSync(imgPath)) {
          addLog("erro", `Falha ao gerar imagem (filtro ${sig}) — ${envio.nome}`);
          continue;
        }
        previews.push({ sig, label: areas.join(" · "), base64: lerBase64(imgPath) });
      }
      for (const dest of destinos) {
        const ok = await enviarParaDestino(dest, imgPath, envio);
        algumEnvio = algumEnvio || ok;
        // Pequeno intervalo entre mensagens (anti-spam / estabilidade do WhatsApp).
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    // Publica todos os previews (painel completo + cada recorte) no portal.
    await publicarPreviews(envio.slug, previews);

    if (algumEnvio) {
      ultimoEnvio = new Date().toISOString();
      heartbeat(); // reporta ultimoEnvio imediatamente
    }
  } finally {
    sending = false;
    // Após terminar, tenta drenar as filas (próximo envio / destino pendente)
    if (filaEnviosForcados.length > 0) {
      setTimeout(drenarFila, 2000);
    } else if (filaDestinos.length > 0) {
      setTimeout(drenarDestinos, 2000);
    }
  }
}

// ── Sessão / recuperação ──────────────────────────────────────────────────────
// ── Soft-restart (reconecta WhatsApp + limpa caches, sem matar o processo) ─────

/**
 * Soft-restart: destrói o cliente WhatsApp atual, limpa caches de queries,
 * e reinicializa tudo. Não mata o processo (funciona mesmo sem PM2/Task Scheduler).
 */
async function softRestart() {
  connPhase = "reconectando";
  sending = false;
  // Limpa fila de envios pendentes
  filaEnviosForcados.length = 0;
  // Limpa cache de queries (força releitura dos .sql na próxima execução)
  Object.keys(_queryCache).forEach((k) => delete _queryCache[k]);
  // Destrói o cliente WhatsApp
  try { await clienteWA.destroy(); } catch {}
  clienteWA = null;
  // Aguarda e reinicializa
  addLog("info", "Soft-restart: WhatsApp destruido, reinicializando em 5s...");
  await new Promise((r) => setTimeout(r, 5000));
  iniciarWhatsApp();
  addLog("ok", "Soft-restart concluido — bot reinicializado");
}

// ── Sessão / recuperação ──────────────────────────────────────────────────────────────────────
const CLIENT_ID = "opendesk-painel";
const SESSION_DIR = path.join(__dirname, ".wwebjs_auth");

/** Apaga a sessão local (força novo QR). Com retry: o Chrome pode demorar a soltar o lock. */
async function removerSessao() {
  for (let i = 0; i < 5; i++) {
    try {
      if (fs.existsSync(SESSION_DIR)) fs.rmSync(SESSION_DIR, { recursive: true, force: true });
      addLog("info", "Sessao local apagada — aguardando novo QR (escaneie pelo portal)");
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  addLog("erro", "Nao consegui apagar a sessao (arquivo travado). Pode exigir reiniciar a tarefa.");
  return false;
}

/** Remove só os locks órfãos do Chrome (preserva a sessão). */
function limparLockChrome() {
  try {
    const dir = path.join(SESSION_DIR, `session-${CLIENT_ID}`);
    for (const f of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
      const p = path.join(dir, f);
      if (fs.existsSync(p)) fs.rmSync(p, { force: true });
    }
  } catch {}
}

/**
 * Recuperação de LOGOUT (troca de aparelho/conta): destrói o cliente, apaga a
 * sessão e reinicia limpo — um QR novo é gerado e publicado no portal, sem
 * precisar mexer no servidor.
 */
async function reiniciarLimpo() {
  connPhase = "reconectando";
  await api("qr", { dataUrl: null }).catch(() => {});
  try { await clienteWA.destroy(); } catch {}
  await new Promise((r) => setTimeout(r, 3000)); // deixa o Chrome soltar o lock
  await removerSessao();
  setTimeout(iniciarWhatsApp, 3000);
}

/**
 * Desconexão solicitada pelo portal: faz LOGOUT no WhatsApp (despareia a conta —
 * o "dispositivo conectado" some do celular), apaga a sessão e reinicia limpo,
 * gerando um QR novo no portal. Difere do reiniciarLimpo() por chamar logout() antes.
 */
async function desconectarWhatsapp() {
  connPhase = "reconectando";
  await api("qr", { dataUrl: null }).catch(() => {});
  try {
    await clienteWA.logout();
  } catch (e) {
    addLog("warn", "logout() falhou (talvez ja desconectado): " + (e && e.message ? e.message : e));
  }
  try { await clienteWA.destroy(); } catch {}
  await new Promise((r) => setTimeout(r, 3000)); // deixa o Chrome soltar o lock
  await removerSessao();
  addLog("ok", "Conta desconectada — escaneie o novo QR pelo portal");
  setTimeout(iniciarWhatsApp, 3000);
}

// ── Inicializa o cliente WhatsApp ─────────────────────────────────────────────
function criarCliente() {
  const puppeteer = {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    protocolTimeout: 120000,
  };
  if (process.env.CHROME_PATH) puppeteer.executablePath = process.env.CHROME_PATH;

  const waVersion = process.env.WA_WEB_VERSION;
  const webVersionCache = waVersion
    ? {
        type: "remote",
        remotePath: `https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/${waVersion}.html`,
      }
    : undefined;

  const cliente = new Client({
    authStrategy: new LocalAuth({ clientId: CLIENT_ID }),
    puppeteer,
    ...(webVersionCache ? { webVersionCache } : {}),
  });

  cliente.on("qr", async (qr) => {
    connPhase = "aguardando_qr";
    console.log("\n📱 Escaneie o QR Code (ou use o portal):\n");
    qrcodeTerminal.generate(qr, { small: true });
    try {
      const dataUrl = await QRCode.toDataURL(qr);
      await api("qr", { dataUrl, ts: new Date().toISOString() });
    } catch (e) {
      console.error("  [qr] falha ao publicar:", e.message);
    }
    heartbeat();
  });

  cliente.on("authenticated", () => {
    addLog("ok", "WhatsApp autenticado — sessao salva");
    api("qr", { dataUrl: null }).catch(() => {}); // limpa o QR no portal
  });

  cliente.on("auth_failure", (msg) => {
    addLog("erro", `Falha de autenticacao: ${msg}`);
    process.exit(1);
  });

  cliente.on("ready", async () => {
    connPhase = "rodando";
    console.log("\n✅ Cliente pronto!");
    const nomes = envios.map((e) => e.nome).join(", ") || "(nenhum envio habilitado)";
    addLog("ok", `Bot conectado (versao: ${BOT_VERSION}) — envios: ${nomes}`);
    agendarMaster();
    heartbeat();
    publicarGruposWa(); // publica a lista de grupos p/ o dropdown do portal

    // Drena as filas pendentes (que chegaram enquanto o WhatsApp não estava pronto)
    if (filaEnviosForcados.length > 0) {
      addLog("info", `WhatsApp pronto — drenando ${filaEnviosForcados.length} envio(s) pendente(s)`);
      setTimeout(drenarFila, 2000);
    }
    if (filaDestinos.length > 0) {
      setTimeout(drenarDestinos, 3000);
    }
  });

  cliente.on("disconnected", async (reason) => {
    const motivo = String(reason || "");
    heartbeat();
    if (/LOGOUT|UNPAIRED|CONFLICT/i.test(motivo)) {
      addLog("warn", `Sessao encerrada no WhatsApp (${motivo}) — gerando novo QR pelo portal`);
      await reiniciarLimpo();
    } else {
      connPhase = "reconectando";
      addLog("warn", `Desconectado: ${motivo} — reconectando em 15s`);
      try { await clienteWA.destroy(); } catch {}
      setTimeout(iniciarWhatsApp, 15000);
    }
  });

  return cliente;
}

// ── Boot ──────────────────────────────────────────────────────────────────────
function iniciarWhatsApp() {
  clienteWA = criarCliente();
  clienteWA.initialize().catch(async (err) => {
    connPhase = "reconectando";
    addLog("erro", `Falha ao inicializar o WhatsApp: ${err.message} — nova tentativa em 20s`);
    heartbeat();
    try { await clienteWA.destroy(); } catch {}
    if (/already running|SingletonLock/i.test(err.message || "")) {
      limparLockChrome();
    }
    setTimeout(iniciarWhatsApp, 20000);
  });
}

async function main() {
  if (!BOT_TOKEN) {
    console.error("✘ PARCIAL_BOT_TOKEN ausente no .env — a ponte respondera 401/503.");
  }
  console.log(`→ Versão do bot: ${BOT_VERSION}`);
  console.log(`→ Helpdesk: ${HELPDESK_URL}`);
  console.log(`→ SQL Server: ${DB.server}/${DB.database}`);

  // Limpa temporários da rodada anterior + órfãos legados na raiz.
  limparTemporarios();

  // Puxa a config inicial antes de subir o WhatsApp.
  await heartbeat();
  console.log(`→ Envios habilitados: ${envios.length}`);
  for (const e of envios) {
    console.log(`   • ${e.nome} (${e.slug}) → grupo: ${e.grupo}`);
  }

  // Heartbeat recorrente (reporta status + recebe config/comandos).
  setInterval(heartbeat, HEARTBEAT_MS);

  iniciarWhatsApp();
}

// Um erro assíncrono do Puppeteer não deve matar o processo
process.on("unhandledRejection", (reason) => {
  const msg = reason && reason.message ? reason.message : String(reason);
  console.error("  [unhandledRejection]", msg);
});

main();
