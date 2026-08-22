/**
 * WA Gateway — submódulo "Monitor de Integrações" (Indicadores) do portal OpenDesk.
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Agente na VM Ubuntu srvappapi que ENVIA os alertas pelo WhatsApp. Genérico e MULTI-CONTA:
 * roda um Client `whatsapp-web.js` por conta (`monarq_wa_conta`), cada um com sua sessão
 * (LocalAuth clientId=<conta>). Fala com o portal (portal) por HTTPS + Bearer <MONITOR_AGENTE_TOKEN>:
 *   POST /api/monitor-arquivos/wa/heartbeat  → reporta status por conta + recebe contas a rodar/flags
 *   POST /api/monitor-arquivos/wa/qr         → publica/limpa o QR de uma conta (pareamento pelo portal)
 *   POST /api/monitor-arquivos/wa/grupos     → publica a lista de grupos da conta
 *   POST /api/monitor-arquivos/wa/pull       → puxa mensagens pendentes da conta (fila do cérebro)
 *   POST /api/monitor-arquivos/wa/report     → reporta o envio (ok|erro) de cada mensagem
 *
 * O QUE enviar/quando é decidido no PORTAL (o cérebro enfileira em monarq_wa_outbox). Este agente
 * é "burro": pareia, puxa a fila, envia, reporta. Recuperação de sessão no `disconnected`.
 *
 * ⚠️ Bug conhecido (ver docs/envio-parcial-handoff.md): `whatsapp-web.js` 1.34.7 quebrou o envio a
 * GRUPOS (getChats). Enquanto a lib não corrige, envio a CONTATO (E.164) funciona; para GRUPO, dá
 * pra contornar cadastrando o identificador como o id do grupo terminando em `@g.us` (envio direto,
 * sem getChats). O portal monitora a correção via scheduledWwebjsVersionCheck.
 *
 * Runtime: Node 18+ (fetch nativo) + Chromium/Puppeteer (mesma VM do bot de Parcial). systemd.
 */

import "dotenv/config";
import pkg from "whatsapp-web.js";
const { Client, LocalAuth, MessageMedia } = pkg;
import qrcode from "qrcode";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "wa-gateway-1.1.0";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Interpretador Python para renderizar a imagem do RESUMO (Pillow) — mesma técnica do bot de Parcial.
const PYTHON_BIN = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
const RENDER_RESUMO = join(__dirname, "gerar_imagem_monitor.py");

// ── Configuração via .env ─────────────────────────────────────────────────────
const PORTAL_URL = (process.env.PORTAL_URL || "http://localhost:3000").replace(/\/+$/, "");
const AGENTE_TOKEN = process.env.MONITOR_AGENTE_TOKEN || "";
const HEARTBEAT_SEG = Math.max(10, Number(process.env.HEARTBEAT_SEG || 30));
const POLL_SEG = Math.max(3, Number(process.env.POLL_SEG || 8));
const HTTP_TIMEOUT_SEG = Math.max(5, Number(process.env.HTTP_TIMEOUT_SEG || 20));
const PULL_LIMIT = Math.max(1, Number(process.env.PULL_LIMIT || 10));
// Pausa entre envios (ms) para não ser marcado como spam.
const ENVIO_DELAY_MS = Math.max(0, Number(process.env.ENVIO_DELAY_MS || 1500));
const SESSAO_DIR = process.env.SESSAO_DIR || "./.wwebjs_auth";

// ── Estado em memória ─────────────────────────────────────────────────────────
/** contaId → { client, status, ready, enviando } */
const contas = new Map();
let parando = false;

// ── Log ────────────────────────────────────────────────────────────────────
function log(nivel, ...a) {
  const ts = new Date().toISOString();
  const fn = nivel === "erro" ? console.error : nivel === "warn" ? console.warn : console.log;
  fn(`[${ts}] [${nivel.toUpperCase()}]`, ...a);
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Cliente HTTP da ponte (com timeout) ─────────────────────────────────────
async function api(endpoint, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_SEG * 1000);
  try {
    const res = await fetch(`${PORTAL_URL}/api/monitor-arquivos/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${AGENTE_TOKEN}` },
      body: JSON.stringify(body ?? {}),
      signal: ctrl.signal,
    });
    const txt = await res.text().catch(() => "");
    let json = null;
    try {
      json = txt ? JSON.parse(txt) : null;
    } catch {
      /* resposta não-JSON */
    }
    if (!res.ok || (json && json.success === false)) {
      const msg = (json && json.message) || txt.slice(0, 200) || res.statusText;
      throw new Error(`HTTP ${res.status} em /${endpoint}: ${msg}`);
    }
    return json?.data ?? {};
  } catch (e) {
    if (e?.name === "AbortError") throw new Error(`timeout (${HTTP_TIMEOUT_SEG}s) em /${endpoint}`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ── Client whatsapp-web.js por conta ────────────────────────────────────────
function criarCliente(contaId) {
  const estado = { client: null, status: "aguardando_qr", ready: false, enviando: false };
  contas.set(contaId, estado);

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: contaId, dataPath: SESSAO_DIR }),
    puppeteer: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    },
  });
  estado.client = client;

  client.on("qr", async (qr) => {
    estado.status = "aguardando_qr";
    estado.ready = false;
    try {
      const dataUrl = await qrcode.toDataURL(qr);
      await api("wa/qr", { conta: contaId, dataUrl });
      log("info", `[${contaId}] QR publicado — pareie pelo portal.`);
    } catch (e) {
      log("warn", `[${contaId}] falha ao publicar QR: ${e.message}`);
    }
  });

  client.on("ready", async () => {
    estado.status = "conectado";
    estado.ready = true;
    log("info", `[${contaId}] conectado.`);
    try {
      await api("wa/qr", { conta: contaId, dataUrl: null }); // limpa o QR
    } catch (e) {
      log("warn", `[${contaId}] falha ao limpar QR: ${e.message}`);
    }
    await publicarGrupos(contaId);
  });

  client.on("auth_failure", (m) => {
    estado.status = "erro";
    estado.ready = false;
    log("erro", `[${contaId}] auth_failure: ${m}`);
  });

  client.on("disconnected", async (motivo) => {
    estado.ready = false;
    estado.status = "desconectado";
    log("warn", `[${contaId}] desconectado: ${motivo}`);
    // LOGOUT/UNPAIRED → apaga a sessão e recria (gera novo QR). Transitório → reconecta.
    try {
      await client.destroy();
    } catch {
      /* ignora */
    }
    contas.delete(contaId);
    if (!parando) {
      await esperar(3000);
      criarCliente(contaId); // recria; o heartbeat também garante recriação
    }
  });

  client.initialize().catch((e) => {
    estado.status = "erro";
    log("erro", `[${contaId}] initialize falhou: ${e.message}`);
  });

  log("info", `[${contaId}] Client criado (inicializando).`);
}

/** Publica a lista de grupos da conta (best-effort; pode falhar no bug do getChats). */
async function publicarGrupos(contaId) {
  const estado = contas.get(contaId);
  if (!estado?.ready) return;
  try {
    const chats = await estado.client.getChats();
    const grupos = chats.filter((c) => c.isGroup).map((c) => c.name).filter(Boolean);
    await api("wa/grupos", { conta: contaId, grupos });
    log("info", `[${contaId}] ${grupos.length} grupo(s) publicado(s).`);
  } catch (e) {
    log("warn", `[${contaId}] não consegui listar grupos (bug getChats?): ${e.message}`);
  }
}

// ── Envio de uma mensagem ────────────────────────────────────────────────────

/** Resolve o chatId (_serialized) do destino: contato (E.164), grupo por id @g.us, ou grupo por nome. */
async function resolverChatId(client, msg) {
  if (msg.tipo === "contato") {
    // Número E.164 (só dígitos) → resolve o id no WhatsApp.
    const num = String(msg.identificador).replace(/\D/g, "");
    const numberId = await client.getNumberId(num);
    if (!numberId) throw new Error(`número ${msg.identificador} não existe no WhatsApp`);
    return numberId._serialized;
  }
  // grupo: id direto (@g.us) contorna o getChats quebrado; senão resolve pelo NOME (bug conhecido).
  if (/@g\.us$/i.test(msg.identificador)) return msg.identificador;
  const chats = await client.getChats();
  const grupo = chats.find((c) => c.isGroup && c.name === msg.identificador);
  if (!grupo) throw new Error(`grupo "${msg.identificador}" não encontrado`);
  return grupo.id._serialized;
}

/**
 * Renderiza a IMAGEM do resumo a partir do payload JSON (campo `mensagem` quando categoria='resumo').
 * Escreve o payload num temporário, chama o renderer Python (Pillow) e devolve MessageMedia + legenda
 * + uma função de limpeza. Mesma técnica do bot de Parcial (JSON → PNG → MessageMedia).
 */
function prepararResumo(msg) {
  let payload;
  try {
    payload = JSON.parse(msg.mensagem);
  } catch {
    throw new Error("payload do resumo inválido (JSON)");
  }
  if (!existsSync(RENDER_RESUMO)) throw new Error(`renderer não encontrado: ${RENDER_RESUMO}`);
  const dir = mkdtempSync(join(tmpdir(), "monarq-resumo-"));
  const jsonPath = join(dir, "payload.json");
  const pngPath = join(dir, "resumo.png");
  const cleanup = () => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignora */
    }
  };
  try {
    writeFileSync(jsonPath, JSON.stringify(payload), "utf8");
    execFileSync(PYTHON_BIN, [RENDER_RESUMO, jsonPath, pngPath], { timeout: 30000, stdio: "pipe" });
    if (!existsSync(pngPath)) throw new Error("renderer não gerou a imagem");
    const media = MessageMedia.fromFilePath(pngPath);
    return { media, caption: typeof payload.caption === "string" ? payload.caption : "", cleanup };
  } catch (e) {
    cleanup();
    throw e instanceof Error ? e : new Error(String(e));
  }
}

async function enviarMensagem(contaId, msg) {
  const estado = contas.get(contaId);
  if (!estado?.ready) throw new Error("conta não conectada");
  const client = estado.client;
  const chatId = await resolverChatId(client, msg);

  // Resumo diário = IMAGEM (Pillow) + legenda; demais categorias = texto puro.
  if (msg.categoria === "resumo") {
    const { media, caption, cleanup } = prepararResumo(msg);
    try {
      await client.sendMessage(chatId, media, caption ? { caption } : {});
    } finally {
      cleanup();
    }
    return;
  }

  await client.sendMessage(chatId, msg.mensagem);
}

/** Drena a fila de UMA conta conectada: pull → envia → report. */
async function drenarConta(contaId) {
  const estado = contas.get(contaId);
  if (!estado?.ready || estado.enviando) return;
  estado.enviando = true;
  try {
    const { mensagens } = await api("wa/pull", { waContaId: contaId, limit: PULL_LIMIT });
    if (!Array.isArray(mensagens) || mensagens.length === 0) return;
    log("info", `[${contaId}] ${mensagens.length} mensagem(ns) na fila.`);
    for (const msg of mensagens) {
      if (parando) break;
      try {
        await enviarMensagem(contaId, msg);
        await api("wa/report", { id: msg.id, ok: true });
        log("info", `[${contaId}] enviado #${msg.id} → ${msg.tipo} ${msg.identificador}`);
      } catch (e) {
        await api("wa/report", { id: msg.id, ok: false, erro: String(e.message).slice(0, 512) }).catch(() => {});
        log("warn", `[${contaId}] falha no #${msg.id}: ${e.message}`);
      }
      await esperar(ENVIO_DELAY_MS);
    }
  } catch (e) {
    log("warn", `[${contaId}] pull falhou: ${e.message}`);
  } finally {
    estado.enviando = false;
  }
}

// ── Heartbeat: reporta status e reconcilia as contas a rodar ─────────────────
async function heartbeat() {
  const payload = Array.from(contas.entries()).map(([id, e]) => ({
    id,
    status: e.status,
    online: true,
  }));
  let data;
  try {
    data = await api("wa/heartbeat", { versao: VERSION, contas: payload });
  } catch (e) {
    log("warn", `heartbeat falhou: ${e.message}`);
    return;
  }
  const desejadas = Array.isArray(data.contas) ? data.contas : [];
  for (const c of desejadas) {
    const estado = contas.get(c.id);
    if (c.logoutSolicitado && estado?.client) {
      log("info", `[${c.id}] re-pareamento solicitado — deslogando.`);
      try {
        await estado.client.logout();
      } catch {
        /* ignora */
      }
      try {
        await estado.client.destroy();
      } catch {
        /* ignora */
      }
      contas.delete(c.id);
    }
    if (!contas.has(c.id)) criarCliente(c.id);
  }
}

// ── Laços ─────────────────────────────────────────────────────────────────────
async function loopHeartbeat() {
  while (!parando) {
    await heartbeat();
    await esperar(HEARTBEAT_SEG * 1000);
  }
}
async function loopPoll() {
  while (!parando) {
    for (const id of Array.from(contas.keys())) {
      if (parando) break;
      await drenarConta(id);
    }
    await esperar(POLL_SEG * 1000);
  }
}

// ── Boot ─────────────────────────────────────────────────────────────────────
async function encerrar(sinal) {
  log("info", `recebido ${sinal} — encerrando…`);
  parando = true;
  for (const [, e] of contas) {
    try {
      await e.client?.destroy();
    } catch {
      /* ignora */
    }
  }
  setTimeout(() => process.exit(0), 500);
}
process.on("SIGINT", () => encerrar("SIGINT"));
process.on("SIGTERM", () => encerrar("SIGTERM"));

log("info", `WA Gateway — ${VERSION}`);
log("info", `Portal: ${PORTAL_URL} · heartbeat ${HEARTBEAT_SEG}s · poll ${POLL_SEG}s`);
if (!AGENTE_TOKEN.trim()) log("warn", "MONITOR_AGENTE_TOKEN vazio — o portal responderá 401/503.");

await heartbeat(); // 1º heartbeat popula as contas
loopHeartbeat();
loopPoll();
