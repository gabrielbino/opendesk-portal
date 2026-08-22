/**
 * Camada de dados do painel de Rupturas (Gestão de Negócios).
 *
 * Fonte: sync da API OpenDesk (server/rupturasApiSync.ts) persiste, por região:
 *   - rupturas_produtos     → itens EM RUPTURA (zerado OU < 7 dias);
 *   - rupturas_marca_resumo → agregado por marca (total de ativos = denominador da %).
 * O vínculo marca → comprador fica em rupturas_compradores (editável pelo usuário).
 *
 * A % de ruptura é calculada na LEITURA (fórmula centralizada, fácil de ajustar):
 *   pct = (qtdRuptura / totalAtivos) * 100
 */

import { eq, inArray, sql } from "drizzle-orm";

import { rupturasCompradores, rupturasMarcaResumo, rupturasProdutos, gnCompradorMarcas, gnCompradores } from "../../drizzle/schema";
import { getDb } from "../db";
import { toUtcTimestampMs, type RegionKey, type RegionView, type TipoProduto } from "../superestocadosDataset";

/** Limiar de ruptura: produto com menos de 7 dias de estoque (ou zerado). */
export const DIAS_RUPTURA = 7;

/**
 * Normaliza o nome da marca/fornecedor para casar o vínculo do comprador de forma
 * tolerante a maiúsculas/espaços (o TEXTO ainda precisa ser o mesmo da API).
 */
function normFornecedor(s: string): string {
  return s.trim().toUpperCase();
}

export type RupturaItemInput = {
  codigo: number;
  fornecedor: string;
  nomeProduto: string;
  tipoProduto: TipoProduto;
  diasEstoque: number;
  estoqueAtual: number;
  vendaMedia: number;
  valorCusto: number | null;
};

export type MarcaResumoInput = {
  fornecedor: string;
  totalAtivos: number;
  qtdRuptura: number;
  qtdZerados: number;
};

export type RupturaItem = {
  codigo: number;
  region: RegionKey;
  fornecedor: string;
  nomeProduto: string;
  tipoProduto: TipoProduto;
  diasEstoque: number;
  estoqueAtual: number;
  vendaMedia: number;
  valorCusto: number | null;
  /** Estoque zerado (destaque vermelho na UI). */
  zerado: boolean;
};

export type RupturaMarca = {
  fornecedor: string;
  comprador: string | null;
  totalAtivos: number;
  qtdRuptura: number;
  qtdZerados: number;
  pctRuptura: number;
  itens: RupturaItem[];
};

export type RupturasDashboardData = {
  region: RegionView;
  marcas: RupturaMarca[];
  summary: {
    totalItens: number;
    totalZerados: number;
    totalMarcas: number;
    ultimaAtualizacaoMs: number | null;
  };
};

export type RupturaRankingRow = {
  fornecedor: string;
  comprador: string | null;
  totalAtivos: number;
  qtdRuptura: number;
  qtdZerados: number;
  pctRuptura: number;
};

/** % de ruptura de uma marca (0–100). Guarda contra divisão por zero. */
export function calcPctRuptura(qtdRuptura: number, totalAtivos: number): number {
  if (!totalAtivos || totalAtivos <= 0) return 0;
  return (qtdRuptura / totalAtivos) * 100;
}

function regionsToLoad(region: RegionView): RegionKey[] {
  return region === "UNIFICADO" ? ["SC", "RS"] : [region];
}

/**
 * Substitui (replace) os dados de ruptura de UMA região — idempotente. Cada sync
 * reescreve detalhe + resumo da região.
 */
export async function replaceRegionalRupturas(
  region: RegionKey,
  itens: RupturaItemInput[],
  resumo: MarcaResumoInput[],
) {
  const db = await getDb();
  if (!db) {
    throw new Error("Banco de dados indisponível para persistir as rupturas.");
  }

  await db.delete(rupturasProdutos).where(eq(rupturasProdutos.region, region));
  await db.delete(rupturasMarcaResumo).where(eq(rupturasMarcaResumo.region, region));

  if (itens.length) {
    await db.insert(rupturasProdutos).values(
      itens.map((i) => ({
        codigo: i.codigo,
        region,
        fornecedor: i.fornecedor,
        nomeProduto: i.nomeProduto,
        tipoProduto: i.tipoProduto,
        diasEstoque: i.diasEstoque,
        estoqueAtual: i.estoqueAtual,
        vendaMedia: i.vendaMedia,
        valorCusto: i.valorCusto,
      })),
    );
  }

  if (resumo.length) {
    await db.insert(rupturasMarcaResumo).values(
      resumo.map((r) => ({
        region,
        fornecedor: r.fornecedor,
        totalAtivos: r.totalAtivos,
        qtdRuptura: r.qtdRuptura,
        qtdZerados: r.qtdZerados,
      })),
    );
  }

  return { itens: itens.length, marcas: resumo.length };
}

async function loadCompradoresMap(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
): Promise<Map<string, string>> {
  // Fonte ÚNICA: registro compartilhado de compradores (gn_*). A edição é feita na tela
  // /compradores (submódulo Compradores), não mais no rupturas_compradores.
  const rows = await db
    .select({ marca: gnCompradorMarcas.marca, comprador: gnCompradores.nome })
    .from(gnCompradorMarcas)
    .innerJoin(gnCompradores, eq(gnCompradores.id, gnCompradorMarcas.compradorId));
  return new Map(rows.map((r) => [normFornecedor(r.marca), r.comprador]));
}

/**
 * Dashboard operacional: itens em ruptura agrupados por marca, com comprador e % de
 * ruptura. UNIFICADO agrega por marca somando SC + RS (cada item mantém sua região).
 */
export async function getRupturasDashboard(region: RegionView): Promise<RupturasDashboardData> {
  const db = await getDb();
  if (!db) {
    return {
      region,
      marcas: [],
      summary: { totalItens: 0, totalZerados: 0, totalMarcas: 0, ultimaAtualizacaoMs: null },
    };
  }

  const regions = regionsToLoad(region);
  const compradores = await loadCompradoresMap(db);

  const resumoRows = await db
    .select()
    .from(rupturasMarcaResumo)
    .where(inArray(rupturasMarcaResumo.region, regions));

  const itemRows = await db
    .select()
    .from(rupturasProdutos)
    .where(inArray(rupturasProdutos.region, regions));

  // Agrega resumo por marca (soma entre regiões no unificado).
  const marcaMap = new Map<string, RupturaMarca>();
  const ensureMarca = (fornecedor: string): RupturaMarca => {
    let m = marcaMap.get(fornecedor);
    if (!m) {
      m = {
        fornecedor,
        comprador: compradores.get(normFornecedor(fornecedor)) ?? null,
        totalAtivos: 0,
        qtdRuptura: 0,
        qtdZerados: 0,
        pctRuptura: 0,
        itens: [],
      };
      marcaMap.set(fornecedor, m);
    }
    return m;
  };

  for (const r of resumoRows) {
    const m = ensureMarca(r.fornecedor);
    m.totalAtivos += r.totalAtivos;
    m.qtdRuptura += r.qtdRuptura;
    m.qtdZerados += r.qtdZerados;
  }

  for (const it of itemRows) {
    const m = ensureMarca(it.fornecedor);
    m.itens.push({
      codigo: it.codigo,
      region: it.region as RegionKey,
      fornecedor: it.fornecedor,
      nomeProduto: it.nomeProduto,
      tipoProduto: it.tipoProduto as TipoProduto,
      diasEstoque: it.diasEstoque,
      estoqueAtual: it.estoqueAtual,
      vendaMedia: it.vendaMedia,
      valorCusto: it.valorCusto,
      zerado: it.estoqueAtual <= 0,
    });
  }

  // Só marcas COM itens em ruptura (zerado ou < 7 dias). O resumo guarda TODAS as marcas
  // (denominador da % + universo da tela "Compradores"); o painel exibe apenas as afetadas.
  const marcas = Array.from(marcaMap.values()).filter((m) => m.itens.length > 0);
  for (const m of marcas) {
    m.pctRuptura = calcPctRuptura(m.qtdRuptura, m.totalAtivos);
    // Itens: zerados primeiro, depois menor dias de estoque.
    m.itens.sort((a, b) => {
      if (a.zerado !== b.zerado) return a.zerado ? -1 : 1;
      return a.diasEstoque - b.diasEstoque;
    });
  }
  // Marcas: maior % primeiro, desempate por quantidade de itens em ruptura.
  marcas.sort((a, b) => b.pctRuptura - a.pctRuptura || b.qtdRuptura - a.qtdRuptura);

  const ultimaAtualizacaoMs = itemRows.reduce<number | null>((acc, it) => {
    const ms = toUtcTimestampMs(it.updatedAt);
    return ms !== null && (acc === null || ms > acc) ? ms : acc;
  }, null);

  return {
    region,
    marcas,
    summary: {
      totalItens: marcas.reduce((s, m) => s + m.itens.length, 0),
      totalZerados: marcas.reduce((s, m) => s + m.qtdZerados, 0),
      totalMarcas: marcas.length,
      ultimaAtualizacaoMs,
    },
  };
}

/**
 * Ranking estratégico (visão de TV): marcas com ruptura, ordenadas pela maior % de
 * ruptura, limitado ao topN. Só agregados — não carrega os itens.
 */
export async function getRupturasRanking(
  region: RegionView,
  topN: number,
): Promise<{ marcas: RupturaRankingRow[]; ultimaAtualizacaoMs: number | null }> {
  const db = await getDb();
  if (!db) return { marcas: [], ultimaAtualizacaoMs: null };

  const regions = regionsToLoad(region);
  const compradores = await loadCompradoresMap(db);

  const resumoRows = await db
    .select()
    .from(rupturasMarcaResumo)
    .where(inArray(rupturasMarcaResumo.region, regions));

  const ultimaAtualizacaoMs = resumoRows.reduce<number | null>((acc, r) => {
    const ms = toUtcTimestampMs(r.updatedAt);
    return ms !== null && (acc === null || ms > acc) ? ms : acc;
  }, null);

  const marcaMap = new Map<string, RupturaRankingRow>();
  for (const r of resumoRows) {
    let m = marcaMap.get(r.fornecedor);
    if (!m) {
      m = {
        fornecedor: r.fornecedor,
        comprador: compradores.get(normFornecedor(r.fornecedor)) ?? null,
        totalAtivos: 0,
        qtdRuptura: 0,
        qtdZerados: 0,
        pctRuptura: 0,
      };
      marcaMap.set(r.fornecedor, m);
    }
    m.totalAtivos += r.totalAtivos;
    m.qtdRuptura += r.qtdRuptura;
    m.qtdZerados += r.qtdZerados;
  }

  const marcas = Array.from(marcaMap.values())
    .map((m) => ({ ...m, pctRuptura: calcPctRuptura(m.qtdRuptura, m.totalAtivos) }))
    .filter((m) => m.qtdRuptura > 0)
    .sort((a, b) => b.pctRuptura - a.pctRuptura || b.qtdRuptura - a.qtdRuptura)
    .slice(0, Math.max(1, topN));

  return { marcas, ultimaAtualizacaoMs };
}

/**
 * Lista todas as marcas conhecidas (do resumo) com o comprador atual (se houver) —
 * alimenta a tela de edição de compradores.
 */
export async function listCompradores(): Promise<Array<{ fornecedor: string; comprador: string | null }>> {
  const db = await getDb();
  if (!db) return [];

  const marcaRows = await db
    .selectDistinct({ fornecedor: rupturasMarcaResumo.fornecedor })
    .from(rupturasMarcaResumo);
  const compradorRows = await db
    .select({ fornecedor: rupturasCompradores.fornecedor, comprador: rupturasCompradores.comprador })
    .from(rupturasCompradores);

  const compMap = new Map(compradorRows.map((r) => [normFornecedor(r.fornecedor), r.comprador]));

  // Nome de exibição por chave normalizada: prioriza o nome REAL da API (resumo);
  // inclui nomes só-da-planilha que ainda não casaram, para o usuário corrigir.
  const display = new Map<string, string>();
  for (const r of marcaRows) display.set(normFornecedor(r.fornecedor), r.fornecedor);
  for (const r of compradorRows) {
    const k = normFornecedor(r.fornecedor);
    if (!display.has(k)) display.set(k, r.fornecedor);
  }

  return Array.from(display.entries())
    .map(([k, fornecedor]) => ({ fornecedor, comprador: compMap.get(k) ?? null }))
    .sort((a, b) => a.fornecedor.localeCompare(b.fornecedor, "pt-BR"));
}

/**
 * Define/atualiza o comprador de uma marca. Comprador vazio remove o vínculo.
 */
export async function upsertComprador(fornecedor: string, comprador: string) {
  const db = await getDb();
  if (!db) {
    throw new Error("Banco de dados indisponível para salvar o comprador.");
  }

  const marca = fornecedor.trim();
  const nome = comprador.trim();
  if (!marca) {
    throw new Error("Marca/fornecedor é obrigatório.");
  }

  if (!nome) {
    await db.delete(rupturasCompradores).where(eq(rupturasCompradores.fornecedor, marca));
    return { fornecedor: marca, comprador: null };
  }

  await db
    .insert(rupturasCompradores)
    .values({ fornecedor: marca, comprador: nome })
    .onDuplicateKeyUpdate({
      set: { comprador: nome, updatedAt: sql`CURRENT_TIMESTAMP` },
    });

  return { fornecedor: marca, comprador: nome };
}
