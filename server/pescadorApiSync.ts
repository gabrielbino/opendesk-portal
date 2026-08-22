/**
 * Sync da TRIAGEM do Pescador via API Erp (consulta "pescador", codigoQuery 9).
 *
 * Substitui o seed estático (`server/scripts/pescador-seed/`) para a Triagem.
 * Pedidos e Histórico continuam no seed até terem suas próprias consultas na API.
 *
 * Fluxo:
 *   1. fetchPescadorTriagem(idPolCom) → universo de produtos da Triagem (Clamed SC);
 *   2. dedupe pela chave natural (ean, política);
 *   3. replace total de `pescador_triagem` (delete + insert em lotes);
 *   4. registra `pescador_meta` (fonte "api", totais reais das 3 tabelas).
 */

import { eq, sql } from "drizzle-orm";

import { getDb } from "./db";
import {
  parametros,
  pescadorHistorico,
  pescadorMeta,
  pescadorPedidos,
  pescadorTriagem,
} from "../drizzle/schema";
import { erpApiConfigurada } from "./erpApi";
import { fetchPescadorTriagem, type PescadorMCParams, type PescadorTriagemRow } from "./erpQueries";

/**
 * Premissas da MC (Margem de Contribuição) — parâmetros da consulta `pescador_3`.
 * Config ÚNICO do módulo (defaults definidos pela área). Gravados no `pescador_meta` a cada
 * carga e expostos pelo `getMeta` (a UI usa como base do what-if). idPolCom = políticas Clamed SC.
 */
export const MC_PARAMS: PescadorMCParams = {
  empresa: "ErpSC",
  idPolCom: "88371, 88372",
  regiaoTributaria: "200",
  varFrete: "0.04",
  varPerdasVencidos: "0.01",
  varContratos: "0.005",
  varInvestEmp: "0",
  varAssociativismo: "0",
};

const BATCH = 500;

/** Chaves em `sys_parametros` (módulo "pescador") que persistem as premissas da MC. */
export const MC_PARAM_CHAVES: Record<keyof PescadorMCParams, string> = {
  empresa: "PESCADOR_MC_EMPRESA",
  idPolCom: "PESCADOR_MC_ID_POLCOM",
  regiaoTributaria: "PESCADOR_MC_REGIAO_TRIBUTARIA",
  varFrete: "PESCADOR_MC_VAR_FRETE",
  varPerdasVencidos: "PESCADOR_MC_VAR_PERDAS_VENCIDOS",
  varContratos: "PESCADOR_MC_VAR_CONTRATOS",
  varInvestEmp: "PESCADOR_MC_VAR_INVEST_EMP",
  varAssociativismo: "PESCADOR_MC_VAR_ASSOCIATIVISMO",
};

/**
 * Premissas da MC efetivas: lê de `sys_parametros` (módulo "pescador"); o que não estiver
 * cadastrado cai no default (`MC_PARAMS`). Editável em Admin→Parâmetros — sem redeploy.
 */
export async function loadMcParams(): Promise<PescadorMCParams> {
  const db = await getDb();
  if (!db) return { ...MC_PARAMS };
  const rows = await db.select().from(parametros).where(eq(parametros.modulo, "pescador"));
  const porChave = new Map(rows.map((r) => [r.chave, r.valor]));
  const out = { ...MC_PARAMS };
  for (const k of Object.keys(MC_PARAM_CHAVES) as Array<keyof PescadorMCParams>) {
    const v = porChave.get(MC_PARAM_CHAVES[k]);
    if (v != null && String(v).trim() !== "") out[k] = String(v).trim();
  }
  return out;
}

/** Achata a janela de 15 dias nos campos dataD1..D15 / vendaD1..D15 do schema. */
function janelaParaColunas(janela: PescadorTriagemRow["janela"]) {
  const cols: Record<string, string | number | null> = {};
  for (let i = 0; i < 15; i++) {
    const d = janela[i] ?? { data: null, venda: 0 };
    cols[`dataD${i + 1}`] = d.data;
    cols[`vendaD${i + 1}`] = d.venda;
  }
  return cols;
}

async function contar(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, table: any): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(table);
  return Number(r?.n ?? 0);
}

export async function syncPescadorTriagem() {
  if (!erpApiConfigurada()) {
    throw new Error("API Erp não configurada (defina ERP_API_URL, ERP_API_USER, ERP_API_SENHA).");
  }
  const db = await getDb();
  if (!db) {
    throw new Error("Banco de dados indisponível para sincronizar a Triagem do Pescador.");
  }

  const mcParams = await loadMcParams();
  const linhas = await fetchPescadorTriagem(mcParams);

  // Dedupe pela chave natural (ean, política) — mesma regra do seed.
  const porChave = new Map<string, PescadorTriagemRow>();
  for (const l of linhas) {
    const k = `${l.ean}::${l.politica}`;
    if (!porChave.has(k)) porChave.set(k, l);
  }
  const unicas = Array.from(porChave.values());

  const values = unicas.map((l) => ({
    estabelecimento: l.estabelecimento,
    ean: l.ean,
    codInterno: l.codInterno,
    descricao: l.descricao,
    fabricante: l.fabricante,
    fornecedor: l.fornecedor,
    politica: l.politica,
    estoqueSc: l.estoqueSc,
    curvaAbc: l.curvaAbc,
    precoUnitario: l.precoUnitario,
    precoPraticado: l.precoPraticado,
    margem: l.margem,
    markup: l.markup,
    valorUltimaCompraIpi: l.valorUltimaCompraIpi,
    mc: l.mc,
    percMc: l.percMc,
    giroEstoque: l.giroEstoque,
    vlrCustoMedio: l.vlrCustoMedio,
    percIcms: l.percIcms,
    percPis: l.percPis,
    percCofins: l.percCofins,
    percComissao: l.percComissao,
    percFrete: l.percFrete,
    percInvestEmp: l.percInvestEmp,
    percAssociativismo: l.percAssociativismo,
    percPerdasVencidos: l.percPerdasVencidos,
    percContratos: l.percContratos,
    percRepasse: l.percRepasse,
    qtdVendidaMes: l.qtdVendidaMes,
    qtdVendidaMesAnterior: l.qtdVendidaMesAnterior,
    acompanhamento: l.acompanhamento,
    codLote: l.codLote,
    loteEstoque: l.loteEstoque,
    loteVencimento: l.loteVencimento,
    statusValidadeLote: l.statusValidadeLote,
    embalagem: l.embalagem,
    ...janelaParaColunas(l.janela),
  }));

  // Replace total da Triagem (idempotente).
  await db.delete(pescadorTriagem);
  for (let i = 0; i < values.length; i += BATCH) {
    await db.insert(pescadorTriagem).values(values.slice(i, i + BATCH) as any);
  }

  // Meta com totais reais das 3 tabelas (Pedidos/Histórico seguem do seed por ora).
  const [totalTriagem, totalPedidos, totalHistorico] = await Promise.all([
    contar(db, pescadorTriagem),
    contar(db, pescadorPedidos),
    contar(db, pescadorHistorico),
  ]);

  await db.insert(pescadorMeta).values({
    geradoEm: new Date(),
    estabelecimento: "SC",
    cliente: "CLAMED",
    janela: "15 dias úteis",
    totalTriagem,
    totalPedidos,
    totalHistorico,
    fonte: "api",
    // Premissas da MC usadas nesta carga (a UI lê daqui p/ o what-if).
    mcEmpresa: mcParams.empresa,
    mcRegiaoTributaria: mcParams.regiaoTributaria,
    mcVarFrete: Number(mcParams.varFrete),
    mcVarPerdasVencidos: Number(mcParams.varPerdasVencidos),
    mcVarContratos: Number(mcParams.varContratos),
    mcVarInvestEmp: Number(mcParams.varInvestEmp),
    mcVarAssociativismo: Number(mcParams.varAssociativismo),
  });

  return {
    ok: true,
    triagem: { recebidas: linhas.length, gravadas: values.length },
    meta: { totalTriagem, totalPedidos, totalHistorico },
  };
}

/** Ponto de entrada do sync do Pescador (hoje só Triagem; Pedidos/Histórico depois). */
export async function syncPescador() {
  const triagem = await syncPescadorTriagem();
  return { ok: triagem.ok, resultados: [triagem] };
}
