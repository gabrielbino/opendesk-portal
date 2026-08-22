/**
 * Coletor de arquivos — submódulo "Monitor de Pedidos" (Indicadores) do portal OpenDesk.
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Agente "burro" (Fase 3): roda na VM Ubuntu srvappapi (rede interna), varre as pastas
 * monitoradas (montadas do FTP/202 via CIFS ou curlftpfs) e publica o snapshot no portal.
 *
 * NÃO decide nada — toda a regra (cor/SLA/alerta) vive no CÉREBRO do portal
 * (server/monitorArquivosControlPlane.ts). Este processo só reporta { nome, mtime }.
 *
 * Fala com o portal (portal) por HTTPS, autenticado por Bearer <MONITOR_AGENTE_TOKEN>:
 *   POST /api/monitor-arquivos/heartbeat          → marca online + recebe os caminhos a varrer
 *   POST /api/monitor-arquivos/snapshot/:id       → publica os arquivos de UM caminho (pedidos)
 *   POST /api/monitor-arquivos/snapshot/lista/:id → publica os arquivos de UMA lista (geração)
 *
 * O heartbeat devolve dois conjuntos de alvos: `configs` (modo pedidos, varre por caminho) e
 * `listas` (modo geração, varre por lista). Cada um é uma pasta com extensões próprias; o coletor
 * varre igual e só muda o endpoint do snapshot. Toda a regra (cor/SLA/deadline) é do portal.
 *
 * Ciclo (ver docs/monitor-arquivos-fase3-coletor.md):
 *   • heartbeat a cada HEARTBEAT_SEG (atualiza o cache de alvos + mantém "online");
 *   • tick curto (TICK_SEG): para cada alvo vencido (>= intervaloVarreduraSeg desde a
 *     última varredura), lê a pasta com fs, filtra extensões e POSTa o snapshot.
 *   • um try/catch por alvo: pasta ruim loga e segue — nunca derruba o processo.
 *
 * Runtime: Node 18+ (fetch nativo). Deploy: cópia manual + systemd (a VM não tem git).
 * Rode com:  node index.mjs   (ou via systemd — ver OPERACAO.md).
 */

import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";

// Carimbo de versão — aparece no log ao subir e vai no heartbeat (visível no painel).
const COLETOR_VERSION = "coletor-1.2.0"; // 1.2.0: reporta o mtime da pasta (fallback de geração)

// ── Configuração via .env ─────────────────────────────────────────────────────
const PORTAL_URL = (process.env.PORTAL_URL || "http://localhost:3000").replace(/\/+$/, "");
const AGENTE_TOKEN = process.env.MONITOR_AGENTE_TOKEN || "";
const HEARTBEAT_SEG = Math.max(5, Number(process.env.HEARTBEAT_SEG || 30));
const TICK_SEG = Math.max(1, Number(process.env.TICK_SEG || 5));
// Timeout de cada requisição HTTP ao portal (s). Rede de segurança: se o portal ficar lento/
// indisponível, a chamada falha rápido (aborta) em vez de pendurar o laço — um caminho lento não
// segura os demais. Padrão 20s.
const HTTP_TIMEOUT_SEG = Math.max(5, Number(process.env.HTTP_TIMEOUT_SEG || 20));
// Teto de itens por snapshot (o portal aceita até 50000). Evita payload gigante numa pasta cheia.
const MAX_ARQUIVOS = 50000;

// ── Estado em memória ─────────────────────────────────────────────────────────
/** Cache dos alvos ativos a varrer (recebidos no heartbeat), já normalizados. */
let alvos = [];
/** Última varredura por chave de alvo (ms epoch). Ausente = varrer já na próxima passada. */
const ultimaVarredura = new Map();
/** Marcações para não poluir o log repetindo o mesmo erro de pasta a cada tick. */
const ultimoErroPasta = new Map();
let parando = false;

// ── Log simples com timestamp (fuso da VM; mantenha em America/Sao_Paulo) ──────
function log(nivel, ...args) {
  const ts = new Date().toISOString();
  const fn = nivel === "erro" ? console.error : nivel === "warn" ? console.warn : console.log;
  fn(`[${ts}] [${nivel.toUpperCase()}]`, ...args);
}

// ── Extensões: réplica MÍNIMA da regra pura (shared/monitorArquivos.ts) ─────────
// Só para FILTRAR o payload (economia de banda). A classificação de verdade é no portal.
function normalizarExtensao(ext) {
  const e = String(ext || "").trim().toLowerCase();
  if (!e) return "";
  return e.startsWith(".") ? e : "." + e;
}
/** Extensão pelo ÚLTIMO ponto, em minúsculas ('PEDIDO123._RM' → '._rm'). Sem ponto → ''. */
function extDoNome(nome) {
  const i = nome.lastIndexOf(".");
  if (i <= 0) return "";
  return nome.slice(i).toLowerCase();
}

// ── Cliente HTTP da ponte ──────────────────────────────────────────────────────
// Com timeout via AbortController (cobre a conexão E a leitura do corpo): se o portal não
// responder em HTTP_TIMEOUT_SEG, aborta e lança erro — o chamador loga e segue (sem pendurar o laço).
async function api(endpoint, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_SEG * 1000);
  try {
    const res = await fetch(`${PORTAL_URL}/api/monitor-arquivos/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AGENTE_TOKEN}`,
      },
      body: JSON.stringify(body ?? {}),
      signal: ctrl.signal,
    });
    const txt = await res.text().catch(() => "");
    let json = null;
    try {
      json = txt ? JSON.parse(txt) : null;
    } catch {
      /* resposta não-JSON (proxy/erro): mantém json=null e o texto no erro abaixo */
    }
    if (!res.ok || (json && json.success === false)) {
      const msg = (json && json.message) || txt.slice(0, 200) || res.statusText;
      const err = new Error(`HTTP ${res.status} em /api/monitor-arquivos/${endpoint}: ${msg}`);
      err.status = res.status;
      throw err;
    }
    return json?.data ?? {};
  } catch (e) {
    if (e?.name === "AbortError") {
      throw new Error(`timeout (${HTTP_TIMEOUT_SEG}s) em /api/monitor-arquivos/${endpoint}`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ── Normalização dos alvos vindos do heartbeat ──────────────────────────────────
// Une `configs` (pedidos: extensoesPendente + extensaoLida) e `listas` (geração: por extensão OU
// nome exato) num formato único { chave, nome, caminho, aceita(nome), intervalo, endpoint }. A
// `chave` é namespaced por tipo (c:/l:) porque config.id e lista.id vêm de tabelas diferentes e
// podem coincidir. `aceita` é o filtro de banda; a classificação de verdade acontece no portal.
function aceitaPorExtensao(exts) {
  const set = new Set(exts);
  return (nome) => set.has(extDoNome(nome));
}
function normalizarAlvos(data) {
  const out = [];
  for (const c of Array.isArray(data.configs) ? data.configs : []) {
    const exts = [...(c.extensoesPendente ?? []).map(normalizarExtensao), normalizarExtensao(c.extensaoLida)].filter(Boolean);
    out.push({
      chave: `c:${c.id}`,
      nome: c.nome,
      caminho: c.caminho,
      aceita: aceitaPorExtensao(exts),
      intervalo: Math.max(1, Number(c.intervaloVarreduraSeg || 60)) * 1000,
      endpoint: `snapshot/${c.id}`,
    });
  }
  for (const l of Array.isArray(data.listas) ? data.listas : []) {
    let aceita;
    if (l.modoIdentificacao === "nome") {
      const alvo = String(l.nomeArquivo || "").trim().toLowerCase();
      aceita = (nome) => alvo !== "" && nome.trim().toLowerCase() === alvo;
    } else {
      aceita = aceitaPorExtensao((l.extensoes ?? []).map(normalizarExtensao).filter(Boolean));
    }
    out.push({
      chave: `l:${l.id}`,
      nome: l.nome,
      caminho: l.caminho,
      aceita,
      intervalo: Math.max(1, Number(l.intervaloVarreduraSeg || 60)) * 1000,
      endpoint: `snapshot/lista/${l.id}`,
    });
  }
  return out;
}

// ── Heartbeat: marca online e atualiza o cache de alvos a varrer ────────────────
async function heartbeat() {
  try {
    const data = await api("heartbeat", { versao: COLETOR_VERSION });
    alvos = normalizarAlvos(data);
    // Poda as marcações de alvos que sumiram (desativados/removidos no painel).
    const chaves = new Set(alvos.map((a) => a.chave));
    for (const k of ultimaVarredura.keys()) if (!chaves.has(k)) ultimaVarredura.delete(k);
    for (const k of ultimoErroPasta.keys()) if (!chaves.has(k)) ultimoErroPasta.delete(k);
    const nPed = alvos.filter((a) => a.chave.startsWith("c:")).length;
    const nLista = alvos.length - nPed;
    log("info", `heartbeat ok — ${nPed} caminho(s) + ${nLista} lista(s)`);
  } catch (e) {
    // 503 = token ainda não configurado no portal; 401 = token errado. Não derruba: tenta de novo.
    log("warn", `heartbeat falhou: ${e.message}`);
  }
}

// ── Varredura de UM alvo (caminho ou lista) + publicação do snapshot ─────────────
async function varrerAlvo(alvo) {
  let entradas;
  try {
    entradas = await fs.readdir(alvo.caminho, { withFileTypes: true });
  } catch (e) {
    // Pasta inacessível (mount caiu, caminho errado): loga UMA vez por mensagem e segue.
    if (ultimoErroPasta.get(alvo.chave) !== e.message) {
      log("warn", `caminho inacessível [${alvo.chave} ${alvo.nome}] "${alvo.caminho}": ${e.message}`);
      ultimoErroPasta.set(alvo.chave, e.message);
    }
    return;
  }
  if (ultimoErroPasta.has(alvo.chave)) {
    log("info", `caminho voltou a responder [${alvo.chave} ${alvo.nome}] "${alvo.caminho}"`);
    ultimoErroPasta.delete(alvo.chave);
  }

  const arquivos = [];
  for (const ent of entradas) {
    if (arquivos.length >= MAX_ARQUIVOS) break;
    if (ent.isDirectory()) continue; // não é recursivo nesta fase
    if (!alvo.aceita(ent.name)) continue; // filtro de banda (portal reavalia de qualquer jeito)
    try {
      const st = await fs.stat(path.join(alvo.caminho, ent.name));
      if (!st.isFile()) continue; // resolve symlink → só arquivo de verdade
      arquivos.push({ nome: ent.name, mtime: st.mtime.toISOString() });
    } catch (e) {
      // Arquivo pode ter sumido entre o readdir e o stat (rename para ._RM em curso): ignora.
      log("warn", `stat falhou [${alvo.chave}] "${ent.name}": ${e.message}`);
    }
  }

  // mtime da PRÓPRIA pasta: fallback de geração pras listas cujo arquivo é puxado antes da varredura
  // (o cérebro usa isto só quando não reconheceu o arquivo). Falha silenciosa → não envia.
  let pastaMtime;
  try {
    pastaMtime = (await fs.stat(alvo.caminho)).mtime.toISOString();
  } catch {
    /* ignora */
  }

  const varreduraEm = new Date().toISOString();
  try {
    const data = await api(alvo.endpoint, { varreduraEm, arquivos, pastaMtime });
    const resumo =
      data.gerada !== undefined
        ? `${data.gerada ? "gerada" : "não gerada"}${data.atrasada ? ", atrasada" : ""}`
        : `${data.pendentes ?? 0} pendente(s), ${data.atrasados ?? 0} atrasado(s)`;
    log("info", `snapshot [${alvo.chave} ${alvo.nome}] ${arquivos.length} arq · ${resumo}`);
  } catch (e) {
    log("warn", `snapshot falhou [${alvo.chave} ${alvo.nome}]: ${e.message}`);
  }
}

// ── Tick: dispara as varreduras vencidas ────────────────────────────────────────
async function tick() {
  const agora = Date.now();
  for (const alvo of alvos) {
    const ultima = ultimaVarredura.get(alvo.chave) ?? 0;
    if (agora - ultima < alvo.intervalo) continue;
    ultimaVarredura.set(alvo.chave, agora); // marca ANTES de varrer p/ não empilhar se demorar
    // Sequencial de propósito: pastas de rede são I/O lento; evita saturar o mount.
    await varrerAlvo(alvo);
  }
}

// ── Laços com auto-agendamento (sem overlap) ────────────────────────────────────
async function loopHeartbeat() {
  while (!parando) {
    await heartbeat();
    await esperar(HEARTBEAT_SEG * 1000);
  }
}
async function loopTick() {
  while (!parando) {
    try {
      await tick();
    } catch (e) {
      log("erro", `tick inesperado: ${e.message}`); // blindagem extra — nunca deixa o laço morrer
    }
    await esperar(TICK_SEG * 1000);
  }
}
function esperar(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Boot ─────────────────────────────────────────────────────────────────────
function encerrar(sinal) {
  log("info", `recebido ${sinal} — encerrando…`);
  parando = true;
  setTimeout(() => process.exit(0), 300);
}
process.on("SIGINT", () => encerrar("SIGINT"));
process.on("SIGTERM", () => encerrar("SIGTERM"));

log("info", `Coletor Monitor de Pedidos — ${COLETOR_VERSION}`);
log("info", `Portal: ${PORTAL_URL} · heartbeat ${HEARTBEAT_SEG}s · tick ${TICK_SEG}s`);
if (!AGENTE_TOKEN.trim()) {
  log("warn", "MONITOR_AGENTE_TOKEN vazio — o portal responderá 401/503 até configurar o .env.");
}

// Um heartbeat imediato antes de entrar nos laços (popula o cache de configs de cara).
await heartbeat();
loopHeartbeat();
loopTick();
