/**
 * Control plane do submódulo "Envio de Parcial" (Comercial) — MULTI-ENVIO.
 *
 * Camada de acesso às tabelas parcial_envios / parcial_imagens / parcial_log /
 * parcial_qr, compartilhada entre:
 *   - os endpoints-ponte (server/parcialBridge.ts), usados pelo bot via HTTPS;
 *   - o router tRPC (server/routers/parcial.ts), usado pelo portal.
 *
 * Cada envio (região) é uma linha em parcial_envios. O bot itera os envios
 * habilitados e reporta status/imagem/médias por envioId ou slug.
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  parcialContatoEnvios,
  parcialContatos,
  parcialEnvios,
  parcialGruposWa,
  parcialImagens,
  parcialLog,
  parcialPreviews,
  parcialQr,
} from "../drizzle/schema";

export type FiltroTipo = "todos" | "gerencia" | "rca";

/** Destinatário resolvido para o bot (1 entrada por vínculo habilitado). */
export type Destinatario = {
  vinculoId: number;
  tipo: string; // "grupo" | "contato"
  identificador: string;
  nome: string;
  filtroTipo: string;
  filtroValores: string[];
  /** "enviar/testar só para este destino" — vem true uma vez (read-and-clear). */
  forcar: boolean;
};

const LOG_CAP = 200;
/** Janela (ms) para considerar o bot "online" a partir do último heartbeat. */
export const HEARTBEAT_TIMEOUT_MS = 30_000;

export type NivelLog = "ok" | "info" | "warn" | "erro";

async function db() {
  const conn = await getDb();
  if (!conn) {
    throw new Error("Banco de dados indisponível.");
  }
  return conn;
}

/* ─── Envios (multi-região) ─────────────────────────────────────────────── */

export async function listEnvios() {
  const conn = await db();
  return conn.select().from(parcialEnvios).orderBy(parcialEnvios.id);
}

export async function getEnvioById(id: number) {
  const conn = await db();
  const rows = await conn
    .select()
    .from(parcialEnvios)
    .where(eq(parcialEnvios.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function getEnvioBySlug(slug: string) {
  const conn = await db();
  const rows = await conn
    .select()
    .from(parcialEnvios)
    .where(eq(parcialEnvios.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}

export async function getEnviosHabilitados() {
  const conn = await db();
  return conn
    .select()
    .from(parcialEnvios)
    .where(eq(parcialEnvios.habilitado, true))
    .orderBy(parcialEnvios.id);
}

type EnvioColumns = typeof parcialEnvios.$inferInsert;
export type EnvioPatch = Partial<Omit<EnvioColumns, "id" | "slug" | "createdAt">>;

export async function updateEnvio(id: number, patch: EnvioPatch) {
  const conn = await db();
  await conn
    .update(parcialEnvios)
    .set(patch)
    .where(eq(parcialEnvios.id, id));
}

/** O bot está reportando dentro da janela de heartbeat para um dado envio? */
export function isBotOnline(envio: { botOnline: boolean; ultimoHeartbeat: Date | null } | null): boolean {
  if (!envio || !envio.botOnline || !envio.ultimoHeartbeat) return false;
  return Date.now() - new Date(envio.ultimoHeartbeat).getTime() < HEARTBEAT_TIMEOUT_MS;
}

/* ─── Contatos (cadastro central reutilizável: grupo | contato) ─────────── */

export async function listContatos() {
  const conn = await db();
  return conn
    .select()
    .from(parcialContatos)
    .orderBy(parcialContatos.tipo, parcialContatos.nome);
}

export async function createContato(input: {
  tipo: string;
  identificador: string;
  nome: string;
  ativo?: boolean;
}) {
  const conn = await db();
  const [res] = await conn.insert(parcialContatos).values({
    tipo: input.tipo,
    identificador: input.identificador,
    nome: input.nome,
    ativo: input.ativo ?? true,
  });
  return res.insertId;
}

export async function updateContato(
  id: number,
  patch: Partial<{ identificador: string; nome: string; ativo: boolean }>,
) {
  const conn = await db();
  await conn.update(parcialContatos).set(patch).where(eq(parcialContatos.id, id));
}

export async function deleteContato(id: number) {
  const conn = await db();
  // Os vínculos (parcial_contato_envios) caem por ON DELETE CASCADE.
  await conn.delete(parcialContatos).where(eq(parcialContatos.id, id));
}

/* ─── Vínculos contato↔envio (N:N) + filtro de áreas ────────────────────── */

/** Vínculos de um envio, com os dados do contato (para a UI). */
export async function listVinculosByEnvio(envioId: number) {
  const conn = await db();
  return conn
    .select({
      id: parcialContatoEnvios.id,
      contatoId: parcialContatoEnvios.contatoId,
      envioId: parcialContatoEnvios.envioId,
      filtroTipo: parcialContatoEnvios.filtroTipo,
      filtroValores: parcialContatoEnvios.filtroValores,
      habilitado: parcialContatoEnvios.habilitado,
      tipo: parcialContatos.tipo,
      identificador: parcialContatos.identificador,
      nome: parcialContatos.nome,
      contatoAtivo: parcialContatos.ativo,
    })
    .from(parcialContatoEnvios)
    .innerJoin(parcialContatos, eq(parcialContatoEnvios.contatoId, parcialContatos.id))
    .where(eq(parcialContatoEnvios.envioId, envioId))
    .orderBy(parcialContatos.tipo, parcialContatos.nome);
}

/** Cria ou atualiza o vínculo (UNIQUE contatoId+envioId). */
export async function upsertVinculo(input: {
  contatoId: number;
  envioId: number;
  filtroTipo: FiltroTipo;
  filtroValores: string[];
  habilitado?: boolean;
}) {
  const conn = await db();
  const existing = await conn
    .select({ id: parcialContatoEnvios.id })
    .from(parcialContatoEnvios)
    .where(
      and(
        eq(parcialContatoEnvios.contatoId, input.contatoId),
        eq(parcialContatoEnvios.envioId, input.envioId),
      ),
    )
    .limit(1);

  // 'todos' nunca carrega valores; demais filtros normalizam (dedupe + sort).
  const valores =
    input.filtroTipo === "todos"
      ? []
      : Array.from(new Set(input.filtroValores)).sort((a, b) => a.localeCompare(b, "pt-BR"));

  const fields = {
    filtroTipo: input.filtroTipo,
    filtroValores: valores,
    ...(input.habilitado !== undefined ? { habilitado: input.habilitado } : {}),
  };

  if (existing.length > 0) {
    await conn
      .update(parcialContatoEnvios)
      .set(fields)
      .where(eq(parcialContatoEnvios.id, existing[0].id));
    return existing[0].id;
  }
  const [res] = await conn.insert(parcialContatoEnvios).values({
    contatoId: input.contatoId,
    envioId: input.envioId,
    ...fields,
  });
  return res.insertId;
}

export async function deleteVinculo(id: number) {
  const conn = await db();
  await conn.delete(parcialContatoEnvios).where(eq(parcialContatoEnvios.id, id));
}

export async function setVinculoHabilitado(id: number, habilitado: boolean) {
  const conn = await db();
  await conn.update(parcialContatoEnvios).set({ habilitado }).where(eq(parcialContatoEnvios.id, id));
}

/** Marca um vínculo para "enviar/testar só para ele" (consumido no heartbeat). */
export async function solicitarEnvioVinculo(id: number) {
  const conn = await db();
  await conn.update(parcialContatoEnvios).set({ forcarEnvio: true }).where(eq(parcialContatoEnvios.id, id));
}

/** Limpa o flag forcarEnvio dos vínculos informados (após entregar no heartbeat). */
async function limparForcarVinculos(ids: number[]) {
  if (ids.length === 0) return;
  const conn = await db();
  await conn
    .update(parcialContatoEnvios)
    .set({ forcarEnvio: false })
    .where(inArray(parcialContatoEnvios.id, ids));
}

/**
 * Destinatários resolvidos de um envio (só vínculos habilitados de contatos ativos).
 * Faz read-and-clear de forcarEnvio: o destino volta com forcar=true uma única vez.
 */
export async function getDestinatariosByEnvio(envioId: number): Promise<Destinatario[]> {
  const conn = await db();
  const rows = await conn
    .select({
      vinculoId: parcialContatoEnvios.id,
      tipo: parcialContatos.tipo,
      identificador: parcialContatos.identificador,
      nome: parcialContatos.nome,
      filtroTipo: parcialContatoEnvios.filtroTipo,
      filtroValores: parcialContatoEnvios.filtroValores,
      forcar: parcialContatoEnvios.forcarEnvio,
    })
    .from(parcialContatoEnvios)
    .innerJoin(parcialContatos, eq(parcialContatoEnvios.contatoId, parcialContatos.id))
    .where(
      and(
        eq(parcialContatoEnvios.envioId, envioId),
        eq(parcialContatoEnvios.habilitado, true),
        eq(parcialContatos.ativo, true),
      ),
    );
  const destinatarios = rows.map((r) => ({ ...r, filtroValores: r.filtroValores ?? [] }));
  await limparForcarVinculos(destinatarios.filter((d) => d.forcar).map((d) => d.vinculoId));
  return destinatarios;
}

/* ─── Preview por recorte (1 imagem por filtro distinto de um envio) ─────── */

export async function listPreviews(envioId: number) {
  const conn = await db();
  return conn
    .select()
    .from(parcialPreviews)
    .where(eq(parcialPreviews.envioId, envioId))
    .orderBy(parcialPreviews.sig);
}

/** Substitui TODOS os previews de um envio pelo conjunto atual (evita órfãos). */
export async function replacePreviews(
  envioId: number,
  items: { sig: string; label: string; base64: string; mimeType?: string; geradoEm?: Date }[],
) {
  const conn = await db();
  await conn.delete(parcialPreviews).where(eq(parcialPreviews.envioId, envioId));
  if (items.length === 0) return;
  await conn.insert(parcialPreviews).values(
    items.map((it) => ({
      envioId,
      sig: it.sig,
      label: it.label,
      base64: it.base64,
      mimeType: it.mimeType ?? "image/png",
      geradoEm: it.geradoEm ?? new Date(),
    })),
  );
}

/* ─── Grupos do WhatsApp (lista publicada pelo bot — singleton id=1) ─────── */

export async function getGruposWa() {
  const conn = await db();
  const rows = await conn
    .select()
    .from(parcialGruposWa)
    .where(eq(parcialGruposWa.id, 1))
    .limit(1);
  return rows[0] ?? null;
}

export async function setGruposWa(grupos: string[]) {
  const conn = await db();
  await conn
    .insert(parcialGruposWa)
    .values({ id: 1, grupos })
    .onDuplicateKeyUpdate({ set: { grupos } });
}

/* ─── Log (compartilhado — o bot publica com contexto na msg) ───────────── */

export async function addLog(nivel: NivelLog, msg: string) {
  const conn = await db();
  await conn.insert(parcialLog).values({ nivel, msg: msg.slice(0, 512) });
  // Mantém só as LOG_CAP entradas mais recentes (poda na aplicação).
  await conn.execute(
    sql`DELETE FROM parcial_log WHERE id NOT IN (SELECT id FROM (SELECT id FROM parcial_log ORDER BY id DESC LIMIT ${sql.raw(String(LOG_CAP))}) t)`,
  );
}

export async function getLogs(limit = 100) {
  const conn = await db();
  return conn
    .select()
    .from(parcialLog)
    .orderBy(desc(parcialLog.id))
    .limit(Math.min(Math.max(limit, 1), LOG_CAP));
}

/* ─── QR Code (compartilhado — 1 bot = 1 WhatsApp) ─────────────────────── */

export async function setQr(dataUrl: string | null, ts: Date | null = new Date()) {
  const conn = await db();
  await conn
    .update(parcialQr)
    .set({ dataUrl, ts: dataUrl ? ts : null })
    .where(eq(parcialQr.id, 1));
}

export async function getQr() {
  const conn = await db();
  const rows = await conn
    .select()
    .from(parcialQr)
    .where(eq(parcialQr.id, 1))
    .limit(1);
  return rows[0] ?? null;
}

/* ─── Imagem (por envio) ────────────────────────────────────────────────── */

export async function setImagem(envioId: number, base64: string, mimeType = "image/png", geradoEm: Date = new Date()) {
  const conn = await db();
  // Upsert: atualiza se existe, insere se não
  const existing = await conn
    .select({ id: parcialImagens.id })
    .from(parcialImagens)
    .where(eq(parcialImagens.envioId, envioId))
    .limit(1);

  if (existing.length > 0) {
    await conn
      .update(parcialImagens)
      .set({ base64, mimeType, geradoEm })
      .where(eq(parcialImagens.envioId, envioId));
  } else {
    await conn.insert(parcialImagens).values({ envioId, base64, mimeType, geradoEm });
  }
}

export async function getImagem(envioId: number) {
  const conn = await db();
  const rows = await conn
    .select()
    .from(parcialImagens)
    .where(eq(parcialImagens.envioId, envioId))
    .limit(1);
  return rows[0] ?? null;
}

/* ─── Cálculo do próximo envio (server-side) ──────────────────────────── */

const TZ = "America/Sao_Paulo";

/** Retorna partes de data/hora no fuso de São Paulo. */
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
    .reduce((acc, x) => ((acc[x.type] = x.value), acc), {} as Record<string, string>);
  return {
    ano: Number(p.year),
    mes: Number(p.month),
    dia: Number(p.day),
    hora: Number(p.hour),
    minuto: Number(p.minute),
    diaSemana: p.weekday, // "Mon".."Sun"
  };
}

/** Dia (1-31) do último dia ÚTIL (seg-sex) do mês. */
function ultimoDiaUtilDoMes(ano: number, mes: number) {
  const d = new Date(Date.UTC(ano, mes, 0)); // último dia do mês
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.getUTCDate();
}

/** Verifica se um dia da semana ("Mon".."Sun") é dia útil. */
function isDiaUtil(wd: string) {
  return wd !== "Sat" && wd !== "Sun";
}

/** Retorna o weekday string para um Date no fuso SP. */
function weekdaySP(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short" }).format(date);
}

/**
 * Calcula o próximo horário de envio para um envio, baseado nos horários configurados.
 * Retorna um Date UTC representando o próximo disparo.
 */
export function calcularProximoEnvio(envio: {
  horaInicio: number;
  horaFim: number;
  horariosPadrao: number[] | null;
  pausado: boolean;
}): Date | null {
  if (envio.pausado) return null;

  const agora = new Date();
  const { ano, mes, dia, hora, minuto, diaSemana } = partesSP(agora);
  const horarios = envio.horariosPadrao ?? [11, 13, 15, 17, 19, 20];

  // Gera lista de horários para hoje
  function horariosParaDia(d: number, m: number, a: number): number[] {
    if (d === ultimoDiaUtilDoMes(a, m)) {
      // Último dia útil: hora em hora de horaInicio a horaFim
      const lista: number[] = [];
      for (let h = envio.horaInicio; h <= envio.horaFim; h++) lista.push(h);
      return lista;
    }
    return [...horarios].sort((a, b) => a - b);
  }

  // Tenta encontrar o próximo horário hoje
  if (isDiaUtil(diaSemana)) {
    const horasHoje = horariosParaDia(dia, mes, ano);
    const horaAtual = hora * 60 + minuto;
    for (const h of horasHoje) {
      if (h * 60 > horaAtual) {
        // Próximo envio é hoje às h:00 BRT
        // Converter para UTC: criar a data em SP e ajustar
        const target = new Date(
          agora.toLocaleString("en-US", { timeZone: TZ }).replace(/,.*/, "") +
            ` ${String(h).padStart(2, "0")}:00:00`,
        );
        // Abordagem mais robusta: calcular offset
        const spNow = new Date(agora.toLocaleString("en-US", { timeZone: TZ }));
        const offsetMs = agora.getTime() - spNow.getTime();
        const targetUTC = new Date(target.getTime() + offsetMs);
        return targetUTC;
      }
    }
  }

  // Não há mais horários hoje — buscar o próximo dia útil
  const candidate = new Date(agora);
  for (let i = 0; i < 7; i++) {
    candidate.setDate(candidate.getDate() + 1);
    const wd = weekdaySP(candidate);
    if (!isDiaUtil(wd)) continue;

    // Encontrou o próximo dia útil
    const pCandidate = partesSP(candidate);
    const horasNoDia = horariosParaDia(pCandidate.dia, pCandidate.mes, pCandidate.ano);
    if (horasNoDia.length === 0) continue;

    const primeiraHora = horasNoDia[0];
    // Construir a data no fuso SP e converter para UTC
    const spNow = new Date(candidate.toLocaleString("en-US", { timeZone: TZ }));
    const offsetMs = candidate.getTime() - spNow.getTime();
    const targetStr = candidate.toLocaleString("en-US", { timeZone: TZ }).replace(/,.*/, "") +
      ` ${String(primeiraHora).padStart(2, "0")}:00:00`;
    const target = new Date(targetStr);
    const targetUTC = new Date(target.getTime() + offsetMs);
    return targetUTC;
  }

  return null;
}

/* ─── Heartbeat / pull (usado pelo bot) — MULTI-ENVIO ───────────────────── */

export type HeartbeatInput = {
  status: string;
  ultimoEnvio?: Date | null;
  proximoEnvio?: Date | null;
};

/* ─── Reiniciar Bot (flag in-memory, não persiste no DB) ─────────────────── */

/** Flag em memória: quando true, o próximo heartbeat responde com reiniciarBot=true. */
let _reiniciarBotFlag = false;

/** Seta o flag de reinício (chamado pelo tRPC router). */
export function solicitarReinicioBot() {
  _reiniciarBotFlag = true;
}

/** Lê e limpa o flag de reinício (chamado pelo heartbeat). */
function consumirReinicioBot(): boolean {
  if (_reiniciarBotFlag) {
    _reiniciarBotFlag = false;
    return true;
  }
  return false;
}

/* ─── Desconectar WhatsApp (flag in-memory, não persiste no DB) ──────────────── */

/** Flag em memória: quando true, o próximo heartbeat responde com logoutBot=true. */
let _logoutBotFlag = false;

/** Seta o flag de logout do WhatsApp (chamado pelo tRPC router). */
export function solicitarLogoutBot() {
  _logoutBotFlag = true;
}

/** Lê e limpa o flag de logout (chamado pelo heartbeat). */
function consumirLogoutBot(): boolean {
  if (_logoutBotFlag) {
    _logoutBotFlag = false;
    return true;
  }
  return false;
}

/* ─── Reiniciar PROCESSO (hard restart: process.exit → Tarefa Agendada sobe) ──── */

/** Flag em memória: quando true, o próximo heartbeat responde com hardRestart=true. */
let _hardRestartFlag = false;

/** Seta o flag de reinício de processo (chamado pelo tRPC router). */
export function solicitarHardRestart() {
  _hardRestartFlag = true;
}

/** Lê e limpa o flag de hard restart (chamado pelo heartbeat). */
function consumirHardRestart(): boolean {
  if (_hardRestartFlag) {
    _hardRestartFlag = false;
    return true;
  }
  return false;
}

/**
 * Registra o heartbeat do bot para um envio específico e devolve a configuração
 * + comandos pendentes. Faz read-and-clear de `forcarEnvio`.
 * Calcula automaticamente o próximo envio (server-side).
 */
export async function heartbeatPullEnvio(envioId: number, input: HeartbeatInput) {
  const envio = await getEnvioById(envioId);
  if (!envio) {
    throw new Error(`Envio id=${envioId} não encontrado.`);
  }

  const patch: EnvioPatch = {
    status: input.status,
    botOnline: true,
    ultimoHeartbeat: new Date(),
  };
  if (input.ultimoEnvio !== undefined) patch.ultimoEnvio = input.ultimoEnvio;

  // Calcular próximo envio server-side (ignora o que o bot envia)
  const proximo = calcularProximoEnvio(envio);
  patch.proximoEnvio = proximo;

  const forcarEnvio = envio.forcarEnvio === true;
  if (forcarEnvio) patch.forcarEnvio = false;

  await updateEnvio(envioId, patch);

  const destinatarios = await getDestinatariosByEnvio(envio.id);

  return {
    id: envio.id,
    slug: envio.slug,
    nome: envio.nome,
    pausado: envio.pausado,
    grupo: envio.grupo,
    gerentes: envio.gerentes ?? [],
    gerentesOcultos: envio.gerentesOcultos ?? [],
    gerentesVisiveis: envio.gerentesVisiveis ?? null,
    mediaBaseTodos: envio.mediaBaseTodos ?? true,
    rcasOcultos: envio.rcasOcultos ?? [],
    queryKey: envio.queryKey,
    codEstabelecimentos: envio.codEstabelecimentos ?? [1, 2],
    horaInicio: envio.horaInicio,
    horaFim: envio.horaFim,
    horariosPadrao: envio.horariosPadrao ?? [11, 13, 15, 17, 19, 20],
    medias: envio.medias ?? {},
    destinatarios,
    forcarEnvio,
    habilitado: envio.habilitado,
    reiniciarBot: consumirReinicioBot(),
    logoutBot: consumirLogoutBot(),
    hardRestart: consumirHardRestart(),
  };
}

/**
 * Heartbeat "global" do bot: reporta status para TODOS os envios habilitados
 * e devolve a lista completa de configurações + comandos pendentes.
 * Usado quando o bot faz polling centralizado (1 heartbeat → N envios).
 * Calcula automaticamente o próximo envio para cada região.
 */
export async function heartbeatPullAll(input: HeartbeatInput) {
  const envios = await getEnviosHabilitados();
  const results = [];

  for (const envio of envios) {
    const patch: EnvioPatch = {
      status: input.status,
      botOnline: true,
      ultimoHeartbeat: new Date(),
    };
    if (input.ultimoEnvio !== undefined) patch.ultimoEnvio = input.ultimoEnvio;

    // Calcular próximo envio server-side
    const proximo = calcularProximoEnvio(envio);
    patch.proximoEnvio = proximo;

    const forcarEnvio = envio.forcarEnvio === true;
    if (forcarEnvio) patch.forcarEnvio = false;

    await updateEnvio(envio.id, patch);

    const destinatarios = await getDestinatariosByEnvio(envio.id);

    results.push({
      id: envio.id,
      slug: envio.slug,
      nome: envio.nome,
      pausado: envio.pausado,
      grupo: envio.grupo,
      gerentes: envio.gerentes ?? [],
      // Allowlist de gerências no painel completo (o bot filtra por ela). Antes o
      // caminho global NÃO enviava esse campo → a filtragem nunca chegava ao bot.
      gerentesVisiveis: envio.gerentesVisiveis ?? null,
      mediaBaseTodos: envio.mediaBaseTodos ?? true,
      rcasOcultos: envio.rcasOcultos ?? [],
      queryKey: envio.queryKey,
      codEstabelecimentos: envio.codEstabelecimentos ?? [1, 2],
      horaInicio: envio.horaInicio,
      horaFim: envio.horaFim,
      horariosPadrao: envio.horariosPadrao ?? [11, 13, 15, 17, 19, 20],
      medias: envio.medias ?? {},
      destinatarios,
      forcarEnvio,
      habilitado: envio.habilitado,
      reiniciarBot: false,
      logoutBot: false,
      hardRestart: false,
    });
  }

  // Inclui reiniciarBot/logoutBot no primeiro envio da lista (o bot verifica em qualquer um)
  if (results.length > 0) {
    results[0].reiniciarBot = consumirReinicioBot();
    results[0].logoutBot = consumirLogoutBot();
    results[0].hardRestart = consumirHardRestart();
  }

  return results;
}

/* ─── Retrocompatibilidade: heartbeat singleton (bot antigo) ────────────── */

/**
 * Para manter compatibilidade com o bot que ainda não foi atualizado para
 * multi-envio: faz heartbeat no envio SC (id=1) e retorna no formato antigo.
 */
export async function heartbeatPullLegacy(input: HeartbeatInput) {
  const result = await heartbeatPullEnvio(1, input);
  return {
    pausado: result.pausado,
    grupo: result.grupo,
    cron: `0 ${result.horaInicio}-${result.horaFim} * * 1-5`,
    horaInicio: result.horaInicio,
    horaFim: result.horaFim,
    horariosPadrao: result.horariosPadrao,
    medias: result.medias,
    forcarEnvio: result.forcarEnvio,
  };
}
