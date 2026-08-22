import { ACTIONS, MODULES } from "@shared/permissions";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { requirePermission } from "../permissionMiddleware";
import { indicadoresAlertaCfvConfig, monarqDestino, monarqWaOutbox } from "../../drizzle/schema";
import { getApprovedUsers, getDb } from "../db";
import { and, eq, inArray } from "drizzle-orm";
import {
  fetchPedidosPorLayout,
  fetchPedidosCortadosPorLayout,
  fetchQtdPedidoDia,
  type PedidoPorLayoutRow,
  type QtdPedidoDiaRow,
} from "../erpQueries";
import { getHistoricoLayout } from "../indicadoresHistorico";

/**
 * Indicadores (renomeado de "Diretoria") — painéis informativos de leitura rápida ("bate o olho").
 *
 * Pedidos por layout (chave "qtd_pedido_layout", codigoQuery 16): foto do DIA dos pedidos
 * agregados por layout. É pass-through AO VIVO — sem tabela/sync; a API já devolve
 * o agregado pronto (volume pequeno). Um cache curto em memória evita marretar a API quando
 * várias telas (mesa + telão) abrem juntas; o front revalida sozinho a cada 60s.
 */

/** Um layout com seus totais do dia: pedidos ACEITOS + pedidos CORTADOS (rejeitados). */
export type PedidoRedeLinha = {
  layout: string;
  /** Aceitos. */
  qtdPedidos: number;
  valorPedido: number;
  /** Cortados/rejeitados. */
  qtdCortados: number;
  valorCortados: number;
  /** Total de pedidos do dia (query 1018 — todos os status). */
  qtdTotal: number;
  /** Horário do último pedido do layout (ISO). */
  dtHora: string | null;
};

/** Agregado de uma região (ou do unificado). */
export type PedidosRegiao = {
  linhas: PedidoRedeLinha[];
  /** Máx. dos horários das redes desta região (o "atualizado às"). */
  atualizadoEm: string | null;
};

export type PedidosPorLayoutResult = {
  /** Hora do PEDIDO mais recente de todas as regiões (máx. dos `dtHora`). */
  atualizadoEm: string | null;
  /** ISO do instante em que o servidor consultou a API (freshness do dado; congela com o cache de 30s). */
  buscadoEm: string;
  regioes: {
    SC: PedidosRegiao;
    RS: PedidosRegiao;
    UNIFICADO: PedidosRegiao;
  };
};

const maxData = (a: string | null, b: string | null): string | null =>
  !a ? b : !b ? a : a >= b ? a : b;

type LinhaComEstado = PedidoRedeLinha & { estado: string };

/**
 * Funde aceitos + cortados numa linha por (estado, layout). Layout pode existir só de um lado
 * (ex.: teve corte mas nenhum aceito, ou vice-versa) → o outro fica em 0.
 */
function fundir(
  aceitos: PedidoPorLayoutRow[],
  cortados: PedidoPorLayoutRow[],
  totais: QtdPedidoDiaRow[],
): LinhaComEstado[] {
  const map = new Map<string, LinhaComEstado>();
  const chave = (estado: string, layout: string) => `${estado}||${layout}`;
  const get = (estado: string, layout: string): LinhaComEstado => {
    const k = chave(estado, layout);
    let l = map.get(k);
    if (!l) {
      l = { estado, layout, qtdPedidos: 0, valorPedido: 0, qtdCortados: 0, valorCortados: 0, qtdTotal: 0, dtHora: null };
      map.set(k, l);
    }
    return l;
  };
  for (const r of aceitos) {
    const l = get(r.estado, r.layout);
    l.qtdPedidos += r.qtdPedidos;
    l.valorPedido += r.valorPedido;
    l.dtHora = maxData(l.dtHora, r.dtHora);
  }
  for (const r of cortados) {
    const l = get(r.estado, r.layout);
    l.qtdCortados += r.qtdPedidos;
    l.valorCortados += r.valorPedido;
    l.dtHora = maxData(l.dtHora, r.dtHora);
  }
  for (const r of totais) {
    get(r.estado, r.layout).qtdTotal += r.qtd;
  }
  return Array.from(map.values());
}

/** Monta o agregado de uma região a partir das linhas já filtradas (ordena por valor aceito desc). */
function montaRegiao(linhas: LinhaComEstado[]): PedidosRegiao {
  const ordenadas = linhas
    .map(({ estado: _estado, ...resto }) => resto)
    .sort((x, y) => y.valorPedido - x.valorPedido);
  const atualizadoEm = linhas.reduce<string | null>((acc, l) => maxData(acc, l.dtHora), null);
  return { linhas: ordenadas, atualizadoEm };
}

/** Soma por layout as linhas de SC + RS (unificado). */
function unifica(linhas: LinhaComEstado[]): LinhaComEstado[] {
  const porLayout = new Map<string, LinhaComEstado>();
  for (const l of linhas) {
    const atual = porLayout.get(l.layout);
    if (atual) {
      atual.qtdPedidos += l.qtdPedidos;
      atual.valorPedido += l.valorPedido;
      atual.qtdCortados += l.qtdCortados;
      atual.valorCortados += l.valorCortados;
      atual.qtdTotal += l.qtdTotal;
      atual.dtHora = maxData(atual.dtHora, l.dtHora);
    } else {
      porLayout.set(l.layout, { ...l, estado: "UNIFICADO" });
    }
  }
  return Array.from(porLayout.values());
}

function montaResultado(
  aceitos: PedidoPorLayoutRow[],
  cortados: PedidoPorLayoutRow[],
  totais: QtdPedidoDiaRow[],
  buscadoEm: string,
): PedidosPorLayoutResult {
  const merged = fundir(aceitos, cortados, totais);
  const sc = montaRegiao(merged.filter((l) => l.estado === "SC"));
  const rs = montaRegiao(merged.filter((l) => l.estado === "RS"));
  const unificado = montaRegiao(unifica(merged));
  return {
    atualizadoEm: maxData(sc.atualizadoEm, rs.atualizadoEm),
    buscadoEm,
    regioes: { SC: sc, RS: rs, UNIFICADO: unificado },
  };
}

// Cache curto em memória (o dado do dia muda de minuto em minuto; 30s é suficiente).
const CACHE_TTL_MS = 30_000;
let cache: { at: number; data: PedidosPorLayoutResult } | null = null;

/** Pedidos do dia por layout (com cache curto). Reutilizável (painel, status e disparo server-side). */
export async function carregarPedidosLayout(): Promise<PedidosPorLayoutResult> {
  const agora = Date.now();
  if (cache && agora - cache.at < CACHE_TTL_MS) return cache.data;
  // Instante da consulta REAL à API (só quando dá cache-miss). Fica no payload como `buscadoEm` e
  // "congela" no cache — então reflete a idade verdadeira do dado, igual para todos os clientes.
  const buscadoEm = new Date().toISOString();
  const [aceitos, cortados, totais] = await Promise.all([
    fetchPedidosPorLayout(),
    fetchPedidosCortadosPorLayout(),
    fetchQtdPedidoDia(),
  ]);
  const data = montaResultado(aceitos, cortados, totais, buscadoEm);
  cache = { at: agora, data };
  return data;
}

export const indicadoresRouter = router({
  /** Pedidos do dia por layout (aceitos + cortados), agregados por SC / RS / Unificado. */
  getPedidosPorLayout: protectedProcedure
    .use(requirePermission(MODULES.INDICADORES_PEDIDOS_LAYOUT, ACTIONS.READ))
    .query((): Promise<PedidosPorLayoutResult> => carregarPedidosLayout()),

  /**
   * Histórico (últimos 14 dias, "mesmo horário do dia") para deltas vs. período anterior + sparkline.
   * Nasce vazio e vai acumulando conforme o snapshot (30 min, janela 08:00–22:00 SP) grava. Lê do
   * banco (não da API) — barato.
   */
  getHistoricoLayout: protectedProcedure
    .use(requirePermission(MODULES.INDICADORES_PEDIDOS_LAYOUT, ACTIONS.READ))
    .query(() => getHistoricoLayout(new Date(), 14)),

  /* ─── Alerta CFV — configuração + status ─── */

  /** Config do alerta CFV (singleton). Retorna null se não configurado. */
  getAlertaCfvConfig: protectedProcedure
    .use(requirePermission(MODULES.INDICADORES_PEDIDOS_LAYOUT, ACTIONS.READ))
    .query(async () => {
      const conn = (await getDb())!;
      const rows = await conn.select().from(indicadoresAlertaCfvConfig).limit(1);
      return rows[0] ?? null;
    }),

  /** Salva/atualiza a config do alerta CFV (somente quem tem TODAS as permissões do módulo). */
  setAlertaCfvConfig: protectedProcedure
    .use(requirePermission(MODULES.INDICADORES_PEDIDOS_LAYOUT, ACTIONS.CREATE))
    .use(requirePermission(MODULES.INDICADORES_PEDIDOS_LAYOUT, ACTIONS.UPDATE))
    .input(
      z.object({
        layouts: z.array(z.string().min(1).max(50)).min(1),
        regioes: z.array(z.enum(["SC", "RS"])).min(1),
        gapMinutos: z.number().int().min(1).max(1440),
        horaInicio: z.number().int().min(0).max(23),
        horaFim: z.number().int().min(0).max(23),
        diasSemana: z.array(z.number().int().min(0).max(6)).min(1),
        destinatarioIds: z.array(z.number().int().positive()),
        destinoIds: z.array(z.number().int().positive()).optional().default([]),
        waRealertaMin: z.number().int().min(1).max(1440).optional().default(60),
        ativo: z.boolean(),
      }),
    )
    .mutation(async ({ input }) => {
      const conn = (await getDb())!;
      const existing = await conn.select({ id: indicadoresAlertaCfvConfig.id }).from(indicadoresAlertaCfvConfig).limit(1);
      if (existing.length > 0) {
        await conn.update(indicadoresAlertaCfvConfig).set(input).where(eq(indicadoresAlertaCfvConfig.id, existing[0].id));
      } else {
        await conn.insert(indicadoresAlertaCfvConfig).values(input);
      }
      return { ok: true };
    }),

  /**
   * Status do alerta CFV para o usuário logado: retorna se há alerta ativo agora.
   * O frontend faz polling a cada 60s. Lógica: verifica se o layout CFV na região
   * configurada tem o último pedido há mais de gapMinutos, dentro da janela de horário.
   */
  getAlertaCfvStatus: protectedProcedure.query(async ({ ctx }) => {
    const conn = (await getDb())!;
    const rows = await conn.select().from(indicadoresAlertaCfvConfig).limit(1);
    const cfg = rows[0];
    if (!cfg || !cfg.ativo) return { alerta: false };

    // Verifica se o usuário logado é destinatário
    const userId = ctx.user.id;
    if (!cfg.destinatarioIds.includes(userId)) return { alerta: false };

    // Verifica dia da semana e horário (fuso SP)
    const agora = new Date();
    const sp = new Date(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const dow = sp.getDay();
    if (!cfg.diasSemana.includes(dow)) return { alerta: false };
    const hora = sp.getHours();
    if (hora < cfg.horaInicio || hora >= cfg.horaFim) return { alerta: false };

    // Dados ao vivo do painel (reutiliza o cache de 30s de carregarPedidosLayout).
    const data = await carregarPedidosLayout();
    return avaliarAlertaCfv(cfg, data, agora);
  }),

  /** Lista de usuários aprovados (para o dropdown de destinatários na config). */
  getUsuariosPortal: protectedProcedure
    .use(requirePermission(MODULES.INDICADORES_PEDIDOS_LAYOUT, ACTIONS.CREATE))
    .query(async () => {
      const users = await getApprovedUsers();
      return users.map((u) => ({ id: u.id, name: u.name, email: u.email }));
    }),

  /**
   * Testa o alerta por WhatsApp: enfileira UMA mensagem [TESTE] AGORA para os destinos selecionados
   * (mesmo antes de salvar), pela fila/gateway do Monitor (conta 'monitor'). Serve para validar que
   * o caminho até o WhatsApp está ok. Envia mensagem REAL (com prefixo [TESTE]).
   */
  testarAlertaCfvWhatsapp: protectedProcedure
    .use(requirePermission(MODULES.INDICADORES_PEDIDOS_LAYOUT, ACTIONS.CREATE))
    .input(z.object({ destinoIds: z.array(z.number().int().positive()).min(1) }))
    .mutation(async ({ input }) => {
      const conn = (await getDb())!;
      const destinos = await conn
        .select({ tipo: monarqDestino.tipo, identificador: monarqDestino.identificador })
        .from(monarqDestino)
        .where(and(inArray(monarqDestino.id, input.destinoIds), eq(monarqDestino.ativo, true)));
      if (destinos.length === 0) return { enviados: 0 };
      await conn.insert(monarqWaOutbox).values(
        destinos.map((d) => ({
          waContaId: "monitor",
          tipo: d.tipo,
          identificador: d.identificador,
          mensagem: "🔔 [TESTE] Alerta de pedidos — Pedidos por Layout. Se você recebeu, o canal está ok.",
          categoria: "alerta",
        })),
      );
      return { enviados: destinos.length };
    }),
});

/** Avalia se o alerta CFV deve disparar com base nos dados ao vivo. */
export function avaliarAlertaCfv(
  cfg: typeof indicadoresAlertaCfvConfig.$inferSelect,
  data: PedidosPorLayoutResult,
  agora: Date,
): { alerta: boolean; mensagem?: string; gapMin?: number; regiao?: string; layout?: string } {
  for (const regiao of cfg.regioes) {
    const r = data.regioes[regiao as "SC" | "RS"];
    if (!r) continue;
    for (const layoutNome of cfg.layouts) {
      const linha = r.linhas.find((l) => l.layout.toUpperCase().includes(layoutNome.toUpperCase()));
      if (!linha) {
        // Layout não apareceu hoje = sem pedidos desde o início do dia
        return {
          alerta: true,
          mensagem: `Layout ${layoutNome} (${regiao}) sem pedidos hoje`,
          gapMin: cfg.gapMinutos,
          regiao,
          layout: layoutNome,
        };
      }
      if (linha.dtHora) {
        const ultimo = new Date(linha.dtHora);
        const diffMin = (agora.getTime() - ultimo.getTime()) / 60000;
        if (diffMin >= cfg.gapMinutos) {
          return {
            alerta: true,
            mensagem: `Layout ${layoutNome} (${regiao}) sem pedidos há ${Math.round(diffMin)} min`,
            gapMin: Math.round(diffMin),
            regiao,
            layout: layoutNome,
          };
        }
      }
    }
  }
  return { alerta: false };
}
