import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { requirePermission } from "../permissionMiddleware";
import { MODULES, ACTIONS } from "../../shared/permissions";
import * as commercialDb from "../db/commercial";
import { TRPCError } from "@trpc/server";

export const commercialRouter = router({
  // ==================== UPLOADS ====================
  
  getUploads: protectedProcedure
    .use(requirePermission(MODULES.COMERCIAL, ACTIONS.READ))
    .query(async () => {
      try {
        return await commercialDb.getCommercialUploads();
      } catch (error: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao listar uploads",
          cause: error,
        });
      }
    }),

  uploadExcel: protectedProcedure
    .use(requirePermission(MODULES.COMERCIAL, ACTIONS.CREATE))
    .input(z.object({
      fileName: z.string(),
      originalName: z.string(),
      fileData: z.string(), // base64 encoded
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        // Create upload record
        const uploadId = await commercialDb.createCommercialUpload({
          fileName: input.fileName,
          originalName: input.originalName,
          uploadedById: ctx.user!.id,
          uploadedByName: ctx.user!.name || "Desconhecido",
        });

        // Decode base64 and parse Excel
        const buffer = Buffer.from(input.fileData, "base64");
        
        // Dynamic import of xlsx
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(buffer, { type: "buffer" });

        let totalRecords = 0;

        // Process "Atualizavel" sheet (PDE Rejections)
        const atualizavelSheet = workbook.Sheets["Atualizavel"];
        if (atualizavelSheet) {
          // Data starts at row 7 (header) and row 8+ (data)
          const jsonData = XLSX.utils.sheet_to_json(atualizavelSheet, { 
            range: 6, // 0-indexed, so row 7 = index 6
            defval: null,
          });

          const records = jsonData.map((row: any) => {
            // Map Excel columns to our schema
            const keys = Object.keys(row);
            return {
              dataRegistro: row[keys[0]] ? String(row[keys[0]]) : null,
              estado: row[keys[1]] ? String(row[keys[1]]) : null,
              razaoSocial: row[keys[2]] ? String(row[keys[2]]) : null,
              cnpj: row[keys[3]] ? String(row[keys[3]]) : null,
              pedido: row[keys[4]] ? String(row[keys[4]]) : null,
              codProduto: row[keys[5]] ? String(row[keys[5]]) : null,
              produto: row[keys[6]] ? String(row[keys[6]]) : null,
              percentualDesconto: row[keys[7]] ? String(row[keys[7]]) : null,
              precoUnitario: row[keys[8]] ? String(row[keys[8]]) : null,
              qtdSolicitado: row[keys[9]] ? Number(row[keys[9]]) : null,
              qtdAtendido: row[keys[10]] ? Number(row[keys[10]]) : null,
              codFabricante: row[keys[11]] ? String(row[keys[11]]) : null,
              fabricante: row[keys[12]] ? String(row[keys[12]]) : null,
              idPolitica: row[keys[13]] ? String(row[keys[13]]) : null,
              politica: row[keys[14]] ? String(row[keys[14]]) : null,
              motivoRejeicao: row[keys[15]] ? String(row[keys[15]]) : null,
              layout: row[keys[16]] ? String(row[keys[16]]) : null,
            };
          }).filter((r: any) => r.codProduto || r.produto || r.razaoSocial); // Filter empty rows

          if (records.length > 0) {
            totalRecords += await commercialDb.insertPdeRejections(uploadId, records);
          }
        }

        // Process "Cadastro Pro" sheet (Products)
        const cadastroSheet = workbook.Sheets["Cadastro Pro"];
        if (cadastroSheet) {
          const jsonData = XLSX.utils.sheet_to_json(cadastroSheet, { defval: null });

          const records = jsonData.map((row: any) => {
            const keys = Object.keys(row);
            return {
              codigoProduto: row[keys[0]] ? String(row[keys[0]]) : null,
              produto: row[keys[1]] ? String(row[keys[1]]) : null,
              codigoEan: row[keys[2]] ? String(row[keys[2]]) : null,
              classificacaoFiscal: row[keys[3]] ? String(row[keys[3]]) : null,
              codigoCest: row[keys[4]] ? String(row[keys[4]]) : null,
              classificacaoTributaria: row[keys[5]] ? String(row[keys[5]]) : null,
              descricaoClassificacao: row[keys[6]] ? String(row[keys[6]]) : null,
              fabricante: row[keys[7]] ? String(row[keys[7]]) : null,
            };
          }).filter((r: any) => r.codigoProduto || r.produto);

          if (records.length > 0) {
            await commercialDb.insertCommercialProducts(uploadId, records);
          }
        }

        // Update upload status
        await commercialDb.updateCommercialUpload(uploadId, {
          status: "completed",
          totalRecords,
        });

        return { uploadId, totalRecords };
      } catch (error: any) {
        console.error("Erro ao processar upload:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao processar arquivo Excel: " + (error.message || "Erro desconhecido"),
          cause: error,
        });
      }
    }),

  deleteUpload: protectedProcedure
    .use(requirePermission(MODULES.COMERCIAL, ACTIONS.DELETE))
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      try {
        await commercialDb.deleteCommercialUpload(input.id);
        return { success: true };
      } catch (error: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao excluir upload",
          cause: error,
        });
      }
    }),

  // ==================== PDE REJECTIONS ====================

  getRejections: protectedProcedure
    .use(requirePermission(MODULES.COMERCIAL, ACTIONS.READ))
    .input(z.object({
      uploadId: z.number().optional(),
      estado: z.string().optional(),
      motivoRejeicao: z.string().optional(),
      fabricante: z.string().optional(),
      search: z.string().optional(),
      page: z.number().optional(),
      limit: z.number().optional(),
    }).optional())
    .query(async ({ input }) => {
      try {
        return await commercialDb.getPdeRejections(input || {});
      } catch (error: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao listar rejeições PDE",
          cause: error,
        });
      }
    }),

  // ==================== ANALYTICS ====================

  getAnalytics: protectedProcedure
    .use(requirePermission(MODULES.COMERCIAL, ACTIONS.READ))
    .input(z.object({
      uploadId: z.number().optional(),
      motivoRejeicao: z.string().optional(),
      estado: z.string().optional(),
      fabricante: z.string().optional(),
      mes: z.number().optional(),
      ano: z.number().optional(),
    }).optional())
    .query(async ({ input }) => {
      try {
        return await commercialDb.getPdeAnalytics(input?.uploadId, input?.motivoRejeicao, input?.estado, input?.fabricante, input?.mes, input?.ano);
      } catch (error: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao obter análises comerciais",
          cause: error,
        });
      }
    }),

  // ==================== FILTERS ====================

  getFilterOptions: protectedProcedure
    .use(requirePermission(MODULES.COMERCIAL, ACTIONS.READ))
    .input(z.object({
      uploadId: z.number().optional(),
    }).optional())
    .query(async ({ input }) => {
      try {
        const [estados, motivos, fabricantes] = await Promise.all([
          commercialDb.getDistinctEstados(input?.uploadId),
          commercialDb.getDistinctMotivos(input?.uploadId),
          commercialDb.getDistinctFabricantes(input?.uploadId),
        ]);
        return { estados, motivos, fabricantes };
      } catch (error: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao obter opções de filtro",
          cause: error,
        });
      }
    }),

  getMotivoDetalhes: protectedProcedure
    .use(requirePermission(MODULES.COMERCIAL, ACTIONS.READ))
    .input(z.object({
      motivoRejeicao: z.string(),
      uploadId: z.number().optional(),
      mes: z.number().optional(),
      ano: z.number().optional(),
    }))
    .query(async ({ input }) => {
      try {
        return await commercialDb.getMotivoRejeicaoDetalhes(input.motivoRejeicao, input.uploadId, input.mes, input.ano);
      } catch (error: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao obter detalhes do motivo",
          cause: error,
        });
      }
    }),
});
