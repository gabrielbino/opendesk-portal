import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, notInArray, sql } from "drizzle-orm";

import { campanhaHistorico, historicoVendas, loteSuperestoque, superestoque, superestocadosPermanencia, superestocadosResumoSemanal } from "../../drizzle/schema";
import { getDb } from "../db";
import {
  formatDayMonthLabelFromIso,
  normalizeIsoDateString,
  toUtcTimestampMs,
  type LoteInfo,
  type LoteUploadRow,
  type ProductPanoramaData,
  type RegionDashboardData,
  type RegionKey,
  type RegionStatus,
  type RegionView,
  type TipoProduto,
  type VendaUploadRow,
} from "../superestocadosDataset";
import type { CsvRotationRow } from "../superestocadosConnectorIngestion";
import { excessoReaisSuperestocado, reducaoExcessoPct } from "@shared/superestocados";
import { getMapaMarcaComprador } from "./compradores";
import { normMarcaKey } from "./marcaAliases";

const EMPTY_REGION_STATUS: Record<RegionKey, RegionStatus> = {
  SC: {
    totalProdutos: 0,
    ultimaAtualizacaoMs: null,
    ultimoUploadVendasMs: null,
  },
  RS: {
    totalProdutos: 0,
    ultimaAtualizacaoMs: null,
    ultimoUploadVendasMs: null,
  },
};

async function getRegionStatusMap(db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  const productStatusRows = await db
    .select({
      region: superestoque.region,
      totalProdutos: sql<number>`count(*)`,
      ultimaAtualizacao: sql<Date | null>`max(${superestoque.updatedAt})`,
    })
    .from(superestoque)
    .groupBy(superestoque.region);

  const salesStatusRows = await db
    .select({
      region: superestoque.region,
      ultimoUploadVendas: sql<Date | null>`max(${historicoVendas.updatedAt})`,
    })
    .from(historicoVendas)
    .innerJoin(superestoque, eq(historicoVendas.superestoqueId, superestoque.id))
    .groupBy(superestoque.region);

  const statusMap: Record<RegionKey, RegionStatus> = {
    SC: { ...EMPTY_REGION_STATUS.SC },
    RS: { ...EMPTY_REGION_STATUS.RS },
  };

  for (const row of productStatusRows) {
    const region = row.region as RegionKey;
    statusMap[region] = {
      totalProdutos: Number(row.totalProdutos ?? 0),
      ultimaAtualizacaoMs: toUtcTimestampMs(row.ultimaAtualizacao),
      ultimoUploadVendasMs: statusMap[region]?.ultimoUploadVendasMs ?? null,
    };
  }

  for (const row of salesStatusRows) {
    const region = row.region as RegionKey;
    statusMap[region] = {
      ...(statusMap[region] ?? EMPTY_REGION_STATUS[region]),
      ultimoUploadVendasMs: toUtcTimestampMs(row.ultimoUploadVendas),
    };
  }

  return statusMap;
}

async function getRecentDatesForRegion(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  region: RegionKey,
  limit: number = 15,
) {
  const recentDateRows = await db
    .select({
      dataVenda: historicoVendas.dataVenda,
    })
    .from(historicoVendas)
    .innerJoin(superestoque, eq(historicoVendas.superestoqueId, superestoque.id))
    .where(eq(superestoque.region, region))
    .groupBy(historicoVendas.dataVenda)
    .orderBy(desc(historicoVendas.dataVenda))
    .limit(limit);

  return recentDateRows
    .map((row) => normalizeIsoDateString(row.dataVenda))
    .filter((value): value is string => Boolean(value))
    .reverse();
}

/**
 * Calcula quantos dias consecutivos (a partir da data mais recente) o produto ficou sem vendas.
 * Retorna 0 se houve venda no dia mais recente, ou o número de dias sem venda.
 */
function computeDiasSemVenda(vendasRecentes: Record<string, number>, recentDates: string[]): number {
  if (!recentDates.length) return 0;

  // Percorre as datas do mais recente para o mais antigo
  let diasSemVenda = 0;
  for (let i = recentDates.length - 1; i >= 0; i--) {
    const date = recentDates[i]!;
    const qty = vendasRecentes[date] ?? 0;
    if (qty > 0) break;
    diasSemVenda++;
  }

  return diasSemVenda;
}

/**
 * Busca o lote com vencimento mais próximo (mais recente) para cada produto.
 * Retorna um Map de superestoqueId -> LoteInfo
 */
async function getClosestLotesForProducts(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  productIds: number[],
): Promise<Map<number, LoteInfo>> {
  if (!productIds.length) return new Map();

  // Busca todos os lotes dos produtos, ordenados por vencimento ASC (mais próximo primeiro)
  const allLotes = await db
    .select()
    .from(loteSuperestoque)
    .where(
      and(
        inArray(loteSuperestoque.superestoqueId, productIds),
        gt(loteSuperestoque.estoqueLote, 0) // Considera apenas lotes com estoque disponível
      )
    )
    .orderBy(asc(loteSuperestoque.vencimentoLote));

  const result = new Map<number, LoteInfo>();

  for (const lote of allLotes) {
    // Pega o primeiro lote (vencimento mais próximo) de cada produto
    if (!result.has(lote.superestoqueId)) {
      result.set(lote.superestoqueId, {
        codLote: lote.codLote,
        vencimentoLote: normalizeIsoDateString(lote.vencimentoLote) ?? null,
        estoqueLote: lote.estoqueLote,
        qtdVendida: lote.qtdVendida,
      });
    }
  }

  return result;
}

/**
 * Dashboard do painel. Aceita uma região específica (SC/RS) ou "UNIFICADO",
 * que justapõe SC + RS (cada produto mantém sua `region` real).
 */
export async function getRegionDashboard(region: RegionView): Promise<RegionDashboardData> {
  if (region === "UNIFICADO") {
    return getUnifiedDashboard();
  }
  return getSingleRegionDashboard(region);
}

/**
 * Combina os dashboards de SC e RS numa visão única (justaposição):
 * - products: concatenados e reordenados por diasEstoque desc, depois nome.
 * - recentDates: união ordenada das datas das duas regiões.
 * - summary: soma dos totais; ultimaAtualizacao/uploadVendas = o mais recente.
 * - regionStatus: o mapa completo (idêntico nas duas chamadas).
 */
async function getUnifiedDashboard(): Promise<RegionDashboardData> {
  const [sc, rs] = await Promise.all([
    getSingleRegionDashboard("SC"),
    getSingleRegionDashboard("RS"),
  ]);

  const products = [...sc.products, ...rs.products].sort((a, b) => {
    if (b.diasEstoque !== a.diasEstoque) return b.diasEstoque - a.diasEstoque;
    return a.nomeProduto.localeCompare(b.nomeProduto, "pt-BR");
  });

  const recentDates = Array.from(new Set([...sc.recentDates, ...rs.recentDates])).sort();

  const compradores = Array.from(new Set([...sc.compradores, ...rs.compradores])).sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
  const temNaoAtribuido = sc.temNaoAtribuido || rs.temNaoAtribuido;

  const maxOrNull = (a: number | null, b: number | null) => {
    if (a === null) return b;
    if (b === null) return a;
    return Math.max(a, b);
  };

  return {
    region: "UNIFICADO",
    recentDates,
    products,
    compradores,
    temNaoAtribuido,
    summary: {
      totalProdutos: sc.summary.totalProdutos + rs.summary.totalProdutos,
      valorTotalCusto: sc.summary.valorTotalCusto + rs.summary.valorTotalCusto,
      estoqueAtualTotal: sc.summary.estoqueAtualTotal + rs.summary.estoqueAtualTotal,
      estoqueInicialTotal: sc.summary.estoqueInicialTotal + rs.summary.estoqueInicialTotal,
      ultimaAtualizacaoMs: maxOrNull(sc.summary.ultimaAtualizacaoMs, rs.summary.ultimaAtualizacaoMs),
      ultimoUploadVendasMs: maxOrNull(sc.summary.ultimoUploadVendasMs, rs.summary.ultimoUploadVendasMs),
    },
    regionStatus: sc.regionStatus,
  };
}

async function getSingleRegionDashboard(region: RegionKey): Promise<RegionDashboardData> {
  const db = await getDb();

  if (!db) {
    return {
      region,
      recentDates: [],
      products: [],
      compradores: [],
      temNaoAtribuido: false,
      summary: {
        totalProdutos: 0,
        valorTotalCusto: 0,
        estoqueAtualTotal: 0,
        estoqueInicialTotal: 0,
        ultimaAtualizacaoMs: null,
        ultimoUploadVendasMs: null,
      },
      regionStatus: { ...EMPTY_REGION_STATUS },
    };
  }

  const [products, recentDates, regionStatus, mapaComprador] = await Promise.all([
    db
      .select()
      .from(superestoque)
      .where(
        and(
          eq(superestoque.region, region),
          gt(superestoque.estoqueAtual, 0)
        )
      )
      .orderBy(desc(superestoque.diasEstoque), asc(superestoque.nomeProduto)),
    getRecentDatesForRegion(db, region),
    getRegionStatusMap(db),
    getMapaMarcaComprador(),
  ]);

  const productIds = products.map((product) => product.id);

  const [aggregatedSalesRows, lotesMap] = await Promise.all([
    productIds.length && recentDates.length
      ? db
          .select({
            superestoqueId: historicoVendas.superestoqueId,
            dataVenda: historicoVendas.dataVenda,
            quantidade: sql<number>`sum(${historicoVendas.quantidade})`,
          })
          .from(historicoVendas)
          .where(
            and(
              inArray(historicoVendas.superestoqueId, productIds),
              inArray(historicoVendas.dataVenda, recentDates),
            ),
          )
          .groupBy(historicoVendas.superestoqueId, historicoVendas.dataVenda)
      : [],
    getClosestLotesForProducts(db, productIds),
  ]);

  const salesMap = new Map<number, Record<string, number>>();

  for (const row of aggregatedSalesRows) {
    const productSales = salesMap.get(row.superestoqueId) ?? {};
    const dateKey = normalizeIsoDateString(row.dataVenda);
    if (!dateKey) {
      continue;
    }
    productSales[dateKey] = Number(row.quantidade ?? 0);
    salesMap.set(row.superestoqueId, productSales);
  }

  const mappedProducts = products.map((product) => {
    const vendasRecentes = recentDates.reduce<Record<string, number>>((accumulator, date) => {
      accumulator[date] = salesMap.get(product.id)?.[date] ?? 0;
      return accumulator;
    }, {});

    return {
      id: product.id,
      codigo: product.codigo,
      region: product.region as RegionKey,
      tipoProduto: (product.tipoProduto ?? "medicamento") as TipoProduto,
      nomeProduto: product.nomeProduto,
      fornecedor: product.fornecedor,
      comprador: mapaComprador.get(normMarcaKey(product.fornecedor))?.nome ?? null,
      ultimaCompra: product.ultimaCompra === null ? null : Number(product.ultimaCompra),
      dataUltimaCompra: product.dataUltimaCompra ?? null,
      diasEstoque: product.diasEstoque,
      estoqueInicial: product.estoqueInicial,
      estoqueAtual: product.estoqueAtual,
      valorCusto: product.valorCusto === null ? null : Number(product.valorCusto),
      vendaMedia: Number(product.vendaMedia ?? 0),
      ultimaAtualizacaoMs: toUtcTimestampMs(product.updatedAt) ?? Date.now(),
      vendasRecentes,
      lote: lotesMap.get(product.id) ?? null,
      diasSemVenda: computeDiasSemVenda(vendasRecentes, recentDates),
      statusCampanha: (product.statusCampanha ?? "nao_participa") as "nao_participa" | "em_campanha",
      estoqueIdealCongelado: product.estoqueIdealCongelado ?? null,
      diasEstoqueEntrada: product.diasEstoqueEntrada ?? null,
      excessoEntradaReais: product.excessoEntradaReais === null || product.excessoEntradaReais === undefined ? null : Number(product.excessoEntradaReais),
      campanhaDescricao: product.campanhaDescricao ?? null,
      campanhaInicio: product.campanhaInicio ?? null,
      campanhaFim: product.campanhaFim ?? null,
      dataUltimaTransferencia: product.dataUltimaTransferencia ?? null,
      qtdVendaMesAnterior: product.qtdVendaMesAnterior ?? 0,
      qtdVenda2MesesAnterior: product.qtdVenda2MesesAnterior ?? 0,
      qtdProjetadoMesAtual: product.qtdProjetadoMesAtual ?? 0,
      precoPolitica: product.precoPolitica === null || product.precoPolitica === undefined ? null : Number(product.precoPolitica),
      qtdVendaMesAtual: product.qtdVendaMesAtual ?? 0,
    };
  });

  // Compradores presentes (para o dropdown) + se há itens sem comprador atribuído.
  const compradores = Array.from(
    new Set(mappedProducts.map((p) => p.comprador).filter((c): c is string => c !== null)),
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const temNaoAtribuido = mappedProducts.some((p) => p.comprador === null);

  return {
    region,
    recentDates,
    products: mappedProducts,
    compradores,
    temNaoAtribuido,
    summary: {
      totalProdutos: mappedProducts.length,
      valorTotalCusto: mappedProducts.reduce((sum, product) => sum + (product.valorCusto ?? 0), 0),
      estoqueAtualTotal: mappedProducts.reduce((sum, product) => sum + product.estoqueAtual, 0),
      estoqueInicialTotal: mappedProducts.reduce((sum, product) => sum + product.estoqueInicial, 0),
      ultimaAtualizacaoMs: regionStatus[region]?.ultimaAtualizacaoMs ?? null,
      ultimoUploadVendasMs: regionStatus[region]?.ultimoUploadVendasMs ?? null,
    },
    regionStatus,
  };
}

export async function getProductPanorama(productId: number): Promise<ProductPanoramaData | null> {
  const db = await getDb();
  if (!db) {
    return null;
  }

  const [product] = await db.select().from(superestoque).where(eq(superestoque.id, productId)).limit(1);
  if (!product) {
    return null;
  }

  const [salesRows, loteRows] = await Promise.all([
    db
      .select({
        dataVenda: historicoVendas.dataVenda,
        quantidade: sql<number>`sum(${historicoVendas.quantidade})`,
      })
      .from(historicoVendas)
      .where(eq(historicoVendas.superestoqueId, productId))
      .groupBy(historicoVendas.dataVenda)
      .orderBy(asc(historicoVendas.dataVenda)),
    db
      .select()
      .from(loteSuperestoque)
      .where(
        and(
          eq(loteSuperestoque.superestoqueId, productId),
          gt(loteSuperestoque.estoqueLote, 0)
        )
      )
      .orderBy(asc(loteSuperestoque.vencimentoLote)),
  ]);

  return {
    product: {
      id: product.id,
      region: product.region as RegionKey,
      tipoProduto: (product.tipoProduto ?? "medicamento") as TipoProduto,
      codigo: product.codigo,
      nomeProduto: product.nomeProduto,
      fornecedor: product.fornecedor,
      ultimaCompra: product.ultimaCompra === null ? null : Number(product.ultimaCompra),
      dataUltimaCompra: product.dataUltimaCompra ?? null,
      diasEstoque: product.diasEstoque,
      estoqueInicial: product.estoqueInicial,
      estoqueAtual: product.estoqueAtual,
      valorCusto: product.valorCusto === null ? null : Number(product.valorCusto),
      vendaMedia: Number(product.vendaMedia ?? 0),
      ultimaAtualizacaoMs: toUtcTimestampMs(product.updatedAt) ?? Date.now(),
      statusCampanha: (product.statusCampanha ?? "nao_participa") as "nao_participa" | "em_campanha",
      estoqueIdealCongelado: product.estoqueIdealCongelado ?? null,
      campanhaDescricao: product.campanhaDescricao ?? null,
      campanhaInicio: product.campanhaInicio ?? null,
      campanhaFim: product.campanhaFim ?? null,
      campanhaObservacao: product.campanhaObservacao ?? null,
      dataUltimaTransferencia: product.dataUltimaTransferencia ?? null,
      qtdVendaMesAnterior: product.qtdVendaMesAnterior ?? 0,
      qtdVenda2MesesAnterior: product.qtdVenda2MesesAnterior ?? 0,
      qtdProjetadoMesAtual: product.qtdProjetadoMesAtual ?? 0,
      precoPolitica: product.precoPolitica === null || product.precoPolitica === undefined ? null : Number(product.precoPolitica),
    },
    lotes: loteRows.map((lote) => ({
      codLote: lote.codLote,
      vencimentoLote: normalizeIsoDateString(lote.vencimentoLote) ?? null,
      estoqueLote: lote.estoqueLote,
      qtdVendida: lote.qtdVendida,
    })),
    salesSeries: salesRows.flatMap((row) => {
      const isoDate = normalizeIsoDateString(row.dataVenda);
      if (!isoDate) {
        return [];
      }
      return {
        date: isoDate,
        label: formatDayMonthLabelFromIso(isoDate),
        quantidade: Number(row.quantidade ?? 0),
      };
    }),
  };
}

export async function getRegionProductCodes(
  region: RegionKey,
  tipoProduto?: TipoProduto,
): Promise<number[]> {
  const db = await getDb();
  if (!db) {
    return [];
  }

  const conditions = [eq(superestoque.region, region)];
  if (tipoProduto) {
    conditions.push(eq(superestoque.tipoProduto, tipoProduto));
  }

  const rows = await db
    .select({ codigo: superestoque.codigo })
    .from(superestoque)
    .where(and(...conditions))
    .orderBy(asc(superestoque.codigo));

  return rows.map((row) => row.codigo);
}

export async function replaceRegionalSalesHistory(region: RegionKey, rows: VendaUploadRow[]) {
  const db = await getDb();
  if (!db) {
    throw new Error("Banco de dados indisponível para persistir o histórico de vendas regional.");
  }

  const regionProducts = await db
    .select({ id: superestoque.id, codigo: superestoque.codigo })
    .from(superestoque)
    .where(eq(superestoque.region, region));

  if (!regionProducts.length) {
    throw new Error(`Envie primeiro a planilha de produtos da região ${region} antes do histórico de vendas.`);
  }

  const productsByCode = new Map(regionProducts.map((product) => [product.codigo, product.id]));
  const matchedProductIds = regionProducts.map((product) => product.id);

  if (matchedProductIds.length) {
    await db.delete(historicoVendas).where(inArray(historicoVendas.superestoqueId, matchedProductIds));
  }

  const matchedRows = rows
    .map((row) => ({
      superestoqueId: productsByCode.get(row.codigo) ?? null,
      dataVenda: row.dataVenda,
      quantidade: row.quantidade,
    }))
    .filter((row): row is { superestoqueId: number; dataVenda: string; quantidade: number } => row.superestoqueId !== null);

  if (!matchedRows.length) {
    return {
      inserted: 0,
      skipped: rows.length,
    };
  }

  await db
    .insert(historicoVendas)
    .values(matchedRows)
    .onDuplicateKeyUpdate({
      set: {
        quantidade: sql`values(${historicoVendas.quantidade})`,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      },
    });

  return {
    inserted: matchedRows.length,
    skipped: Math.max(rows.length - matchedRows.length, 0),
  };
}

/**
 * Carga INCREMENTAL de vendas: insere/atualiza as vendas do novo dia
 * e remove as datas mais antigas se a região exceder 15 datas distintas.
 * Resultado: janela deslizante de no máximo 15 dias úteis.
 */
export async function appendDailySales(region: RegionKey, rows: VendaUploadRow[]) {
  const db = await getDb();
  if (!db) {
    throw new Error("Banco de dados indisponível para persistir vendas incrementais.");
  }

  const regionProducts = await db
    .select({ id: superestoque.id, codigo: superestoque.codigo })
    .from(superestoque)
    .where(eq(superestoque.region, region));

  if (!regionProducts.length) {
    throw new Error(`Envie primeiro a planilha de produtos da região ${region} antes do histórico de vendas.`);
  }

  const productsByCode = new Map(regionProducts.map((product) => [product.codigo, product.id]));

  const matchedRows = rows
    .map((row) => ({
      superestoqueId: productsByCode.get(row.codigo) ?? null,
      dataVenda: row.dataVenda,
      quantidade: row.quantidade,
    }))
    .filter((row): row is { superestoqueId: number; dataVenda: string; quantidade: number } => row.superestoqueId !== null);

  if (!matchedRows.length) {
    return {
      inserted: 0,
      skipped: rows.length,
      trimmed: 0,
    };
  }

  // Upsert: insere o novo dia (ou atualiza se já existir)
  await db
    .insert(historicoVendas)
    .values(matchedRows)
    .onDuplicateKeyUpdate({
      set: {
        quantidade: sql`values(${historicoVendas.quantidade})`,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      },
    });

  // Trim: manter no máximo 15 datas distintas por região
  const MAX_DATES = 15;
  const matchedProductIds = regionProducts.map((product) => product.id);

  const allDatesRows = await db
    .select({ dataVenda: historicoVendas.dataVenda })
    .from(historicoVendas)
    .where(inArray(historicoVendas.superestoqueId, matchedProductIds))
    .groupBy(historicoVendas.dataVenda)
    .orderBy(desc(historicoVendas.dataVenda));

  const allDates = allDatesRows.map((r) => r.dataVenda);
  let trimmed = 0;

  if (allDates.length > MAX_DATES) {
    const datesToRemove = allDates.slice(MAX_DATES);
    await db.delete(historicoVendas).where(
      and(
        inArray(historicoVendas.superestoqueId, matchedProductIds),
        inArray(historicoVendas.dataVenda, datesToRemove),
      ),
    );
    trimmed = datesToRemove.length;
  }

  return {
    inserted: matchedRows.length,
    skipped: Math.max(rows.length - matchedRows.length, 0),
    trimmed,
  };
}

/**
 * Retorna a contagem de datas distintas de vendas para uma região.
 * Usado pelo connector para decidir entre bootstrap (0 datas) e incremental.
 */
export async function getSalesDatesCount(region: RegionKey): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const regionProducts = await db
    .select({ id: superestoque.id })
    .from(superestoque)
    .where(eq(superestoque.region, region));

  if (!regionProducts.length) return 0;

  const productIds = regionProducts.map((p) => p.id);
  const result = await db
    .select({ count: sql<number>`count(distinct ${historicoVendas.dataVenda})` })
    .from(historicoVendas)
    .where(inArray(historicoVendas.superestoqueId, productIds));

  return Number(result[0]?.count ?? 0);
}

import { getSuperestocadosParams } from "./parametros";

/**
 * Parâmetros configuráveis do painel de superestocados.
 * Valores são lidos da tabela `parametros` no banco de dados.
 * Defaults são usados caso o banco não esteja disponível.
 *
 * Para alterar regras de negócio, atualize diretamente na tabela `parametros`
 * sem necessidade de recompilar o código.
 */

// Defaults usados apenas como fallback quando o banco não está acessível
const DEFAULTS = {
  DIAS_LIMITE_ENTRADA: 90,
  DIAS_CADASTRO_MINIMO: 60,
  DIAS_LIMITE_SAIDA_MEDICAMENTO: 60,
  DIAS_LIMITE_SAIDA_NAO_MEDICAMENTO: 45,
  SLOTS_POR_REGIAO_TIPO: 50,
  ZERADO_SLOTS_POR_REGIAO: 10,
  ZERADO_DIAS_ROTACAO: 15,
  LIMIAR_VENDA_ZERADA: 1,
};

/**
 * Verifica se a ÚLTIMA COMPRA do produto foi há menos de X dias.
 * Produtos recém-comprados não devem ser considerados superestocados (saem do
 * painel até voltarem a se enquadrar nos critérios).
 */
function isUltimaCompraRecente(dataIso: string, referenceDate: Date, diasMinimo: number): boolean {
  const data = new Date(`${dataIso}T00:00:00.000Z`);
  if (Number.isNaN(data.getTime())) return false;
  const diffMs = referenceDate.getTime() - data.getTime();
  const diffDias = diffMs / (1000 * 60 * 60 * 24);
  return diffDias < diasMinimo;
}

/**
 * Comparador de prioridade usado para ranquear candidatos em ambos os painéis.
 * Critério (em ordem):
 *   1. maior valorCusto (mais dinheiro travado = mais prioritário);
 *   2. maior diasEstoque (mais superestocado);
 *   3. menor código (desempate determinístico).
 */
function compareCandidatePriority(
  a: { valorCusto: number | null; diasEstoque: number; codigo: number },
  b: { valorCusto: number | null; diasEstoque: number; codigo: number },
) {
  const valorDiff = (Number(b.valorCusto ?? 0)) - (Number(a.valorCusto ?? 0));
  if (valorDiff !== 0) return valorDiff;
  const diasDiff = b.diasEstoque - a.diasEstoque;
  if (diasDiff !== 0) return diasDiff;
  return a.codigo - b.codigo;
}

/**
 * Rotaciona produtos do painel para uma região.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * Painel principal — vendaMedia >= 1, separado por tipo (50 slots por tipo)
 * ────────────────────────────────────────────────────────────────────────────── *  • Entrada: vendaMedia >= 1 e diasEstoque > DIAS_LIMITE_ENTRADA (90).
 *            Produto com menos de 90 dias de cadastro é ignorado.
 *  • Saída:   diasEstoque <= DIAS_LIMITE_SAIDA_<tipo> (60 medicamento / 45 não-med).
 *             Histerese 60↔︎60/45 evita "liga-desliga" diário.
 *  • Prioridade: valorCusto DESC, depois diasEstoque DESC, depois código ASC.
 *  • Painel só remove quando o produto é resolvido (atingiu o critério de saída);
 *    novos candidatos esperam vaga abrir. Slots vazios são preenchidos por ordem
 *    de prioridade. Sem substituição forçada de incumbentes.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * Painel zerados — 0 <= vendaMedia < 1 (10 slots por região, sem dividir por tipo)
 * ──────────────────────────────────────────────────────────────────────────────
 *  • Entrada: 0 <= vendaMedia < 1 e estoqueAtual > 0.
 *  • Saída:   estoqueAtual == 0  OU  estoqueAtual <= estoqueInicial/2
 *             OU  diasNoPainel >= ZERADO_DIAS_ROTACAO (15).
 *  • Prioridade: valorCusto DESC, depois diasEstoque DESC, depois código ASC.
 *  • Produto zerado cuja vendaMedia subiu para >= 1 deixa o painel de zerados
 *    (limpa vendaZeradaEntradaEm / vendaZeradaEstoqueInicial) e compete em pé
 *    de igualdade pelos slots do painel principal na mesma rotação.
 */
/** Remove produtos do painel em LOTE (lote + histórico + produto) — 3 statements, não 3×N. */
async function removerProdutosEmLote(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  ids: number[],
) {
  if (!ids.length) return;
  await db.delete(loteSuperestoque).where(inArray(loteSuperestoque.superestoqueId, ids));
  await db.delete(historicoVendas).where(inArray(historicoVendas.superestoqueId, ids));
  await db.delete(superestoque).where(inArray(superestoque.id, ids));
}

export async function rotateRegionalProducts(
  region: RegionKey,
  csvRows: CsvRotationRow[],
) {
  const db = await getDb();
  if (!db) {
    throw new Error("Banco de dados indisponível para rotacionar produtos.");
  }

  if (!csvRows.length) {
    return { updated: 0, removed: 0, inserted: 0, unchanged: 0, zeradosUpdated: 0, zeradosRemoved: 0, zeradosInserted: 0 };
  }

  // Carrega parâmetros configuráveis do banco (com fallback para defaults)
  const params = await getSuperestocadosParams();
  const DIAS_LIMITE_ENTRADA = params.DIAS_ESTOQUE_ENTRADA;
  const DIAS_CADASTRO_MINIMO = params.DIAS_CADASTRO_MINIMO;
  const DIAS_LIMITE_SAIDA_MEDICAMENTO = params.DIAS_ESTOQUE_SAIDA_MEDICAMENTO;
  const DIAS_LIMITE_SAIDA_NAO_MEDICAMENTO = params.DIAS_ESTOQUE_SAIDA_NAO_MEDICAMENTO;
  // SLOTS_POR_REGIAO_TIPO e ZERADO_SLOTS_POR_REGIAO removidos — sem limite de slots.
  const LIMIAR_VENDA_ZERADA = params.VENDA_MEDIA_MINIMA;
  const ZERADO_DIAS_ROTACAO = DEFAULTS.ZERADO_DIAS_ROTACAO;

  const now = new Date();
  const csvByCode = new Map<number, CsvRotationRow>();
  for (const row of csvRows) {
    csvByCode.set(row.codigo, row);
  }

  // ─── PARTE 0: Atualização universal ─────────────────────────────────────────
  // Aplica os dados frescos do CSV em todo produto da região que ainda esteja
  // listado. A re-classificação (normal × zerado) acontece DEPOIS, a partir do
  // novo vendaMedia. Produtos do CSV que não estão na tabela só entram via
  // critério de entrada nas partes 1/2.

  const existingProducts = await db
    .select({
      id: superestoque.id,
      codigo: superestoque.codigo,
      tipoProduto: superestoque.tipoProduto,
      diasEstoque: superestoque.diasEstoque,
      estoqueAtual: superestoque.estoqueAtual,
      vendaMedia: superestoque.vendaMedia,
      vendaZeradaEntradaEm: superestoque.vendaZeradaEntradaEm,
      vendaZeradaEstoqueInicial: superestoque.vendaZeradaEstoqueInicial,
      statusCampanha: superestoque.statusCampanha,
      estoqueIdealCongelado: superestoque.estoqueIdealCongelado,
      dataUltimaCompra: superestoque.dataUltimaCompra,
    })
    .from(superestoque)
    .where(eq(superestoque.region, region));

  // Snapshot do painel PRINCIPAL (vendaMedia>=1) antes da rotação — usado para
  // reconciliar entradas/saídas de permanência no fim (abrir/fechar stints).
  const beforeMain = await db
    .select({
      codigo: superestoque.codigo,
      tipoProduto: superestoque.tipoProduto,
      painelEntradaEm: superestoque.painelEntradaEm,
      transfRecebidaAcum: superestoque.transfRecebidaAcum,
      transfEnviadaAcum: superestoque.transfEnviadaAcum,
    })
    .from(superestoque)
    .where(and(eq(superestoque.region, region), isNull(superestoque.vendaZeradaEntradaEm)));

  // Só os produtos existentes que vieram no CSV desta rodada.
  const existentesComCsv = existingProducts.filter((e) => csvByCode.has(e.codigo));
  const updated = existentesComCsv.filter((e) => e.vendaZeradaEntradaEm === null).length;
  const zeradosUpdated = existentesComCsv.length - updated;

  // Independentes (id distinto) → paralelas no pool, em vez de uma a uma em série.
  await Promise.all(
    existentesComCsv.map((existing) => {
      const csvData = csvByCode.get(existing.codigo)!;
      return db
        .update(superestoque)
        .set({
          nomeProduto: csvData.nomeProduto,
          fornecedor: csvData.fornecedor,
          dataUltimaCompra: csvData.dataUltimaCompra,
          diasEstoque: Math.round(csvData.diasEstoque),
          estoqueAtual: csvData.estoqueAtual,
          valorCusto: csvData.valorCusto,
          vendaMedia: csvData.vendaMedia,
          dataUltimaTransferencia: csvData.dataUltimaTransferencia,
          qtdVendaMesAnterior: csvData.qtdVendaMesAnterior,
          qtdVenda2MesesAnterior: csvData.qtdVenda2MesesAnterior,
          qtdProjetadoMesAtual: csvData.qtdProjetadoMesAtual,
          precoPolitica: csvData.precoPolitica,
          qtdVendaMesAtual: csvData.qtdVendaMesAtual ?? 0,
          updatedAt: now,
        })
        .where(eq(superestoque.id, existing.id));
    }),
  );

  // Reflete localmente os updates (evita reler do banco logo em seguida).
  type ExistingProduct = (typeof existingProducts)[number];
  const refreshedProducts: ExistingProduct[] = existingProducts.map((existing) => {
    const csvData = csvByCode.get(existing.codigo);
    if (!csvData) return existing;
    return {
      ...existing,
      diasEstoque: Math.round(csvData.diasEstoque),
      estoqueAtual: csvData.estoqueAtual,
      vendaMedia: csvData.vendaMedia as unknown as ExistingProduct["vendaMedia"],
      dataUltimaCompra: csvData.dataUltimaCompra ?? existing.dataUltimaCompra,
    };
  });

  // ─── PARTE 1: Painel principal (vendaMedia >= 1, por tipo, 50 slots) ────────

  let removed = 0;
  let inserted = 0;

  const incumbents = refreshedProducts.filter(
    (p) => Number(p.vendaMedia ?? 0) >= LIMIAR_VENDA_ZERADA && p.vendaZeradaEntradaEm === null,
  );
  const promotedFromZerado = refreshedProducts.filter(
    (p) => Number(p.vendaMedia ?? 0) >= LIMIAR_VENDA_ZERADA && p.vendaZeradaEntradaEm !== null,
  );

  // 1.1 — Incumbentes que devem sair:
  //   - Bateram critério de saída por tipo (diasEstoque <= limiar)
  //   - Cadastro < 60 dias (regra de negócio: não permanece no painel)
  //   - Em campanha: só sai se atingiu estoque ideal congelado
  const incumbentsToRemove: number[] = [];
  const incumbentsToKeep: ExistingProduct[] = [];
  for (const p of incumbents) {
    const tipo = p.tipoProduto as TipoProduto;
    const diasLimiteSaida = tipo === "medicamento"
      ? DIAS_LIMITE_SAIDA_MEDICAMENTO
      : DIAS_LIMITE_SAIDA_NAO_MEDICAMENTO;

    // Regra: última compra < DIAS_CADASTRO_MINIMO dias → produto sai (a menos que esteja em campanha)
    const compraRecente = p.dataUltimaCompra
      ? isUltimaCompraRecente(p.dataUltimaCompra, now, DIAS_CADASTRO_MINIMO)
      : false;

    // Produto em campanha: só sai se atingiu estoque ideal congelado
    if (p.statusCampanha === "em_campanha") {
      const estoqueIdeal = p.estoqueIdealCongelado ?? 0;
      if (p.estoqueAtual <= estoqueIdeal) {
        // Atingiu estoque ideal — sai do painel
        incumbentsToRemove.push(p.id);
      } else {
        // Ainda não atingiu — permanece independente de outros critérios
        incumbentsToKeep.push(p);
      }
      continue;
    }

    if (compraRecente || p.diasEstoque <= diasLimiteSaida) {
      incumbentsToRemove.push(p.id);
    } else {
      incumbentsToKeep.push(p);
    }
  }

  // 1.2 — Promovidos do zerado: precisam passar pelo critério de ENTRADA do principal.
  //       Qualificados viram candidatos (competem pé-de-igualdade). Não qualificados saem.
  const promotedQualified: ExistingProduct[] = [];
  const promotedToRemove: number[] = [];
  for (const p of promotedFromZerado) {
    if (p.diasEstoque > DIAS_LIMITE_ENTRADA) {
      promotedQualified.push(p);
    } else {
      promotedToRemove.push(p.id);
    }
  }

  // 1.3 — Aplica remoções (incumbentes resolvidos + promovidos sem qualificação).
  const idsRemover = [...incumbentsToRemove, ...promotedToRemove];
  await removerProdutosEmLote(db, idsRemover);
  removed += idsRemover.length;

  // 1.4 — Sem limite de slots: todos os candidatos qualificados entram no painel.
  //       Promovidos do zerado ainda competem para voltar ao painel principal.

  // 1.5 — Pool de candidatos por tipo: promovidos do zerado + linhas do CSV.
  //       Todos passam pelos mesmos filtros (vendaMedia >= 1, diasEstoque > 90).
  type Candidate =
    | {
        source: "csv";
        codigo: number;
        categoria: TipoProduto;
        valorCusto: number | null;
        diasEstoque: number;
        csvData: CsvRotationRow;
      }
    | {
        source: "promoted";
        codigo: number;
        categoria: TipoProduto;
        valorCusto: number | null;
        diasEstoque: number;
        existingId: number;
      };

  const candidatesByType: Record<TipoProduto, Candidate[]> = {
    medicamento: [],
    nao_medicamento: [],
  };

  for (const p of promotedQualified) {
    candidatesByType[p.tipoProduto as TipoProduto].push({
      source: "promoted",
      codigo: p.codigo,
      categoria: p.tipoProduto as TipoProduto,
      valorCusto: Number(csvByCode.get(p.codigo)?.valorCusto ?? 0),
      diasEstoque: p.diasEstoque,
      existingId: p.id,
    });
  }

  const survivorCodes = new Set(incumbentsToKeep.map((p) => p.codigo));
  for (const row of csvRows) {
    if (survivorCodes.has(row.codigo)) continue;
    if (promotedQualified.some((p) => p.codigo === row.codigo)) continue;
    if (row.vendaMedia < LIMIAR_VENDA_ZERADA) continue;
    if (row.diasEstoque <= DIAS_LIMITE_ENTRADA) continue;
    // Produto com última compra há menos de DIAS_CADASTRO_MINIMO dias não é superestocado
    if (row.dataUltimaCompra && isUltimaCompraRecente(row.dataUltimaCompra, now, DIAS_CADASTRO_MINIMO)) continue;

    candidatesByType[row.categoria].push({
      source: "csv",
      codigo: row.codigo,
      categoria: row.categoria,
      valorCusto: row.valorCusto,
      diasEstoque: row.diasEstoque,
      csvData: row,
    });
  }

  candidatesByType.medicamento.sort(compareCandidatePriority);
  candidatesByType.nao_medicamento.sort(compareCandidatePriority);

  // 1.6 — Todos os candidatos qualificados entram. Promovidos voltam ao painel principal.
  // Sem limite de slots → não há "perdedores"; escritas independentes rodam em paralelo.
  const winningPromotedCodes = new Set<number>();
  for (const tipo of ["medicamento", "nao_medicamento"] as TipoProduto[]) {
    const winners = candidatesByType[tipo]; // Sem limite — todos entram
    for (const candidate of winners) {
      if (candidate.source === "promoted") winningPromotedCodes.add(candidate.codigo);
      else inserted++;
    }

    await Promise.all(
      winners.map((candidate) => {
        if (candidate.source === "promoted") {
          return db
            .update(superestoque)
            .set({
              vendaZeradaEntradaEm: null,
              vendaZeradaEstoqueInicial: null,
              updatedAt: now,
            })
            .where(eq(superestoque.id, candidate.existingId));
        }
        return db.insert(superestoque).values({
          codigo: candidate.csvData.codigo,
          region,
          tipoProduto: tipo,
          nomeProduto: candidate.csvData.nomeProduto,
          fornecedor: candidate.csvData.fornecedor,
          dataUltimaCompra: candidate.csvData.dataUltimaCompra,
          diasEstoque: Math.round(candidate.csvData.diasEstoque),
          estoqueInicial: candidate.csvData.estoqueAtual,
          estoqueAtual: candidate.csvData.estoqueAtual,
          valorCusto: candidate.csvData.valorCusto,
          vendaMedia: candidate.csvData.vendaMedia,
          dataUltimaTransferencia: candidate.csvData.dataUltimaTransferencia,
          qtdVendaMesAnterior: candidate.csvData.qtdVendaMesAnterior,
          qtdVenda2MesesAnterior: candidate.csvData.qtdVenda2MesesAnterior,
          qtdProjetadoMesAtual: candidate.csvData.qtdProjetadoMesAtual,
          precoPolitica: candidate.csvData.precoPolitica,
        }).onDuplicateKeyUpdate({
          set: {
            tipoProduto: tipo,
            nomeProduto: candidate.csvData.nomeProduto,
            fornecedor: candidate.csvData.fornecedor,
            dataUltimaCompra: candidate.csvData.dataUltimaCompra,
            diasEstoque: Math.round(candidate.csvData.diasEstoque),
            estoqueInicial: candidate.csvData.estoqueAtual,
            estoqueAtual: candidate.csvData.estoqueAtual,
            valorCusto: candidate.csvData.valorCusto,
            vendaMedia: candidate.csvData.vendaMedia,
            dataUltimaTransferencia: candidate.csvData.dataUltimaTransferencia,
            qtdVendaMesAnterior: candidate.csvData.qtdVendaMesAnterior,
            qtdVenda2MesesAnterior: candidate.csvData.qtdVenda2MesesAnterior,
            qtdProjetadoMesAtual: candidate.csvData.qtdProjetadoMesAtual,
            precoPolitica: candidate.csvData.precoPolitica,
            vendaZeradaEntradaEm: null,
            vendaZeradaEstoqueInicial: null,
            updatedAt: now,
          },
        });
      }),
    );
  }

  // ─── PARTE 2: Painel zerados (0 <= vendaMedia < 1, 10 slots por região) ─────

  let zeradosRemoved = 0;
  let zeradosInserted = 0;

  // Após a Parte 1, os "promovidos" ou viraram normais ou foram removidos.
  // Restam aqui apenas produtos cuja vendaMedia continua < 1.
  const zeradosRemanescentes = refreshedProducts.filter(
    (p) =>
      Number(p.vendaMedia ?? 0) < LIMIAR_VENDA_ZERADA &&
      p.vendaZeradaEntradaEm !== null,
  );

  const zeradosToRemove: number[] = [];
  const zeradosToKeep: ExistingProduct[] = [];
  for (const z of zeradosRemanescentes) {
    const estoqueInicial = z.vendaZeradaEstoqueInicial ?? z.estoqueAtual;
    const metadeInicial = Math.ceil(estoqueInicial / 2);
    const entradaEm = z.vendaZeradaEntradaEm ? new Date(z.vendaZeradaEntradaEm) : null;
    const diasNoPainel = entradaEm
      ? Math.floor((now.getTime() - entradaEm.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    const deveSair =
      z.estoqueAtual === 0 ||
      z.estoqueAtual <= metadeInicial ||
      diasNoPainel >= ZERADO_DIAS_ROTACAO;

    if (deveSair) {
      zeradosToRemove.push(z.id);
    } else {
      zeradosToKeep.push(z);
    }
  }

  await removerProdutosEmLote(db, zeradosToRemove);
  zeradosRemoved += zeradosToRemove.length;

  // Sem limite de slots para zerados: todos os candidatos qualificados entram.
  const zeradoSlotsVazios = Infinity;

  if (true) {
    // Códigos já presentes no painel (principal ou zerados restantes) — excluir candidatos.
    const codesNoPainel = new Set<number>([
      ...incumbentsToKeep.map((p) => p.codigo),
      ...Array.from(winningPromotedCodes),
      ...zeradosToKeep.map((z) => z.codigo),
    ]);

    const zeradoCandidates = csvRows
      .filter((row) =>
        !codesNoPainel.has(row.codigo) &&
        row.vendaMedia >= 0 &&
        row.vendaMedia < LIMIAR_VENDA_ZERADA &&
        row.estoqueAtual > 0 &&
        // Produto com última compra há menos de DIAS_CADASTRO_MINIMO dias não é superestocado
        !(row.dataUltimaCompra && isUltimaCompraRecente(row.dataUltimaCompra, now, DIAS_CADASTRO_MINIMO)),
      )
      .map((row) => ({ ...row }))
      .sort(compareCandidatePriority);

    const toInsertZerados = zeradoCandidates; // Sem limite — todos entram
    zeradosInserted += toInsertZerados.length;

    await Promise.all(
      toInsertZerados.map((candidate) =>
        db.insert(superestoque).values({
          codigo: candidate.codigo,
          region,
          tipoProduto: candidate.categoria,
          nomeProduto: candidate.nomeProduto,
          fornecedor: candidate.fornecedor,
          dataUltimaCompra: candidate.dataUltimaCompra,
          diasEstoque: Math.round(candidate.diasEstoque),
          estoqueInicial: candidate.estoqueAtual,
          estoqueAtual: candidate.estoqueAtual,
          valorCusto: candidate.valorCusto,
          vendaMedia: candidate.vendaMedia,
          dataUltimaTransferencia: candidate.dataUltimaTransferencia,
          qtdVendaMesAnterior: candidate.qtdVendaMesAnterior,
          qtdVenda2MesesAnterior: candidate.qtdVenda2MesesAnterior,
          qtdProjetadoMesAtual: candidate.qtdProjetadoMesAtual,
          precoPolitica: candidate.precoPolitica,
          vendaZeradaEntradaEm: now,
          vendaZeradaEstoqueInicial: candidate.estoqueAtual,
        }).onDuplicateKeyUpdate({
          set: {
            tipoProduto: candidate.categoria,
            nomeProduto: candidate.nomeProduto,
            fornecedor: candidate.fornecedor,
            dataUltimaCompra: candidate.dataUltimaCompra,
            diasEstoque: Math.round(candidate.diasEstoque),
            estoqueAtual: candidate.estoqueAtual,
            valorCusto: candidate.valorCusto,
            vendaMedia: candidate.vendaMedia,
            dataUltimaTransferencia: candidate.dataUltimaTransferencia,
            qtdVendaMesAnterior: candidate.qtdVendaMesAnterior,
            qtdVenda2MesesAnterior: candidate.qtdVenda2MesesAnterior,
            qtdProjetadoMesAtual: candidate.qtdProjetadoMesAtual,
            precoPolitica: candidate.precoPolitica,
            vendaZeradaEntradaEm: now,
            vendaZeradaEstoqueInicial: candidate.estoqueAtual,
            updatedAt: now,
          },
        }),
      ),
    );
  }

  // ─── Reconciliação de permanência (painel principal) ────────────────────────
  // Compara o painel principal antes × depois. Quem entrou: marca data de entrada,
  // zera contadores de transferência e abre uma permanência. Quem saiu: fecha a
  // permanência aberta com a duração e os totais de transferência da passagem.
  const afterMain = await db
    .select({
      codigo: superestoque.codigo,
      tipoProduto: superestoque.tipoProduto,
      diasEstoque: superestoque.diasEstoque,
      estoqueAtual: superestoque.estoqueAtual,
      vendaMedia: superestoque.vendaMedia,
      valorCusto: superestoque.valorCusto,
    })
    .from(superestoque)
    .where(and(eq(superestoque.region, region), isNull(superestoque.vendaZeradaEntradaEm)));

  const permKey = (codigo: number, tipo: string) => `${codigo}|${tipo}`;
  const beforeByKey = new Map(beforeMain.map((p) => [permKey(p.codigo, p.tipoProduto), p]));
  const afterKeys = new Set(afterMain.map((p) => permKey(p.codigo, p.tipoProduto)));
  const hojeIso = now.toISOString().slice(0, 10);

  // Entradas: produtos que não estavam no painel antes. Snapshot + abre permanência.
  const entradas = afterMain.filter((p) => !beforeByKey.has(permKey(p.codigo, p.tipoProduto)));
  await Promise.all(
    entradas.flatMap((p) => {
      const excessoEntrada = excessoReaisSuperestocado(
        p.estoqueAtual,
        Number(p.vendaMedia ?? 0),
        p.valorCusto == null ? null : Number(p.valorCusto),
      );
      return [
        db
          .update(superestoque)
          .set({
            painelEntradaEm: now,
            diasEstoqueEntrada: p.diasEstoque,
            excessoEntradaReais: excessoEntrada,
            transfRecebidaAcum: 0,
            transfEnviadaAcum: 0,
            transfProcessadaAte: hojeIso,
            updatedAt: now,
          })
          .where(and(
            eq(superestoque.region, region),
            eq(superestoque.codigo, p.codigo),
            eq(superestoque.tipoProduto, p.tipoProduto),
          )),
        db.insert(superestocadosPermanencia).values({
          codigo: p.codigo,
          region,
          tipoProduto: p.tipoProduto,
          entrouEm: now,
        }),
      ];
    }),
  );

  // Saídas: produtos que estavam antes e não estão mais. Fecha a permanência aberta.
  const saidas = Array.from(beforeByKey.values()).filter(
    (snap) => !afterKeys.has(permKey(snap.codigo, snap.tipoProduto)),
  );
  await Promise.all(
    saidas.map((snap) => {
      const entrou = snap.painelEntradaEm ? new Date(snap.painelEntradaEm) : null;
      const dias = entrou ? Math.floor((now.getTime() - entrou.getTime()) / 86400000) : null;
      return db
        .update(superestocadosPermanencia)
        .set({
          saiuEm: now,
          diasPermanencia: dias,
          transfRecebida: snap.transfRecebidaAcum ?? 0,
          transfEnviada: snap.transfEnviadaAcum ?? 0,
          updatedAt: now,
        })
        .where(and(
          eq(superestocadosPermanencia.codigo, snap.codigo),
          eq(superestocadosPermanencia.region, region),
          eq(superestocadosPermanencia.tipoProduto, snap.tipoProduto),
          isNull(superestocadosPermanencia.saiuEm),
        ));
    }),
  );

  const unchanged = Math.max(0, existingProducts.length - removed - zeradosRemoved);

  return { updated, removed, inserted, unchanged, zeradosUpdated, zeradosRemoved, zeradosInserted };
}

type TransferenciaRow = {
  codProduto: number;
  data: string; // YYYY-MM-DD
  quantidadeEntrada: number;
  quantidadeSaida: number;
};

/**
 * Aplica transferências entre CDs ao estoque inicial dos produtos do painel
 * PRINCIPAL da região. Recebida (entrada) soma; enviada (saída) subtrai.
 *
 * Once-only: por produto, só considera linhas com `data > transfProcessadaAte`
 * e avança o watermark — assim rodar várias vezes (sync 4x/dia, janela de 15
 * dias) não conta em dobro. Atualiza também os contadores da permanência atual.
 */
export async function aplicarTransferenciasRegiao(region: RegionKey, transfers: TransferenciaRow[]) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível para aplicar transferências.");

  const produtos = await db
    .select({
      codigo: superestoque.codigo,
      tipoProduto: superestoque.tipoProduto,
      transfProcessadaAte: superestoque.transfProcessadaAte,
    })
    .from(superestoque)
    .where(and(eq(superestoque.region, region), isNull(superestoque.vendaZeradaEntradaEm)));

  // Agrupa transferências por produto.
  const porProduto = new Map<number, TransferenciaRow[]>();
  for (const t of transfers) {
    const arr = porProduto.get(t.codProduto) ?? [];
    arr.push(t);
    porProduto.set(t.codProduto, arr);
  }

  let produtosAjustados = 0;
  let recebidoTotal = 0;
  let enviadoTotal = 0;

  for (const prod of produtos) {
    const linhas = porProduto.get(prod.codigo);
    if (!linhas || !linhas.length) continue;

    const watermark = prod.transfProcessadaAte; // YYYY-MM-DD | null
    const maxData = linhas.reduce((m, l) => (l.data > m ? l.data : m), "0000-00-00");
    if (maxData <= "0000-00-00") continue;

    // Sem watermark (não deveria ocorrer em produto de painel pós-reseed): só
    // posiciona o watermark, sem aplicar — evita contar transferências pré-rastreio.
    if (!watermark) {
      await db
        .update(superestoque)
        .set({ transfProcessadaAte: maxData })
        .where(and(eq(superestoque.region, region), eq(superestoque.codigo, prod.codigo), eq(superestoque.tipoProduto, prod.tipoProduto)));
      continue;
    }

    if (maxData <= watermark) continue; // nada novo

    let recebido = 0;
    let enviado = 0;
    for (const l of linhas) {
      if (l.data <= watermark) continue;
      recebido += Number(l.quantidadeEntrada) || 0;
      enviado += Number(l.quantidadeSaida) || 0;
    }

    await db
      .update(superestoque)
      .set({
        estoqueInicial: sql`${superestoque.estoqueInicial} + ${recebido - enviado}`,
        transfRecebidaAcum: sql`${superestoque.transfRecebidaAcum} + ${recebido}`,
        transfEnviadaAcum: sql`${superestoque.transfEnviadaAcum} + ${enviado}`,
        transfProcessadaAte: maxData,
        updatedAt: new Date(),
      })
      .where(and(eq(superestoque.region, region), eq(superestoque.codigo, prod.codigo), eq(superestoque.tipoProduto, prod.tipoProduto)));

    if (recebido !== 0 || enviado !== 0) {
      await db
        .update(superestocadosPermanencia)
        .set({
          transfRecebida: sql`${superestocadosPermanencia.transfRecebida} + ${recebido}`,
          transfEnviada: sql`${superestocadosPermanencia.transfEnviada} + ${enviado}`,
        })
        .where(and(
          eq(superestocadosPermanencia.codigo, prod.codigo),
          eq(superestocadosPermanencia.region, region),
          eq(superestocadosPermanencia.tipoProduto, prod.tipoProduto),
          isNull(superestocadosPermanencia.saiuEm),
        ));
      produtosAjustados++;
      recebidoTotal += recebido;
      enviadoTotal += enviado;
    }
  }

  return { produtosAjustados, recebidoTotal, enviadoTotal };
}

/** Histórico de permanência de um produto no painel (todas as passagens + a atual). */
export async function getProdutoPermanencia(codigo: number, region: RegionKey, tipoProduto: TipoProduto) {
  const db = await getDb();
  if (!db) return { totalPassagens: 0, passagens: [], atual: null };

  const passagens = await db
    .select()
    .from(superestocadosPermanencia)
    .where(and(
      eq(superestocadosPermanencia.codigo, codigo),
      eq(superestocadosPermanencia.region, region),
      eq(superestocadosPermanencia.tipoProduto, tipoProduto),
    ))
    .orderBy(desc(superestocadosPermanencia.entrouEm));

  const prod = await db
    .select({
      painelEntradaEm: superestoque.painelEntradaEm,
      transfRecebidaAcum: superestoque.transfRecebidaAcum,
      transfEnviadaAcum: superestoque.transfEnviadaAcum,
    })
    .from(superestoque)
    .where(and(
      eq(superestoque.region, region),
      eq(superestoque.codigo, codigo),
      eq(superestoque.tipoProduto, tipoProduto),
      isNull(superestoque.vendaZeradaEntradaEm),
    ))
    .limit(1);

  const atual = prod[0]
    ? {
        entrouEm: prod[0].painelEntradaEm,
        diasNoPainel: prod[0].painelEntradaEm
          ? Math.floor((Date.now() - new Date(prod[0].painelEntradaEm).getTime()) / 86400000)
          : null,
        transfRecebida: prod[0].transfRecebidaAcum ?? 0,
        transfEnviada: prod[0].transfEnviadaAcum ?? 0,
      }
    : null;

  return { totalPassagens: passagens.length, passagens, atual };
}

/**
 * Upsert dados de lotes recebidos do conector.
 * A consulta SQL do conector retorna dados por Cod_Estabe (1=SC, 2=RS).
 */
export async function upsertRegionalLotes(region: RegionKey, rows: LoteUploadRow[]) {
  const db = await getDb();
  if (!db) {
    throw new Error("Banco de dados indisponível para persistir os dados de lotes.");
  }

  // Busca todos os produtos da região para mapear código -> id
  const regionProducts = await db
    .select({ id: superestoque.id, codigo: superestoque.codigo })
    .from(superestoque)
    .where(eq(superestoque.region, region));

  if (!regionProducts.length) {
    return { inserted: 0, skipped: rows.length };
  }

  const productsByCode = new Map(regionProducts.map((p) => [p.codigo, p.id]));

  // Filtra apenas os lotes que correspondem a produtos existentes
  const matchedRows = rows
    .map((row) => ({
      superestoqueId: productsByCode.get(row.codProduto) ?? null,
      codLote: row.codLote,
      vencimentoLote: row.vencimentoLote,
      estoqueLote: row.estoqueLote,
      qtdVendida: row.qtdVendida,
    }))
    .filter((row): row is {
      superestoqueId: number;
      codLote: string;
      vencimentoLote: string | null;
      estoqueLote: number;
      qtdVendida: number;
    } => row.superestoqueId !== null && row.codLote.trim() !== "");

  if (!matchedRows.length) {
    return { inserted: 0, skipped: rows.length };
  }

  // Remove lotes antigos dos produtos que estão sendo atualizados
  const affectedProductIds = Array.from(new Set(matchedRows.map((r) => r.superestoqueId)));
  if (affectedProductIds.length) {
    await db.delete(loteSuperestoque).where(
      inArray(loteSuperestoque.superestoqueId, affectedProductIds),
    );
  }

  // Insere os novos lotes
  const BATCH_SIZE = 500;
  for (let i = 0; i < matchedRows.length; i += BATCH_SIZE) {
    const batch = matchedRows.slice(i, i + BATCH_SIZE);
    await db
      .insert(loteSuperestoque)
      .values(batch)
      .onDuplicateKeyUpdate({
        set: {
          vencimentoLote: sql`values(${loteSuperestoque.vencimentoLote})`,
          estoqueLote: sql`values(${loteSuperestoque.estoqueLote})`,
          qtdVendida: sql`values(${loteSuperestoque.qtdVendida})`,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        },
      });
  }

  return {
    inserted: matchedRows.length,
    skipped: Math.max(rows.length - matchedRows.length, 0),
  };
}


/* ─── Campaign History Helpers ─── */

export async function getCampaignHistory(superestoqueId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(campanhaHistorico)
    .where(eq(campanhaHistorico.superestoqueId, superestoqueId))
    .orderBy(desc(campanhaHistorico.criadoEm));
}

/**
 * Inicia ou altera uma campanha:
 * - Se já existe campanha ativa, finaliza a anterior e salva no histórico
 * - Salva a nova campanha no produto
 */
export async function startOrUpdateCampaign(params: {
  productId: number;
  descricao: string;
  dataInicio: string | null;
  dataFim: string | null;
  observacao: string | null;
  keepObservation: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");

  const [product] = await db.select().from(superestoque).where(eq(superestoque.id, params.productId)).limit(1);
  if (!product) throw new Error("Produto não encontrado");

  // Se já tem campanha ativa, salva no histórico antes de substituir
  if (product.statusCampanha === "em_campanha" && product.campanhaDescricao) {
    await db.insert(campanhaHistorico).values({
      superestoqueId: params.productId,
      descricao: product.campanhaDescricao,
      dataInicio: product.campanhaInicio ?? null,
      dataFim: product.campanhaFim ?? null,
      finalizadoEm: new Date(),
    });
  }

  // Congela estoque ideal = vendaMedia * 2 (arredondado para cima)
  const estoqueIdeal = Math.ceil(Number(product.vendaMedia ?? 0) * 2);

  // Determina observação: manter a existente ou usar a nova/null
  const observacao = params.keepObservation
    ? (product.campanhaObservacao ?? params.observacao)
    : params.observacao;

  await db.update(superestoque).set({
    statusCampanha: "em_campanha",
    estoqueIdealCongelado: estoqueIdeal,
    campanhaDescricao: params.descricao,
    campanhaInicio: params.dataInicio,
    campanhaFim: params.dataFim,
    campanhaObservacao: observacao,
  }).where(eq(superestoque.id, params.productId));

  return { success: true, estoqueIdealCongelado: estoqueIdeal };
}

/**
 * Remove campanha do produto, salvando no histórico se houver descrição
 */
export async function removeCampaign(productId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");

  const [product] = await db.select().from(superestoque).where(eq(superestoque.id, productId)).limit(1);
  if (!product) throw new Error("Produto não encontrado");

  // Salva no histórico se tinha campanha com descrição
  if (product.statusCampanha === "em_campanha" && product.campanhaDescricao) {
    await db.insert(campanhaHistorico).values({
      superestoqueId: productId,
      descricao: product.campanhaDescricao,
      dataInicio: product.campanhaInicio ?? null,
      dataFim: product.campanhaFim ?? null,
      finalizadoEm: new Date(),
    });
  }

  await db.update(superestoque).set({
    statusCampanha: "nao_participa",
    estoqueIdealCongelado: null,
    campanhaDescricao: null,
    campanhaInicio: null,
    campanhaFim: null,
    campanhaObservacao: null,
  }).where(eq(superestoque.id, productId));

  return { success: true };
}

/**
 * Atualiza apenas a observação da campanha (bloco de notas)
 */
export async function updateCampaignObservation(productId: number, observacao: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");

  await db.update(superestoque).set({
    campanhaObservacao: observacao,
  }).where(eq(superestoque.id, productId));

  return { success: true };
}

/* ─── Ranking por fornecedor (modo TV) ─────────────────────────────────────── */

export type SuperestocadosRankingItem = {
  fornecedor: string;
  /** Excesso R$ ATUAL somado dos produtos superestocados da indústria. */
  excessoReais: number;
  /** Excesso R$ fixado NA ENTRADA (soma dos snapshots de entrada dos produtos). */
  excessoEntradaReais: number;
  /** Tempo médio no painel (dias desde painelEntradaEm) dos produtos da indústria. */
  tempoMedioDias: number | null;
  /** Acompanhamento do excesso: % de redução desde a entrada (>0 reduziu). null = sem base. */
  acompPct: number | null;
  produtos: number;
};

/**
 * Ranking das indústrias (fornecedor) mais superestocadas — fonte do modo TV.
 * Agrega o painel PRINCIPAL (vendaMedia≥1) por fornecedor. UNIFICADO = união dos
 * dois estados com o excesso somado. Ordena por Excesso R$ (desc) e corta no top N.
 */
export async function getSuperestocadosRanking(region: RegionView, top: number) {
  const db = await getDb();
  if (!db) return { region, top, itens: [] as SuperestocadosRankingItem[], ultimaAtualizacaoMs: null };

  const regioes: RegionKey[] = region === "UNIFICADO" ? ["SC", "RS"] : [region];

  const rows = await db
    .select({
      fornecedor: superestoque.fornecedor,
      estoqueAtual: superestoque.estoqueAtual,
      vendaMedia: superestoque.vendaMedia,
      valorCusto: superestoque.valorCusto,
      excessoEntradaReais: superestoque.excessoEntradaReais,
      painelEntradaEm: superestoque.painelEntradaEm,
      updatedAt: superestoque.updatedAt,
    })
    .from(superestoque)
    .where(and(inArray(superestoque.region, regioes), isNull(superestoque.vendaZeradaEntradaEm)));

  const now = Date.now();
  type Agg = { excessoAtual: number; excessoEntrada: number; tempoSum: number; tempoCount: number; produtos: number };
  const map = new Map<string, Agg>();
  let ultimaAtualizacaoMs: number | null = null;

  for (const r of rows) {
    const forn = (r.fornecedor ?? "").trim() || "(sem fornecedor)";
    const a = map.get(forn) ?? { excessoAtual: 0, excessoEntrada: 0, tempoSum: 0, tempoCount: 0, produtos: 0 };
    a.excessoAtual += excessoReaisSuperestocado(r.estoqueAtual, Number(r.vendaMedia ?? 0), r.valorCusto);
    a.excessoEntrada += r.excessoEntradaReais ?? 0;
    if (r.painelEntradaEm) {
      const ms = new Date(r.painelEntradaEm).getTime();
      if (Number.isFinite(ms)) {
        a.tempoSum += Math.max(0, Math.floor((now - ms) / 86_400_000));
        a.tempoCount++;
      }
    }
    a.produtos++;
    map.set(forn, a);
    const upd = toUtcTimestampMs(r.updatedAt);
    if (upd && (ultimaAtualizacaoMs === null || upd > ultimaAtualizacaoMs)) ultimaAtualizacaoMs = upd;
  }

  const itens: SuperestocadosRankingItem[] = Array.from(map.entries())
    .map(([fornecedor, a]) => ({
      fornecedor,
      excessoReais: a.excessoAtual,
      excessoEntradaReais: a.excessoEntrada,
      tempoMedioDias: a.tempoCount > 0 ? Math.round(a.tempoSum / a.tempoCount) : null,
      acompPct: reducaoExcessoPct(a.excessoEntrada, a.excessoAtual),
      produtos: a.produtos,
    }))
    .sort((x, y) => y.excessoReais - x.excessoReais)
    .slice(0, top);

  return { region, top, itens, ultimaAtualizacaoMs };
}

export type SuperestocadosProdutoRankingItem = {
  codigo: number;
  region: RegionKey;
  nomeProduto: string;
  /** Marca/indústria (razão social) — sublinha da linha. */
  fornecedor: string;
  /** Excesso R$ ATUAL do produto. */
  excessoReais: number;
  /** Excesso R$ fixado NA ENTRADA (snapshot). null = sem base de entrada. */
  excessoEntradaReais: number | null;
  /** Tempo EXATO no painel (dias desde painelEntradaEm). null = sem data de entrada. */
  diasNoPainel: number | null;
  /** Acompanhamento: % de redução do excesso desde a entrada (>0 reduziu). null = sem base. */
  acompPct: number | null;
};

/**
 * Ranking dos PRODUTOS mais superestocados — visão alternativa do modo TV (mesma
 * pegada da de indústrias, mas 1 linha por produto e tempo EXATO no painel). Agrega o
 * painel PRINCIPAL (vendaMedia≥1). UNIFICADO = união dos dois estados (cada produto
 * mantém sua região). Ordena por Excesso R$ (desc) e corta no top N.
 */
export async function getSuperestocadosProdutosRanking(region: RegionView, top: number) {
  const db = await getDb();
  if (!db) return { region, top, itens: [] as SuperestocadosProdutoRankingItem[], ultimaAtualizacaoMs: null };

  const regioes: RegionKey[] = region === "UNIFICADO" ? ["SC", "RS"] : [region];

  const rows = await db
    .select({
      codigo: superestoque.codigo,
      region: superestoque.region,
      nomeProduto: superestoque.nomeProduto,
      fornecedor: superestoque.fornecedor,
      estoqueAtual: superestoque.estoqueAtual,
      vendaMedia: superestoque.vendaMedia,
      valorCusto: superestoque.valorCusto,
      excessoEntradaReais: superestoque.excessoEntradaReais,
      painelEntradaEm: superestoque.painelEntradaEm,
      updatedAt: superestoque.updatedAt,
    })
    .from(superestoque)
    .where(and(inArray(superestoque.region, regioes), isNull(superestoque.vendaZeradaEntradaEm)));

  const now = Date.now();
  let ultimaAtualizacaoMs: number | null = null;

  const itens: SuperestocadosProdutoRankingItem[] = rows
    .map((r) => {
      const excessoAtual = excessoReaisSuperestocado(r.estoqueAtual, Number(r.vendaMedia ?? 0), r.valorCusto);
      let diasNoPainel: number | null = null;
      if (r.painelEntradaEm) {
        const ms = new Date(r.painelEntradaEm).getTime();
        if (Number.isFinite(ms)) diasNoPainel = Math.max(0, Math.floor((now - ms) / 86_400_000));
      }
      const upd = toUtcTimestampMs(r.updatedAt);
      if (upd && (ultimaAtualizacaoMs === null || upd > ultimaAtualizacaoMs)) ultimaAtualizacaoMs = upd;
      return {
        codigo: r.codigo,
        region: r.region as RegionKey,
        nomeProduto: (r.nomeProduto ?? "").trim() || "(sem descrição)",
        fornecedor: (r.fornecedor ?? "").trim() || "(sem fornecedor)",
        excessoReais: excessoAtual,
        excessoEntradaReais: r.excessoEntradaReais == null ? null : Number(r.excessoEntradaReais),
        diasNoPainel,
        acompPct: reducaoExcessoPct(r.excessoEntradaReais, excessoAtual),
      };
    })
    .sort((x, y) => y.excessoReais - x.excessoReais)
    .slice(0, top);

  return { region, top, itens, ultimaAtualizacaoMs };
}

/* ─────────────── Resumo do painel: Valor imobilizado + evolução semanal ───────────────
 * Total ao vivo (Σ valorCusto dos produtos com estoqueAtual>0 = "Valor imobilizado" do
 * dashboard) + retrato das últimas 4 semanas (janela deslizante). O retrato semanal é
 * capturado no sync (upsert da semana ISO corrente) e as passadas ficam congeladas. */

const TZ_SP = "America/Sao_Paulo";

/** Semana ISO "YYYY-Www" da data no fuso America/Sao_Paulo. */
export function anoSemanaIso(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_SP,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const dt = new Date(Date.UTC(get("year"), get("month") - 1, get("day")));
  const dayNum = (dt.getUTCDay() + 6) % 7; // segunda=0 … domingo=6
  dt.setUTCDate(dt.getUTCDate() - dayNum + 3); // quinta-feira da semana ISO
  const firstThu = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((dt.getTime() - firstThu.getTime()) / (7 * 86_400_000));
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Segunda-feira (YYYY-MM-DD) da semana ISO "YYYY-Www" — rótulo dos blocos. */
function segundaDaSemanaIso(anoSemana: string): string {
  const m = /^(\d{4})-W(\d{2})$/.exec(anoSemana);
  if (!m) return anoSemana;
  const year = Number(m[1]);
  const week = Number(m[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7;
  const week1Monday = new Date(jan4.getTime() - jan4Day * 86_400_000);
  const monday = new Date(week1Monday.getTime() + (week - 1) * 7 * 86_400_000);
  return monday.toISOString().slice(0, 10);
}

/** Baldes de tipo do painel (disjuntos; juntos = total). Espelham os filtros do dashboard. */
export type ResumoTipoBalde = "medicamento" | "medicamento_zerado" | "nao_medicamento" | "nao_medicamento_zerado";

type ResumoLive = {
  valorEstoqueTotal: number;
  qtdProdutos: number;
  /** Valor imobilizado por balde (ao vivo, sempre presente). */
  baldes: Record<ResumoTipoBalde, number>;
};

async function resumoLiveRegiao(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  region: RegionKey,
): Promise<ResumoLive> {
  const somaBalde = (tipo: "medicamento" | "nao_medicamento", comVenda: boolean) =>
    sql<number>`COALESCE(SUM(CASE WHEN ${superestoque.tipoProduto} = ${tipo} AND ${superestoque.vendaMedia} ${comVenda ? sql`>= 1` : sql`< 1`} THEN ${superestoque.valorCusto} ELSE 0 END), 0)`;
  const [row] = await db
    .select({
      valor: sql<number>`COALESCE(SUM(${superestoque.valorCusto}), 0)`,
      qtd: sql<number>`COUNT(*)`,
      med: somaBalde("medicamento", true),
      medZ: somaBalde("medicamento", false),
      naoMed: somaBalde("nao_medicamento", true),
      naoMedZ: somaBalde("nao_medicamento", false),
    })
    .from(superestoque)
    .where(and(eq(superestoque.region, region), gt(superestoque.estoqueAtual, 0)));
  return {
    valorEstoqueTotal: Number(row?.valor ?? 0),
    qtdProdutos: Number(row?.qtd ?? 0),
    baldes: {
      medicamento: Number(row?.med ?? 0),
      medicamento_zerado: Number(row?.medZ ?? 0),
      nao_medicamento: Number(row?.naoMed ?? 0),
      nao_medicamento_zerado: Number(row?.naoMedZ ?? 0),
    },
  };
}

/** Retrato AO VIVO do painel (Valor imobilizado). UNIFICADO = SC + RS. */
export async function getSuperestocadosResumo(region: RegionView): Promise<ResumoLive> {
  const zero = (): ResumoLive => ({
    valorEstoqueTotal: 0,
    qtdProdutos: 0,
    baldes: { medicamento: 0, medicamento_zerado: 0, nao_medicamento: 0, nao_medicamento_zerado: 0 },
  });
  const db = await getDb();
  if (!db) return zero();
  const regioes: RegionKey[] = region === "UNIFICADO" ? ["SC", "RS"] : [region];
  const parciais = await Promise.all(regioes.map((r) => resumoLiveRegiao(db, r)));
  return parciais.reduce((acc, p) => {
    acc.valorEstoqueTotal += p.valorEstoqueTotal;
    acc.qtdProdutos += p.qtdProdutos;
    for (const k of Object.keys(acc.baldes) as ResumoTipoBalde[]) acc.baldes[k] += p.baldes[k];
    return acc;
  }, zero());
}

/**
 * Captura/atualiza o retrato da semana ISO corrente de UMA região (chamada no sync).
 * Idempotente: reescreve a semana corrente; semanas passadas ficam congeladas.
 * Grava também o valor por balde (tipo), p/ a faixa das 4 semanas reagir ao filtro.
 */
export async function capturarResumoSemanal(region: RegionKey): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const { valorEstoqueTotal, qtdProdutos, baldes } = await resumoLiveRegiao(db, region);
  const anoSemana = anoSemanaIso();
  const valores = {
    valorEstoqueTotal,
    qtdProdutos,
    valorMedicamento: baldes.medicamento,
    valorMedicamentoZerado: baldes.medicamento_zerado,
    valorNaoMedicamento: baldes.nao_medicamento,
    valorNaoMedicamentoZerado: baldes.nao_medicamento_zerado,
  };
  await db
    .insert(superestocadosResumoSemanal)
    .values({ region, anoSemana, ...valores })
    .onDuplicateKeyUpdate({ set: { ...valores, updatedAt: sql`CURRENT_TIMESTAMP` } });
}

export type ResumoSemana = {
  anoSemana: string;
  /** Segunda-feira da semana (YYYY-MM-DD), para rótulo. */
  inicioSemana: string;
  /** Valor imobilizado (total, ou soma dos tipos selecionados). 0 quando `semDado`. */
  valorEstoqueTotal: number;
  /** Variação % vs a semana anterior COM dado (null na base / sem dado). */
  deltaPct: number | null;
  /** down = reduziu (bom) · up = cresceu · flat = manteve · null = base. */
  direcao: "up" | "down" | "flat" | null;
  /** true = semana capturada antes do recorte por tipo (não dá pra separar) → exibir "sem dado". */
  semDado?: boolean;
};

export type ResumoPainelData = {
  region: RegionView;
  valorEstoqueTotal: number;
  qtdProdutos: number;
  semanas: ResumoSemana[];
};

/** Variação relativa abaixo disso (em %) é considerada "manteve". */
const RESUMO_FLAT_PCT = 1;

/**
 * Total AO VIVO (Valor imobilizado) + últimas 4 semanas (janela deslizante) com a
 * variação semana-a-semana. A semana corrente usa o valor ao vivo (bate com o headline);
 * as anteriores vêm do retrato congelado. UNIFICADO soma SC + RS por semana.
 *
 * `tipos` (opcional) = baldes selecionados no painel. Vazio → total (histórico completo).
 * Com tipos: soma os baldes; a semana corrente é ao vivo (sempre disponível), mas semanas
 * antigas capturadas antes do recorte por tipo (baldes NULL) vêm marcadas `semDado`.
 */
export async function getResumoPainel(region: RegionView, tipos: ResumoTipoBalde[] = []): Promise<ResumoPainelData> {
  const db = await getDb();
  const live = await getSuperestocadosResumo(region);
  const usaTipos = tipos.length > 0;
  const liveSel = usaTipos ? tipos.reduce((s, k) => s + live.baldes[k], 0) : live.valorEstoqueTotal;

  if (!db) {
    return { region, valorEstoqueTotal: liveSel, qtdProdutos: live.qtdProdutos, semanas: [] };
  }

  const regioes: RegionKey[] = region === "UNIFICADO" ? ["SC", "RS"] : [region];
  const rows = await db
    .select({
      anoSemana: superestocadosResumoSemanal.anoSemana,
      valor: superestocadosResumoSemanal.valorEstoqueTotal,
      medicamento: superestocadosResumoSemanal.valorMedicamento,
      medicamento_zerado: superestocadosResumoSemanal.valorMedicamentoZerado,
      nao_medicamento: superestocadosResumoSemanal.valorNaoMedicamento,
      nao_medicamento_zerado: superestocadosResumoSemanal.valorNaoMedicamentoZerado,
    })
    .from(superestocadosResumoSemanal)
    .where(inArray(superestocadosResumoSemanal.region, regioes));

  // Agrega por semana. total = soma do valor; sel = soma dos baldes selecionados.
  // Se qualquer região tiver um balde selecionado NULL, a semana não tem recorte por tipo.
  type Acc = { total: number; sel: number; semDado: boolean };
  const porSemana = new Map<string, Acc>();
  for (const r of rows) {
    const cur = porSemana.get(r.anoSemana) ?? { total: 0, sel: 0, semDado: false };
    cur.total += Number(r.valor ?? 0);
    if (usaTipos) {
      for (const k of tipos) {
        const v = r[k];
        if (v === null || v === undefined) cur.semDado = true;
        else cur.sel += Number(v);
      }
    }
    porSemana.set(r.anoSemana, cur);
  }

  // A semana corrente sempre reflete o valor AO VIVO (consistente com o headline; nunca "sem dado").
  porSemana.set(anoSemanaIso(), { total: live.valorEstoqueTotal, sel: liveSel, semDado: false });

  // Janela deslizante: as 4 semanas mais recentes (string ISO ordena cronologicamente).
  const ordenadas = Array.from(porSemana.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(-4);

  const semanas: ResumoSemana[] = [];
  let anterior: number | null = null; // último valor COM dado (base do delta)
  for (const [anoSemana, acc] of ordenadas) {
    const semDado = usaTipos && acc.semDado;
    const valor = semDado ? 0 : usaTipos ? acc.sel : acc.total;

    let deltaPct: number | null = null;
    let direcao: ResumoSemana["direcao"] = null;
    if (!semDado && anterior !== null) {
      if (anterior > 0) {
        deltaPct = ((valor - anterior) / anterior) * 100;
        direcao = Math.abs(deltaPct) < RESUMO_FLAT_PCT ? "flat" : deltaPct < 0 ? "down" : "up";
      } else {
        deltaPct = 0;
        direcao = "flat";
      }
    }
    semanas.push({ anoSemana, inicioSemana: segundaDaSemanaIso(anoSemana), valorEstoqueTotal: valor, deltaPct, direcao, semDado });
    if (!semDado) anterior = valor;
  }

  return { region, valorEstoqueTotal: liveSel, qtdProdutos: live.qtdProdutos, semanas };
}
