
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import * as XLSX from "xlsx";

import { ACTIONS, MODULES } from "@shared/permissions";
import { protectedProcedure, router } from "../_core/trpc";
import { requirePermission } from "../permissionMiddleware";
import {
  getCampaignHistory,
  getProductPanorama,
  getProdutoPermanencia,
  getRegionDashboard,
  getSuperestocadosRanking,
  getSuperestocadosProdutosRanking,
  getResumoPainel,
  removeCampaign,
  startOrUpdateCampaign,
  updateCampaignObservation,
} from "../db/superestocados";
import { getDb } from "../db";
import { superestoque, parametros } from "../../drizzle/schema";
import { getParamsByModule, updateParam, invalidateParametrosCache } from "../db/parametros";
import { syncRegion } from "../superestocadosApiSync";

const regionSchema = z.enum(["SC", "RS"]);
/** Inclui o modo agregado para o dashboard (não usar nas operações por região). */
const regionViewSchema = z.enum(["SC", "RS", "UNIFICADO"]);

export const superestocadosRouter = router({
  getRegionDashboard: protectedProcedure
    .use(requirePermission(MODULES.SUPERESTOCADOS, ACTIONS.READ))
    .input(z.object({ region: regionViewSchema }))
    .query(async ({ input }) => {
      return getRegionDashboard(input.region);
    }),

  /**
   * Refresh manual (botão do painel): puxa os dados frescos da API (produtos + vendas)
   * da região ativa (UNIFICADO = SC + RS) e devolve o dashboard atualizado. Como roda
   * `rotateRegionalProducts` (grava `updatedAt = now`), o "Última Atualização" reflete.
   */
  refreshDados: protectedProcedure
    .use(requirePermission(MODULES.SUPERESTOCADOS, ACTIONS.UPDATE))
    .input(z.object({ region: regionViewSchema }))
    .mutation(async ({ input }) => {
      const regioes: Array<"SC" | "RS"> =
        input.region === "UNIFICADO" ? ["SC", "RS"] : [input.region];
      // SC e RS são independentes — sincroniza em paralelo (metade do tempo no unificado).
      await Promise.all(regioes.map((r) => syncRegion(r)));
      const dashboard = await getRegionDashboard(input.region);
      return { ok: true, dashboard };
    }),

  /** Ranking das indústrias mais superestocadas (modo TV). */
  getRanking: protectedProcedure
    .use(requirePermission(MODULES.SUPERESTOCADOS, ACTIONS.READ))
    .input(z.object({
      region: regionViewSchema,
      top: z.number().int().min(1).max(100).default(10),
    }))
    .query(async ({ input }) => {
      return getSuperestocadosRanking(input.region, input.top);
    }),

  /** Ranking dos PRODUTOS mais superestocados (visão alternativa do modo TV). */
  getProdutosRanking: protectedProcedure
    .use(requirePermission(MODULES.SUPERESTOCADOS, ACTIONS.READ))
    .input(z.object({
      region: regionViewSchema,
      top: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ input }) => {
      return getSuperestocadosProdutosRanking(input.region, input.top);
    }),

  /**
   * Valor imobilizado (ao vivo) + evolução das últimas 4 semanas. Usado no Modo TV e no painel.
   * `tipos` (opcional) filtra por balde de tipo (união) — vazio = total.
   */
  getResumoPainel: protectedProcedure
    .use(requirePermission(MODULES.SUPERESTOCADOS, ACTIONS.READ))
    .input(
      z.object({
        region: regionViewSchema,
        tipos: z
          .array(z.enum(["medicamento", "medicamento_zerado", "nao_medicamento", "nao_medicamento_zerado"]))
          .optional(),
      }),
    )
    .query(async ({ input }) => {
      return getResumoPainel(input.region, input.tipos ?? []);
    }),

  getProductPanorama: protectedProcedure
    .use(requirePermission(MODULES.SUPERESTOCADOS, ACTIONS.READ))
    .input(z.object({ productId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const panorama = await getProductPanorama(input.productId);
      if (!panorama) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Produto não encontrado para o panorama solicitado.",
        });
      }
      return panorama;
    }),

  getProdutoPermanencia: protectedProcedure
    .use(requirePermission(MODULES.SUPERESTOCADOS, ACTIONS.READ))
    .input(z.object({
      codigo: z.number().int().positive(),
      region: regionSchema,
      tipoProduto: z.enum(["medicamento", "nao_medicamento"]),
    }))
    .query(async ({ input }) => {
      return getProdutoPermanencia(input.codigo, input.region, input.tipoProduto);
    }),

  /**
   * Inicia ou altera campanha de um produto.
   * Salva histórico da campanha anterior se existir.
   */
  startCampaign: protectedProcedure
    .use(requirePermission(MODULES.SUPERESTOCADOS, ACTIONS.UPDATE))
    .input(z.object({
      productId: z.number().int().positive(),
      descricao: z.string().min(1, "Descrição da campanha é obrigatória"),
      dataInicio: z.string().nullable().optional(),
      dataFim: z.string().nullable().optional(),
      observacao: z.string().nullable().optional(),
      keepObservation: z.boolean().optional().default(false),
    }))
    .mutation(async ({ input }) => {
      try {
        return await startOrUpdateCampaign({
          productId: input.productId,
          descricao: input.descricao,
          dataInicio: input.dataInicio ?? null,
          dataFim: input.dataFim ?? null,
          observacao: input.observacao ?? null,
          keepObservation: input.keepObservation,
        });
      } catch (e: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e.message });
      }
    }),

  /**
   * Remove campanha de um produto (salva histórico).
   */
  removeCampaign: protectedProcedure
    .use(requirePermission(MODULES.SUPERESTOCADOS, ACTIONS.UPDATE))
    .input(z.object({
      productId: z.number().int().positive(),
    }))
    .mutation(async ({ input }) => {
      try {
        return await removeCampaign(input.productId);
      } catch (e: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e.message });
      }
    }),

  /**
   * Atualiza observação livre da campanha (bloco de notas).
   */
  updateCampaignObservation: protectedProcedure
    .use(requirePermission(MODULES.SUPERESTOCADOS, ACTIONS.UPDATE))
    .input(z.object({
      productId: z.number().int().positive(),
      observacao: z.string().nullable(),
    }))
    .mutation(async ({ input }) => {
      try {
        return await updateCampaignObservation(input.productId, input.observacao);
      } catch (e: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e.message });
      }
    }),

  /**
   * Lista histórico de campanhas de um produto.
   */
  getCampaignHistory: protectedProcedure
    .use(requirePermission(MODULES.SUPERESTOCADOS, ACTIONS.READ))
    .input(z.object({
      productId: z.number().int().positive(),
    }))
    .query(async ({ input }) => {
      return getCampaignHistory(input.productId);
    }),

  /**
   * Legacy: Marca/desmarca produto como "Em Campanha" (compatível com botão simples).
   */
  setStatusCampanha: protectedProcedure
    .use(requirePermission(MODULES.SUPERESTOCADOS, ACTIONS.UPDATE))
    .input(z.object({
      productId: z.number().int().positive(),
      status: z.enum(["nao_participa", "em_campanha"]),
    }))
    .mutation(async ({ input }) => {
      if (input.status === "nao_participa") {
        try {
          await removeCampaign(input.productId);
          return { statusCampanha: "nao_participa" as const, estoqueIdealCongelado: null };
        } catch (e: any) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e.message });
        }
      }
      // Para "em_campanha" sem descrição, manter compatível
      const db2 = await getDb();
      if (!db2) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
      }
      const [product] = await db2.select().from(superestoque).where(eq(superestoque.id, input.productId)).limit(1);
      if (!product) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Produto não encontrado." });
      }
      const estoqueIdeal = Math.ceil(Number(product.vendaMedia ?? 0) * 2);
      await db2.update(superestoque).set({
        statusCampanha: "em_campanha",
        estoqueIdealCongelado: estoqueIdeal,
      }).where(eq(superestoque.id, input.productId));
      return { statusCampanha: "em_campanha" as const, estoqueIdealCongelado: estoqueIdeal };
    }),

  /**
   * Exporta produtos selecionados como XLSX.
   * Recebe IDs dos produtos e as datas de vendas visíveis no painel.
   * Retorna base64 do arquivo XLSX.
   */
  exportXlsx: protectedProcedure
    .use(requirePermission(MODULES.SUPERESTOCADOS, ACTIONS.READ))
    .input(z.object({
      region: regionViewSchema,
      productIds: z.array(z.number().int().positive()),
      recentDates: z.array(z.string()),
    }))
    .mutation(async ({ input }) => {
      const dashboardData = await getRegionDashboard(input.region);
      
      // Filtrar apenas os produtos selecionados
      const selectedProducts = dashboardData.products.filter(
        (p) => input.productIds.includes(p.id)
      );

      if (!selectedProducts.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum produto selecionado para exportação." });
      }

      // Formata data ISO (YYYY-MM-DD) para padrão BR (DD/MM/YYYY).
      const formatDateBR = (iso: string | null | undefined) => {
        if (!iso) return "-";
        const [y, m, d] = iso.split("-");
        if (!y || !m || !d) return iso;
        return `${d}/${m}/${y}`;
      };

      // Montar cabeçalho — ordem coerente com a tabela do painel.
      // Vendas diárias invertidas (mais recente à esquerda).
      const reversedDates = [...input.recentDates].reverse();
      const headers = [
        "Código",
        "Produto",
        "Fornecedor",
        "Comprador",
        "Tipo",
        "Status Campanha",
        "Est. Inicial",
        "Est. Total",
        "Est. Ideal",
        "Est. Lote",
        "Cód. Lote",
        "Vencimento",
        "Valor Custo (R$)",
        "Preço Mín.",
        "Excesso R$",
        "Venda Média Mensal",
        "Proj. Mês",
        "Vda. M-0",
        "Vda. M-1",
        "Vda. M-2",
        "Dias Estoque",
        "Cobertura Estimada",
        "Última Compra",
        "Última Transferência",
        "Dias Sem Venda",
        ...reversedDates.map((d) => {
          const [, m, day] = d.split("-");
          return `${day}/${m}`;
        }),
      ];

      // Montar linhas — mesma ordem do array `headers` acima.
      const rows = selectedProducts.map((p) => {
        const estoqueIdealCalculado = p.vendaMedia > 0 ? Math.round(p.vendaMedia * 2) : 0;
        const idealUsado = p.statusCampanha === "em_campanha"
          ? (p.estoqueIdealCongelado ?? estoqueIdealCalculado)
          : estoqueIdealCalculado;

        const excedente = Math.max(0, p.estoqueAtual - idealUsado);
        const custoUnitario = p.estoqueAtual > 0 ? (p.valorCusto ?? 0) / p.estoqueAtual : 0;
        const excessoReais = excedente * custoUnitario;

        const coberturaDias = p.vendaMedia > 0
          ? Math.round((p.estoqueAtual / p.vendaMedia) * 30)
          : 0;
        const coberturaLabel = coberturaDias > 365
          ? `${coberturaDias} dias (~${Math.round(coberturaDias / 30)} meses)`
          : `${coberturaDias} dias`;

        return [
          p.codigo,
          p.nomeProduto,
          p.fornecedor,
          p.comprador ?? "Não atribuído",
          p.tipoProduto === "medicamento" ? "Medicamento" : "Não Medicamento",
          p.statusCampanha === "em_campanha" ? "Em Campanha" : "Não Participa",
          p.estoqueInicial,
          p.estoqueAtual,
          idealUsado,
          p.lote?.estoqueLote ?? 0,
          p.lote?.codLote ?? "-",
          formatDateBR(p.lote?.vencimentoLote),
          p.valorCusto != null ? p.valorCusto.toFixed(2) : "0.00",
          p.precoPolitica != null ? p.precoPolitica.toFixed(2) : "-",
          excessoReais.toFixed(2),
          p.vendaMedia.toFixed(1),
          p.qtdProjetadoMesAtual ?? 0,
          p.qtdVendaMesAtual ?? 0,
          p.qtdVendaMesAnterior ?? 0,
          p.qtdVenda2MesesAnterior ?? 0,
          p.diasEstoque,
          coberturaLabel,
          p.dataUltimaCompra ?? "-",
          p.dataUltimaTransferencia ? formatDateBR(p.dataUltimaTransferencia) : "-",
          p.diasSemVenda,
          ...reversedDates.map((d) => p.vendasRecentes[d] ?? 0),
        ];
      });

      // Criar workbook
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

      // Largura por nome de coluna — resiste a reordenação e inclusão de novas.
      const colWidths: Record<string, number> = {
        "Produto": 40,
        "Fornecedor": 28,
        "Comprador": 18,
        "Status Campanha": 18,
        "Cobertura Estimada": 25,
        "Cód. Lote": 18,
        "Vencimento": 14,
        "Última Compra": 14,
        "Última Transferência": 18,
        "Valor Custo (R$)": 16,
        "Excesso R$": 14,
      };
      ws["!cols"] = headers.map((h) => ({ wch: colWidths[h] ?? 14 }));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `Superestocados ${input.region}`);
      
      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      const base64 = Buffer.from(buffer).toString("base64");

      return {
        base64,
        filename: `superestocados_${input.region}_${new Date().toISOString().split("T")[0]}.xlsx`,
      };
    }),

  /**
   * Lista todos os parâmetros do módulo superestocados.
   */
  getParametros: protectedProcedure
    .use(requirePermission(MODULES.SUPERESTOCADOS, ACTIONS.READ))
    .query(async () => {
      return getParamsByModule("superestocados");
    }),

  /**
   * Atualiza um parâmetro do módulo superestocados.
   */
  updateParametro: protectedProcedure
    .use(requirePermission(MODULES.SUPERESTOCADOS, ACTIONS.UPDATE))
    .input(z.object({
      chave: z.string().min(1),
      valor: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const success = await updateParam(input.chave, input.valor, ctx.user?.name ?? "sistema");
      if (!success) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Par\u00e2metro n\u00e3o encontrado." });
      }
      invalidateParametrosCache();
      return { success: true };
    }),
});
