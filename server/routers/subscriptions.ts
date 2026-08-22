import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { subscriptionsLicenses, subscriptionAttachments } from "../../drizzle/schema";
import { eq, desc, and, lte, gte, sql } from "drizzle-orm";

// Input schema for creating/updating subscriptions
const subscriptionInput = z.object({
  serviceName: z.string().min(1, "Nome do serviço é obrigatório"),
  category: z.enum(["Segurança", "IA/LLM", "Infraestrutura", "Software", "Outro"]),
  renewalType: z.enum(["Mensal", "Anual", "Personalizado"]),
  renewalDays: z.number().int().positive().optional().nullable(),
  startDate: z.number(), // Unix timestamp ms
  expirationDate: z.number(), // Unix timestamp ms
  value: z.string().regex(/^\d+(\.\d{1,2})?$/, "Valor inválido"),
  currency: z.enum(["BRL", "USD"]),
  notes: z.string().optional().nullable(),
  responsibleUserId: z.number().int().positive(),
  responsibleUserName: z.string().min(1),
  alertDaysBefore: z.number().int().min(1).max(365).default(30),
  alertEnabled: z.boolean().default(true),
  groupId: z.number().int().positive(),
});

/**
 * Calcula o status com base na data de expiração
 */
function computeStatus(expirationDate: number, alertDaysBefore: number): "Ativo" | "Próximo do vencimento" | "Vencido" {
  const now = Date.now();
  if (expirationDate < now) return "Vencido";
  const alertThreshold = expirationDate - (alertDaysBefore * 24 * 60 * 60 * 1000);
  if (now >= alertThreshold) return "Próximo do vencimento";
  return "Ativo";
}

export const subscriptionsRouter = router({
  // ═══════════════════════════════════════════════════════
  // LISTAR ASSINATURAS
  // ═══════════════════════════════════════════════════════
  list: adminProcedure
    .input(z.object({
      category: z.enum(["Segurança", "IA/LLM", "Infraestrutura", "Software", "Outro"]).optional(),
      status: z.enum(["Ativo", "Próximo do vencimento", "Vencido", "Cancelado"]).optional(),
      groupId: z.number().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

      const conditions: any[] = [];
      if (input?.category) conditions.push(eq(subscriptionsLicenses.category, input.category));
      if (input?.status) conditions.push(eq(subscriptionsLicenses.status, input.status));
      if (input?.groupId) conditions.push(eq(subscriptionsLicenses.groupId, input.groupId));

      const results = conditions.length > 0
        ? await db.select().from(subscriptionsLicenses).where(and(...conditions)).orderBy(desc(subscriptionsLicenses.expirationDate))
        : await db.select().from(subscriptionsLicenses).orderBy(desc(subscriptionsLicenses.expirationDate));

      return results;
    }),

  // ═══════════════════════════════════════════════════════
  // OBTER ASSINATURA POR ID
  // ═══════════════════════════════════════════════════════
  getById: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

      const [result] = await db.select().from(subscriptionsLicenses).where(eq(subscriptionsLicenses.id, input.id));
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Assinatura não encontrada" });
      return result;
    }),

  // ═══════════════════════════════════════════════════════
  // CRIAR ASSINATURA
  // ═══════════════════════════════════════════════════════
  create: adminProcedure
    .input(subscriptionInput)
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

      const now = Date.now();
      const status = computeStatus(input.expirationDate, input.alertDaysBefore);

      await db.insert(subscriptionsLicenses).values({
        serviceName: input.serviceName,
        category: input.category,
        renewalType: input.renewalType,
        renewalDays: input.renewalDays ?? null,
        startDate: input.startDate,
        expirationDate: input.expirationDate,
        value: input.value,
        currency: input.currency,
        status,
        notes: input.notes ?? null,
        responsibleUserId: input.responsibleUserId,
        responsibleUserName: input.responsibleUserName,
        alertDaysBefore: input.alertDaysBefore,
        alertEnabled: input.alertEnabled,
        groupId: input.groupId,
        createdById: ctx.user.id,
        createdByName: ctx.user.name,
        createdAt: now,
        updatedAt: now,
      });

      return { success: true };
    }),

  // ═══════════════════════════════════════════════════════
  // ATUALIZAR ASSINATURA
  // ═══════════════════════════════════════════════════════
  update: adminProcedure
    .input(z.object({
      id: z.number().int().positive(),
      data: subscriptionInput.partial(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

      const [existing] = await db.select().from(subscriptionsLicenses).where(eq(subscriptionsLicenses.id, input.id));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Assinatura não encontrada" });

      // Recalcular status se data de expiração ou alertDaysBefore mudou
      const expirationDate = input.data.expirationDate ?? existing.expirationDate;
      const alertDaysBefore = input.data.alertDaysBefore ?? existing.alertDaysBefore;
      const computedStatus = computeStatus(expirationDate, alertDaysBefore);

      await db.update(subscriptionsLicenses)
        .set({
          ...input.data,
          status: existing.status === "Cancelado" ? "Cancelado" : computedStatus,
          updatedAt: Date.now(),
        })
        .where(eq(subscriptionsLicenses.id, input.id));

      return { success: true };
    }),

  // ═══════════════════════════════════════════════════════
  // CANCELAR ASSINATURA
  // ═══════════════════════════════════════════════════════
  cancel: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

      await db.update(subscriptionsLicenses)
        .set({ status: "Cancelado", updatedAt: Date.now() })
        .where(eq(subscriptionsLicenses.id, input.id));

      return { success: true };
    }),

  // ═══════════════════════════════════════════════════════
  // EXCLUIR ASSINATURA
  // ═══════════════════════════════════════════════════════
  delete: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

      await db.delete(subscriptionsLicenses).where(eq(subscriptionsLicenses.id, input.id));
      return { success: true };
    }),

  // ═══════════════════════════════════════════════════════
  // DASHBOARD / RESUMO
  // ═══════════════════════════════════════════════════════
  getSummary: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

    const all = await db.select().from(subscriptionsLicenses);

    const now = Date.now();
    let totalActive = 0;
    let totalExpiringSoon = 0;
    let totalExpired = 0;
    let totalCancelled = 0;
    let totalMonthlyBRL = 0;
    let totalMonthlyUSD = 0;

    // Recalcular status em tempo real
    for (const sub of all) {
      if (sub.status === "Cancelado") {
        totalCancelled++;
        continue;
      }

      const realStatus = computeStatus(sub.expirationDate, sub.alertDaysBefore);
      if (realStatus === "Ativo") totalActive++;
      else if (realStatus === "Próximo do vencimento") totalExpiringSoon++;
      else if (realStatus === "Vencido") totalExpired++;

      // Calcular custo mensal (para ativos e próximos do vencimento)
      if (realStatus !== "Vencido") {
        const monthlyValue = sub.renewalType === "Anual"
          ? Number(sub.value) / 12
          : sub.renewalType === "Personalizado" && sub.renewalDays
            ? (Number(sub.value) / sub.renewalDays) * 30
            : Number(sub.value);

        if (sub.currency === "BRL") totalMonthlyBRL += monthlyValue;
        else totalMonthlyUSD += monthlyValue;
      }

      // Atualizar status no banco se divergir
      if (realStatus !== sub.status) {
        await db.update(subscriptionsLicenses)
          .set({ status: realStatus, updatedAt: now })
          .where(eq(subscriptionsLicenses.id, sub.id));
      }
    }

    // Agrupar por categoria
    const byCategory = all.reduce((acc, sub) => {
      if (sub.status !== "Cancelado") {
        acc[sub.category] = (acc[sub.category] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    // Próximos vencimentos (próximos 60 dias)
    const sixtyDaysFromNow = now + (60 * 24 * 60 * 60 * 1000);
    const upcomingExpirations = all
      .filter(sub => sub.status !== "Cancelado" && sub.expirationDate > now && sub.expirationDate <= sixtyDaysFromNow)
      .sort((a, b) => a.expirationDate - b.expirationDate)
      .slice(0, 5);

    return {
      total: all.length,
      active: totalActive,
      expiringSoon: totalExpiringSoon,
      expired: totalExpired,
      cancelled: totalCancelled,
      totalMonthlyBRL: Math.round(totalMonthlyBRL * 100) / 100,
      totalMonthlyUSD: Math.round(totalMonthlyUSD * 100) / 100,
      byCategory,
      upcomingExpirations,
    };
  }),

  // ═══════════════════════════════════════════════════════
  // ATUALIZAR STATUS EM MASSA (para scheduled job)
  // ═══════════════════════════════════════════════════════
  refreshStatuses: adminProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

    const all = await db.select().from(subscriptionsLicenses).where(
      sql`${subscriptionsLicenses.status} != 'Cancelado'`
    );

    let updated = 0;
    const now = Date.now();
    for (const sub of all) {
      const realStatus = computeStatus(sub.expirationDate, sub.alertDaysBefore);
      if (realStatus !== sub.status) {
        await db.update(subscriptionsLicenses)
          .set({ status: realStatus, updatedAt: now })
          .where(eq(subscriptionsLicenses.id, sub.id));
        updated++;
      }
    }

    return { success: true, updated };
  }),

  // ═══════════════════════════════════════════════════════
  // ANEXOS (PDFs)
  // ═══════════════════════════════════════════════════════

  /** Listar anexos de uma assinatura */
  listAttachments: adminProcedure
    .input(z.object({ subscriptionId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

      return db.select().from(subscriptionAttachments)
        .where(eq(subscriptionAttachments.subscriptionId, input.subscriptionId))
        .orderBy(desc(subscriptionAttachments.createdAt));
    }),

  /** Upload de PDF - recebe base64 do arquivo */
  uploadAttachment: adminProcedure
    .input(z.object({
      subscriptionId: z.number().int().positive(),
      fileName: z.string().min(1),
      fileBase64: z.string().min(1),
      fileSize: z.number().int().positive(),
      mimeType: z.string().default("application/pdf"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

      // Validar que a assinatura existe
      const [sub] = await db.select().from(subscriptionsLicenses)
        .where(eq(subscriptionsLicenses.id, input.subscriptionId));
      if (!sub) throw new TRPCError({ code: "NOT_FOUND", message: "Assinatura não encontrada" });

      // Validar tipo de arquivo (apenas PDF)
      if (!input.mimeType.includes("pdf")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas arquivos PDF são permitidos" });
      }

      // Validar tamanho (máx 16MB)
      if (input.fileSize > 16 * 1024 * 1024) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo excede o limite de 16MB" });
      }

      // Converter base64 para buffer
      const buffer = Buffer.from(input.fileBase64, "base64");

      // Gerar chave única no S3
      const randomSuffix = Math.random().toString(36).substring(2, 10);
      const sanitizedName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const fileKey = `subscriptions/${input.subscriptionId}/${randomSuffix}-${sanitizedName}`;

      // Upload para S3
      const { storagePut } = await import("../storage");
      const { url } = await storagePut(fileKey, buffer, input.mimeType);

      // Salvar referência no banco
      await db.insert(subscriptionAttachments).values({
        subscriptionId: input.subscriptionId,
        fileName: input.fileName,
        fileKey,
        fileUrl: url,
        fileSize: input.fileSize,
        mimeType: input.mimeType,
        uploadedById: ctx.user.id,
        uploadedByName: ctx.user.name,
        createdAt: Date.now(),
      });

      return { success: true, url };
    }),

  /** Excluir anexo */
  deleteAttachment: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

      const [attachment] = await db.select().from(subscriptionAttachments)
        .where(eq(subscriptionAttachments.id, input.id));
      if (!attachment) throw new TRPCError({ code: "NOT_FOUND", message: "Anexo não encontrado" });

      // Remover do banco (o arquivo permanece no S3 como backup)
      await db.delete(subscriptionAttachments).where(eq(subscriptionAttachments.id, input.id));

      return { success: true };
    }),
});
