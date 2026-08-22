import { eq } from "drizzle-orm";
import { parametros } from "../../drizzle/schema";
import { getDb } from "../db";

/**
 * Cache em memória para parâmetros do sistema.
 * Evita consultas repetidas ao banco para cada operação.
 * TTL de 5 minutos — após isso, recarrega do banco.
 */
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

let cache: Map<string, { valor: string; tipo: string }> = new Map();
let cacheLoadedAt = 0;

/**
 * Carrega todos os parâmetros do banco para o cache em memória.
 */
async function loadCache(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const rows = await db.select().from(parametros);
  cache = new Map();
  for (const row of rows) {
    cache.set(row.chave, { valor: row.valor, tipo: row.tipo });
  }
  cacheLoadedAt = Date.now();
}

/**
 * Verifica se o cache está expirado e recarrega se necessário.
 */
async function ensureCache(): Promise<void> {
  if (Date.now() - cacheLoadedAt > CACHE_TTL_MS || cache.size === 0) {
    await loadCache();
  }
}

/**
 * Invalida o cache manualmente (chamar após atualizar parâmetros).
 */
export function invalidateParametrosCache(): void {
  cacheLoadedAt = 0;
}

/**
 * Obtém um parâmetro numérico do cache.
 * Retorna o defaultValue se o parâmetro não existir.
 */
export async function getParamNumber(chave: string, defaultValue: number): Promise<number> {
  await ensureCache();
  const entry = cache.get(chave);
  if (!entry) return defaultValue;
  const parsed = Number(entry.valor);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Obtém um parâmetro booleano do cache.
 * Retorna o defaultValue se o parâmetro não existir.
 */
export async function getParamBoolean(chave: string, defaultValue: boolean): Promise<boolean> {
  await ensureCache();
  const entry = cache.get(chave);
  if (!entry) return defaultValue;
  return entry.valor === "true" || entry.valor === "1";
}

/**
 * Obtém um parâmetro string do cache.
 * Retorna o defaultValue se o parâmetro não existir.
 */
export async function getParamString(chave: string, defaultValue: string): Promise<string> {
  await ensureCache();
  const entry = cache.get(chave);
  if (!entry) return defaultValue;
  return entry.valor;
}

/**
 * Obtém todos os parâmetros de um módulo específico.
 */
export async function getParamsByModule(modulo: string): Promise<Array<{ chave: string; valor: string; tipo: string; descricao: string | null }>> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(parametros).where(eq(parametros.modulo, modulo));
  return rows.map((r) => ({ chave: r.chave, valor: r.valor, tipo: r.tipo, descricao: r.descricao }));
}

/**
 * Atualiza o valor de um parâmetro existente.
 */
export async function updateParam(chave: string, valor: string, updatedBy?: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result = await db
    .update(parametros)
    .set({ valor, updatedBy: updatedBy ?? null })
    .where(eq(parametros.chave, chave));
  invalidateParametrosCache();
  return (result as any)[0]?.affectedRows > 0;
}

/**
 * Insere ou atualiza um parâmetro (upsert).
 */
export async function upsertParam(data: {
  chave: string;
  valor: string;
  tipo?: "number" | "boolean" | "string";
  modulo?: string;
  descricao?: string;
  updatedBy?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(parametros).where(eq(parametros.chave, data.chave));
  if (existing.length > 0) {
    await db
      .update(parametros)
      .set({
        valor: data.valor,
        tipo: data.tipo ?? existing[0].tipo,
        modulo: data.modulo ?? existing[0].modulo,
        descricao: data.descricao ?? existing[0].descricao,
        updatedBy: data.updatedBy ?? null,
      })
      .where(eq(parametros.chave, data.chave));
  } else {
    await db.insert(parametros).values({
      chave: data.chave,
      valor: data.valor,
      tipo: data.tipo ?? "string",
      modulo: data.modulo ?? "geral",
      descricao: data.descricao ?? null,
      updatedBy: data.updatedBy ?? null,
    });
  }
  invalidateParametrosCache();
}

/**
 * Carrega todos os parâmetros do módulo superestocados com valores padrão.
 * Usado para obter todos os parâmetros de uma vez (mais eficiente).
 */
export async function getSuperestocadosParams() {
  await ensureCache();
  return {
    DIAS_ESTOQUE_ENTRADA: await getParamNumber("DIAS_ESTOQUE_ENTRADA", 90),
    DIAS_ESTOQUE_SAIDA_MEDICAMENTO: await getParamNumber("DIAS_ESTOQUE_SAIDA_MEDICAMENTO", 60),
    DIAS_ESTOQUE_SAIDA_NAO_MEDICAMENTO: await getParamNumber("DIAS_ESTOQUE_SAIDA_NAO_MEDICAMENTO", 45),
    DIAS_CADASTRO_MINIMO: await getParamNumber("DIAS_CADASTRO_MINIMO", 60),
    SLOTS_POR_REGIAO_TIPO: await getParamNumber("SLOTS_POR_REGIAO_TIPO", 50),
    ZERADO_SLOTS_POR_REGIAO: await getParamNumber("ZERADO_SLOTS_POR_REGIAO", 10),
    VENDA_MEDIA_MINIMA: await getParamNumber("VENDA_MEDIA_MINIMA", 1),
    MESES_ESTOQUE_IDEAL: await getParamNumber("MESES_ESTOQUE_IDEAL", 2),
    DIAS_SEM_VENDA_ALERTA: await getParamNumber("DIAS_SEM_VENDA_ALERTA", 3),
    ROTATIVIDADE_SEMANA: await getParamNumber("ROTATIVIDADE_SEMANA", 3),
    ROTATIVIDADE_DIA_UTIL: await getParamBoolean("ROTATIVIDADE_DIA_UTIL", true),
  };
}

/**
 * Carrega todos os parâmetros do módulo Validades Curtas com valores padrão.
 * Limites das bandas e janela de risco são editáveis via Admin > Parâmetros.
 */
export async function getValidadesCurtasParams() {
  await ensureCache();
  return {
    VC_DESCARTE_ATE: await getParamNumber("VC_DESCARTE_ATE", 90),
    VC_BONIFICAVEL_ATE: await getParamNumber("VC_BONIFICAVEL_ATE", 120),
    VC_ALTO_RISCO_ATE: await getParamNumber("VC_ALTO_RISCO_ATE", 180),
    VC_ALERTA_ATE: await getParamNumber("VC_ALERTA_ATE", 270),
    VC_ATENCAO_ATE: await getParamNumber("VC_ATENCAO_ATE", 360),
    VC_JANELA_RISCO_DIAS: await getParamNumber("VC_JANELA_RISCO_DIAS", 180),
  };
}
