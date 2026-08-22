import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { ACTIONS, MODULES } from "@shared/permissions";
import { protectedProcedure, router } from "../_core/trpc";
import { requirePermission } from "../permissionMiddleware";
import { invokeLLM } from "../_core/llm";
import {
  createContratoRepasse,
  deleteContratoRepasse,
  getContratoRepasseById,
  getLogsContrato,
  listContratosRepasse,
  registrarLogContrato,
  updateContratoRepasse,
} from "../db/repasses";
import { logError } from "../errorLogger";

const estadoSchema = z.enum(["SC", "RS"]);
const grupoSchema = z.enum(["Associativismo", "Farmácias"]);
const statusSchema = z.enum(["Vigente", "Vencido"]);

/**
 * Valida e corrige datas ISO (YYYY-MM-DD).
 * Se a IA extrair uma data invalida (ex: 2026-06-31), corrige para o ultimo dia valido do mes.
 */
function sanitizeIsoDate(dateStr: string): string {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateStr; // deixa o zod rejeitar
  const [, yearStr, monthStr, dayStr] = match;
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (month < 1 || month > 12) return dateStr; // invalido, zod rejeita

  // Ultimo dia valido do mes
  const lastDay = new Date(year, month, 0).getDate();
  const correctedDay = Math.min(day, lastDay);

  return `${yearStr}-${monthStr}-${String(correctedDay).padStart(2, '0')}`;
}

const isoDateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (use yyyy-mm-dd)")
  .transform(sanitizeIsoDate);

const taxaSchema = z.object({
  categoria: z.string().min(1, "Categoria obrigatória").max(255),
  percentual: z.number().min(0).max(100),
});

const contratoInputSchema = z.object({
  apelidoInterno: z.string().max(255).nullable().optional(),
  parceiro: z.string().min(1, "Parceiro obrigatório").max(512),
  cnpj: z.string().min(11, "CNPJ obrigatório").max(32),
  estado: estadoSchema,
  grupo: grupoSchema,
  status: statusSchema.optional(),
  gatilhoMensal: z.number().min(0),
  vigenciaInicio: isoDateSchema,
  vigenciaFim: isoDateSchema,
  observacoes: z.string().nullable().optional(),
  pdfFileName: z.string().nullable().optional(),
  pdfFileKey: z.string().nullable().optional(),
  pdfFileUrl: z.string().nullable().optional(),
  taxas: z.array(taxaSchema).default([]),
  filiais: z.array(z.string().min(1).max(512)).default([]),
});

export const repassesRouter = router({
  list: protectedProcedure
    .use(requirePermission(MODULES.REPASSES, ACTIONS.READ))
    .input(
      z
        .object({
          estado: estadoSchema.optional(),
          grupo: grupoSchema.optional(),
          status: z.union([statusSchema, z.literal("Todos")]).optional(),
          search: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      return listContratosRepasse(input ?? {});
    }),

  getById: protectedProcedure
    .use(requirePermission(MODULES.REPASSES, ACTIONS.READ))
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const contrato = await getContratoRepasseById(input.id);
      if (!contrato) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado" });
      }
      return contrato;
    }),

  create: protectedProcedure
    .use(requirePermission(MODULES.REPASSES, ACTIONS.CREATE))
    .input(contratoInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await createContratoRepasse(input, {
          id: ctx.user?.id ?? null,
          name: ctx.user?.name ?? null,
        });
      } catch (err) {
        await logError({
          module: "repasses",
          operation: "createContrato",
          error: err,
          context: { input, userId: ctx.user?.id },
          userId: ctx.user?.id ?? null,
          userName: ctx.user?.name ?? null,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Falha ao salvar no banco: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }),

  update: protectedProcedure
    .use(requirePermission(MODULES.REPASSES, ACTIONS.UPDATE))
    .input(
      z.object({
        id: z.number().int().positive(),
        data: contratoInputSchema.partial(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await updateContratoRepasse(input.id, input.data, {
          id: ctx.user?.id ?? null,
          name: ctx.user?.name ?? null,
        });
      } catch (err) {
        await logError({
          module: "repasses",
          operation: "updateContrato",
          error: err,
          context: { contratoId: input.id, data: input.data, userId: ctx.user?.id },
          userId: ctx.user?.id ?? null,
          userName: ctx.user?.name ?? null,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Falha ao atualizar contrato: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }),

  delete: protectedProcedure
    .use(requirePermission(MODULES.REPASSES, ACTIONS.DELETE))
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await deleteContratoRepasse(input.id);
      return { success: true } as const;
    }),

  /** Atualiza um contrato existente com novo PDF + dados extraídos + motivo */
  renewContract: protectedProcedure
    .use(requirePermission(MODULES.REPASSES, ACTIONS.UPDATE))
    .input(
      z.object({
        id: z.number().int().positive(),
        motivo: z.string().min(1, "Motivo obrigatório"),
        data: contratoInputSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Buscar dados anteriores para snapshot
      const existing = await getContratoRepasseById(input.id);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado" });
      }

      // Atualizar o contrato com os novos dados
      const updated = await updateContratoRepasse(input.id, input.data, {
        id: ctx.user?.id ?? null,
        name: ctx.user?.name ?? null,
      });

      // Registrar log de atualização
      await registrarLogContrato({
        contratoId: input.id,
        acao: "atualizacao",
        motivo: input.motivo,
        dadosAnteriores: {
          parceiro: existing.parceiro,
          cnpj: existing.cnpj,
          estado: existing.estado,
          grupo: existing.grupo,
          status: existing.status,
          gatilhoMensal: existing.gatilhoMensal,
          vigenciaInicio: existing.vigenciaInicio,
          vigenciaFim: existing.vigenciaFim,
          pdfFileName: existing.pdfFileName,
          taxas: existing.taxas,
          filiais: existing.filiais,
        },
        userId: ctx.user?.id ?? null,
        userName: ctx.user?.name ?? null,
      });

      return updated;
    }),

  /** Busca o histórico de atualizações de um contrato */
  getLogs: protectedProcedure
    .use(requirePermission(MODULES.REPASSES, ACTIONS.READ))
    .input(z.object({ contratoId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return getLogsContrato(input.contratoId);
    }),

  /** Extrai dados de um contrato PDF usando IA (LLM com visão) */
  extractFromPdf: protectedProcedure
    .use(requirePermission(MODULES.REPASSES, ACTIONS.CREATE))
    .input(
      z.object({
        pdfUrl: z.string().url("URL do PDF obrigatória"),
        fileName: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { pdfUrl, fileName } = input;

      const systemPrompt = `Você é um assistente especializado em extrair dados de contratos comerciais de repasse farmacêutico da OpenDesk Distribuidora.

Analise o PDF do contrato e extraia as seguintes informações com precisão:

1. **parceiro**: Razão social da empresa parceira (NÃO é a OpenDesk). É a empresa que recebe o repasse.
2. **cnpj**: CNPJ da empresa parceira (formato XX.XXX.XXX/XXXX-XX).
3. **estado**: Estado onde opera (SC ou RS). Identifique pela sede da empresa parceira.
4. **grupo**: Classificação do parceiro - "Associativismo" (se for rede, associação, cooperativa, grupo de farmácias) ou "Farmácias" (se for farmácia individual ou rede própria).
5. **vigenciaInicio**: Data de início do contrato no formato YYYY-MM-DD.
6. **vigenciaFim**: Data de fim do contrato no formato YYYY-MM-DD.
7. **gatilhoMensal**: Valor mínimo mensal de compras para ativar o repasse (em reais, apenas número). Se houver faixas progressivas, use o valor da primeira faixa (menor valor).
8. **taxasRepasse**: Array de faixas/categorias de repasse. Cada item tem:
   - "categoria": Descrição da faixa ou categoria (ex: "Compras R$150k a R$200k", "Genéricos", "Geolab", etc.)
   - "percentual": Percentual de repasse (número decimal, ex: 1.5 para 1,5%)
9. **observacoes**: Informações relevantes adicionais do contrato (condições especiais, restrições, etc.)

REGRAS IMPORTANTES:
- O parceiro é SEMPRE a outra parte do contrato (não a OpenDesk S/A).
- Se o contrato menciona faixas de valores com percentuais diferentes, cada faixa deve ser uma taxa separada.
- Se o contrato menciona categorias de produtos (Genéricos, Similares, laboratórios específicos), cada categoria é uma taxa.
- Datas devem estar no formato YYYY-MM-DD e devem ser VALIDAS (ex: fevereiro tem 28/29 dias, abril/junho/setembro/novembro tem 30 dias). Se o contrato diz "até 30/06/2026", use "2026-06-30" (não "2026-06-31").
- Valores monetários devem ser apenas números (sem R$, sem pontos de milhar).
- Se não encontrar filiais específicas, retorne um array vazio para filiais.`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Extraia os dados deste contrato de repasse. O arquivo se chama: "${fileName || "contrato.pdf"}"`,
              },
              {
                type: "file_url",
                file_url: {
                  url: pdfUrl,
                  mime_type: "application/pdf",
                },
              },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "contrato_repasse_extraction",
            strict: true,
            schema: {
              type: "object",
              properties: {
                parceiro: { type: "string", description: "Razão social do parceiro" },
                cnpj: { type: "string", description: "CNPJ do parceiro" },
                estado: { type: "string", enum: ["SC", "RS"], description: "Estado" },
                grupo: { type: "string", enum: ["Associativismo", "Farmácias"], description: "Grupo" },
                vigenciaInicio: { type: "string", description: "Data início YYYY-MM-DD" },
                vigenciaFim: { type: "string", description: "Data fim YYYY-MM-DD" },
                gatilhoMensal: { type: "number", description: "Valor mínimo mensal para repasse" },
                taxasRepasse: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      categoria: { type: "string", description: "Categoria ou faixa" },
                      percentual: { type: "number", description: "Percentual de repasse" },
                    },
                    required: ["categoria", "percentual"],
                    additionalProperties: false,
                  },
                  description: "Taxas de repasse por categoria/faixa",
                },
                filiais: {
                  type: "array",
                  items: { type: "string" },
                  description: "Filiais beneficiadas (se mencionadas)",
                },
                observacoes: { type: "string", description: "Observações adicionais" },
              },
              required: [
                "parceiro",
                "cnpj",
                "estado",
                "grupo",
                "vigenciaInicio",
                "vigenciaFim",
                "gatilhoMensal",
                "taxasRepasse",
                "filiais",
                "observacoes",
              ],
              additionalProperties: false,
            },
          },
        },
      });

      const content = response.choices?.[0]?.message?.content;
      if (!content || typeof content !== "string") {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "A IA não retornou dados válidos do contrato.",
        });
      }

      try {
        const extracted = JSON.parse(content);

        // Determinar status com base na vigência
        const hoje = new Date();
        const fim = new Date(extracted.vigenciaFim);
        const status = fim < hoje ? "Vencido" : "Vigente";

        return {
          parceiro: extracted.parceiro || "",
          cnpj: extracted.cnpj || "",
          estado: extracted.estado || "SC",
          grupo: extracted.grupo || "Associativismo",
          status,
          vigenciaInicio: sanitizeIsoDate(extracted.vigenciaInicio || ""),
          vigenciaFim: sanitizeIsoDate(extracted.vigenciaFim || ""),
          gatilhoMensal: extracted.gatilhoMensal || 0,
          taxasRepasse: (extracted.taxasRepasse || []).map((t: any) => ({
            categoria: t.categoria || "",
            percentual: Number(t.percentual) || 0,
          })),
          filiais: extracted.filiais || [],
          observacoes: extracted.observacoes || "",
          pdfFileName: fileName || null,
          pdfFileUrl: pdfUrl,
        };
      } catch (parseError) {
        console.error("[Repasses Extract] Falha ao parsear resposta da IA:", content);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Falha ao interpretar a resposta da IA. Tente novamente.",
        });
      }
    }),
});
