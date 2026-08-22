/**
 * Validades Curtas — lógica de negócio (servidor).
 *
 * Regra de entrada:
 *   entra ⇔ MtV < TETO (VC_ATENCAO_ATE) E DpV > (MtV − JANELA_RISCO)
 *   onde:
 *     MtV = Dias até vencer (lote mais próximo)
 *     DpV = Dias para vender = estoqueLote ÷ (vendaMedia / 30)
 *     Venda zerada → DpV = Infinity → sempre entra (se MtV < TETO)
 *
 * Classificação em 5 bandas por MtV (dias até vencer).
 *
 * DADOS: lê da tabela `validades_curtas_itens` que contém TODOS os produtos
 * com lote/vencimento (sincronizado pelo validadesCurtasSync.ts).
 */

import { getDb } from "../db";
import { validadesCurtasItens } from "../../drizzle/schema";
import { and, eq, lte, sql } from "drizzle-orm";
import { getValidadesCurtasParams } from "./parametros";
import { getMapaMarcaComprador } from "./compradores";
import { normMarcaKey } from "./marcaAliases";
import type {
  BandaId,
  ItemValidadeCurta,
  VCKpis,
  VCDashboardData,
  RegionView,
  TipoFiltroVC,
} from "@shared/validadesCurtas";
import { BANDAS_ORDER, VC_COMPRADOR_NAO_ATRIBUIDO } from "@shared/validadesCurtas";

// ─── Helpers ────────────────────────────────────────────────────────────────

function diffDays(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

function classificarBanda(
  diasAteVencer: number,
  limites: { descarte: number; bonificavel: number; altoRisco: number; alerta: number; atencao: number }
): BandaId {
  if (diasAteVencer <= limites.descarte) return "descarte";
  if (diasAteVencer <= limites.bonificavel) return "bonificavel";
  if (diasAteVencer <= limites.altoRisco) return "alto_risco";
  if (diasAteVencer <= limites.alerta) return "alerta";
  return "atencao";
}

// ─── Tipo da row do banco ───────────────────────────────────────────────────

interface VCRow {
  codigo: number;
  nomeProduto: string;
  fornecedor: string;
  tipoProduto: "medicamento" | "nao_medicamento";
  codLote: string;
  vencimentoLote: string;
  estoqueLote: number;
  estoqueTotal: number;
  vendaMedia: number;
  valorCusto: number | null;
  valorEstoqueCusto: number | null;
  diasEstoque: number;
  region: "SC" | "RS";
}

// ─── Busca no banco ─────────────────────────────────────────────────────────

async function fetchItensDoDb(
  regionView: RegionView,
  tetoMaxDias: number
): Promise<VCRow[]> {
  const db = await getDb();
  if (!db) return [];

  // Data limite: hoje + teto dias
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const limite = new Date(hoje);
  limite.setDate(limite.getDate() + tetoMaxDias);
  const limiteStr = limite.toISOString().split("T")[0];

  // Construir condição de região
  const regionCondition =
    regionView === "UNIFICADO"
      ? undefined
      : eq(validadesCurtasItens.region, regionView);

  const rows = await db
    .select({
      codigo: validadesCurtasItens.codigo,
      nomeProduto: validadesCurtasItens.nomeProduto,
      fornecedor: validadesCurtasItens.fornecedor,
      tipoProduto: validadesCurtasItens.tipoProduto,
      codLote: validadesCurtasItens.codLote,
      vencimentoLote: validadesCurtasItens.vencimentoLote,
      estoqueLote: validadesCurtasItens.estoqueLote,
      estoqueTotal: validadesCurtasItens.estoqueTotal,
      vendaMedia: validadesCurtasItens.vendaMedia,
      valorCusto: validadesCurtasItens.valorCusto,
      valorEstoqueCusto: validadesCurtasItens.valorEstoqueCusto,
      diasEstoque: validadesCurtasItens.diasEstoque,
      region: validadesCurtasItens.region,
    })
    .from(validadesCurtasItens)
    .where(
      and(
        lte(validadesCurtasItens.vencimentoLote, limiteStr),
        regionCondition
      )
    );

  return rows as unknown as VCRow[];
}

// ─── Processamento principal ────────────────────────────────────────────────

function processarProdutos(
  rows: VCRow[],
  params: Awaited<ReturnType<typeof getValidadesCurtasParams>>
): ItemValidadeCurta[] {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const teto = params.VC_ATENCAO_ATE;
  const janelaRisco = params.VC_JANELA_RISCO_DIAS;

  const limites = {
    descarte: params.VC_DESCARTE_ATE,
    bonificavel: params.VC_BONIFICAVEL_ATE,
    altoRisco: params.VC_ALTO_RISCO_ATE,
    alerta: params.VC_ALERTA_ATE,
    atencao: params.VC_ATENCAO_ATE,
  };

  const resultado: ItemValidadeCurta[] = [];

  for (const p of rows) {
    if (!p.vencimentoLote) continue;

    const dataVenc = new Date(p.vencimentoLote + "T00:00:00");
    if (isNaN(dataVenc.getTime())) continue;

    const mtv = diffDays(hoje, dataVenc); // Dias até vencer (pode ser negativo = já vencido)

    // Regra de entrada: MtV < TETO
    if (mtv >= teto) continue;

    // Calcular DpV (dias para vender) usando estoqueLote
    const vendaDiaria = p.vendaMedia / 30;
    const dpv = vendaDiaria > 0 ? p.estoqueLote / vendaDiaria : Infinity;

    // Regra de entrada: DpV > (MtV - JANELA_RISCO)
    if (dpv <= (mtv - janelaRisco)) continue;

    // Classificar banda (usa MtV, inclusive negativos vão para descarte)
    const banda = classificarBanda(Math.max(mtv, 0), limites);

    // Valor em risco = estoqueLote × valorCusto (custo unitário)
    const custoUnitario = p.valorCusto ?? 0;
    const valorEmRisco = p.estoqueLote * custoUnitario;

    resultado.push({
      codigo: p.codigo,
      nomeProduto: p.nomeProduto,
      fornecedor: p.fornecedor,
      tipoProduto: p.tipoProduto,
      estoqueAtual: p.estoqueLote,
      vendaMedia: p.vendaMedia,
      valorEstoqueCusto: p.valorEstoqueCusto,
      comprador: null, // enriquecido depois (lente marca→comprador)
      vencimentoLote: p.vencimentoLote,
      diasAteVencer: mtv,
      diasParaVender: dpv === Infinity ? 99999 : Math.round(dpv),
      banda,
      valorEmRisco,
      region: p.region,
    });
  }

  return resultado;
}

// ─── KPIs ───────────────────────────────────────────────────────────────────

function calcularKpis(itens: ItemValidadeCurta[]): VCKpis {
  const contagemPorBanda: Record<BandaId, number> = {
    descarte: 0,
    bonificavel: 0,
    alto_risco: 0,
    alerta: 0,
    atencao: 0,
  };

  let estoqueTotal = 0;
  let valorEmRiscoTotal = 0;
  let totalVencidos = 0;
  let menorDiasNaoVencido: number | null = null;

  for (const item of itens) {
    contagemPorBanda[item.banda]++;
    estoqueTotal += item.estoqueAtual;
    valorEmRiscoTotal += item.valorEmRisco;
    if (item.diasAteVencer < 0) {
      totalVencidos++;
    } else if (menorDiasNaoVencido === null || item.diasAteVencer < menorDiasNaoVencido) {
      menorDiasNaoVencido = item.diasAteVencer;
    }
  }

  return {
    totalItens: itens.length,
    estoqueTotal,
    valorEmRiscoTotal,
    contagemPorBanda,
    totalVencidos,
    menorDiasNaoVencido,
  };
}

/**
 * Filtra por comprador (multi-seleção; união). Vazio = todos. A sentinela
 * `VC_COMPRADOR_NAO_ATRIBUIDO` casa com itens sem comprador.
 */
function aplicarFiltroComprador(itens: ItemValidadeCurta[], compradorFiltros?: string[]): ItemValidadeCurta[] {
  if (!compradorFiltros || compradorFiltros.length === 0) return itens;
  const set = new Set(compradorFiltros);
  return itens.filter((i) => set.has(i.comprador ?? VC_COMPRADOR_NAO_ATRIBUIDO));
}

/** Último `syncedAt` da tabela (ms) — quando os dados foram de fato atualizados. null se vazio. */
async function getUltimaAtualizacaoMs(regionView: RegionView): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const cond = regionView === "UNIFICADO" ? undefined : eq(validadesCurtasItens.region, regionView);
  const [row] = await db
    .select({ max: sql<string | null>`MAX(${validadesCurtasItens.syncedAt})` })
    .from(validadesCurtasItens)
    .where(cond);
  if (!row?.max) return null;
  const t = new Date(row.max).getTime();
  return Number.isNaN(t) ? null : t;
}

// ─── Filtros (multi-seleção) ────────────────────────────────────────────────

function aplicarFiltroTipo(itens: ItemValidadeCurta[], tipos: TipoFiltroVC[]): ItemValidadeCurta[] {
  if (!tipos.length || tipos.includes("todos")) return itens;

  return itens.filter((i) => {
    for (const tipo of tipos) {
      switch (tipo) {
        case "medicamento":
          if (i.tipoProduto === "medicamento" && i.vendaMedia > 0) return true;
          break;
        case "medicamento_venda_zerada":
          if (i.tipoProduto === "medicamento" && i.vendaMedia === 0) return true;
          break;
        case "nao_medicamento":
          if (i.tipoProduto === "nao_medicamento" && i.vendaMedia > 0) return true;
          break;
        case "nao_medicamento_venda_zerada":
          if (i.tipoProduto === "nao_medicamento" && i.vendaMedia === 0) return true;
          break;
      }
    }
    return false;
  });
}

function aplicarFiltroBandas(itens: ItemValidadeCurta[], bandas: BandaId[]): ItemValidadeCurta[] {
  if (!bandas.length) return itens;
  const bandasSet = new Set(bandas);
  return itens.filter((i) => bandasSet.has(i.banda));
}

// ─── Função principal exportada ─────────────────────────────────────────────

export async function getValidadesCurtasDashboard(
  regionView: RegionView,
  tipoFiltros: TipoFiltroVC[] = ["todos"],
  bandaFiltros: BandaId[] = [],
  compradorFiltros?: string[],
  soVencidos = false
): Promise<VCDashboardData> {
  const params = await getValidadesCurtasParams();

  // Busca do banco local (tabela validades_curtas_itens)
  const rows = await fetchItensDoDb(regionView, params.VC_ATENCAO_ATE);

  // Processar e classificar
  const todosItens = processarProdutos(rows, params);

  // Enriquecer com o comprador (lente compartilhada marca→comprador).
  const mapaComprador = await getMapaMarcaComprador();
  for (const item of todosItens) {
    item.comprador = mapaComprador.get(normMarcaKey(item.fornecedor))?.nome ?? null;
  }
  // Lista de compradores presentes (para o dropdown) + se há itens sem comprador.
  const compradores = Array.from(new Set(todosItens.map((i) => i.comprador).filter((c): c is string => c !== null))).sort(
    (a, b) => a.localeCompare(b, "pt-BR"),
  );
  const temNaoAtribuido = todosItens.some((i) => i.comprador === null);

  // Aplicar filtros (multi-seleção + comprador)
  let itensFiltrados = aplicarFiltroTipo(todosItens, tipoFiltros);
  itensFiltrados = aplicarFiltroBandas(itensFiltrados, bandaFiltros);
  itensFiltrados = aplicarFiltroComprador(itensFiltrados, compradorFiltros);
  if (soVencidos) itensFiltrados = itensFiltrados.filter((i) => i.diasAteVencer < 0);

  // Ordenar por urgência (banda mais urgente primeiro), depois por valor em risco desc
  const bandaOrdem = Object.fromEntries(BANDAS_ORDER.map((b, i) => [b, i]));
  itensFiltrados.sort((a, b) => {
    const bandaDiff = bandaOrdem[a.banda] - bandaOrdem[b.banda];
    if (bandaDiff !== 0) return bandaDiff;
    return b.valorEmRisco - a.valorEmRisco;
  });

  // KPIs calculados sobre os itens filtrados (acompanham a seleção)
  const kpis = calcularKpis(itensFiltrados);

  // KPIs globais (sem filtro de tipo/banda) para contagem total de bandas no header
  const kpisGlobais = calcularKpis(todosItens);

  return {
    region: regionView,
    compradores,
    temNaoAtribuido,
    itens: itensFiltrados,
    kpis,
    kpisGlobais,
    ultimaAtualizacaoMs: await getUltimaAtualizacaoMs(regionView),
  };
}
