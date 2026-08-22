import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { sql, eq } from "drizzle-orm";
import { parametros } from "../../drizzle/schema";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { listErrors, resolveError, countUnresolvedByModule } from "../errorLogger";

// Prefixos válidos para validação de nomenclatura
const VALID_PREFIXES = [
  "sys_", "suporte_", "chat_", "superestocados_", "comercial_",
  "repasses_", "projetos_", "tarefas_", "responsabilidades_",
  "ti_", "compras_", "estoque_", "dev_",
];

export const adminRouter = router({
  // ═══════════════════════════════════════════════════════
  // SAÚDE DO SISTEMA
  // ═══════════════════════════════════════════════════════

  getSystemHealth: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

    // 1. Informações do banco de dados
    const dbSizeRaw = await db.execute(sql`
      SELECT 
        table_schema as db_name,
        ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) as size_mb,
        COUNT(*) as total_tables,
        SUM(table_rows) as total_rows
      FROM information_schema.tables 
      WHERE table_schema = DATABASE()
      GROUP BY table_schema
    `);
    const dbSizeRows = Array.isArray(dbSizeRaw[0]) ? dbSizeRaw[0] : dbSizeRaw;
    const dbSizeResult = (dbSizeRows as any[])[0];

    // 2. Tabelas maiores por tamanho
    const topTablesRaw = await db.execute(sql`
      SELECT 
        table_name,
        ROUND((data_length + index_length) / 1024 / 1024, 2) as size_mb,
        table_rows as rows_count,
        ROUND(index_length / 1024 / 1024, 2) as index_size_mb
      FROM information_schema.tables 
      WHERE table_schema = DATABASE()
      ORDER BY (data_length + index_length) DESC
      LIMIT 15
    `);
    const topTables = Array.isArray(topTablesRaw[0]) ? topTablesRaw[0] : topTablesRaw;

    // 3. Usuários ativos
    // "Online agora" = isOnline E com atividade recente (janela de 2 min, igual a getAllOnlineUsers).
    // Sem a janela, sessões que fecharam a aba sem logout ficam presas em isOnline=1 e inflam o número.
    const onlineDesde = Date.now() - 120_000;
    const activeUsersRaw = await db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM sys_status_online WHERE isOnline = 1 AND lastActivityAt >= ${onlineDesde}) as online_now,
        (SELECT COUNT(*) FROM sys_usuarios) as total_users,
        (SELECT COUNT(*) FROM sys_usuarios WHERE lastSignedIn >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) as last_24h,
        (SELECT COUNT(*) FROM sys_usuarios WHERE lastSignedIn >= DATE_SUB(NOW(), INTERVAL 7 DAY)) as last_7d
    `);
    const activeUsersRows = Array.isArray(activeUsersRaw[0]) ? activeUsersRaw[0] : activeUsersRaw;
    const activeUsersResult = (activeUsersRows as any[])[0];

    // 4. Validação de nomenclatura das tabelas
    const allTablesRaw = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = DATABASE()
      ORDER BY table_name
    `);

    // db.execute retorna [rows, fields] - pegar apenas as rows
    const allTables = Array.isArray(allTablesRaw[0]) ? allTablesRaw[0] : allTablesRaw;

    const namingValidation = (allTables as any[]).map((row: any) => {
      const name = row.table_name || row.TABLE_NAME;
      if (!name) return null;
      if (name === "__drizzle_migrations") return { name, status: "exception", message: "Tabela de controle do Drizzle" };
      
      const hasValidPrefix = VALID_PREFIXES.some(p => name.startsWith(p));
      const isSnakeCase = !/[A-Z]/.test(name) && !name.includes("-");
      
      if (hasValidPrefix && isSnakeCase) {
        return { name, status: "ok", message: "Conforme" };
      }
      
      const issues = [];
      if (!hasValidPrefix) issues.push("Sem prefixo de módulo");
      if (!isSnakeCase) issues.push("Não é snake_case");
      return { name, status: "error", message: issues.join(", ") };
    }).filter(Boolean);

    const conformeCount = namingValidation.filter((v: any) => v.status === "ok" || v.status === "exception").length;

    // 5. Resumo por módulo
    const modulesSummary = VALID_PREFIXES.map(prefix => {
      const tables = (allTables as any[]).filter((t: any) => {
        const n = t.table_name || t.TABLE_NAME;
        return n && n.startsWith(prefix);
      });
      return {
        prefix,
        module: prefix.replace(/_$/, ""),
        count: tables.length,
      };
    }).filter(m => m.count > 0);

    // 6. Uptime do servidor (processo Node)
    const uptimeSeconds = process.uptime();

    return {
      database: {
        name: (dbSizeResult as any)?.db_name || "principal",
        sizeMb: Number((dbSizeResult as any)?.size_mb) || 0,
        totalTables: Number((dbSizeResult as any)?.total_tables) || 0,
        totalRows: Number((dbSizeResult as any)?.total_rows) || 0,
      },
      topTables: (topTables as any[]).map((t: any) => ({
        name: t.table_name || t.TABLE_NAME,
        sizeMb: Number(t.size_mb) || 0,
        rowsCount: Number(t.rows_count) || 0,
        indexSizeMb: Number(t.index_size_mb) || 0,
      })),
      users: {
        total: Number((activeUsersResult as any)?.total_users) || 0,
        onlineNow: Number((activeUsersResult as any)?.online_now) || 0,
        last24h: Number((activeUsersResult as any)?.last_24h) || 0,
        last7d: Number((activeUsersResult as any)?.last_7d) || 0,
      },
      naming: {
        total: namingValidation.length,
        conforme: conformeCount,
        violations: namingValidation.filter((v: any) => v.status === "error"),
        details: namingValidation,
      },
      modules: modulesSummary,
      server: {
        uptimeSeconds,
        uptimeFormatted: formatUptime(uptimeSeconds),
        nodeVersion: process.version,
        memoryUsageMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        memoryTotalMb: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      },
    };
  }),

  // ═══════════════════════════════════════════════════════
  // PARÂMETROS CONFIGURÁVEIS
  // ═══════════════════════════════════════════════════════

  getParametros: adminProcedure
    .input(z.object({ modulo: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });
      if (input?.modulo) {
        return db.select().from(parametros).where(eq(parametros.modulo, input.modulo));
      }
      return db.select().from(parametros);
    }),

  updateParametro: adminProcedure
    .input(z.object({
      id: z.number(),
      valor: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      await db!.update(parametros)
        .set({ valor: input.valor, updatedBy: ctx.user.name })
        .where(eq(parametros.id, input.id));
      return { success: true };
    }),

  createParametro: adminProcedure
    .input(z.object({
      chave: z.string().min(1),
      valor: z.string(),
      tipo: z.enum(["number", "boolean", "string"]),
      modulo: z.string().min(1),
      descricao: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      await db!.insert(parametros).values({
        chave: input.chave,
        valor: input.valor,
        tipo: input.tipo,
        modulo: input.modulo,
        descricao: input.descricao || null,
        updatedBy: ctx.user.name,
      });
      return { success: true };
    }),

  // ═══════════════════════════════════════════════════════
  // LOGS DE ERROS DO SISTEMA
  // ═══════════════════════════════════════════════════════

  /** Lista erros registrados no sistema com filtros */
  listErrors: adminProcedure
    .input(z.object({
      module: z.string().optional(),
      severity: z.enum(["error", "warning", "info"]).optional(),
      resolved: z.boolean().optional(),
      limit: z.number().int().min(1).max(500).optional(),
    }).optional())
    .query(async ({ input }) => {
      return listErrors(input ?? undefined);
    }),

  /** Conta erros nao resolvidos agrupados por modulo */
  countUnresolvedErrors: adminProcedure.query(async () => {
    return countUnresolvedByModule();
  }),

  /** Marca um erro como resolvido com notas opcionais */
  resolveError: adminProcedure
    .input(z.object({
      id: z.number().int().positive(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await resolveError(input.id, input.notes);
      return { success: true };
    }),
});

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  
  return parts.join(" ");
}
