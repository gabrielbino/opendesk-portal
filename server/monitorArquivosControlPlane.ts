/**
 * Control plane + CÉREBRO do submódulo "Monitor de Integrações" (Indicadores).
 *
 * Camada de acesso às tabelas monarq_* e a lógica de decisão (máquina de estados, SLA,
 * alertas). Compartilhada entre:
 *   - os endpoints-ponte (server/monitorArquivosBridge.ts), usados pelo COLETOR e pelo WA
 *     GATEWAY (agentes na VM) via HTTPS + Bearer;
 *   - o router tRPC (server/routers/monitorArquivos.ts), usado pelo portal.
 *
 * A regra de negócio PURA (parsing, avaliação de prazo, status, mensagens) vive em
 * @shared/monitorArquivos — aqui só orquestramos com o banco. Ver docs/monitor-arquivos-handoff.md.
 */

import { and, eq, inArray, lt, ne, sql } from "drizzle-orm";
import { getDb, createNotification, getUserByEmail, getApprovedUsers } from "./db";
import {
  monarqAlertaTelaConfig,
  monarqBackupConfig,
  monarqColetor,
  monarqConfig,
  monarqConfigDestino,
  monarqDestino,
  monarqEvento,
  monarqHistoricoDia,
  monarqLista,
  monarqLog,
  monarqResumoConfig,
  monarqWaConta,
  monarqWaOutbox,
} from "../drizzle/schema";
import { diaMarcado, estaAtivoAgora, instanteSP, type Agenda } from "@shared/agenda";
import { calcularCorte, dataSP, type ManterUnidade } from "@shared/monitorArquivosBackup";
import { montarResumoImagem, type ResumoItem } from "@shared/monitorArquivosResumo";
import {
  arquivoCasaLista,
  avaliarAlertaAgregado,
  avaliarGeracao,
  avaliarPrazo,
  calcularStatusGeracao,
  calcularStatusPainel,
  classificarExtensao,
  type EstadoDiaGeracao,
  type EstadoEvento,
  formatarDuracaoMin,
  msgAgregadoListas,
  msgAgregadoPedidos,
  normalizarExtensao,
  parseArquivo,
  type ResumoConfig,
  type StatusCor,
  type StatusPainel,
} from "@shared/monitorArquivos";

/** Janela (ms) para considerar o coletor "online" a partir do último heartbeat. */
export const COLETOR_TIMEOUT_MS = 90_000;
const LOG_CAP = 200;
/** Eventos "lido" mais antigos que isto são podados a cada varredura. */
const RETENCAO_LIDO_DIAS = 30;
/** Mensagens de WhatsApp já enviadas/com erro mais antigas que isto são podadas (histórico curto). */
const RETENCAO_OUTBOX_DIAS = 7;

async function db() {
  const conn = await getDb();
  if (!conn) throw new Error("Banco de dados indisponível.");
  return conn;
}

/* ─── Normalização de entrada ─────────────────────────────────────────────── */

function sanitizarExtensoesPendente(exts: string[]): string[] {
  return Array.from(new Set(exts.map(normalizarExtensao).filter((e) => e !== "")));
}

function sanitizarDias(dias: number[] | null | undefined): number[] {
  if (!Array.isArray(dias)) return [];
  return Array.from(new Set(dias.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))).sort((a, b) => a - b);
}

function clampHora(h: number, fallback: number): number {
  return Number.isFinite(h) ? Math.min(24, Math.max(0, Math.trunc(h))) : fallback;
}

function agendaDe(c: { diasSemana: number[] | null; horaInicio: number; horaFim: number }): Agenda {
  return { diasSemana: c.diasSemana ?? [], horaInicio: c.horaInicio, horaFim: c.horaFim };
}

/* ─── Config (CRUD) ───────────────────────────────────────────────────────── */

export type ConfigInput = {
  nome: string;
  caminho: string;
  tipoMonitoramento?: string;
  extensoesPendente: string[];
  extensaoLida: string;
  intervaloVarreduraSeg: number;
  slaLeituraMin: number;
  gapSemPedidoMin: number;
  realertaMin: number;
  diasSemana: number[];
  horaInicio: number;
  horaFim: number;
  waContaId?: string;
  ativo?: boolean;
  /** Modo 'geracao': listas a acompanhar (replace-set). Ignorado no modo 'pedidos'. */
  listas?: ListaInput[];
};

/** Uma lista do modo 'geracao' (subset editável; `id` presente = linha existente). */
export type ListaInput = {
  id?: number;
  rotulo: string;
  caminho: string;
  modoIdentificacao?: string; // 'extensao' | 'nome'
  nomeArquivo?: string | null;
  extensoes: string[];
  quantidadeEsperada?: number;
  horaAlvo: number;
  minutoAlvo: number;
  realertaMin: number;
  ativo?: boolean;
};

export async function listConfigs() {
  const conn = await db();
  return conn.select().from(monarqConfig).orderBy(monarqConfig.nome);
}

export async function getConfig(id: number) {
  const conn = await db();
  const rows = await conn.select().from(monarqConfig).where(eq(monarqConfig.id, id)).limit(1);
  return rows[0] ?? null;
}

function valoresConfig(input: ConfigInput) {
  return {
    nome: input.nome.trim(),
    caminho: input.caminho.trim(),
    tipoMonitoramento: input.tipoMonitoramento === "geracao" ? "geracao" : "pedidos",
    extensoesPendente: sanitizarExtensoesPendente(input.extensoesPendente),
    extensaoLida: normalizarExtensao(input.extensaoLida) || "._rm",
    intervaloVarreduraSeg: Math.max(5, Math.trunc(input.intervaloVarreduraSeg)),
    slaLeituraMin: Math.max(1, Math.trunc(input.slaLeituraMin)),
    gapSemPedidoMin: Math.max(1, Math.trunc(input.gapSemPedidoMin)),
    realertaMin: Math.max(1, Math.trunc(input.realertaMin)),
    diasSemana: sanitizarDias(input.diasSemana),
    horaInicio: clampHora(input.horaInicio, 0),
    horaFim: clampHora(input.horaFim, 24),
    waContaId: (input.waContaId ?? "monitor").trim() || "monitor",
    ativo: input.ativo ?? true,
  };
}

export async function createConfig(input: ConfigInput) {
  const conn = await db();
  const [res] = await conn.insert(monarqConfig).values(valoresConfig(input));
  const id = res.insertId;
  // Uma integração pode ter pedidos e/ou listas — o replace-set aplica o conjunto enviado.
  if (input.listas !== undefined) await setListasConfig(id, input.listas);
  await addLog("ok", `Integração "${input.nome}" cadastrada.`);
  return id;
}

export async function updateConfig(id: number, input: ConfigInput) {
  const conn = await db();
  await conn.update(monarqConfig).set(valoresConfig(input)).where(eq(monarqConfig.id, id));
  if (input.listas !== undefined) await setListasConfig(id, input.listas);
  await addLog("info", `Integração "${input.nome}" atualizada.`);
}

export async function deleteConfig(id: number) {
  const conn = await db();
  const c = await getConfig(id);
  // Eventos e vínculos caem por ON DELETE CASCADE.
  await conn.delete(monarqConfig).where(eq(monarqConfig.id, id));
  if (c) await addLog("info", `Caminho "${c.nome}" removido.`);
}

/* ─── Destinos WhatsApp (cadastro + vínculo N:N) ──────────────────────────── */

export async function listDestinos() {
  const conn = await db();
  return conn.select().from(monarqDestino).orderBy(monarqDestino.tipo, monarqDestino.nome);
}

export async function createDestino(input: {
  waContaId?: string;
  tipo: string;
  identificador: string;
  nome: string;
  ativo?: boolean;
  universal?: boolean;
}) {
  const conn = await db();
  const [res] = await conn.insert(monarqDestino).values({
    waContaId: (input.waContaId ?? "monitor").trim() || "monitor",
    tipo: input.tipo === "grupo" ? "grupo" : "contato",
    identificador: input.identificador.trim(),
    nome: input.nome.trim(),
    ativo: input.ativo ?? true,
    universal: input.universal ?? false,
  });
  return res.insertId;
}

export async function updateDestino(
  id: number,
  patch: Partial<{ identificador: string; nome: string; ativo: boolean; universal: boolean }>,
) {
  const conn = await db();
  await conn.update(monarqDestino).set(patch).where(eq(monarqDestino.id, id));
}

export async function deleteDestino(id: number) {
  const conn = await db();
  await conn.delete(monarqDestino).where(eq(monarqDestino.id, id));
}

/** Vínculos (destinoId + habilitado) de um caminho, com dados do destino para a UI. */
export async function listVinculosByConfig(configId: number) {
  const conn = await db();
  return conn
    .select({
      destinoId: monarqConfigDestino.destinoId,
      habilitado: monarqConfigDestino.habilitado,
      tipo: monarqDestino.tipo,
      identificador: monarqDestino.identificador,
      nome: monarqDestino.nome,
      ativo: monarqDestino.ativo,
      waContaId: monarqDestino.waContaId,
    })
    .from(monarqConfigDestino)
    .innerJoin(monarqDestino, eq(monarqConfigDestino.destinoId, monarqDestino.id))
    .where(eq(monarqConfigDestino.configId, configId))
    .orderBy(monarqDestino.tipo, monarqDestino.nome);
}

/** Substitui o conjunto de destinos vinculados a um caminho (replace-set). */
export async function setVinculosConfig(configId: number, destinoIds: number[]) {
  const conn = await db();
  await conn.delete(monarqConfigDestino).where(eq(monarqConfigDestino.configId, configId));
  const ids = Array.from(new Set(destinoIds));
  if (ids.length === 0) return;
  await conn.insert(monarqConfigDestino).values(ids.map((destinoId) => ({ configId, destinoId })));
}

/* ─── Listas do modo 'geracao' (filhas de uma config) ─────────────────────────
 *
 * Uma integração (monarq_config tipo 'geracao') tem N listas — cada uma com seu caminho +
 * extensões + horário limite. O CRUD é replace-set por config: preserva o estado de runtime
 * (ultimaGeracaoEm/estadoDia) das linhas mantidas (diff por id) e só remove as tiradas.
 */

function valoresLista(input: ListaInput, ordem: number) {
  const modo = input.modoIdentificacao === "nome" ? "nome" : "extensao";
  return {
    rotulo: input.rotulo.trim().slice(0, 120),
    caminho: input.caminho.trim(),
    modoIdentificacao: modo,
    nomeArquivo: modo === "nome" ? (input.nomeArquivo ?? "").trim().slice(0, 300) || null : null,
    extensoes: sanitizarExtensoesPendente(input.extensoes),
    quantidadeEsperada: modo === "extensao" ? Math.max(1, Math.trunc(input.quantidadeEsperada ?? 1)) : 1,
    horaAlvo: Math.min(23, Math.max(0, Math.trunc(input.horaAlvo))),
    minutoAlvo: Math.min(59, Math.max(0, Math.trunc(input.minutoAlvo))),
    realertaMin: Math.max(1, Math.trunc(input.realertaMin)),
    ordem,
    ativo: input.ativo ?? true,
  };
}

export async function listListasByConfig(configId: number) {
  const conn = await db();
  return conn
    .select()
    .from(monarqLista)
    .where(eq(monarqLista.configId, configId))
    .orderBy(monarqLista.ordem, monarqLista.id);
}

/** Substitui o conjunto de listas de uma config (diff por id: mantém, insere, remove). */
export async function setListasConfig(configId: number, listas: ListaInput[]) {
  const conn = await db();
  // Descarta linhas inválidas antes de persistir: precisa de caminho + (nome exato | ≥1 extensão).
  const validas = listas.filter((l) => {
    if (!l.caminho.trim()) return false;
    if (l.modoIdentificacao === "nome") return Boolean((l.nomeArquivo ?? "").trim());
    return sanitizarExtensoesPendente(l.extensoes).length > 0;
  });

  const existentes = await conn
    .select({
      id: monarqLista.id,
      horaAlvo: monarqLista.horaAlvo,
      minutoAlvo: monarqLista.minutoAlvo,
      modoIdentificacao: monarqLista.modoIdentificacao,
      nomeArquivo: monarqLista.nomeArquivo,
      extensoes: monarqLista.extensoes,
      quantidadeEsperada: monarqLista.quantidadeEsperada,
    })
    .from(monarqLista)
    .where(eq(monarqLista.configId, configId));
  const porId = new Map(existentes.map((r) => [r.id, r]));
  const idsIncoming = new Set(validas.filter((l) => l.id).map((l) => l.id as number));

  const remover = Array.from(porId.keys()).filter((id) => !idsIncoming.has(id));
  if (remover.length) await conn.delete(monarqLista).where(inArray(monarqLista.id, remover));

  for (let i = 0; i < validas.length; i++) {
    const l = validas[i];
    const vals = valoresLista(l, i);
    const antigo = l.id ? porId.get(l.id) : undefined;
    if (antigo) {
      // Mudou o HORÁRIO-LIMITE ou a IDENTIFICAÇÃO? Então reabre a avaliação do dia (limpa o alerta
      // antigo) — a lista é rejulgada pelo novo horário na próxima varredura, em vez de ficar presa
      // no vermelho. `qtdGeradaHoje`/`diaRef` são mantidos (uma lista já gerada continua verde).
      const mudouRegra =
        antigo.horaAlvo !== vals.horaAlvo ||
        antigo.minutoAlvo !== vals.minutoAlvo ||
        antigo.modoIdentificacao !== vals.modoIdentificacao ||
        (antigo.nomeArquivo ?? null) !== (vals.nomeArquivo ?? null) ||
        antigo.quantidadeEsperada !== vals.quantidadeEsperada ||
        JSON.stringify(antigo.extensoes ?? []) !== JSON.stringify(vals.extensoes);
      const reset = mudouRegra ? { estadoDia: "aguardando", alertadoEm: null, ultimoAlertaEm: null } : {};
      await conn.update(monarqLista).set({ ...vals, ...reset }).where(eq(monarqLista.id, l.id!));
    } else {
      await conn.insert(monarqLista).values({ configId, ...vals });
    }
  }
}

/** Listas ativas (de integrações ativas) que o coletor deve varrer, com o filtro de identificação. */
export async function getListasParaColetar() {
  const conn = await db();
  return conn
    .select({
      id: monarqLista.id,
      nome: sql<string>`CONCAT(${monarqConfig.nome}, ' · ', ${monarqLista.rotulo})`,
      caminho: monarqLista.caminho,
      modoIdentificacao: monarqLista.modoIdentificacao,
      nomeArquivo: monarqLista.nomeArquivo,
      extensoes: monarqLista.extensoes,
      intervaloVarreduraSeg: monarqConfig.intervaloVarreduraSeg,
    })
    .from(monarqLista)
    .innerJoin(monarqConfig, eq(monarqLista.configId, monarqConfig.id))
    .where(and(eq(monarqLista.ativo, true), eq(monarqConfig.ativo, true)))
    .orderBy(monarqLista.id);
}

/** Listas de uma config + status "bate o olho" calculado (para a modal de detalhe). */
export async function getListasComStatus(configId: number, agora: Date = new Date()) {
  const conn = await db();
  const config = await getConfig(configId);
  if (!config) return [];
  const online = isColetorOnline(await getColetorEstado(), agora);
  const rows = await listListasByConfig(configId);
  const agenda = agendaDe(config);
  return rows.map((l) => ({
    id: l.id,
    rotulo: l.rotulo,
    caminho: l.caminho,
    modoIdentificacao: l.modoIdentificacao,
    nomeArquivo: l.nomeArquivo ?? null,
    extensoes: l.extensoes ?? [],
    quantidadeEsperada: l.quantidadeEsperada,
    horaAlvo: l.horaAlvo,
    minutoAlvo: l.minutoAlvo,
    realertaMin: l.realertaMin,
    ativo: l.ativo,
    qtdGeradaHoje: l.qtdGeradaHoje,
    deteccao: l.deteccao ?? null,
    ultimaGeracaoEm: isoOuNull(l.ultimaGeracaoEm),
    ultimoArquivo: l.ultimoArquivo ?? null,
    status: calcularStatusGeracao({
      agenda,
      horaAlvo: l.horaAlvo,
      minutoAlvo: l.minutoAlvo,
      estadoDia: l.estadoDia as EstadoDiaGeracao,
      diaRef: l.diaRef,
      qtdGeradaHoje: l.qtdGeradaHoje,
      qtdEsperada: l.quantidadeEsperada,
      ultimaGeracaoEm: l.ultimaGeracaoEm ? new Date(l.ultimaGeracaoEm) : null,
      alertadoEm: l.alertadoEm ? new Date(l.alertadoEm) : null,
      coletorOnline: online && config.ativo && l.ativo,
      agora,
    }),
  }));
}

/* ─── Coletor (heartbeat + configs a varrer) ──────────────────────────────── */

export async function heartbeatColetor(versao?: string) {
  const conn = await db();
  await conn
    .update(monarqColetor)
    .set({ online: true, ultimoHeartbeat: new Date(), ...(versao ? { versao } : {}) })
    .where(eq(monarqColetor.id, 1));
}

export async function getColetorEstado() {
  const conn = await db();
  const rows = await conn.select().from(monarqColetor).where(eq(monarqColetor.id, 1)).limit(1);
  return rows[0] ?? null;
}

export function isColetorOnline(
  estado: { ultimoHeartbeat: Date | null } | null,
  agora: Date = new Date(),
): boolean {
  if (!estado?.ultimoHeartbeat) return false;
  return agora.getTime() - new Date(estado.ultimoHeartbeat).getTime() < COLETOR_TIMEOUT_MS;
}

/** Integrações ativas COM pasta de pedidos (caminho preenchido) que o coletor deve varrer. As
 * listas (opcionais) são varridas à parte por `getListasParaColetar`. */
export async function getConfigsParaColetar() {
  const conn = await db();
  const rows = await conn
    .select({
      id: monarqConfig.id,
      nome: monarqConfig.nome,
      caminho: monarqConfig.caminho,
      extensoesPendente: monarqConfig.extensoesPendente,
      extensaoLida: monarqConfig.extensaoLida,
      intervaloVarreduraSeg: monarqConfig.intervaloVarreduraSeg,
    })
    .from(monarqConfig)
    .where(and(eq(monarqConfig.ativo, true), ne(monarqConfig.caminho, "")))
    .orderBy(monarqConfig.id);
  return rows;
}

/* ─── Log ─────────────────────────────────────────────────────────────────── */

export type NivelLog = "ok" | "info" | "warn" | "erro";

export async function addLog(nivel: NivelLog, msg: string) {
  const conn = await db();
  await conn.insert(monarqLog).values({ nivel, msg: msg.slice(0, 512) });
  await conn.execute(
    sql`DELETE FROM monarq_log WHERE id NOT IN (SELECT id FROM (SELECT id FROM monarq_log ORDER BY id DESC LIMIT ${sql.raw(String(LOG_CAP))}) t)`,
  );
}

/* ─── Fila de saída WhatsApp ───────────────────────────────────────────────── */

/**
 * Enfileira uma mensagem para os destinos de um caminho: os VINCULADOS a ele (habilitados) UNIÃO
 * os UNIVERSAIS (recebem de todas as integrações). Dedupe por id do destino (um destino vinculado
 * que também é universal entra uma vez só).
 */
async function enfileirarParaConfig(
  config: { id: number; nome: string; waContaId: string },
  eventoId: number | null,
  categoria: "alerta" | "realerta" | "resolvido",
  mensagem: string,
) {
  const conn = await db();
  const vinculados = await conn
    .select({ id: monarqDestino.id, tipo: monarqDestino.tipo, identificador: monarqDestino.identificador })
    .from(monarqConfigDestino)
    .innerJoin(monarqDestino, eq(monarqConfigDestino.destinoId, monarqDestino.id))
    .where(
      and(
        eq(monarqConfigDestino.configId, config.id),
        eq(monarqConfigDestino.habilitado, true),
        eq(monarqDestino.ativo, true),
      ),
    );
  const universais = await conn
    .select({ id: monarqDestino.id, tipo: monarqDestino.tipo, identificador: monarqDestino.identificador })
    .from(monarqDestino)
    .where(and(eq(monarqDestino.universal, true), eq(monarqDestino.ativo, true)));

  const porId = new Map<number, { tipo: string; identificador: string }>();
  for (const d of [...vinculados, ...universais]) porId.set(d.id, { tipo: d.tipo, identificador: d.identificador });

  if (porId.size === 0) {
    await addLog("warn", `"${config.nome}": sem destinos WhatsApp (vinculado ou universal) — ${categoria} não enviado.`);
    return;
  }
  await conn.insert(monarqWaOutbox).values(
    Array.from(porId.values()).map((d) => ({
      waContaId: config.waContaId,
      tipo: d.tipo,
      identificador: d.identificador,
      mensagem,
      eventoId,
      categoria,
    })),
  );
}

/**
 * Fila pendente para o WA gateway drenar (Fase 2). Read-and-clear otimista: marca as linhas
 * como 'enviado' ao entregar; o gateway confirma/reporta erro depois via reportarEnvioWa.
 */
export async function pullOutbox(waContaId: string, limit = 20) {
  const conn = await db();
  // Poda de retenção (sem cron): remove enviados/erros antigos pra a fila não crescer pra sempre.
  const corte = new Date(Date.now() - RETENCAO_OUTBOX_DIAS * 24 * 60 * 60 * 1000);
  await conn
    .delete(monarqWaOutbox)
    .where(and(inArray(monarqWaOutbox.status, ["enviado", "erro"]), lt(monarqWaOutbox.criadoEm, corte)));

  const rows = await conn
    .select()
    .from(monarqWaOutbox)
    .where(and(eq(monarqWaOutbox.waContaId, waContaId), eq(monarqWaOutbox.status, "pendente")))
    .orderBy(monarqWaOutbox.criadoEm)
    .limit(Math.min(Math.max(limit, 1), 100));
  return rows;
}

export async function reportarEnvioWa(id: number, ok: boolean, erro?: string) {
  const conn = await db();
  await conn
    .update(monarqWaOutbox)
    .set({
      status: ok ? "enviado" : "erro",
      enviadoEm: ok ? new Date() : null,
      erro: erro ? erro.slice(0, 512) : null,
      tentativas: sql`${monarqWaOutbox.tentativas} + 1`,
    })
    .where(eq(monarqWaOutbox.id, id));
}

/* ─── Contas de WhatsApp (WA Gateway — Fase 2) ────────────────────────────────
 *
 * O gateway na VM roda 1 Client `whatsapp-web.js` por conta (`monarq_wa_conta`), publica QR/
 * status/grupos aqui e drena a fila da conta. O painel (admin) mostra o status + QR pra parear.
 * `WA_CONTA_TIMEOUT_MS` = janela do heartbeat pra considerar a conta "online". */
export const WA_CONTA_TIMEOUT_MS = 60_000;

export async function listWaContas() {
  const conn = await db();
  return conn.select().from(monarqWaConta).orderBy(monarqWaConta.id);
}

export async function getWaConta(id: string) {
  const conn = await db();
  const rows = await conn.select().from(monarqWaConta).where(eq(monarqWaConta.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Contas ativas que o gateway deve rodar (devolvidas no heartbeat). */
export async function getWaContasParaGateway() {
  const conn = await db();
  return conn
    .select({ id: monarqWaConta.id, nome: monarqWaConta.nome, logoutSolicitado: monarqWaConta.logoutSolicitado })
    .from(monarqWaConta)
    .where(eq(monarqWaConta.ativo, true))
    .orderBy(monarqWaConta.id);
}

/** Heartbeat do gateway: aplica o status reportado por conta e devolve a lista + flags one-shot. */
export async function heartbeatWaGateway(
  contas: { id: string; status?: string; online?: boolean }[] = [],
) {
  const conn = await db();
  for (const c of contas) {
    const patch: Record<string, unknown> = { online: c.online ?? true, ultimoHeartbeat: new Date() };
    if (c.status) patch.status = c.status;
    await conn.update(monarqWaConta).set(patch).where(eq(monarqWaConta.id, c.id));
  }
  const desejadas = await getWaContasParaGateway();
  // Read-and-clear das flags de logout entregues.
  const paraLimpar = desejadas.filter((d) => d.logoutSolicitado).map((d) => d.id);
  if (paraLimpar.length > 0) {
    await conn.update(monarqWaConta).set({ logoutSolicitado: false }).where(inArray(monarqWaConta.id, paraLimpar));
  }
  return { contas: desejadas };
}

/** Publica (ou limpa) o QR de uma conta. dataUrl=null quando conecta. */
export async function setWaQr(id: string, dataUrl: string | null, ts: Date | null = new Date()) {
  const conn = await db();
  await conn
    .update(monarqWaConta)
    .set({ qrDataUrl: dataUrl, qrTs: dataUrl ? ts : null })
    .where(eq(monarqWaConta.id, id));
}

/** Publica a lista de grupos de uma conta (para conferência no painel). */
export async function setWaGrupos(id: string, grupos: string[]) {
  const conn = await db();
  await conn.update(monarqWaConta).set({ grupos }).where(eq(monarqWaConta.id, id));
}

/** Portal pede logout/re-pareamento de uma conta (flag one-shot consumida no heartbeat). */
export async function solicitarLogoutWaConta(id: string) {
  const conn = await db();
  await conn.update(monarqWaConta).set({ logoutSolicitado: true }).where(eq(monarqWaConta.id, id));
  await addLog("info", `WhatsApp: re-pareamento solicitado para a conta "${id}".`);
}

/** A conta está reportando dentro da janela de heartbeat? */
export function isWaContaOnline(
  conta: { online: boolean; ultimoHeartbeat: Date | null } | null,
  agora: Date = new Date(),
): boolean {
  if (!conta?.online || !conta.ultimoHeartbeat) return false;
  return agora.getTime() - new Date(conta.ultimoHeartbeat).getTime() < WA_CONTA_TIMEOUT_MS;
}

/* ─── CÉREBRO: reconciliação de snapshot + avaliação de SLA ────────────────── */

type Info = {
  base: string;
  pendenteNome?: string;
  pendenteExt?: string;
  pendenteMtime?: Date;
  temLida: boolean;
  lidaMtime?: Date;
};

/**
 * Processa o snapshot de arquivos de UM caminho (enviado pelo coletor): reconcilia a máquina
 * de estados por nome-base, avalia SLA/re-alerta e enfileira WhatsApp. Idempotente.
 */
export async function processarSnapshot(
  configId: number,
  arquivos: { nome: string; mtime: Date }[],
  agora: Date = new Date(),
  pastaMtime: Date | null = null,
): Promise<{ ignorado?: boolean; pendentes: number; atrasados: number }> {
  const conn = await db();
  const config = await getConfig(configId);
  if (!config || !config.ativo) return { ignorado: true, pendentes: 0, atrasados: 0 };

  const patch: Record<string, any> = { ultimaVarreduraEm: agora };
  if (pastaMtime) patch.ultimaPastaMtime = pastaMtime;
  await conn.update(monarqConfig).set(patch).where(eq(monarqConfig.id, configId));

  const pend = config.extensoesPendente ?? [];
  const lida = config.extensaoLida;

  // 1) Agrupa o snapshot por nome-base (ignora extensões "outras").
  const mapa = new Map<string, Info>();
  for (const arq of arquivos) {
    const { base, ext } = parseArquivo(arq.nome);
    const cls = classificarExtensao(ext, pend, lida);
    if (cls === "outra") continue;
    let info = mapa.get(base);
    if (!info) {
      info = { base, temLida: false };
      mapa.set(base, info);
    }
    if (cls === "lida") {
      info.temLida = true;
      if (!info.lidaMtime || arq.mtime < info.lidaMtime) info.lidaMtime = arq.mtime;
    } else {
      // Pendente: guarda o mtime mais antigo (melhor estimativa de "quando caiu").
      if (!info.pendenteMtime || arq.mtime < info.pendenteMtime) {
        info.pendenteNome = arq.nome;
        info.pendenteExt = ext;
        info.pendenteMtime = arq.mtime;
      }
    }
  }

  // 2) Carrega TODOS os eventos do caminho numa ÚNICA consulta indexada (por configId).
  //    Evita o `IN` gigante por nome-base e o N+1 de leitura — essencial em pastas com milhares
  //    de arquivos (ex.: `._RM` acumulados), que antes estouravam o timeout (HTTP 524).
  const eventos = await conn.select().from(monarqEvento).where(eq(monarqEvento.configId, configId));
  const porBase = new Map(eventos.map((e) => [e.nomeBase, e]));
  const basesNoSnapshot = new Set(mapa.keys());

  // 3) Classifica as ações em LOTES (nada é escrito ainda). Só as transições que disparam WhatsApp
  //    (resolvido/alerta/re-alerta) são tratadas individualmente — e essas são poucas.
  const LOTE = 500; // chunk de insert/update em massa (evita statement/packet gigante)
  const novosLido: (typeof monarqEvento.$inferInsert)[] = [];
  const novosPendente: (typeof monarqEvento.$inferInsert)[] = [];
  const idsParaLido: number[] = []; // pendente/atrasado → lido (o "resolvido" é agregado por integração)
  const reaberturas: { id: number; nome?: string; ext?: string; mtime: Date }[] = [];
  const renomeios: { id: number; nome?: string; ext?: string }[] = [];

  for (const info of Array.from(mapa.values())) {
    const ev = porBase.get(info.base);
    if (info.temLida) {
      const quando = info.lidaMtime ?? agora;
      if (!ev) {
        // Só vimos como lido (perdemos o pendente): registra já resolvido, sem alertar.
        novosLido.push({ configId, nomeBase: info.base, caiuEm: quando, lidoEm: quando, estado: "lido", resolvidoAvisado: true });
      } else if (ev.estado !== "lido") {
        idsParaLido.push(ev.id);
      }
    } else if (info.pendenteMtime) {
      if (!ev) {
        novosPendente.push({
          configId,
          nomeBase: info.base,
          arquivoPendente: info.pendenteNome,
          extensaoPendente: info.pendenteExt,
          caiuEm: info.pendenteMtime,
          estado: "pendente",
        });
      } else if (ev.estado === "lido") {
        // Recorrência: mesmo nome-base voltou a cair (ciclo novo) — reabre.
        reaberturas.push({ id: ev.id, nome: info.pendenteNome, ext: info.pendenteExt, mtime: info.pendenteMtime });
      } else if (ev.arquivoPendente !== info.pendenteNome || ev.extensaoPendente !== info.pendenteExt) {
        // Mesmo pedido aberto, mas mudou de extensão (ex.: .txt → .ped): atualiza o nome exibido.
        renomeios.push({ id: ev.id, nome: info.pendenteNome, ext: info.pendenteExt });
      }
      // Se já está pendente/atrasado e o arquivo é o mesmo, mantém o caiuEm original.
    }
  }

  // Sumiço: aberto cuja base não está mais na pasta → encerra em silêncio (entra no lote de "lido").
  let sumicos = 0;
  for (const ev of eventos) {
    if ((ev.estado === "pendente" || ev.estado === "atrasado") && !basesNoSnapshot.has(ev.nomeBase)) {
      idsParaLido.push(ev.id);
      sumicos++;
    }
  }

  // 4) Executa os LOTES (inserts/updates agrupados).
  for (let i = 0; i < novosLido.length; i += LOTE) await conn.insert(monarqEvento).values(novosLido.slice(i, i + LOTE));
  for (let i = 0; i < novosPendente.length; i += LOTE) await conn.insert(monarqEvento).values(novosPendente.slice(i, i + LOTE));
  for (let i = 0; i < idsParaLido.length; i += LOTE) {
    await conn
      .update(monarqEvento)
      .set({ estado: "lido", lidoEm: agora, resolvidoAvisado: true })
      .where(inArray(monarqEvento.id, idsParaLido.slice(i, i + LOTE)));
  }
  for (const r of reaberturas) {
    await conn
      .update(monarqEvento)
      .set({
        arquivoPendente: r.nome,
        extensaoPendente: r.ext,
        caiuEm: r.mtime,
        lidoEm: null,
        estado: "pendente",
        alertadoEm: null,
        ultimoAlertaEm: null,
        resolvidoAvisado: false,
      })
      .where(eq(monarqEvento.id, r.id));
  }
  for (const u of renomeios) {
    await conn.update(monarqEvento).set({ arquivoPendente: u.nome, extensaoPendente: u.ext }).where(eq(monarqEvento.id, u.id));
  }
  if (sumicos > 0) {
    await addLog("info", `"${config.nome}": ${sumicos} pedido(s) sumiram da pasta — encerrados sem aviso.`);
  }

  // 5) SLA: marca "pendente → atrasado" ao estourar o prazo (só dentro da janela da agenda). O
  //    disparo de WhatsApp NÃO é por evento — é agregado por integração no passo 7.
  if (estaAtivoAgora(agendaDe(config), agora)) {
    const abertos = await conn
      .select()
      .from(monarqEvento)
      .where(and(eq(monarqEvento.configId, configId), eq(monarqEvento.estado, "pendente")));
    const virar: number[] = [];
    for (const ev of abertos) {
      const { virarAtrasado } = avaliarPrazo(
        { estado: ev.estado as EstadoEvento, caiuEm: ev.caiuEm, ultimoAlertaEm: ev.ultimoAlertaEm },
        { slaLeituraMin: config.slaLeituraMin, realertaMin: config.realertaMin },
        agora,
      );
      if (virarAtrasado) virar.push(ev.id);
    }
    for (let i = 0; i < virar.length; i += LOTE) {
      await conn
        .update(monarqEvento)
        .set({ estado: "atrasado", alertadoEm: agora })
        .where(inArray(monarqEvento.id, virar.slice(i, i + LOTE)));
    }
  }

  // 6) Poda de eventos "lido" antigos (retém histórico curto).
  const corte = new Date(agora.getTime() - RETENCAO_LIDO_DIAS * 24 * 60 * 60 * 1000);
  await conn
    .delete(monarqEvento)
    .where(and(eq(monarqEvento.configId, configId), eq(monarqEvento.estado, "lido"), lt(monarqEvento.caiuEm, corte)));

  // Contagem final + o pedido atrasado MAIS ANTIGO (para a mensagem agregada).
  const [cont] = await conn
    .select({
      pendentes: sql<number>`SUM(CASE WHEN estado = 'pendente' THEN 1 ELSE 0 END)`,
      atrasados: sql<number>`SUM(CASE WHEN estado = 'atrasado' THEN 1 ELSE 0 END)`,
      maisAntigoAtrasado: sql<string | null>`MIN(CASE WHEN estado = 'atrasado' THEN caiuEm END)`,
    })
    .from(monarqEvento)
    .where(eq(monarqEvento.configId, configId));
  const qtdAtrasados = Number(cont?.atrasados ?? 0);

  // 7) ALERTA AGREGADO por integração (1 mensagem, não por evento) — evita flood/bloqueio no WhatsApp.
  const acao = avaliarAlertaAgregado(
    { alertandoDesde: config.alertaPedidoEm, ultimoEnvioEm: config.alertaPedidoUltimoEm },
    { qtdTravado: qtdAtrasados, realertaMin: config.realertaMin, podeAlertar: estaAtivoAgora(agendaDe(config), agora), agora },
  );
  if (acao.enviar) {
    const maisAntigo = parseUtc(cont?.maisAntigoAtrasado);
    await enfileirarParaConfig(config, null, acao.enviar, msgAgregadoPedidos(config.nome, qtdAtrasados, maisAntigo, agora, acao.enviar));
  }
  await conn
    .update(monarqConfig)
    .set({ alertaPedidoEm: acao.alertandoDesde, alertaPedidoUltimoEm: acao.ultimoEnvioEm })
    .where(eq(monarqConfig.id, configId));

  // 8) HISTÓRICO DIÁRIO: upsert do dia corrente (fuso SP) + poda de registros antigos (> 45 dias).
  await atualizarHistoricoDia(configId, mapa, agora);

  return { pendentes: Number(cont?.pendentes ?? 0), atrasados: qtdAtrasados };
}

/**
 * Processa o snapshot de UMA lista (modo 'geracao'): conta os arquivos VÁLIDOS gerados HOJE (por
 * nome exato ou por extensão), decide "gerada hoje?" (contagem ≥ esperada) e avalia o deadline
 * (alerta/re-alerta/resolvido). A contagem do dia é MONÓTONA (só sobe até o reset da meia-noite SP):
 * assim a lista continua "gerada" mesmo que os arquivos sejam capturados/movidos depois — a GERAÇÃO
 * é o sucesso. Dirigido por snapshot (sem cron).
 */
export async function processarSnapshotLista(
  listaId: number,
  arquivos: { nome: string; mtime: Date }[],
  agora: Date = new Date(),
  pastaMtime: Date | null = null,
): Promise<{ ignorado?: boolean; gerada: boolean; atrasada: boolean }> {
  const conn = await db();
  const rows = await conn
    .select({ lista: monarqLista, config: monarqConfig })
    .from(monarqLista)
    .innerJoin(monarqConfig, eq(monarqLista.configId, monarqConfig.id))
    .where(eq(monarqLista.id, listaId))
    .limit(1);
  const row = rows[0];
  if (!row) return { ignorado: true, gerada: false, atrasada: false };
  const { lista, config } = row;
  if (!lista.ativo || !config.ativo) return { ignorado: true, gerada: false, atrasada: false };

  const hoje = dataSP(agora);
  const matcher = {
    modoIdentificacao: lista.modoIdentificacao,
    nomeArquivo: lista.nomeArquivo,
    extensoes: lista.extensoes ?? [],
  };
  const qtdEsperada = lista.modoIdentificacao === "nome" ? 1 : Math.max(1, lista.quantidadeEsperada);

  // 1) Arquivos que casam a lista e foram gerados HOJE; + o mais recente (para "gerada às").
  let novo: { nome: string; mtime: Date } | null = null;
  let qtdHojeAgora = 0;
  for (const arq of arquivos) {
    if (!arquivoCasaLista(arq.nome, matcher) || dataSP(arq.mtime) !== hoje) continue;
    qtdHojeAgora++;
    if (!novo || arq.mtime.getTime() > novo.mtime.getTime()) novo = { nome: arq.nome, mtime: arq.mtime };
  }

  // 2) Contagem MONÓTONA no dia (só zera no vira-dia) — não "desgera" ao capturar o arquivo.
  const qtdAnterior = lista.diaRef === hoje ? lista.qtdGeradaHoje : 0;
  let qtdGeradaHoje = Math.max(qtdHojeAgora, qtdAnterior);
  // Como foi detectada a geração de hoje (reseta no vira-dia).
  let deteccao: "arquivo" | "pasta" | null = lista.diaRef === hoje ? ((lista.deteccao as "arquivo" | "pasta" | null) ?? null) : null;

  const patch: Record<string, unknown> = { ultimaVarreduraEm: agora, diaRef: hoje };
  let ultimaGeracaoEm = lista.ultimaGeracaoEm ? new Date(lista.ultimaGeracaoEm) : null;
  if (novo && (!ultimaGeracaoEm || novo.mtime.getTime() > ultimaGeracaoEm.getTime())) {
    ultimaGeracaoEm = novo.mtime;
    patch.ultimaGeracaoEm = novo.mtime;
    patch.ultimoArquivo = novo.nome.slice(0, 300);
  }

  // 2b) FALLBACK por mtime da PASTA: se o arquivo não foi reconhecido (puxado antes da varredura) mas
  //     a PASTA mexeu HOJE, considera gerado "por pasta" (deixa explícito no painel). Arquivo tem
  //     prioridade — se em algum momento reconhecer o arquivo, a detecção vira 'arquivo'.
  if (qtdGeradaHoje >= qtdEsperada) {
    if (qtdHojeAgora >= qtdEsperada || !deteccao) deteccao = "arquivo";
  } else if (pastaMtime && dataSP(pastaMtime) === hoje) {
    qtdGeradaHoje = qtdEsperada;
    if (deteccao !== "arquivo") deteccao = "pasta";
    if (!ultimaGeracaoEm || pastaMtime.getTime() > ultimaGeracaoEm.getTime()) {
      ultimaGeracaoEm = pastaMtime;
      patch.ultimaGeracaoEm = pastaMtime; // sem `ultimoArquivo`: não há arquivo, foi pela hora da pasta
    }
  }
  patch.qtdGeradaHoje = qtdGeradaHoje;
  patch.deteccao = deteccao;
  const geradoHoje = qtdGeradaHoje >= qtdEsperada;

  // 3) Vira-dia: o estado volta a 'aguardando' — MAS o vermelho (não resolvido) PERSISTE.
  let estado = lista.estadoDia as EstadoDiaGeracao;
  let ultimoAlertaEm = lista.ultimoAlertaEm ? new Date(lista.ultimoAlertaEm) : null;
  if (lista.diaRef !== hoje && estado !== "atrasado") {
    estado = "aguardando";
    ultimoAlertaEm = null;
    patch.alertadoEm = null;
    patch.ultimoAlertaEm = null;
  }

  // 4) Avaliação (dirigida por snapshot). O deadline é o horário-alvo de HOJE (janela 00:00→alvo);
  //    `diaMonitorado` gateia os alertas (só nos dias marcados); `elegivelHoje` evita que um cadastro
  //    feito APÓS o limite de hoje vire vermelho no mesmo dia (começa no próximo ciclo).
  const deadline = instanteSP(agora, lista.horaAlvo, lista.minutoAlvo);
  const diaMonitorado = diaMarcado(agendaDe(config), agora);
  const elegivelHoje = lista.createdAt ? new Date(lista.createdAt).getTime() <= deadline.getTime() : true;
  const r = avaliarGeracao(
    { estado, ultimoAlertaEm },
    { geradoHoje, agora, deadline, elegivelHoje, diaMonitorado, realertaMin: lista.realertaMin },
  );
  // Estado do dia da lista (o disparo de WhatsApp NÃO é por lista — é agregado por integração abaixo).
  patch.estadoDia = r.novoEstado;
  if (r.alertar) patch.alertadoEm = agora; // âncora do "travada há X" (usada no display)
  else if (r.resolver) patch.alertadoEm = null;

  await conn.update(monarqLista).set(patch).where(eq(monarqLista.id, listaId));

  // ALERTA AGREGADO por integração: 1 mensagem citando as listas atrasadas (rótulos), re-alerta e
  // resolvido — evita 1 msg por lista. `podeAlertar` = dia marcado da agenda.
  const atrasadas = await conn
    .select({ rotulo: monarqLista.rotulo })
    .from(monarqLista)
    .where(and(eq(monarqLista.configId, config.id), eq(monarqLista.estadoDia, "atrasado"), eq(monarqLista.ativo, true)))
    .orderBy(monarqLista.ordem, monarqLista.id);
  const acao = avaliarAlertaAgregado(
    { alertandoDesde: config.alertaListaEm, ultimoEnvioEm: config.alertaListaUltimoEm },
    { qtdTravado: atrasadas.length, realertaMin: config.realertaMin, podeAlertar: diaMonitorado, agora },
  );
  if (acao.enviar) {
    await enfileirarParaConfig(
      config,
      null,
      acao.enviar,
      msgAgregadoListas(config.nome, atrasadas.length, atrasadas.map((a) => a.rotulo), acao.enviar),
    );
  }
  await conn
    .update(monarqConfig)
    .set({ alertaListaEm: acao.alertandoDesde, alertaListaUltimoEm: acao.ultimoEnvioEm })
    .where(eq(monarqConfig.id, config.id));

  return { gerada: geradoHoje, atrasada: r.novoEstado === "atrasado" };
}

/* ─── Painel ("bate o olho") ──────────────────────────────────────────────── */

/**
 * Converte um valor de timestamp vindo do MySQL em Date (instante correto).
 * A conexão grava/lê em UTC (`timezone=Z`), então uma string "naive" ("YYYY-MM-DD HH:MM:SS",
 * sem fuso) — como as que projeções `sql<string>` (MIN/MAX) devolvem — é UTC. Sem o sufixo `Z`,
 * `new Date(str)` a interpretaria como HORÁRIO LOCAL do processo e deslocaria o instante (bug do
 * "caiu às" no fuso errado). Dates e ISO com fuso passam intactos.
 */
function parseUtc(v: unknown): Date | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  let s = String(v).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s) && !/[zZ]|[+-]\d\d:?\d\d$/.test(s)) {
    s = s.replace(" ", "T") + "Z";
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isoOuNull(v: unknown): string | null {
  const d = parseUtc(v);
  return d ? d.toISOString() : null;
}

export interface EventoAberto {
  nomeBase: string;
  estado: "pendente" | "atrasado";
  arquivoPendente: string | null;
  caiuEm: string;
}

/** Eventos ABERTOS (pendente/atrasado) de um caminho — atrasados primeiro, mais antigos no topo. */
export async function listEventosAbertos(configId: number): Promise<EventoAberto[]> {
  const conn = await db();
  const rows = await conn
    .select({
      nomeBase: monarqEvento.nomeBase,
      estado: monarqEvento.estado,
      arquivoPendente: monarqEvento.arquivoPendente,
      caiuEm: monarqEvento.caiuEm,
    })
    .from(monarqEvento)
    .where(and(eq(monarqEvento.configId, configId), inArray(monarqEvento.estado, ["pendente", "atrasado"])))
    .orderBy(monarqEvento.caiuEm);
  return rows
    .map((r) => ({
      nomeBase: r.nomeBase,
      estado: r.estado as "pendente" | "atrasado",
      arquivoPendente: r.arquivoPendente ?? null,
      caiuEm: isoOuNull(r.caiuEm)!,
    }))
    // Atrasados no topo (o "pior" primeiro), mantendo a ordem por caiuEm dentro de cada grupo.
    .sort((a, b) => (a.estado === b.estado ? 0 : a.estado === "atrasado" ? -1 : 1));
}

export type PainelItem = {
  config: typeof monarqConfig.$inferSelect;
  resumo: ResumoConfig;
  status: StatusPainel;
};

export type PainelResult = {
  coletorOnline: boolean;
  coletorUltimoHeartbeat: string | null;
  atualizadoEm: string;
  /** Integrações com pasta de pedidos (visão "Pedidos"). */
  itens: PainelItem[];
  /** Integrações com listas (visão "Listas") — card agregado por integração. */
  listasItens: PainelItem[];
  /** Contagem por cor das LISTAS individuais (KPIs da visão Listas). */
  listasContagem: Record<StatusCor, number>;
};

/** Status "bate o olho" de UMA lista (projeta o estadoDia mantido pelo cérebro). Fonte única. */
function statusGeracaoDaLista(
  config: typeof monarqConfig.$inferSelect,
  l: typeof monarqLista.$inferSelect,
  coletorOnline: boolean,
  agora: Date,
): StatusPainel {
  return calcularStatusGeracao({
    agenda: agendaDe(config),
    horaAlvo: l.horaAlvo,
    minutoAlvo: l.minutoAlvo,
    estadoDia: l.estadoDia as EstadoDiaGeracao,
    diaRef: l.diaRef,
    qtdGeradaHoje: l.qtdGeradaHoje,
    qtdEsperada: l.quantidadeEsperada,
    ultimaGeracaoEm: l.ultimaGeracaoEm ? new Date(l.ultimaGeracaoEm) : null,
    alertadoEm: l.alertadoEm ? new Date(l.alertadoEm) : null,
    coletorOnline: coletorOnline && config.ativo && l.ativo,
    agora,
  });
}

/**
 * Card de uma config 'geracao': agrega o status das suas listas. Cor = pior meaningful
 * (🔴 se qualquer lista não gerada → 🔵 se ainda há alguma aguardando → 🟢 todas geradas).
 * A âncora do vermelho é o deadline mais antigo (ordena "mais antigo primeiro" no grid).
 */
function agregarPainelGeracao(
  config: typeof monarqConfig.$inferSelect,
  listas: (typeof monarqLista.$inferSelect)[],
  coletorOnline: boolean,
  agora: Date,
): PainelItem {
  const ativas = listas.filter((l) => l.ativo);
  const statuses = ativas.map((l) => ({ l, s: statusGeracaoDaLista(config, l, coletorOnline, agora) }));
  const vermelhas = statuses.filter((x) => x.s.cor === "vermelho");
  const azuis = statuses.filter((x) => x.s.cor === "azul");
  const verdes = statuses.filter((x) => x.s.cor === "verde");
  const nTotal = statuses.length;

  const resumo: ResumoConfig = {
    atrasadoMaisAntigo: null,
    qtdPendentes: azuis.length,
    qtdAtrasados: vermelhas.length,
    ultimaCaiuEm: null,
    ultimaLidaEm: null,
  };

  const menorAncora = (arr: typeof statuses) =>
    arr.map((x) => x.s.ancoraEm).filter((a): a is string => Boolean(a)).sort()[0] ?? null;

  // Cor do card = pior entre as listas (as regras de janela/dia/red-sticky já estão em cada status).
  // Prioridade: 🔴 > 🔵 > 🟢 > ⚫ (todas inativas). Vermelho persiste mesmo fora do dia.
  let status: StatusPainel;
  if (!coletorOnline || !config.ativo || nTotal === 0) {
    const detalhe = !coletorOnline ? "Coletor offline" : nTotal === 0 ? "Sem listas configuradas" : "Integração inativa";
    status = { cor: "inativo", detalhe, ancoraEm: null, ancoraLabel: null };
  } else if (vermelhas.length > 0) {
    status = {
      cor: "vermelho",
      detalhe: `${vermelhas.length} de ${nTotal} lista(s) não gerada(s)`,
      ancoraEm: menorAncora(vermelhas),
      ancoraLabel: "sem geração",
    };
  } else if (azuis.length > 0) {
    status = {
      cor: "azul",
      detalhe: `${verdes.length} de ${nTotal} gerada(s) · aguardando ${azuis.length}`,
      ancoraEm: menorAncora(azuis),
      ancoraLabel: null,
    };
  } else if (verdes.length > 0) {
    // Todas as ativas geradas: âncora no mais recente p/ o mini-card mostrar "gerada HH:MM".
    const maior = verdes.map((x) => x.s.ancoraEm).filter((a): a is string => Boolean(a)).sort().pop() ?? null;
    status = { cor: "verde", detalhe: `${verdes.length} de ${nTotal} lista(s) gerada(s) hoje`, ancoraEm: maior, ancoraLabel: null };
  } else {
    // Todas as listas inativas (fora do dia de acompanhamento).
    status = { cor: "inativo", detalhe: "Fora do dia de acompanhamento", ancoraEm: null, ancoraLabel: null };
  }
  return { config, resumo, status };
}

/**
 * Monta o painel completo (todos os caminhos + status "bate o olho").
 *
 * Performance/escala: os resumos de TODOS os caminhos são calculados em um número FIXO de
 * consultas (não N+1) — 1 agregado `GROUP BY configId` (contagens + últimos instantes) + 1
 * varredura só dos "atrasado" (poucos) para o mais antigo por caminho. Assim o custo não cresce
 * com a quantidade de caminhos cadastrados.
 */
export async function getPainel(agora: Date = new Date()): Promise<PainelResult> {
  const conn = await db();
  const coletor = await getColetorEstado();
  const online = isColetorOnline(coletor, agora);
  const configs = await listConfigs();

  // 1) Agregado por caminho: pendentes/atrasados + último caiu/lido (uma consulta só).
  const aggRows = await conn
    .select({
      configId: monarqEvento.configId,
      qtdPendentes: sql<number>`SUM(CASE WHEN estado = 'pendente' THEN 1 ELSE 0 END)`,
      qtdAtrasados: sql<number>`SUM(CASE WHEN estado = 'atrasado' THEN 1 ELSE 0 END)`,
      ultimaCaiuEm: sql<string | null>`MAX(caiuEm)`,
      ultimaLidaEm: sql<string | null>`MAX(lidoEm)`,
    })
    .from(monarqEvento)
    .groupBy(monarqEvento.configId);
  const aggByConfig = new Map(aggRows.map((r) => [r.configId, r]));

  // 2) Atrasados (normalmente poucos) ordenados por caiuEm → o mais antigo por caminho (1ª ocorrência).
  const atrasados = await conn
    .select({ configId: monarqEvento.configId, nomeBase: monarqEvento.nomeBase, caiuEm: monarqEvento.caiuEm })
    .from(monarqEvento)
    .where(eq(monarqEvento.estado, "atrasado"))
    .orderBy(monarqEvento.caiuEm);
  const atrasadoMaisAntigoPorConfig = new Map<number, { nomeBase: string; caiuEm: string }>();
  for (const a of atrasados) {
    if (!atrasadoMaisAntigoPorConfig.has(a.configId)) {
      atrasadoMaisAntigoPorConfig.set(a.configId, { nomeBase: a.nomeBase, caiuEm: isoOuNull(a.caiuEm)! });
    }
  }

  // 3) Listas de TODAS as integrações numa consulta só, agrupadas por config (sem N+1).
  const todasListas = await conn.select().from(monarqLista);
  const listasPorConfig = new Map<number, (typeof monarqLista.$inferSelect)[]>();
  for (const l of todasListas) {
    const arr = listasPorConfig.get(l.configId) ?? [];
    arr.push(l);
    listasPorConfig.set(l.configId, arr);
  }

  // Uma integração pode ter pedidos (pasta configurada) e/ou listas — cada visão só mostra quem tem.
  const temPedidos = (c: typeof monarqConfig.$inferSelect) =>
    (c.caminho ?? "").trim() !== "" && (c.extensoesPendente?.length ?? 0) > 0;

  const itens: PainelItem[] = configs.filter(temPedidos).map((c) => {
    const agg = aggByConfig.get(c.id);
    const resumo: ResumoConfig = {
      atrasadoMaisAntigo: atrasadoMaisAntigoPorConfig.get(c.id) ?? null,
      qtdPendentes: Number(agg?.qtdPendentes ?? 0),
      qtdAtrasados: Number(agg?.qtdAtrasados ?? 0),
      ultimaCaiuEm: isoOuNull(agg?.ultimaCaiuEm),
      ultimaLidaEm: isoOuNull(agg?.ultimaLidaEm),
    };
    const status = calcularStatusPainel({
      agenda: agendaDe(c),
      gapSemPedidoMin: c.gapSemPedidoMin,
      resumo,
      coletorOnline: online && c.ativo,
      agora,
    });
    // Fallback: quando não há eventos (pasta vazia) mas temos o mtime da pasta, usamos como
    // âncora visual para o card exibir "há Xd Yh" em vez de "—". Não altera a cor/detalhe.
    if (!status.ancoraEm && c.ultimaPastaMtime) {
      status.ancoraEm = c.ultimaPastaMtime.toISOString();
    }
    return { config: c, resumo, status };
  });

  const configById = new Map(configs.map((c) => [c.id, c]));
  const listasItens: PainelItem[] = configs
    .filter((c) => (listasPorConfig.get(c.id)?.length ?? 0) > 0)
    .map((c) => agregarPainelGeracao(c, listasPorConfig.get(c.id) ?? [], online, agora));

  // Contagem por COR das LISTAS individuais (não das integrações) — alimenta os KPIs da visão Listas.
  const listasContagem: Record<StatusCor, number> = { vermelho: 0, amarelo: 0, azul: 0, verde: 0, inativo: 0 };
  for (const l of todasListas) {
    const c = configById.get(l.configId);
    if (!c) continue;
    listasContagem[statusGeracaoDaLista(c, l, online, agora).cor]++;
  }

  return {
    coletorOnline: online,
    coletorUltimoHeartbeat: isoOuNull(coletor?.ultimoHeartbeat),
    atualizadoEm: agora.toISOString(),
    itens,
    listasItens,
    listasContagem,
  };
}

/* ─── Backup de pedidos (retenção) ─────────────────────────────────────────────
 *
 * O JOB roda na VM por systemd timer (padrão: seg 06:00) — o QUANDO rodar é do systemd, NÃO do
 * portal (não seria tempo real). O job lê `getDadosBackup()` (corte da retenção + extensões +
 * retenção dos zips + caminhos), arquiva os pedidos MAIS ANTIGOS que o corte (agrupados por mês)
 * em <caminho>/backup/<ano>/<mês>/<data>.zip, REMOVE os originais, PODA pastas-mês antigas e
 * reporta via `registrarResultadoBackup()`, que grava o resultado e notifica no sino. Ajustes de
 * DADOS pelo portal (admin): `setBackupConfig()` (extensões, dias a manter, retenção). Agenda é
 * operada na VM (ver connector/monitor-arquivos-backup/OPERACAO.md).
 */

const BACKUP_EMAIL = "desenvolvimento@opendeskdistribuidora.com.br";

export type BackupResumo = { pastas: number; arquivos: number; zips: number; podados: number };
export type BackupErro = { caminho: string; erro: string };

export async function getBackupConfig() {
  const conn = await db();
  const rows = await conn.select().from(monarqBackupConfig).where(eq(monarqBackupConfig.id, 1)).limit(1);
  return rows[0] ?? null;
}

/** Ajustes do backup pelo portal (admin): extensões, quantos dias manter, e a retenção dos zips. */
export async function setBackupConfig(patch: {
  extensoesZip?: string[];
  manterDias?: number;
  manterUnidade?: string;
  retencaoZipMeses?: number;
  caminhosExtras?: { caminho: string; extensoes: string[] }[];
}) {
  const conn = await db();
  const set: Record<string, unknown> = {};
  if (patch.extensoesZip !== undefined) {
    const limpas = Array.from(new Set(patch.extensoesZip.map(normalizarExtensao).filter(Boolean)));
    if (limpas.length === 0) throw new Error("Informe ao menos uma extensão para o backup.");
    set.extensoesZip = limpas;
  }
  if (patch.manterDias !== undefined) set.manterDias = Math.min(365, Math.max(1, Math.trunc(patch.manterDias)));
  if (patch.manterUnidade !== undefined) {
    set.manterUnidade = patch.manterUnidade === "corridos" ? "corridos" : "uteis";
  }
  if (patch.retencaoZipMeses !== undefined) {
    set.retencaoZipMeses = Math.min(120, Math.max(1, Math.trunc(patch.retencaoZipMeses)));
  }
  if (patch.caminhosExtras !== undefined) {
    // Cada caminho extra precisa de pasta + ≥1 extensão própria (a retenção é a mesma dos pedidos).
    set.caminhosExtras = patch.caminhosExtras
      .map((e) => ({
        caminho: (e.caminho ?? "").trim(),
        extensoes: Array.from(new Set((e.extensoes ?? []).map(normalizarExtensao).filter(Boolean))),
      }))
      .filter((e) => e.caminho !== "" && e.extensoes.length > 0);
  }
  if (Object.keys(set).length === 0) return;
  await conn.update(monarqBackupConfig).set(set).where(eq(monarqBackupConfig.id, 1));
  await addLog("info", "Backup: configuração atualizada pelo painel.");
}

/** Caminhos elegíveis ao backup: integrações ativas COM pasta de pedidos (caminho preenchido). */
export async function listCaminhosParaBackup() {
  const conn = await db();
  return conn
    .select({ id: monarqConfig.id, nome: monarqConfig.nome, caminho: monarqConfig.caminho })
    .from(monarqConfig)
    .where(and(eq(monarqConfig.ativo, true), ne(monarqConfig.caminho, "")))
    .orderBy(monarqConfig.id);
}

/**
 * Dados que o job de backup (VM) lê a cada execução. O portal calcula o CORTE da retenção (mantém
 * os últimos N dias; arquiva o `mtime < corte`) e devolve as extensões, a retenção dos zips e os
 * caminhos. O QUANDO rodar é do systemd timer na VM (não é tempo real). A idempotência do job
 * (pular zip já existente) e o "silêncio quando não há nada" evitam ruído em execuções repetidas.
 */
export async function getDadosBackup(agora: Date = new Date()) {
  const cfg = await getBackupConfig();
  const extensoesZip = (cfg?.extensoesZip && cfg.extensoesZip.length ? cfg.extensoesZip : ["._rm"]).map(
    normalizarExtensao,
  );
  const manterDias = cfg?.manterDias ?? 5;
  const manterUnidade: ManterUnidade = cfg?.manterUnidade === "corridos" ? "corridos" : "uteis";
  const retencaoZipMeses = cfg?.retencaoZipMeses ?? 12;
  const corte = calcularCorte(agora, manterDias, manterUnidade);

  // Cada caminho carrega a SUA extensão: pedidos = a global `extensoesZip`; extras (ex.: listas) = a
  // própria. O job da VM usa `caminho.extensoes` (fallback na global) — retenção/poda são as mesmas.
  const pedidos = (await listCaminhosParaBackup()).map((c) => ({ ...c, extensoes: extensoesZip }));
  const extras = (cfg?.caminhosExtras ?? []).map((e, i) => ({
    id: `extra-${i + 1}`,
    nome: e.caminho,
    caminho: e.caminho,
    extensoes: (e.extensoes ?? []).map(normalizarExtensao).filter(Boolean),
  }));
  const caminhos: { id: number | string; nome: string; caminho: string; extensoes: string[] }[] = [...pedidos, ...extras];

  return {
    corte: corte.toISOString(),
    corteData: dataSP(corte),
    manterDias,
    manterUnidade,
    retencaoZipMeses,
    extensoesZip,
    caminhos,
  };
}

/** Notifica no sino do portal o resultado do backup (usuário desenvolvimento@). */
async function notificarBackup(input: { ok: boolean; corte: string; resumo: BackupResumo; erros: BackupErro[] }) {
  try {
    const user = await getUserByEmail(BACKUP_EMAIL);
    if (!user) {
      console.warn(`[Backup] Usuário ${BACKUP_EMAIL} não encontrado — notificação não criada.`);
      return;
    }
    const title = input.ok
      ? "✅ Backup de pedidos concluído"
      : "⚠️ Backup de pedidos concluído com falhas";
    const r = input.resumo;
    const linhas = [
      `Arquivados pedidos anteriores a ${input.corte}: ${r.pastas} pasta(s), ${r.arquivos} arquivo(s) em ${r.zips} zip(s).`,
    ];
    if (r.podados > 0) linhas.push(`${r.podados} pasta(s)-mês antiga(s) podada(s).`);
    if (input.erros?.length) {
      linhas.push(`${input.erros.length} pasta(s) com erro:`);
      for (const e of input.erros.slice(0, 10)) linhas.push(`• ${e.caminho}: ${e.erro}`);
    }
    await createNotification({
      userId: user.id,
      type: "system",
      title,
      message: linhas.join("\n"),
      actionUrl: "/indicadores/monitor-pedidos",
    });
  } catch (err) {
    console.error("[Backup] Falha ao criar notificação:", err);
  }
}

/** O agente reporta o resultado: grava no singleton e notifica no sino. */
export async function registrarResultadoBackup(input: {
  ok: boolean;
  corte: string;
  resumo: BackupResumo;
  erros: BackupErro[];
}) {
  const conn = await db();
  await conn
    .update(monarqBackupConfig)
    .set({
      ultimoCorte: input.corte,
      ultimaExecucaoEm: new Date(),
      ultimoOk: input.ok,
      ultimoResumo: input.resumo,
      ultimoErros: input.erros ?? [],
    })
    .where(eq(monarqBackupConfig.id, 1));
  await addLog(
    input.ok ? "ok" : "erro",
    `Backup (corte ${input.corte}): ${input.resumo.pastas} pasta(s), ${input.resumo.arquivos} arq, ` +
      `${input.resumo.zips} zip(s), ${input.resumo.podados} podado(s)` +
      `${input.erros?.length ? ` · ${input.erros.length} com erro` : ""}.`,
  );
  await notificarBackup(input);
}

/* ─── Resumo diário por imagem (WhatsApp) ──────────────────────────────────────
 *
 * Envia UMA imagem com o cenário de integrações (pedidos + listas) no fim da última janela
 * (horário configurável no painel). SEM cron no portal: o gatilho é o heartbeat do coletor —
 * `talvezEnviarResumo` roda a cada heartbeat e, quando o dia está marcado, já passou de
 * `hora:minuto` (fuso SP) e ainda não enviou hoje (`diaRef`), monta o payload (regra pura em
 * @shared/monitorArquivosResumo) e enfileira em monarq_wa_outbox (categoria='resumo'). A VM
 * (gateway) desenha a imagem (Pillow) e envia. Depende do coletor estar ONLINE no horário —
 * o que é desejável, pois com o coletor offline o cenário estaria defasado.
 */

const RESUMO_WA_CONTA = "monitor";

export async function getResumoConfig() {
  const conn = await db();
  const rows = await conn.select().from(monarqResumoConfig).where(eq(monarqResumoConfig.id, 1)).limit(1);
  return rows[0] ?? null;
}

/** Ajustes do resumo pelo portal (admin): ativo, horário, dias, seções e destinos. */
export async function setResumoConfig(patch: {
  ativo?: boolean;
  hora?: number;
  minuto?: number;
  diasSemana?: number[];
  incluirPedidos?: boolean;
  incluirListas?: boolean;
  destinoIds?: number[];
}) {
  const conn = await db();
  const set: Record<string, unknown> = {};
  if (patch.ativo !== undefined) set.ativo = patch.ativo;
  if (patch.hora !== undefined) set.hora = Math.min(23, Math.max(0, Math.trunc(patch.hora)));
  if (patch.minuto !== undefined) set.minuto = Math.min(59, Math.max(0, Math.trunc(patch.minuto)));
  if (patch.diasSemana !== undefined) set.diasSemana = sanitizarDias(patch.diasSemana);
  if (patch.incluirPedidos !== undefined) set.incluirPedidos = patch.incluirPedidos;
  if (patch.incluirListas !== undefined) set.incluirListas = patch.incluirListas;
  if (patch.destinoIds !== undefined) {
    set.destinoIds = Array.from(new Set(patch.destinoIds.filter((n) => Number.isInteger(n) && n > 0)));
  }
  if (Object.keys(set).length === 0) return;
  await conn.update(monarqResumoConfig).set(set).where(eq(monarqResumoConfig.id, 1));
  await addLog("info", "Resumo diário: configuração atualizada pelo painel.");
}

/* ─── Alerta EM TELA de pedidos travados (overlay + aba + som) ─────────────────
 *
 * Espelha o alerta CFV: um singleton define QUEM (usuários do portal) vê o aviso em tela
 * quando QUALQUER integração de PEDIDOS fica vermelha (SLA estourado). Listas ficam de fora.
 * O WhatsApp agregado por integração continua no fluxo do snapshot — este é só o canal em tela.
 */

export async function getAlertaTelaConfig() {
  const conn = await db();
  const rows = await conn.select().from(monarqAlertaTelaConfig).where(eq(monarqAlertaTelaConfig.id, 1)).limit(1);
  return rows[0] ?? null;
}

/** Ajustes do alerta em tela pelo portal (admin): liga/desliga + destinatários. */
export async function setAlertaTelaConfig(patch: { ativo?: boolean; destinatarioIds?: number[] }) {
  const conn = await db();
  const set: Record<string, unknown> = {};
  if (patch.ativo !== undefined) set.ativo = patch.ativo;
  if (patch.destinatarioIds !== undefined) {
    set.destinatarioIds = Array.from(new Set(patch.destinatarioIds.filter((n) => Number.isInteger(n) && n > 0)));
  }
  if (Object.keys(set).length === 0) return;
  // Garante o singleton (idempotente) e aplica o patch.
  await conn
    .insert(monarqAlertaTelaConfig)
    .values({ id: 1, ...set })
    .onDuplicateKeyUpdate({ set });
  await addLog("info", "Alerta em tela: configuração atualizada pelo painel.");
}

/** Usuários aprovados do portal (para o seletor de destinatários do alerta em tela). */
export async function listUsuariosPortal() {
  const users = await getApprovedUsers();
  return users.map((u) => ({ id: u.id, name: u.name, email: u.email }));
}

/** Cache curto do painel p/ o polling do overlay (evita marretar o banco a cada 30s por usuário). */
let painelOverlayCache: { at: number; data: PainelResult } | null = null;
async function getPainelCacheado(ttlMs = 15_000): Promise<PainelResult> {
  const agora = Date.now();
  if (painelOverlayCache && agora - painelOverlayCache.at < ttlMs) return painelOverlayCache.data;
  const data = await getPainel();
  painelOverlayCache = { at: agora, data };
  return data;
}

/**
 * Status do alerta EM TELA para o usuário logado. Retorna { alerta, mensagem } quando o alerta
 * está ligado, o usuário é destinatário e há AO MENOS uma integração de pedidos vermelha (travada).
 * A cor vermelha já embute janela/dias/SLA/coletor-online — não reinventamos a regra aqui.
 */
export async function getAlertaTravadosStatus(
  userId: number,
  agora: Date = new Date(),
): Promise<{ alerta: boolean; mensagem?: string; qtdIntegracoes?: number; qtdTotal?: number }> {
  const cfg = await getAlertaTelaConfig();
  if (!cfg || !cfg.ativo) return { alerta: false };
  const destinatarios = cfg.destinatarioIds ?? [];
  if (!destinatarios.includes(userId)) return { alerta: false };

  const painel = await getPainelCacheado();
  const travadas = painel.itens.filter((i) => i.status.cor === "vermelho");
  if (travadas.length === 0) return { alerta: false };

  const qtdTotal = travadas.reduce((a, i) => a + i.resumo.qtdAtrasados, 0);
  // Mais antigo entre todas as integrações travadas (dá a noção de gravidade).
  const maisAntigoIso =
    travadas
      .map((i) => i.resumo.atrasadoMaisAntigo?.caiuEm)
      .filter((v): v is string => Boolean(v))
      .sort()[0] ?? null;
  const haQuanto = maisAntigoIso
    ? ` · mais antigo há ${formatarDuracaoMin((agora.getTime() - new Date(maisAntigoIso).getTime()) / 60000)}`
    : "";

  let mensagem: string;
  if (travadas.length === 1) {
    const it = travadas[0]!;
    const s = it.resumo.qtdAtrasados > 1 ? "s" : "";
    mensagem = `${it.config.nome} — ${it.resumo.qtdAtrasados} pedido${s} travado${s} no ERP${haQuanto}`;
  } else {
    mensagem = `${travadas.length} integrações com pedidos travados no ERP (${qtdTotal} no total)${haQuanto}`;
  }
  return { alerta: true, mensagem, qtdIntegracoes: travadas.length, qtdTotal };
}

/** Monta o payload da imagem a partir do painel atual (pedidos + listas). */
export async function montarPayloadResumo(agora: Date = new Date()) {
  const cfg = await getResumoConfig();
  const painel = await getPainel(agora);
  const paraItem = (arr: PainelItem[]): ResumoItem[] =>
    arr.map((i) => ({ nome: i.config.nome, cor: i.status.cor, detalhe: i.status.detalhe }));
  return montarResumoImagem(
    {
      geradoEm: agora.toISOString(),
      pedidosItens: paraItem(painel.itens),
      listasItens: paraItem(painel.listasItens),
      listasKpis: painel.listasContagem,
    },
    {
      incluirPedidos: cfg?.incluirPedidos ?? true,
      incluirListas: cfg?.incluirListas ?? true,
    },
  );
}

/** Destinos do resumo: os selecionados (se houver) OU todos os universais. */
async function resolverDestinosResumo(destinoIds: number[] | null | undefined) {
  const conn = await db();
  const cols = { id: monarqDestino.id, tipo: monarqDestino.tipo, identificador: monarqDestino.identificador };
  if (destinoIds && destinoIds.length > 0) {
    return conn
      .select(cols)
      .from(monarqDestino)
      .where(and(inArray(monarqDestino.id, destinoIds), eq(monarqDestino.ativo, true)));
  }
  return conn
    .select(cols)
    .from(monarqDestino)
    .where(and(eq(monarqDestino.universal, true), eq(monarqDestino.ativo, true)));
}

async function marcarResumoResultado(agora: Date, ok: boolean, detalhe: string, marcarDia: boolean) {
  const conn = await db();
  const set: Record<string, unknown> = { ultimoEnvioEm: new Date(), ultimoOk: ok, ultimoDetalhe: detalhe.slice(0, 512) };
  if (marcarDia) set.diaRef = dataSP(agora);
  await conn.update(monarqResumoConfig).set(set).where(eq(monarqResumoConfig.id, 1));
}

/**
 * Monta o cenário e enfileira o resumo para os destinos (categoria='resumo', payload JSON no campo
 * `mensagem`). `marcarDia` = true grava o `diaRef` (consome o dia — usado pelo gatilho automático);
 * o botão "Enviar agora" do painel usa false, para poder testar sem impedir o envio real do dia.
 */
export async function enviarResumoAgora(
  agora: Date = new Date(),
  opts: { marcarDia?: boolean } = {},
): Promise<{ destinos: number; caption: string }> {
  const cfg = await getResumoConfig();
  const payload = await montarPayloadResumo(agora);
  const destinos = await resolverDestinosResumo(cfg?.destinoIds ?? null);
  const marcarDia = opts.marcarDia ?? false;
  if (destinos.length === 0) {
    await addLog("warn", "Resumo diário: sem destinos (nenhum universal e nenhum selecionado) — não enviado.");
    await marcarResumoResultado(agora, false, "sem destinos", marcarDia);
    return { destinos: 0, caption: payload.caption };
  }
  const conn = await db();
  const mensagem = JSON.stringify(payload);
  await conn.insert(monarqWaOutbox).values(
    destinos.map((d) => ({
      waContaId: RESUMO_WA_CONTA,
      tipo: d.tipo,
      identificador: d.identificador,
      mensagem,
      eventoId: null,
      categoria: "resumo",
    })),
  );
  await marcarResumoResultado(agora, true, `${destinos.length} destino(s)`, marcarDia);
  await addLog("ok", `Resumo diário enfileirado para ${destinos.length} destino(s).`);
  return { destinos: destinos.length, caption: payload.caption };
}

/**
 * Gatilho automático (chamado no heartbeat do coletor): envia o resumo 1x/dia quando o dia está
 * marcado e já passou do horário-alvo. Resiliente — engole os próprios erros para não afetar o
 * heartbeat.
 */
export async function talvezEnviarResumo(agora: Date = new Date()): Promise<void> {
  try {
    const cfg = await getResumoConfig();
    if (!cfg || !cfg.ativo) return;
    const agenda: Agenda = { diasSemana: sanitizarDias(cfg.diasSemana), horaInicio: 0, horaFim: 24 };
    if (!diaMarcado(agenda, agora)) return;
    if (cfg.diaRef === dataSP(agora)) return; // já enviou hoje
    const alvo = instanteSP(agora, cfg.hora, cfg.minuto);
    if (agora.getTime() < alvo.getTime()) return; // ainda não deu o horário
    await enviarResumoAgora(agora, { marcarDia: true });
  } catch (err) {
    console.error("[Monitor Resumo] talvezEnviarResumo falhou:", err);
  }
}

/* ─── Histórico diário de processamento (heatmap 30 dias úteis) ────────────────
 *
 * Registra por dia (fuso SP) se houve processamento de pedidos numa integração. Upsert inline
 * no processarSnapshot (sem cron extra). Poda registros > 45 dias corridos (garante que 30 dias
 * úteis sempre cabem). A UI mostra um mini-heatmap na CaminhoDetalheModal.
 */

/** Dias corridos a reter (45 corridos cobre ~30 úteis com folga para feriados). */
const HISTORICO_RETENCAO_DIAS = 45;

/**
 * Upsert do dia corrente no histórico: conta pendentes e lidos do snapshot atual. Poda inline.
 * Chamado no fim do processarSnapshot — roda 1x por varredura (barato: 1 upsert + 1 delete).
 */
async function atualizarHistoricoDia(configId: number, mapa: Map<string, { temLida: boolean; pendenteMtime?: Date }>, agora: Date) {
  const conn = await db();
  const hoje = dataSP(agora);

  let qtdPedidos = 0;
  let qtdLidos = 0;
  for (const info of Array.from(mapa.values())) {
    if (info.pendenteMtime) qtdPedidos++;
    if (info.temLida) qtdLidos++;
  }
  const tevePedido = qtdPedidos > 0 || qtdLidos > 0;

  // Upsert: INSERT ... ON DUPLICATE KEY UPDATE (a unique key é configId+dia).
  await conn.execute(
    sql`INSERT INTO monarq_historico_dia (configId, dia, tevePedido, qtdPedidos, qtdLidos)
        VALUES (${configId}, ${hoje}, ${tevePedido}, ${qtdPedidos}, ${qtdLidos})
        ON DUPLICATE KEY UPDATE
          tevePedido = VALUES(tevePedido) OR tevePedido,
          qtdPedidos = GREATEST(qtdPedidos, VALUES(qtdPedidos)),
          qtdLidos = GREATEST(qtdLidos, VALUES(qtdLidos))`,
  );

  // Poda: remove registros antigos (> HISTORICO_RETENCAO_DIAS corridos).
  const corte = new Date(agora.getTime() - HISTORICO_RETENCAO_DIAS * 24 * 60 * 60 * 1000);
  const corteDia = dataSP(corte);
  await conn
    .delete(monarqHistoricoDia)
    .where(and(eq(monarqHistoricoDia.configId, configId), lt(monarqHistoricoDia.dia, corteDia)));
}

/**
 * Retorna o histórico dos últimos N dias corridos (padrão 45) de uma integração, ordenado por dia.
 * A UI filtra os dias úteis no cliente (mais flexível — permite mostrar feriados como gaps).
 */
export async function getHistoricoDias(configId: number, diasCorridos = HISTORICO_RETENCAO_DIAS) {
  const conn = await db();
  const corte = dataSP(new Date(Date.now() - diasCorridos * 24 * 60 * 60 * 1000));
  return conn
    .select({
      dia: monarqHistoricoDia.dia,
      tevePedido: monarqHistoricoDia.tevePedido,
      qtdPedidos: monarqHistoricoDia.qtdPedidos,
      qtdLidos: monarqHistoricoDia.qtdLidos,
    })
    .from(monarqHistoricoDia)
    .where(and(eq(monarqHistoricoDia.configId, configId), sql`${monarqHistoricoDia.dia} >= ${corte}`))
    .orderBy(monarqHistoricoDia.dia);
}
