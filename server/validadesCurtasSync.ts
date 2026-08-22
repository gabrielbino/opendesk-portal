/**
 * Validades Curtas — Sync de TODOS os produtos com lote/vencimento.
 *
 * Reutiliza `fetchProdutosEstoque` (mesma query dia_estoque_sc/rs que o
 * Superestocados usa), mas NÃO aplica nenhum filtro de superestocados.
 * Grava na tabela `validades_curtas_itens` todos os produtos que possuem
 * lote com vencimento preenchido e estoqueLote > 0.
 *
 * Fluxo:
 *   1. fetchProdutosEstoque(region) → 4000+ produtos
 *   2. Filtra: codLote preenchido + vencimentoLote preenchido + estoqueLote > 0
 *   3. Upsert na tabela validades_curtas_itens (replace por codigo+region+codLote)
 *   4. Remove itens que não vieram mais na API (produto saiu de estoque)
 */

import { getDb } from "./db";
import { validadesCurtasItens } from "../drizzle/schema";
import { fetchProdutosEstoque } from "./erpQueries";
import { erpApiConfigurada } from "./erpApi";
import { eq, and, notInArray, sql } from "drizzle-orm";
import type { ProdutoEstoqueRow } from "./erpQueries";

type RegionKey = "SC" | "RS";
const REGIOES: RegionKey[] = ["SC", "RS"];

export interface VCSyncResult {
  region: RegionKey;
  totalApi: number;
  comLote: number;
  upserted: number;
  removed: number;
  skipped?: string;
}

/**
 * Sincroniza uma região: busca todos os produtos da API, filtra os que têm
 * lote+vencimento, e faz upsert na tabela validades_curtas_itens.
 */
export async function syncValidadesCurtasRegion(region: RegionKey): Promise<VCSyncResult> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  // 1. Buscar todos os produtos da API
  const produtos = await fetchProdutosEstoque(region);
  if (!produtos.length) {
    return { region, totalApi: 0, comLote: 0, upserted: 0, removed: 0, skipped: "API não retornou produtos" };
  }

  // 2. Filtrar: só quem tem lote + vencimento + estoqueLote > 0
  const comLote = produtos.filter(
    (p): p is ProdutoEstoqueRow & { codLote: string; vencimentoLote: string; estoqueLote: number } =>
      p.codLote !== null &&
      p.codLote.trim() !== "" &&
      p.vencimentoLote !== null &&
      p.vencimentoLote.trim() !== "" &&
      p.estoqueLote !== null &&
      p.estoqueLote > 0
  );

  if (!comLote.length) {
    return { region, totalApi: produtos.length, comLote: 0, upserted: 0, removed: 0, skipped: "Nenhum produto com lote/vencimento" };
  }

  // 3. Upsert em lotes de 100 (para não estourar o tamanho do SQL)
  const BATCH_SIZE = 100;
  let upserted = 0;
  const codigosLotesVivos: string[] = []; // "codigo-codLote" para controle de remoção

  for (let i = 0; i < comLote.length; i += BATCH_SIZE) {
    const batch = comLote.slice(i, i + BATCH_SIZE);

    await db
      .insert(validadesCurtasItens)
      .values(
        batch.map((p) => ({
          codigo: p.codigo,
          region,
          tipoProduto: p.tipoProduto,
          nomeProduto: p.nomeProduto,
          fornecedor: p.fornecedor,
          codLote: p.codLote,
          vencimentoLote: p.vencimentoLote,
          estoqueLote: p.estoqueLote,
          estoqueTotal: p.estoqueAtual,
          vendaMedia: p.vendaMedia,
          valorCusto: p.valorCusto,
          valorEstoqueCusto: p.valorEstoqueCusto,
          diasEstoque: p.diasEstoque,
          dataUltimaCompra: p.dataUltimaCompra,
          syncedAt: new Date(),
        }))
      )
      .onDuplicateKeyUpdate({
        set: {
          tipoProduto: sql`VALUES(vcTipoProduto)`,
          nomeProduto: sql`VALUES(nomeProduto)`,
          fornecedor: sql`VALUES(fornecedor)`,
          vencimentoLote: sql`VALUES(vencimentoLote)`,
          estoqueLote: sql`VALUES(estoqueLote)`,
          estoqueTotal: sql`VALUES(estoqueTotal)`,
          vendaMedia: sql`VALUES(vendaMedia)`,
          valorCusto: sql`VALUES(valorCusto)`,
          valorEstoqueCusto: sql`VALUES(valorEstoqueCusto)`,
          diasEstoque: sql`VALUES(diasEstoque)`,
          dataUltimaCompra: sql`VALUES(dataUltimaCompra)`,
          syncedAt: sql`VALUES(syncedAt)`,
        },
      });

    upserted += batch.length;
    for (const p of batch) {
      codigosLotesVivos.push(`${p.codigo}-${p.codLote}`);
    }
  }

  // 4. Remover itens da região que não vieram mais na API (estoque zerou ou produto saiu)
  // Buscar todos os IDs atuais da região
  const existentes = await db
    .select({ id: validadesCurtasItens.id, codigo: validadesCurtasItens.codigo, codLote: validadesCurtasItens.codLote })
    .from(validadesCurtasItens)
    .where(eq(validadesCurtasItens.region, region));

  const vivosSet = new Set(codigosLotesVivos);
  const idsParaRemover = existentes
    .filter((e) => !vivosSet.has(`${e.codigo}-${e.codLote}`))
    .map((e) => e.id);

  let removed = 0;
  if (idsParaRemover.length > 0) {
    // Remover em lotes
    for (let i = 0; i < idsParaRemover.length; i += BATCH_SIZE) {
      const batch = idsParaRemover.slice(i, i + BATCH_SIZE);
      await db.delete(validadesCurtasItens).where(
        and(
          eq(validadesCurtasItens.region, region),
          notInArray(validadesCurtasItens.id, existentes.filter(e => vivosSet.has(`${e.codigo}-${e.codLote}`)).map(e => e.id))
        )
      );
      removed += batch.length;
      break; // Só precisa executar uma vez com a condição correta
    }
    // Abordagem mais simples: deletar os IDs específicos
    removed = 0;
    for (let i = 0; i < idsParaRemover.length; i += BATCH_SIZE) {
      const batch = idsParaRemover.slice(i, i + BATCH_SIZE);
      await db.delete(validadesCurtasItens).where(
        sql`${validadesCurtasItens.id} IN (${sql.join(batch.map(id => sql`${id}`), sql`, `)})`
      );
      removed += batch.length;
    }
  }

  return { region, totalApi: produtos.length, comLote: comLote.length, upserted, removed };
}

/**
 * Sincroniza todas as regiões. Não aborta tudo se uma região falhar.
 */
export async function syncAllValidadesCurtas(): Promise<{ ok: boolean; resultados: VCSyncResult[] }> {
  if (!erpApiConfigurada()) {
    throw new Error("API Erp não configurada (defina ERP_API_URL, ERP_API_USER, ERP_API_SENHA).");
  }

  const resultados: VCSyncResult[] = [];
  let ok = true;

  for (const region of REGIOES) {
    try {
      resultados.push(await syncValidadesCurtasRegion(region));
    } catch (error) {
      ok = false;
      resultados.push({
        region,
        totalApi: 0,
        comLote: 0,
        upserted: 0,
        removed: 0,
        skipped: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { ok, resultados };
}
