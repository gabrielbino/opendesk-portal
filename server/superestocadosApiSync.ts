/**
 * Sync de VENDAS do Superestocados via API Erp (substitui o job de vendas do
 * conector, que misturava transferência/bonificação no total).
 *
 * Usa o cliente COMPARTILHADO da API (server/erpApi.ts) — aqui fica só o que é
 * específico do Superestocados: mapeamento dos campos e ingestão.
 *
 * Fluxo (por região SC/RS):
 *   1. pega os códigos dos produtos do painel (getRegionProductCodes);
 *   2. executarQuery("venda_por_dia", { cod_estabe, lista_produtos });
 *   3. mapeia o retorno (`dados[]`) → VendaUploadRow (qtd_venda = venda limpa);
 *   4. grava com replaceRegionalSalesHistory (a query devolve a janela fixa de 15
 *      dias úteis, então substituir é idempotente).
 */

import {
  aplicarTransferenciasRegiao,
  capturarResumoSemanal,
  getRegionProductCodes,
  replaceRegionalSalesHistory,
  rotateRegionalProducts,
  upsertRegionalLotes,
} from "./db/superestocados";
import type { LoteUploadRow, RegionKey, VendaUploadRow } from "./superestocadosDataset";
import type { CsvRotationRow } from "./superestocadosConnectorIngestion";
import { erpApiConfigurada } from "./erpApi";
import { fetchProdutosEstoque, fetchVendaPorDia } from "./erpQueries";

/** Mapeia região → estabelecimento do ERP. */
const COD_ESTABE: Record<RegionKey, string> = { SC: "1", RS: "2" };
const REGIOES: RegionKey[] = ["SC", "RS"];

type RegionResult = {
  region: RegionKey;
  produtos: number;
  linhas: number;
  datas: number;
  skipped?: string;
  transf?: { produtosAjustados: number; recebidoTotal: number; enviadoTotal: number };
};

/** Sincroniza as vendas de uma região. */
export async function syncRegionVendas(region: RegionKey): Promise<RegionResult> {
  const codes = await getRegionProductCodes(region);
  if (!codes.length) {
    return { region, produtos: 0, linhas: 0, datas: 0, skipped: "sem produtos no painel" };
  }

  const linhas = await fetchVendaPorDia(COD_ESTABE[region], codes);

  const rows: VendaUploadRow[] = linhas.map((l) => ({
    codigo: l.codProduto,
    nomeProduto: l.descricaoProduto,
    dataVenda: l.data,
    quantidade: l.qtdVenda,
  }));

  await replaceRegionalSalesHistory(region, rows);

  // Mesmo retorno traz quantidade_entrada/saida (transferências entre CDs) →
  // ajusta o estoque inicial (once-only por produto).
  const transf = await aplicarTransferenciasRegiao(region, linhas);

  const datas = new Set(rows.map((r) => r.dataVenda)).size;
  return { region, produtos: codes.length, linhas: rows.length, datas, transf };
}

/* ─────────────────────────── PRODUTOS (rotação do painel) ─────────────────────────── */

type ProdutoResult = {
  region: RegionKey;
  produtos: number;
  persistence?: Record<string, number>;
  lotes?: number;
  skipped?: string;
};

/**
 * Sincroniza os PRODUTOS de uma região via API (substitui o CSV `dias_estoque` do
 * conector). Busca o universo de produtos ativos (`dia_estoque_<region>`), mapeia para
 * o mesmo formato do conector (`CsvRotationRow`) e reaproveita `rotateRegionalProducts`
 * (rotação/permanência/snapshot) + `upsertRegionalLotes` (lote embutido na linha).
 */
export async function syncRegionProdutos(region: RegionKey): Promise<ProdutoResult> {
  const produtos = await fetchProdutosEstoque(region);
  if (!produtos.length) {
    return { region, produtos: 0, skipped: "API não retornou produtos" };
  }

  const csvRows: CsvRotationRow[] = produtos.map((p) => ({
    codigo: p.codigo,
    nomeProduto: p.nomeProduto,
    // Padrão da diretoria: sempre a razão social ("Fornecedor"), nunca o fabricante.
    fornecedor: p.fornecedor,
    categoria: p.tipoProduto,
    dataUltimaCompra: p.dataUltimaCompra,
    diasEstoque: p.diasEstoque,
    estoqueAtual: p.estoqueAtual,
    // Vlr. Custo do painel = valor TOTAL do estoque a custo (unit. sai de total ÷ estoque).
    valorCusto: p.valorEstoqueCusto,
    vendaMedia: p.vendaMedia,
    codLote: p.codLote,
    vencimentoLote: p.vencimentoLote,
    estoqueLote: p.estoqueLote,
    dataUltimaTransferencia: p.dataUltimaTransferencia,
    qtdVendaMesAnterior: p.qtdVendaMesAnterior,
    qtdVenda2MesesAnterior: p.qtdVenda2MesesAnterior,
    qtdProjetadoMesAtual: p.qtdProjetadoMesAtual,
    precoPolitica: p.precoPolitica,
    qtdVendaMesAtual: p.qtdVendaMesAtual,
  }));

  const persistence = await rotateRegionalProducts(region, csvRows);

  // Lote embutido na linha (1 lote por produto) — mesmo tratamento do conector.
  const codEstabe = region === "SC" ? "1" : "2";
  const loteRows: LoteUploadRow[] = csvRows
    .filter(
      (row): row is CsvRotationRow & { codLote: string; estoqueLote: number } =>
        typeof row.codLote === "string" &&
        row.codLote.trim() !== "" &&
        typeof row.estoqueLote === "number" &&
        row.estoqueLote > 0,
    )
    .map((row) => ({
      codEstabe,
      codProduto: row.codigo,
      codLote: row.codLote,
      vencimentoLote: row.vencimentoLote ?? null,
      qtdVendida: 0,
      estoqueLote: row.estoqueLote,
    }));

  if (loteRows.length > 0) {
    await upsertRegionalLotes(region, loteRows);
  }

  // Retrato semanal (Valor imobilizado) da semana ISO corrente — não pode derrubar o sync.
  try {
    await capturarResumoSemanal(region);
  } catch (err) {
    console.warn(`[superestocados] falha ao capturar resumo semanal de ${region}:`, err);
  }

  return { region, produtos: produtos.length, persistence, lotes: loteRows.length };
}

/**
 * Sincroniza uma região por completo: PRODUTOS primeiro (define os códigos do painel)
 * e depois VENDAS (que dependem desses códigos). Usado pelo refresh manual e pelo cron.
 */
export async function syncRegion(region: RegionKey): Promise<{ produtos: ProdutoResult; vendas: RegionResult }> {
  if (!erpApiConfigurada()) {
    throw new Error("API Erp não configurada (defina ERP_API_URL, ERP_API_USER, ERP_API_SENHA).");
  }
  const produtos = await syncRegionProdutos(region);
  const vendas = await syncRegionVendas(region);
  return { produtos, vendas };
}

/** Sincroniza os produtos de todas as regiões. Não aborta tudo se uma região falhar. */
export async function syncAllProdutos(): Promise<{ ok: boolean; resultados: any[] }> {
  if (!erpApiConfigurada()) {
    throw new Error("API Erp não configurada (defina ERP_API_URL, ERP_API_USER, ERP_API_SENHA).");
  }
  const resultados: any[] = [];
  let ok = true;
  for (const region of REGIOES) {
    try {
      resultados.push(await syncRegionProdutos(region));
    } catch (error) {
      ok = false;
      resultados.push({ region, erro: error instanceof Error ? error.message : String(error) });
    }
  }
  return { ok, resultados };
}

/** Sincroniza as vendas de todas as regiões. Não aborta tudo se uma região falhar. */
export async function syncAllVendas(): Promise<{ ok: boolean; resultados: any[] }> {
  if (!erpApiConfigurada()) {
    throw new Error("API Erp não configurada (defina ERP_API_URL, ERP_API_USER, ERP_API_SENHA).");
  }

  const resultados: any[] = [];
  let ok = true;
  for (const region of REGIOES) {
    try {
      resultados.push(await syncRegionVendas(region));
    } catch (error) {
      ok = false;
      resultados.push({ region, erro: error instanceof Error ? error.message : String(error) });
    }
  }
  return { ok, resultados };
}
