/**
 * Camada de dados da Compradores (compartilhada — painéis de estoque).
 *
 * Registro ÚNICO comprador↔marca. Marca = nome do Fornecedor como vem da base
 * `dia_estoque`. Cada marca em UM só comprador (UNIQUE em gn_comprador_marcas.marca).
 * O catálogo `gn_marcas` alimenta o dropdown de atribuição (todas as marcas da base).
 */

import { asc, eq, sql } from "drizzle-orm";

import { gnCompradores, gnCompradorMarcas, gnMarcas } from "../../drizzle/schema";
import { getDb } from "../db";
import { normMarcaKey } from "./marcaAliases";
import { fetchProdutosEstoque } from "../erpQueries";

export type CompradorResumo = { id: number; nome: string; ativo: boolean; qtdMarcas: number };
export type MarcaComComprador = { marca: string; compradorId: number | null; compradorNome: string | null };

// ─── Lente compartilhada marca → comprador ───────────────────────────────────
// Reutilizável por QUALQUER painel de estoque (Superestocados, Rupturas, Validades Curtas,
// Modo TV) — a "Camada 2" da Compradores. Cacheada (TTL curto; muda raramente).
const TTL_MAPA_MS = 60_000;
let cacheMapa: { at: number; map: Map<string, { compradorId: number; nome: string }> } | null = null;

/** Descarta o cache do mapa (usar após reatribuir marcas no mesmo processo). */
export function invalidarMapaMarcaComprador(): void {
  cacheMapa = null;
}

/**
 * Mapa marca(normalizada) → comprador. A chave usa `normMarcaKey` (mesma normalização dos
 * aliases), então bate com o `fornecedor` canônico dos itens dos painéis. Marca sem vínculo
 * simplesmente não está no mapa (→ "Não atribuído" na UI).
 */
export async function getMapaMarcaComprador(): Promise<Map<string, { compradorId: number; nome: string }>> {
  const agora = Date.now();
  if (cacheMapa && agora - cacheMapa.at < TTL_MAPA_MS) return cacheMapa.map;
  const db = await getDb();
  const map = new Map<string, { compradorId: number; nome: string }>();
  if (db) {
    const rows = await db
      .select({ marca: gnCompradorMarcas.marca, compradorId: gnCompradorMarcas.compradorId, nome: gnCompradores.nome })
      .from(gnCompradorMarcas)
      .innerJoin(gnCompradores, eq(gnCompradores.id, gnCompradorMarcas.compradorId));
    for (const r of rows) map.set(normMarcaKey(r.marca), { compradorId: r.compradorId, nome: r.nome });
  }
  cacheMapa = { at: agora, map };
  return map;
}

/** Lista compradores + quantas marcas cada um tem. */
export async function listCompradores(): Promise<CompradorResumo[]> {
  const db = await getDb();
  if (!db) return [];
  const compradores = await db.select().from(gnCompradores).orderBy(asc(gnCompradores.nome));
  const vinculos = await db.select({ compradorId: gnCompradorMarcas.compradorId }).from(gnCompradorMarcas);
  const contagem = new Map<number, number>();
  for (const v of vinculos) contagem.set(v.compradorId, (contagem.get(v.compradorId) ?? 0) + 1);
  return compradores.map((c) => ({ id: c.id, nome: c.nome, ativo: Boolean(c.ativo), qtdMarcas: contagem.get(c.id) ?? 0 }));
}

export async function createComprador(nome: string): Promise<{ id: number; nome: string }> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const limpo = nome.trim();
  if (!limpo) throw new Error("Nome do comprador é obrigatório.");
  const [existe] = await db.select({ id: gnCompradores.id }).from(gnCompradores).where(eq(gnCompradores.nome, limpo)).limit(1);
  if (existe) throw new Error("Já existe um comprador com esse nome.");
  await db.insert(gnCompradores).values({ nome: limpo });
  const [row] = await db.select().from(gnCompradores).where(eq(gnCompradores.nome, limpo)).limit(1);
  return { id: row.id, nome: row.nome };
}

export async function renameComprador(id: number, nome: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const limpo = nome.trim();
  if (!limpo) throw new Error("Nome do comprador é obrigatório.");
  await db.update(gnCompradores).set({ nome: limpo }).where(eq(gnCompradores.id, id));
}

/** Exclui o comprador; os vínculos de marca caem por FK cascade (marcas ficam livres). */
export async function deleteComprador(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await db.delete(gnCompradores).where(eq(gnCompradores.id, id));
}

/** Vínculo atual de uma marca (ou null se livre). */
export async function getMarcaVinculo(marca: string): Promise<{ compradorId: number; compradorNome: string } | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ compradorId: gnCompradorMarcas.compradorId, compradorNome: gnCompradores.nome })
    .from(gnCompradorMarcas)
    .innerJoin(gnCompradores, eq(gnCompradores.id, gnCompradorMarcas.compradorId))
    .where(eq(gnCompradorMarcas.marca, marca.trim()))
    .limit(1);
  return rows[0] ?? null;
}

/** Vincula a marca a um comprador (assume que já foi checada a unicidade no router). */
export async function setMarcaComprador(marca: string, compradorId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const m = marca.trim();
  await db
    .insert(gnCompradorMarcas)
    .values({ marca: m, compradorId })
    .onDuplicateKeyUpdate({ set: { compradorId, updatedAt: sql`CURRENT_TIMESTAMP` } });
  // Garante a marca no catálogo (caso venha de fora do sync).
  await db
    .insert(gnMarcas)
    .values({ marca: m })
    .onDuplicateKeyUpdate({ set: { updatedAt: sql`CURRENT_TIMESTAMP` } });
}

/** Desvincula a marca de qualquer comprador (marca volta a ficar livre). */
export async function desvincularMarca(marca: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await db.delete(gnCompradorMarcas).where(eq(gnCompradorMarcas.marca, marca.trim()));
}

/**
 * Todas as marcas do catálogo + o comprador atual de cada (null = livre). Alimenta a
 * tela de gestão. Também inclui marcas que já têm vínculo mas não estão no catálogo.
 */
export async function listMarcas(): Promise<MarcaComComprador[]> {
  const db = await getDb();
  if (!db) return [];
  const catalogo = await db.select({ marca: gnMarcas.marca }).from(gnMarcas);
  const vinculos = await db
    .select({ marca: gnCompradorMarcas.marca, compradorId: gnCompradorMarcas.compradorId, compradorNome: gnCompradores.nome })
    .from(gnCompradorMarcas)
    .innerJoin(gnCompradores, eq(gnCompradores.id, gnCompradorMarcas.compradorId));
  const vinPorMarca = new Map(vinculos.map((v) => [v.marca, v]));

  const nomes = new Set<string>(catalogo.map((c) => c.marca));
  for (const v of vinculos) nomes.add(v.marca); // marcas vinculadas fora do catálogo

  return Array.from(nomes)
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .map((marca) => {
      const v = vinPorMarca.get(marca);
      return { marca, compradorId: v?.compradorId ?? null, compradorNome: v?.compradorNome ?? null };
    });
}

/**
 * Sincroniza o catálogo de marcas a partir da base `dia_estoque` (SC + RS): pega os
 * Fornecedores DISTINTOS e faz upsert em gn_marcas. Não apaga (só adiciona/atualiza).
 */
export async function syncMarcasCatalogo(): Promise<{ total: number }> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const [sc, rs] = await Promise.all([fetchProdutosEstoque("SC"), fetchProdutosEstoque("RS")]);
  const marcas = new Set<string>();
  for (const p of [...sc, ...rs]) {
    const nome = (p.fornecedor ?? "").trim();
    if (nome) marcas.add(nome);
  }
  const lista = Array.from(marcas);
  if (lista.length) {
    await db
      .insert(gnMarcas)
      .values(lista.map((marca) => ({ marca })))
      .onDuplicateKeyUpdate({ set: { updatedAt: sql`CURRENT_TIMESTAMP` } });
  }
  return { total: lista.length };
}
