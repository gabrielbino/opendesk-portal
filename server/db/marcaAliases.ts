/**
 * De/para de normalização de marca (compartilhado). Uma variante de razão social
 * aponta para a razão social CANÔNICA definida pelo comercial (tabela gn_marca_aliases).
 *
 * É aplicado na REGRA ÚNICA de marca (`fetchProdutosEstoque`), então vale para o
 * catálogo de compradores e para todos os painéis de estoque de uma vez (DRY).
 *
 * O mapa é cacheado em memória (TTL curto) — a tabela muda raramente (decisão do
 * comercial). Sem banco, devolve mapa vazio (nenhuma normalização) — não quebra
 * scripts/diagnósticos que rodam sem DB.
 */

import { gnMarcaAliases } from "../../drizzle/schema";
import { getDb } from "../db";

/** Chave de casamento tolerante a caixa/espaços (o texto ainda precisa ser o mesmo da base). */
export function normMarcaKey(s: string): string {
  return s.trim().toUpperCase();
}

const TTL_MS = 60_000;
let cache: { map: Map<string, string>; at: number } | null = null;

/** Carrega o de/para (variante normalizada → canônica). Cacheado por TTL_MS. */
export async function loadMarcaAliases(): Promise<Map<string, string>> {
  const agora = Date.now();
  if (cache && agora - cache.at < TTL_MS) return cache.map;
  const db = await getDb();
  const map = new Map<string, string>();
  if (db) {
    const rows = await db.select({ variante: gnMarcaAliases.variante, canonica: gnMarcaAliases.canonica }).from(gnMarcaAliases);
    for (const r of rows) map.set(normMarcaKey(r.variante), r.canonica);
  }
  cache = { map, at: agora };
  return map;
}

/** Descarta o cache (usar após semear/editar aliases no mesmo processo). */
export function invalidarMarcaAliases(): void {
  cache = null;
}

/** Devolve a razão canônica para a marca, se houver alias; senão a própria marca. */
export function canonizarMarca(nome: string, aliases: Map<string, string>): string {
  return aliases.get(normMarcaKey(nome)) ?? nome;
}
