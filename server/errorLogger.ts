import { getDb } from "./db";
import { systemErrorLogs } from "../drizzle/schema";
import { desc, eq, and, sql } from "drizzle-orm";

/**
 * Servico de logging de erros do sistema.
 * Registra erros no banco de dados para analise pela equipe de TI.
 *
 * Uso:
 * ```ts
 * import { logError } from "../errorLogger";
 * try { ... } catch (err) {
 *   await logError({
 *     module: "repasses",
 *     operation: "createContrato",
 *     error: err,
 *     context: { input, userId },
 *   });
 * }
 * ```
 */

export interface LogErrorInput {
  module: string;
  operation: string;
  error: unknown;
  context?: Record<string, unknown>;
  severity?: "error" | "warning" | "info";
  userId?: number | null;
  userName?: string | null;
}

/**
 * Registra um erro no banco de dados.
 * Nunca lanca excecao — falhas de logging sao silenciosas para nao afetar o fluxo principal.
 */
export async function logError(input: LogErrorInput): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    const err = input.error instanceof Error ? input.error : new Error(String(input.error));

    // Sanitizar contexto para evitar dados muito grandes (max 10KB)
    let contextStr: string | null = null;
    if (input.context) {
      try {
        const raw = JSON.stringify(input.context);
        contextStr = raw.length > 10240 ? raw.slice(0, 10240) + "...[truncated]" : raw;
      } catch {
        contextStr = "[context serialization failed]";
      }
    }

    await db.insert(systemErrorLogs).values({
      module: input.module,
      operation: input.operation,
      errorMessage: err.message || "Unknown error",
      stackTrace: err.stack || null,
      context: contextStr ? JSON.parse(contextStr) : null,
      severity: input.severity || "error",
      resolved: 0,
      userId: input.userId ?? null,
      userName: input.userName ?? null,
      createdAt: Date.now(),
    });
  } catch (logErr) {
    // Logging nunca deve quebrar o fluxo principal
    console.error("[ErrorLogger] Falha ao registrar erro:", logErr);
  }
}

/**
 * Lista erros do sistema com filtros opcionais.
 */
export async function listErrors(filters?: {
  module?: string;
  severity?: "error" | "warning" | "info";
  resolved?: boolean;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions: any[] = [];
  if (filters?.module) conditions.push(eq(systemErrorLogs.module, filters.module));
  if (filters?.severity) conditions.push(eq(systemErrorLogs.severity, filters.severity));
  if (filters?.resolved !== undefined) {
    conditions.push(eq(systemErrorLogs.resolved, filters.resolved ? 1 : 0));
  }

  return db
    .select()
    .from(systemErrorLogs)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(systemErrorLogs.createdAt))
    .limit(filters?.limit ?? 100);
}

/**
 * Marca um erro como resolvido.
 */
export async function resolveError(id: number, notes?: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db
    .update(systemErrorLogs)
    .set({
      resolved: 1,
      resolutionNotes: notes || null,
      resolvedAt: Date.now(),
    })
    .where(eq(systemErrorLogs.id, id));
}

/**
 * Conta erros nao resolvidos por modulo.
 */
export async function countUnresolvedByModule() {
  const db = await getDb();
  if (!db) return [];

  return db
    .select({
      module: systemErrorLogs.module,
      count: sql<number>`COUNT(*)`,
    })
    .from(systemErrorLogs)
    .where(eq(systemErrorLogs.resolved, 0))
    .groupBy(systemErrorLogs.module);
}
