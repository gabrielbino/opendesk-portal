import { z } from "zod";
import * as XLSX from "xlsx";
import { ACTIONS, MODULES } from "@shared/permissions";
import { protectedProcedure, router } from "../_core/trpc";
import { requirePermission } from "../permissionMiddleware";
import { getValidadesCurtasDashboard } from "../db/validadesCurtas";
import { syncAllValidadesCurtas, syncValidadesCurtasRegion } from "../validadesCurtasSync";
import { erpApiConfigurada } from "../erpApi";
import { BANDAS_CONFIG, type BandaId, type TipoFiltroVC, type RegionView } from "@shared/validadesCurtas";

const regionViewSchema = z.enum(["SC", "RS", "UNIFICADO"]);
const tipoFiltroSchema = z.enum([
  "todos",
  "medicamento",
  "medicamento_venda_zerada",
  "nao_medicamento",
  "nao_medicamento_venda_zerada",
]);
const bandaSchema = z.enum(["descarte", "bonificavel", "alto_risco", "alerta", "atencao"]);

export const validadesCurtasRouter = router({
  /**
   * Dashboard principal: retorna itens classificados + KPIs.
   * Aceita filtros multi-seleção de região, tipo de produto e banda.
   */
  getDashboard: protectedProcedure
    .use(requirePermission(MODULES.VALIDADES_CURTAS, ACTIONS.READ))
    .input(
      z.object({
        region: regionViewSchema,
        tipoFiltros: z.array(tipoFiltroSchema).default(["todos"]),
        bandaFiltros: z.array(bandaSchema).default([]),
        compradorFiltros: z.array(z.string()).optional(),
        soVencidos: z.boolean().optional(),
      })
    )
    .query(async ({ input }) => {
      return getValidadesCurtasDashboard(
        input.region as RegionView,
        input.tipoFiltros as TipoFiltroVC[],
        input.bandaFiltros as BandaId[],
        input.compradorFiltros,
        input.soVencidos ?? false
      );
    }),

  /**
   * Exporta os itens (com os filtros atuais; e, se `codigos` vier, só os selecionados) em XLSX.
   * Mesmo padrão do Superestocados: gera no servidor e devolve base64 para download no cliente.
   */
  exportXlsx: protectedProcedure
    .use(requirePermission(MODULES.VALIDADES_CURTAS, ACTIONS.READ))
    .input(
      z.object({
        region: regionViewSchema,
        tipoFiltros: z.array(tipoFiltroSchema).default(["todos"]),
        bandaFiltros: z.array(bandaSchema).default([]),
        compradorFiltros: z.array(z.string()).optional(),
        soVencidos: z.boolean().optional(),
        codigos: z.array(z.number()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const dashboard = await getValidadesCurtasDashboard(
        input.region as RegionView,
        input.tipoFiltros as TipoFiltroVC[],
        input.bandaFiltros as BandaId[],
        input.compradorFiltros,
        input.soVencidos ?? false
      );

      const selecionados = input.codigos && input.codigos.length ? new Set(input.codigos) : null;
      const itens = selecionados ? dashboard.itens.filter((i) => selecionados.has(i.codigo)) : dashboard.itens;

      const headers = [
        "Código", "Produto", "Fornecedor", "Comprador", "Est. Total", "Vda. Média",
        "Vencimento", "Dias até Vencer", "Dias p/ Vender", "Vlr. Risco", "Banda", "Região",
      ];
      const rows = itens.map((i) => [
        i.codigo,
        i.nomeProduto,
        i.fornecedor,
        i.comprador ?? "Não atribuído",
        i.estoqueAtual,
        i.vendaMedia,
        i.vencimentoLote ?? "",
        i.diasAteVencer,
        i.diasParaVender >= 99999 ? "∞" : i.diasParaVender,
        i.valorEmRisco,
        BANDAS_CONFIG[i.banda].label,
        i.region,
      ]);

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `Validades ${input.region}`);
      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

      return {
        base64: buffer.toString("base64"),
        filename: `validades_curtas_${input.region}_${new Date().toISOString().split("T")[0]}.xlsx`,
      };
    }),

  /**
   * Refresh manual: sincroniza dados frescos da API Erp para a tabela
   * validades_curtas_itens e depois retorna o dashboard atualizado.
   */
  refreshDados: protectedProcedure
    .use(requirePermission(MODULES.VALIDADES_CURTAS, ACTIONS.UPDATE))
    .input(z.object({ region: regionViewSchema }))
    .mutation(async ({ input }) => {
      if (erpApiConfigurada()) {
        if (input.region === "UNIFICADO") {
          await syncAllValidadesCurtas();
        } else {
          await syncValidadesCurtasRegion(input.region as "SC" | "RS");
        }
      }
      const dashboard = await getValidadesCurtasDashboard(input.region as RegionView);
      return { ok: true, dashboard };
    }),
});
