import { z } from "zod";
import * as XLSX from "xlsx";

import { ACTIONS, MODULES } from "@shared/permissions";
import { protectedProcedure, router } from "../_core/trpc";
import { requirePermission } from "../permissionMiddleware";
import {
  getRupturasDashboard,
  getRupturasRanking,
  listCompradores,
  upsertComprador,
} from "../db/rupturas";
import { syncRegionRupturas } from "../rupturasApiSync";

const regionViewSchema = z.enum(["SC", "RS", "UNIFICADO"]);
const regionKeySchema = z.enum(["SC", "RS"]);

export const rupturasRouter = router({
  /** Visão operacional: itens em ruptura agrupados por marca (+ comprador e %). */
  getRegionDashboard: protectedProcedure
    .use(requirePermission(MODULES.RUPTURAS, ACTIONS.READ))
    .input(z.object({ region: regionViewSchema }))
    .query(async ({ input }) => {
      return getRupturasDashboard(input.region);
    }),

  /** Ranking estratégico (visão de TV): top N marcas por % de ruptura. */
  getRanking: protectedProcedure
    .use(requirePermission(MODULES.RUPTURAS, ACTIONS.READ))
    .input(z.object({ region: regionViewSchema, top: z.number().int().min(1).max(100).default(10) }))
    .query(async ({ input }) => {
      return getRupturasRanking(input.region, input.top);
    }),

  /** Refresh manual (botão do painel): puxa os dados frescos da API para a região
   *  ativa (UNIFICADO = SC + RS) e devolve o dashboard atualizado. */
  refreshDados: protectedProcedure
    .use(requirePermission(MODULES.RUPTURAS, ACTIONS.UPDATE))
    .input(z.object({ region: regionViewSchema }))
    .mutation(async ({ input }) => {
      const regioes: Array<"SC" | "RS"> = input.region === "UNIFICADO" ? ["SC", "RS"] : [input.region];
      for (const r of regioes) {
        await syncRegionRupturas(r);
      }
      const dashboard = await getRupturasDashboard(input.region);
      return { ok: true, dashboard };
    }),

  /**
   * Exporta os itens em ruptura em XLSX, uma linha POR PRODUTO (com Fornecedor + Comprador).
   * `produtos` (opcional) restringe aos selecionados (região + código); vazio = todos da região.
   * Mesmo padrão do Superestocados/Validades Curtas: gera no servidor e devolve base64.
   */
  exportXlsx: protectedProcedure
    .use(requirePermission(MODULES.RUPTURAS, ACTIONS.READ))
    .input(
      z.object({
        region: regionViewSchema,
        produtos: z.array(z.object({ codigo: z.number().int(), region: regionKeySchema })).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const dashboard = await getRupturasDashboard(input.region);

      // Achata marca → produto, carregando o contexto da marca (fornecedor, comprador, % ruptura).
      const linhas = dashboard.marcas.flatMap((m) =>
        m.itens.map((it) => ({
          codigo: it.codigo,
          region: it.region,
          fornecedor: m.fornecedor,
          comprador: m.comprador,
          nomeProduto: it.nomeProduto,
          tipoProduto: it.tipoProduto,
          diasEstoque: it.diasEstoque,
          estoqueAtual: it.estoqueAtual,
          vendaMedia: it.vendaMedia,
          valorCusto: it.valorCusto,
          zerado: it.zerado,
          pctRuptura: m.pctRuptura,
        })),
      );

      const sel = input.produtos && input.produtos.length
        ? new Set(input.produtos.map((p) => `${p.region}-${p.codigo}`))
        : null;
      const rows = sel ? linhas.filter((l) => sel.has(`${l.region}-${l.codigo}`)) : linhas;

      const headers = [
        "Código", "Produto", "Fornecedor", "Comprador", "UF", "Tipo",
        "Situação", "Dias Estoque", "Estoque", "Vda. Média", "Valor Custo (R$)", "% Ruptura Marca",
      ];
      const aoa = rows.map((l) => [
        l.codigo,
        l.nomeProduto,
        l.fornecedor,
        l.comprador ?? "Não atribuído",
        l.region,
        l.tipoProduto === "medicamento" ? "Medicamento" : "Não Medicamento",
        l.zerado ? "Zerado" : "Em alerta",
        Number(l.diasEstoque.toFixed(1)),
        l.estoqueAtual,
        Number(l.vendaMedia.toFixed(1)),
        l.valorCusto != null ? Number(l.valorCusto.toFixed(2)) : "",
        Number(l.pctRuptura.toFixed(1)),
      ]);

      const ws = XLSX.utils.aoa_to_sheet([headers, ...aoa]);
      const colWidths: Record<string, number> = {
        "Produto": 40, "Fornecedor": 28, "Comprador": 18, "Situação": 12, "Valor Custo (R$)": 16, "% Ruptura Marca": 16,
      };
      ws["!cols"] = headers.map((h) => ({ wch: colWidths[h] ?? 12 }));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `Rupturas ${input.region}`);
      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

      return {
        base64: buffer.toString("base64"),
        filename: `rupturas_${input.region}_${new Date().toISOString().split("T")[0]}.xlsx`,
      };
    }),

  /** Lista marcas conhecidas + comprador atual (alimenta a tela de edição). */
  listCompradores: protectedProcedure
    .use(requirePermission(MODULES.RUPTURAS, ACTIONS.READ))
    .query(async () => {
      return listCompradores();
    }),

  /** Define/atualiza o comprador de uma marca (comprador vazio remove o vínculo). */
  upsertComprador: protectedProcedure
    .use(requirePermission(MODULES.RUPTURAS, ACTIONS.UPDATE))
    .input(z.object({ fornecedor: z.string().trim().min(1), comprador: z.string().trim().max(255) }))
    .mutation(async ({ input }) => {
      return upsertComprador(input.fornecedor, input.comprador);
    }),
});
