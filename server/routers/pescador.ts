import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, gte, isNotNull, lte, or, sql, type SQL } from "drizzle-orm";

import { ACTIONS, MODULES } from "@shared/permissions";
import { protectedProcedure, router } from "../_core/trpc";
import { requirePermission } from "../permissionMiddleware";
import { getDb } from "../db";
import { syncPescador } from "../pescadorApiSync";
import {
  pescadorHistorico,
  pescadorMeta,
  pescadorPedidos,
  pescadorPedidosItens,
  pescadorTriagem,
} from "../../drizzle/schema";

/* ─── Schemas ────────────────────────────────────────────────────────────── */

const politicaSchema = z.string().min(1).max(96);

const triagemFiltersSchema = z.object({
  politica: politicaSchema.optional(),
  /** Atalho de KPI: 'caiu', 'sem_giro', 'vencendo_30', 'em_promocao' */
  kpi: z.enum(["caiu", "sem_giro", "vencendo_30", "em_promocao"]).optional(),
  curvaAbc: z.array(z.string()).optional(),
  /** Fornecedores selecionados — multi-select das facetas da carga. */
  fornecedores: z.array(z.string()).optional(),
  /** Status de venda (Subiu/Caiu/Estável/Sem venda) — vem das facetas da carga. */
  acompanhamento: z.string().optional(),
  /** Só produtos COM MOVIMENTO: venderam ≥1 em pelo menos um dos últimos 7 dias úteis (D1–D7). */
  comMovimento: z.boolean().optional(),
  /** Faixa de estoque: '0' | '1-50' | '51-500' | '500+' */
  estoque: z.enum(["0", "1-50", "51-500", "500+"]).optional(),
  /** Restringe a um conjunto de códigos (usado pelo drill-down do comparativo). */
  codInternosIn: z.array(z.string()).optional(),
  busca: z.string().optional(),
  /** Paginação */
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(10).max(500).default(50),
  sortBy: z.string().optional(),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});

/** Filtros do comparativo 7×7 (mesmos da Triagem, sem paginação nem o filtro do drill-down). */
const comparativoFiltersSchema = z.object({
  politica: politicaSchema.optional(),
  curvaAbc: z.array(z.string()).optional(),
  fornecedores: z.array(z.string()).optional(),
  acompanhamento: z.string().optional(),
  comMovimento: z.boolean().optional(),
  estoque: z.enum(["0", "1-50", "51-500", "500+"]).optional(),
  kpi: z.enum(["caiu", "sem_giro", "vencendo_30", "em_promocao"]).optional(),
  busca: z.string().optional(),
});

const historicoFiltersSchema = z.object({
  codInterno: z.string().optional(),
  dataInicio: z.string().optional(),
  dataFim: z.string().optional(),
  codLote: z.string().optional(),
  precoMin: z.number().optional(),
  precoMax: z.number().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(10).max(500).default(100),
});

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Garante DB conectado e devolve a instância. */
async function db() {
  const conn = await getDb();
  if (!conn) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
  }
  return conn;
}

/** Campos de filtro compartilhados entre a Triagem e o comparativo 7×7. */
type TriagemFilters = {
  politica?: string;
  curvaAbc?: string[];
  fornecedores?: string[];
  codInternosIn?: string[];
  acompanhamento?: string;
  comMovimento?: boolean;
  estoque?: "0" | "1-50" | "51-500" | "500+";
  kpi?: "caiu" | "sem_giro" | "vencendo_30" | "em_promocao";
  busca?: string;
};

/** Constrói lista de condições WHERE da Triagem a partir dos filtros. */
function buildTriagemWhere(input: TriagemFilters): SQL[] {
  const conds: SQL[] = [];

  if (input.politica) {
    conds.push(eq(pescadorTriagem.politica, input.politica));
  }
  if (input.curvaAbc && input.curvaAbc.length > 0) {
    conds.push(sql`${pescadorTriagem.curvaAbc} IN (${sql.join(input.curvaAbc.map((c) => sql`${c}`), sql`, `)})`);
  }
  if (input.fornecedores && input.fornecedores.length > 0) {
    conds.push(sql`${pescadorTriagem.fornecedor} IN (${sql.join(input.fornecedores.map((f) => sql`${f}`), sql`, `)})`);
  }
  if (input.codInternosIn && input.codInternosIn.length > 0) {
    conds.push(sql`${pescadorTriagem.codInterno} IN (${sql.join(input.codInternosIn.map((c) => sql`${c}`), sql`, `)})`);
  }
  if (input.acompanhamento) {
    conds.push(eq(pescadorTriagem.acompanhamento, input.acompanhamento));
  }
  if (input.comMovimento) {
    // Vendeu ≥1 em pelo menos um dos 7 dias úteis COMPLETOS — exclui o dia corrente (D1) quando
    // ele é hoje (senão a manhã sem venda sujaria); nesse caso usa D2–D8, senão D1–D7.
    const t = pescadorTriagem;
    const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    conds.push(sql`(CASE WHEN DATE(${t.dataD1}) = ${hoje}
      THEN (${t.vendaD2} + ${t.vendaD3} + ${t.vendaD4} + ${t.vendaD5} + ${t.vendaD6} + ${t.vendaD7} + ${t.vendaD8})
      ELSE (${t.vendaD1} + ${t.vendaD2} + ${t.vendaD3} + ${t.vendaD4} + ${t.vendaD5} + ${t.vendaD6} + ${t.vendaD7}) END) > 0`);
  }

  switch (input.estoque) {
    case "0":
      conds.push(eq(pescadorTriagem.estoqueSc, 0));
      break;
    case "1-50":
      conds.push(and(gte(pescadorTriagem.estoqueSc, 1), lte(pescadorTriagem.estoqueSc, 50))!);
      break;
    case "51-500":
      conds.push(and(gte(pescadorTriagem.estoqueSc, 51), lte(pescadorTriagem.estoqueSc, 500))!);
      break;
    case "500+":
      conds.push(gte(pescadorTriagem.estoqueSc, 501));
      break;
  }

  switch (input.kpi) {
    case "caiu":
      conds.push(eq(pescadorTriagem.acompanhamento, "Caiu"));
      break;
    case "sem_giro":
      conds.push(eq(pescadorTriagem.qtdVendidaMes, 0));
      break;
    case "vencendo_30":
      conds.push(isNotNull(pescadorTriagem.loteVencimento));
      conds.push(gte(pescadorTriagem.loteVencimento, todayIso()));
      conds.push(lte(pescadorTriagem.loteVencimento, addDaysIso(30)));
      break;
    case "em_promocao":
      conds.push(eq(pescadorTriagem.origemPreco, "PROMOCIONAL"));
      break;
  }

  if (input.busca && input.busca.trim()) {
    const term = `%${input.busca.trim()}%`;
    conds.push(
      or(
        sql`${pescadorTriagem.codInterno} LIKE ${term}`,
        sql`${pescadorTriagem.ean} LIKE ${term}`,
        sql`${pescadorTriagem.descricao} LIKE ${term}`,
        sql`${pescadorTriagem.fabricante} LIKE ${term}`,
        sql`${pescadorTriagem.fornecedor} LIKE ${term}`,
      )!,
    );
  }

  return conds;
}

const SORTABLE_TRIAGEM_COLUMNS: Record<string, any> = {
  codInterno: pescadorTriagem.codInterno,
  ean: pescadorTriagem.ean,
  descricao: pescadorTriagem.descricao,
  fabricante: pescadorTriagem.fabricante,
  fornecedor: pescadorTriagem.fornecedor,
  estoqueSc: pescadorTriagem.estoqueSc,
  curvaAbc: pescadorTriagem.curvaAbc,
  precoUnitario: pescadorTriagem.precoUnitario,
  percMc: pescadorTriagem.percMc,
  markup: pescadorTriagem.markup,
  giroMes: pescadorTriagem.giroMes,
  giroEstoque: pescadorTriagem.giroEstoque,
  qtdVendidaMes: pescadorTriagem.qtdVendidaMes,
  loteVencimento: pescadorTriagem.loteVencimento,
};

/* ─── Router ─────────────────────────────────────────────────────────────── */

export const pescadorRouter = router({
  /** Metadados da última carga: versão, data de geração, totais. */
  getMeta: protectedProcedure
    .use(requirePermission(MODULES.PESCADOR, ACTIONS.READ))
    .query(async () => {
      const conn = await db();
      const rows = await conn.select().from(pescadorMeta).orderBy(desc(pescadorMeta.geradoEm)).limit(1);
      return rows[0] ?? null;
    }),

  /**
   * KPIs agregados da Triagem (respeitando filtro de política se houver).
   * Usados nos 4 cards clicáveis: queda, sem giro, vencendo ≤30d, em promoção.
   */
  getKpis: protectedProcedure
    .use(requirePermission(MODULES.PESCADOR, ACTIONS.READ))
    .input(z.object({ politica: politicaSchema.optional() }))
    .query(async ({ input }) => {
      const conn = await db();
      const baseWhere = input.politica ? eq(pescadorTriagem.politica, input.politica) : undefined;

      const [totalRow] = await conn
        .select({ total: count() })
        .from(pescadorTriagem)
        .where(baseWhere);

      const [caiuRow] = await conn
        .select({ total: count() })
        .from(pescadorTriagem)
        .where(
          baseWhere
            ? and(baseWhere, eq(pescadorTriagem.acompanhamento, "Caiu"))
            : eq(pescadorTriagem.acompanhamento, "Caiu"),
        );

      const [semGiroRow] = await conn
        .select({ total: count() })
        .from(pescadorTriagem)
        .where(
          baseWhere
            ? and(baseWhere, eq(pescadorTriagem.qtdVendidaMes, 0))
            : eq(pescadorTriagem.qtdVendidaMes, 0),
        );

      const vencendoCond = and(
        isNotNull(pescadorTriagem.loteVencimento),
        gte(pescadorTriagem.loteVencimento, todayIso()),
        lte(pescadorTriagem.loteVencimento, addDaysIso(30)),
      )!;

      const [vencendoRow] = await conn
        .select({ total: count() })
        .from(pescadorTriagem)
        .where(baseWhere ? and(baseWhere, vencendoCond) : vencendoCond);

      const [promoRow] = await conn
        .select({ total: count() })
        .from(pescadorTriagem)
        .where(
          baseWhere
            ? and(baseWhere, eq(pescadorTriagem.origemPreco, "PROMOCIONAL"))
            : eq(pescadorTriagem.origemPreco, "PROMOCIONAL"),
        );

      return {
        total: Number(totalRow?.total ?? 0),
        caiu: Number(caiuRow?.total ?? 0),
        semGiro: Number(semGiroRow?.total ?? 0),
        vencendo30: Number(vencendoRow?.total ?? 0),
        emPromocao: Number(promoRow?.total ?? 0),
      };
    }),

  /** Lista paginada da Triagem com filtros. */
  getTriagem: protectedProcedure
    .use(requirePermission(MODULES.PESCADOR, ACTIONS.READ))
    .input(triagemFiltersSchema)
    .query(async ({ input }) => {
      const conn = await db();
      const conds = buildTriagemWhere(input);
      const whereExpr = conds.length > 0 ? and(...conds) : undefined;

      const sortCol = input.sortBy && SORTABLE_TRIAGEM_COLUMNS[input.sortBy]
        ? SORTABLE_TRIAGEM_COLUMNS[input.sortBy]
        : pescadorTriagem.codInterno;
      const orderBy = input.sortDir === "desc" ? desc(sortCol) : asc(sortCol);

      const [totalRow] = await conn
        .select({ total: count() })
        .from(pescadorTriagem)
        .where(whereExpr);

      const rows = await conn
        .select()
        .from(pescadorTriagem)
        .where(whereExpr)
        .orderBy(orderBy)
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);

      return {
        rows,
        total: Number(totalRow?.total ?? 0),
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  /** Distinct values de campos usados em filtros (curvas ABC, políticas, origens). */
  getTriagemFacets: protectedProcedure
    .use(requirePermission(MODULES.PESCADOR, ACTIONS.READ))
    .query(async () => {
      const conn = await db();

      const curvas = await conn
        .selectDistinct({ value: pescadorTriagem.curvaAbc })
        .from(pescadorTriagem)
        .where(isNotNull(pescadorTriagem.curvaAbc))
        .orderBy(asc(pescadorTriagem.curvaAbc));

      const politicas = await conn
        .selectDistinct({ value: pescadorTriagem.politica })
        .from(pescadorTriagem)
        .orderBy(asc(pescadorTriagem.politica));

      const acompanhamentos = await conn
        .selectDistinct({ value: pescadorTriagem.acompanhamento })
        .from(pescadorTriagem)
        .where(isNotNull(pescadorTriagem.acompanhamento))
        .orderBy(asc(pescadorTriagem.acompanhamento));

      const fornecedores = await conn
        .selectDistinct({ value: pescadorTriagem.fornecedor })
        .from(pescadorTriagem)
        .where(isNotNull(pescadorTriagem.fornecedor))
        .orderBy(asc(pescadorTriagem.fornecedor));

      return {
        curvas: curvas.map((r) => r.value).filter((v): v is string => !!v),
        politicas: politicas.map((r) => r.value),
        acompanhamentos: acompanhamentos.map((r) => r.value).filter((v): v is string => !!v),
        fornecedores: fornecedores.map((r) => r.value).filter((v): v is string => !!v),
      };
    }),

  /**
   * Comparativo 7×7: sobre TODO o conjunto filtrado, agrega venda dos 7 dias úteis mais
   * recentes × os 7 anteriores (14 dias completos, excluindo o dia corrente). Devolve os
   * totais (itens/unidades/valor aprox./MC gerada) e, por categoria de movimento, a lista de
   * códigos p/ o drill-down filtrar a tabela. Valor = unidades × preço atual (aprox., até a
   * API de pedidos trazer o valor real); MC gerada = unidades × MC por unidade (estimada).
   */
  getComparativo7x7: protectedProcedure
    .use(requirePermission(MODULES.PESCADOR, ACTIONS.READ))
    .input(comparativoFiltersSchema)
    .query(async ({ input }) => {
      const conn = await db();
      const conds = buildTriagemWhere(input);
      const rows = await conn
        .select()
        .from(pescadorTriagem)
        .where(conds.length > 0 ? and(...conds) : undefined);

      // Exclui o dia corrente (D1) quando ele é hoje — mesma regra do status.
      const hojeSp = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
      const dataD1 = rows[0]?.dataD1 ? String(rows[0].dataD1).slice(0, 10) : null;
      const base = dataD1 === hojeSp ? 1 : 0; // índice do 1º dia útil COMPLETO (0-based)

      const somaBucket = (row: Record<string, unknown>, from: number) => {
        let s = 0;
        for (let i = from; i < from + 7; i++) s += Number(row[`vendaD${i + 1}`] ?? 0);
        return s;
      };

      type Ag = {
        codInterno: string; ean: string; descricao: string; fabricante: string | null;
        recente: number; anterior: number; recValor: number; antValor: number; recMc: number; antMc: number;
      };
      const porCod = new Map<string, Ag>();
      for (const r of rows as unknown as Record<string, any>[]) {
        const rec = somaBucket(r, base);
        const ant = somaBucket(r, base + 7);
        if (rec === 0 && ant === 0) continue; // sem venda nos 14 dias → fora do comparativo
        const preco = Number(r.precoPraticado ?? 0);
        const mcUn = Number(r.mc ?? 0);
        const key = String(r.codInterno);
        let a = porCod.get(key);
        if (!a) {
          a = { codInterno: key, ean: String(r.ean), descricao: String(r.descricao), fabricante: r.fabricante ?? null,
            recente: 0, anterior: 0, recValor: 0, antValor: 0, recMc: 0, antMc: 0 };
          porCod.set(key, a);
        }
        a.recente += rec; a.anterior += ant;
        a.recValor += rec * preco; a.antValor += ant * preco;
        a.recMc += rec * mcUn; a.antMc += ant * mcUn;
      }
      const itens = Array.from(porCod.values());
      const soma = (sel: (i: Ag) => number) => itens.reduce((s, i) => s + sel(i), 0);

      const totais = {
        recente: { itens: itens.filter((i) => i.recente > 0).length, unidades: soma((i) => i.recente), valor: soma((i) => i.recValor), mcGerada: soma((i) => i.recMc) },
        anterior: { itens: itens.filter((i) => i.anterior > 0).length, unidades: soma((i) => i.anterior), valor: soma((i) => i.antValor), mcGerada: soma((i) => i.antMc) },
      };

      const cats = { entraram: [] as Ag[], deixou: [] as Ag[], aceleraram: [] as Ag[], desaceleraram: [] as Ag[], mantidos: [] as Ag[] };
      const classifica = (i: Ag): keyof typeof cats => {
        if (i.recente > 0 && i.anterior === 0) return "entraram";
        if (i.anterior > 0 && i.recente === 0) return "deixou";
        if (i.recente > i.anterior) return "aceleraram";
        if (i.recente < i.anterior) return "desaceleraram";
        return "mantidos";
      };
      for (const i of itens) cats[classifica(i)].push(i);
      // Ordena cada categoria pela maior perda (anterior − recente), depois por valor perdido.
      for (const k of Object.keys(cats) as Array<keyof typeof cats>) {
        cats[k].sort((a, b) => (b.anterior - b.recente) - (a.anterior - a.recente) || (b.antValor - b.recValor) - (a.antValor - a.recValor));
      }

      const categorias = Object.fromEntries(
        (Object.keys(cats) as Array<keyof typeof cats>).map((k) => [k, {
          count: cats[k].length,
          codInternos: cats[k].map((i) => i.codInterno),
        }]),
      );

      return {
        base,
        janela: { recente: [base + 1, base + 7] as [number, number], anterior: [base + 8, base + 14] as [number, number] },
        totais,
        categorias,
      };
    }),

  /** Drill-down: tudo o que temos sobre um produto (cod_interno + política). */
  getProdutoDetalhe: protectedProcedure
    .use(requirePermission(MODULES.PESCADOR, ACTIONS.READ))
    .input(z.object({
      codInterno: z.string().min(1),
      politica: politicaSchema.optional(),
    }))
    .query(async ({ input }) => {
      const conn = await db();
      const triagemConds: SQL[] = [eq(pescadorTriagem.codInterno, input.codInterno)];
      if (input.politica) {
        triagemConds.push(eq(pescadorTriagem.politica, input.politica));
      }
      const triagemRows = await conn
        .select()
        .from(pescadorTriagem)
        .where(and(...triagemConds));

      const pedidosRows = await conn
        .select({
          item: pescadorPedidosItens,
          pedido: pescadorPedidos,
        })
        .from(pescadorPedidosItens)
        .innerJoin(pescadorPedidos, eq(pescadorPedidosItens.pedidoId, pescadorPedidos.id))
        .where(eq(pescadorPedidosItens.codInterno, input.codInterno))
        .orderBy(desc(pescadorPedidos.dataPedido))
        .limit(50);

      const historicoRows = await conn
        .select()
        .from(pescadorHistorico)
        .where(eq(pescadorHistorico.codInterno, input.codInterno))
        .orderBy(desc(pescadorHistorico.dataEmissao))
        .limit(100);

      if (triagemRows.length === 0 && pedidosRows.length === 0 && historicoRows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Produto não encontrado em nenhuma das consultas." });
      }

      return {
        triagem: triagemRows,
        pedidos: pedidosRows,
        historico: historicoRows,
      };
    }),

  /**
   * Itens de pedido em formato flat (join pedido × item), para a aba Pedidos.
   *
   * Estratégia (mesma do protótipo original): o servidor entrega o conjunto
   * completo (~18k itens, cap de segurança 25k) e o FRONT filtra, agrupa nas
   * 3 visões (por item / por pedido / tabela plana) e pagina client-side.
   * Com React Query o payload é carregado 1x e cacheado. Quando a API real
   * chegar, reavaliar a necessidade de filtros server-side.
   *
   * Status reais do ERP: 'APROVADO' | 'PARCIAL' | 'REJEITADO TOTAL'.
   */
  getPedidosItens: protectedProcedure
    .use(requirePermission(MODULES.PESCADOR, ACTIONS.READ))
    .query(async () => {
      const conn = await db();

      const rows = await conn
        .select({
          // Item
          itemId: pescadorPedidosItens.id,
          codInterno: pescadorPedidosItens.codInterno,
          ean: pescadorPedidosItens.ean,
          descricao: pescadorPedidosItens.descricao,
          fabricante: pescadorPedidosItens.fabricante,
          politica: pescadorPedidosItens.politica,
          qtdSolicitada: pescadorPedidosItens.qtdSolicitada,
          qtdAtendida: pescadorPedidosItens.qtdAtendida,
          statusAtendimento: pescadorPedidosItens.statusAtendimento,
          motivoRejeicaoItem: pescadorPedidosItens.motivoRejeicaoItem,
          precoUnitarioPedido: pescadorPedidosItens.precoUnitarioPedido,
          valorTotalItemPedido: pescadorPedidosItens.valorTotalItemPedido,
          qtdFaturada: pescadorPedidosItens.qtdFaturada,
          // Pedido (cabeçalho)
          pedidoId: pescadorPedidos.id,
          dataPedido: pescadorPedidos.dataPedido,
          numeroPedidoVenda: pescadorPedidos.numeroPedidoVenda,
          codigoPedidoCliente: pescadorPedidos.codigoPedidoCliente,
          cnpjCliente: pescadorPedidos.cnpjCliente,
          numeroDesdobramento: pescadorPedidos.numeroDesdobramento,
          valorTotalPedido: pescadorPedidos.valorTotalPedido,
        })
        .from(pescadorPedidosItens)
        .innerJoin(pescadorPedidos, eq(pescadorPedidosItens.pedidoId, pescadorPedidos.id))
        .orderBy(desc(pescadorPedidos.dataPedido))
        .limit(25_000);

      return { itens: rows, total: rows.length };
    }),

  /** Histórico de preço praticado (limitado a 15 dias após a data atual). */
  getHistorico: protectedProcedure
    .use(requirePermission(MODULES.PESCADOR, ACTIONS.READ))
    .input(historicoFiltersSchema)
    .query(async ({ input }) => {
      const conn = await db();
      const conds: SQL[] = [];

      if (input.codInterno) conds.push(eq(pescadorHistorico.codInterno, input.codInterno));
      if (input.dataInicio) conds.push(gte(pescadorHistorico.dataEmissao, input.dataInicio));
      if (input.dataFim) conds.push(lte(pescadorHistorico.dataEmissao, input.dataFim));
      if (input.codLote) conds.push(eq(pescadorHistorico.codLote, input.codLote));
      if (input.precoMin != null) conds.push(gte(pescadorHistorico.precoFinal, input.precoMin));
      if (input.precoMax != null) conds.push(lte(pescadorHistorico.precoFinal, input.precoMax));

      const whereExpr = conds.length > 0 ? and(...conds) : undefined;

      const [totalRow] = await conn
        .select({ total: count() })
        .from(pescadorHistorico)
        .where(whereExpr);

      const rows = await conn
        .select()
        .from(pescadorHistorico)
        .where(whereExpr)
        .orderBy(desc(pescadorHistorico.dataEmissao))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);

      return {
        rows,
        total: Number(totalRow?.total ?? 0),
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  /** Atualiza a Triagem/MC sob demanda (mesma rotina do sync agendado). */
  sync: protectedProcedure
    .use(requirePermission(MODULES.PESCADOR, ACTIONS.UPDATE))
    .mutation(async () => syncPescador()),
});
