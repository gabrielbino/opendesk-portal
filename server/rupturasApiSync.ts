/**
 * Sync de RUPTURAS via API Erp (query dia_estoque_sc / dia_estoque_rs).
 *
 * Usa o cliente COMPARTILHADO da API (server/erpApi.ts) + o wrapper tipado
 * fetchProdutosEstoque (server/erpQueries.ts). Aqui fica só a regra do domínio:
 * classificar ruptura, agregar por marca e persistir.
 *
 * Fluxo (por região SC/RS):
 *   1. fetchProdutosEstoque(region) → universo de produtos ativos da região;
 *   2. classifica ruptura = estoque ZERADO ou diasEstoque < DIAS_RUPTURA;
 *   3. agrega por fornecedor (totalAtivos = denominador da %; qtdRuptura; qtdZerados);
 *   4. replaceRegionalRupturas → grava detalhe (só itens em ruptura) + resumo (replace).
 */

import { erpApiConfigurada } from "./erpApi";
import { fetchProdutosEstoque } from "./erpQueries";
import {
  DIAS_RUPTURA,
  replaceRegionalRupturas,
  type MarcaResumoInput,
  type RupturaItemInput,
} from "./db/rupturas";
import type { RegionKey } from "./superestocadosDataset";

const REGIOES: RegionKey[] = ["SC", "RS"];

type RegionResult = {
  region: RegionKey;
  ativos: number;
  emRuptura: number;
  zerados: number;
  marcas: number;
  skipped?: string;
};

/** Sincroniza as rupturas de uma região. */
export async function syncRegionRupturas(region: RegionKey): Promise<RegionResult> {
  const produtos = await fetchProdutosEstoque(region);
  if (!produtos.length) {
    return { region, ativos: 0, emRuptura: 0, zerados: 0, marcas: 0, skipped: "API não retornou produtos" };
  }

  const itens: RupturaItemInput[] = [];
  // Agregado por marca: total de ativos (denominador), ruptura e zerados.
  const resumoMap = new Map<string, MarcaResumoInput>();

  for (const p of produtos) {
    const fornecedor = p.fornecedor || "(sem fornecedor)";
    let resumo = resumoMap.get(fornecedor);
    if (!resumo) {
      resumo = { fornecedor, totalAtivos: 0, qtdRuptura: 0, qtdZerados: 0 };
      resumoMap.set(fornecedor, resumo);
    }
    resumo.totalAtivos += 1;

    const zerado = p.estoqueAtual <= 0;
    const emRuptura = zerado || p.diasEstoque < DIAS_RUPTURA;
    if (!emRuptura) continue;

    resumo.qtdRuptura += 1;
    if (zerado) resumo.qtdZerados += 1;

    itens.push({
      codigo: p.codigo,
      fornecedor,
      nomeProduto: p.nomeProduto,
      tipoProduto: p.tipoProduto,
      diasEstoque: p.diasEstoque,
      estoqueAtual: p.estoqueAtual,
      vendaMedia: p.vendaMedia,
      valorCusto: p.valorCusto,
    });
  }

  const resumo = Array.from(resumoMap.values());
  await replaceRegionalRupturas(region, itens, resumo);

  return {
    region,
    ativos: produtos.length,
    emRuptura: itens.length,
    zerados: itens.filter((i) => i.estoqueAtual <= 0).length,
    marcas: resumo.length,
  };
}

/** Sincroniza as rupturas de todas as regiões. Não aborta tudo se uma região falhar. */
export async function syncAllRupturas(): Promise<{ ok: boolean; resultados: any[] }> {
  if (!erpApiConfigurada()) {
    throw new Error("API Erp não configurada (defina ERP_API_URL, ERP_API_USER, ERP_API_SENHA).");
  }

  const resultados: any[] = [];
  let ok = true;
  for (const region of REGIOES) {
    try {
      resultados.push(await syncRegionRupturas(region));
    } catch (error) {
      ok = false;
      resultados.push({ region, erro: error instanceof Error ? error.message : String(error) });
    }
  }
  return { ok, resultados };
}
