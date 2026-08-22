/**
 * Wrappers TIPADOS de queries nomeadas da API Erp — camada compartilhada
 * entre módulos (Superestocados, Pescador, ...).
 *
 * Camadas:
 *   erpApi.ts     → transporte (login/token/executarQuery)
 *   erpQueries.ts → uma função por query nomeada, devolvendo linhas normalizadas
 *   <módulo>         → mapeia para o seu formato de domínio + persiste
 *
 * Assim, reaproveitar uma query em outro módulo é só chamar a função daqui — sem
 * reescrever a chamada nem o parse das colunas.
 */

import { canonizarMarca, loadMarcaAliases } from "./db/marcaAliases";
import { executarQuery, erpApiPost } from "./erpApi";

/** Linha da query "venda_por_dia" (movimentação dos últimos 15 dias úteis por produto). */
export type VendaPorDiaRow = {
  codEstabe: number;
  codProduto: number;
  descricaoProduto: string;
  /** Data no formato YYYY-MM-DD. */
  data: string;
  /** Venda limpa (sem transferência/bonificação). */
  qtdVenda: number;
  quantidadeSaida: number;
  quantidadeEntrada: number;
};

/**
 * Executa a query "venda_por_dia". Reutilizável por qualquer módulo.
 *
 * @param codEstabe estabelecimento do ERP (ex.: 1 = SC, 2 = RS)
 * @param listaProdutos códigos de produto a consultar
 */
export async function fetchVendaPorDia(
  codEstabe: string | number,
  listaProdutos: Array<string | number>,
): Promise<VendaPorDiaRow[]> {
  if (!listaProdutos.length) return [];

  const dados = await executarQuery("venda_por_dia", {
    cod_estabe: String(codEstabe),
    lista_produtos: listaProdutos.join(","),
  });

  return dados.map((r) => ({
    codEstabe: Number(r.cod_estabe),
    codProduto: Number(r.cod_produto),
    descricaoProduto: String(r.descricao_produto ?? ""),
    data: String(r.data),
    qtdVenda: Number(r.qtd_venda) || 0,
    quantidadeSaida: Number(r.quantidade_saida) || 0,
    quantidadeEntrada: Number(r.quantidade_entrada) || 0,
  }));
}

/* ─────────────────────────── dia_estoque (produtos) ─────────────────────────── */

/**
 * Linha normalizada da query de produtos/estoque (`dia_estoque_sc` / `dia_estoque_rs`).
 * É o universo COMPLETO de produtos ativos da região (com dias de estoque, fornecedor,
 * venda média, custo) — fonte do painel de Rupturas e, no futuro, da migração de
 * produtos do Superestocados (hoje via CSV do conector).
 */
export type ProdutoEstoqueRow = {
  codigo: number;
  /** "Fornecedor" (razão social). */
  fornecedor: string;
  nomeProduto: string;
  tipoProduto: "medicamento" | "nao_medicamento";
  /** Pode ser fracionário (ex.: 192.63). */
  diasEstoque: number;
  estoqueAtual: number;
  vendaMedia: number;
  /** "Custo Medio Liquido" (custo UNITÁRIO) — usado pelo Rupturas e como custo unitário do Superestocados. */
  valorCusto: number | null;
  /** "Valor Estoque Custo" (valor TOTAL do estoque a custo) — Vlr. Custo do painel Superestocados. */
  valorEstoqueCusto: number | null;
  /** "Data Última Compra" (ISO YYYY-MM-DD) — Superestocados (regra dos 90 dias). */
  dataUltimaCompra: string | null;
  /** Lote de vencimento mais próximo. */
  codLote: string | null;
  vencimentoLote: string | null;
  estoqueLote: number | null;
  dataUltimaTransferencia: string | null;
  qtdVendaMesAtual: number;
  qtdVendaMesAnterior: number;
  qtdVenda2MesesAnterior: number;
  qtdProjetadoMesAtual: number;
  precoPolitica: number | null;
};

/** Normaliza uma data da API para ISO YYYY-MM-DD (aceita ISO ou DD/MM/YYYY[ HH:MM]); vazio → null. */
function normalizaDataIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const ddmm = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (ddmm) return `${ddmm[3]}-${ddmm[2]}-${ddmm[1]}`;
  return null;
}

/** Mapeia a região para a `chave` cadastrada na API (a região vai embutida na chave). */
function chaveDiaEstoque(region: "SC" | "RS"): string {
  return `dia_estoque_${region.toLowerCase()}`;
}

/**
 * Remove o BOM UTF-8 (﻿) que a API prefixa na 1ª coluna (ex.: "﻿Código").
 * Devolve uma cópia do objeto com as chaves limpas.
 */
function stripBomKeys(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    out[key.replace(/^﻿/, "")] = row[key];
  }
  return out;
}

/**
 * Converte número em formato brasileiro (vírgula decimal, ponto de milhar) para Number.
 * Ex.: "9,5" → 9.5 · "192,63157" → 192.63157 · "1.234,56" → 1234.56 · "" → null.
 */
export function parseNumeroBr(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  let s = String(value).trim();
  if (!s) return null;
  if (s.includes(",")) {
    // Vírgula é decimal → pontos são separador de milhar.
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Executa a query de produtos/estoque da região e devolve o universo de produtos ativos
 * já normalizado. A query NÃO recebe parâmetros — a região está embutida na `chave`.
 *
 * @param region "SC" → chave "dia_estoque_sc" · "RS" → "dia_estoque_rs"
 */
export async function fetchProdutosEstoque(region: "SC" | "RS"): Promise<ProdutoEstoqueRow[]> {
  const dados = await executarQuery(chaveDiaEstoque(region));
  // De/para de marca (variante → razão canônica), definido pelo comercial. Aplicado aqui,
  // no ponto único da regra de marca, então vale p/ o catálogo de compradores e todos os painéis.
  const aliases = await loadMarcaAliases();

  const rows: ProdutoEstoqueRow[] = [];
  for (const raw of dados) {
    const r = stripBomKeys(raw as Record<string, unknown>);

    const codigo = Math.trunc(parseNumeroBr(r["Código"]) ?? NaN);
    if (!Number.isFinite(codigo) || codigo <= 0) continue; // descarta linhas sem código válido

    const categoriaRaw = String(r["Categoria"] ?? "").toLowerCase().trim();
    const tipoProduto: ProdutoEstoqueRow["tipoProduto"] =
      categoriaRaw === "medicamentos" ? "medicamento" : "nao_medicamento";

    const codLote = String(r["Lote"] ?? "").trim() || null;
    // Marca = razão social ("Fornecedor"); só cai pro fantasia ("Fabricante") quando a
    // razão social vem vazia. Regra única, vale pro catálogo de compradores e todos os painéis.
    const razaoSocial = String(r["Fornecedor"] ?? "").trim();
    const fantasia = String(r["Fabricante"] ?? "").trim();
    rows.push({
      codigo,
      nomeProduto: String(r["Nome Produto"] ?? "").trim(),
      fornecedor: canonizarMarca(razaoSocial || fantasia, aliases),
      tipoProduto,
      diasEstoque: parseNumeroBr(r["Dias de Estoque (Unidades)"]) ?? 0,
      estoqueAtual: Math.round(parseNumeroBr(r["Qtd em Estoque"]) ?? 0),
      vendaMedia: parseNumeroBr(r["Qtd Venda Média Mês"]) ?? 0,
      valorCusto: parseNumeroBr(r["Custo Medio Liquido"]),
      valorEstoqueCusto: parseNumeroBr(r["Valor Estoque Custo"]),
      dataUltimaCompra: normalizaDataIso(r["Data Última Compra"] ?? r["Data Ultima Compra"]),
      codLote,
      vencimentoLote: codLote ? normalizaDataIso(r["Validade Lote"]) : null,
      estoqueLote: codLote ? Math.round(parseNumeroBr(r["Estoque Lote"]) ?? 0) : null,
      dataUltimaTransferencia: normalizaDataIso(r["Data Ultima Transferencia"]),
      qtdVendaMesAtual: Math.round(parseNumeroBr(r["Qtd Venda Mes Atual"]) ?? 0),
      qtdVendaMesAnterior: Math.round(parseNumeroBr(r["Qtd Venda Mes Anterior"]) ?? 0),
      qtdVenda2MesesAnterior: Math.round(parseNumeroBr(r["Qtd Venda 2 Meses Anterior"]) ?? 0),
      qtdProjetadoMesAtual: Math.round(parseNumeroBr(r["Qtd Projetado Mes Atual"]) ?? 0),
      precoPolitica: parseNumeroBr(r["Preço Politica"] ?? r["Preco Politica"]),
    });
  }
  return rows;
}

/* ─────────────── Indicadores — Pedidos por layout (codigoQuery 16, "qtd_pedido_layout") ─────────────── */

/**
 * Normaliza um carimbo de data/hora ("YYYY-MM-DD HH:MM:SS.s" ou ISO) para ISO
 * "YYYY-MM-DDTHH:MM:SS" (comparável e parseável no front). Cai pra data-only se não bater.
 */
function normalizaDataHoraIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? "00"}`;
  return normalizaDataIso(s);
}

/**
 * Linha normalizada da consulta "qtd_pedido_layout" — foto do DIA dos pedidos agregados por
 * rede/cliente (campo "Layout") dentro de cada estado. Sem parâmetros. Volume pequeno (poucas
 * dezenas de linhas). `dtHora` é o horário do último pedido daquela rede (varia por linha).
 */
export type PedidoPorLayoutRow = {
  /** UF do estabelecimento ("SC" | "RS"). */
  estado: string;
  /** Rede/cliente (API: "Layout", ex.: "CLAMED"). */
  layout: string;
  /** Quantidade de pedidos (API: "Qt_Ped"). */
  qtdPedidos: number;
  /** Valor total dos pedidos em R$ (API: "Vl_pedido"). */
  valorPedido: number;
  /** Horário do último pedido da rede, ISO "YYYY-MM-DDTHH:MM:SS" (API: "DT_HORA"). */
  dtHora: string | null;
};

/** Executa a query "qtd_pedido_layout" (pedidos do dia por rede). Reutilizável por qualquer módulo. */
export async function fetchPedidosPorLayout(): Promise<PedidoPorLayoutRow[]> {
  const dados = await executarQuery("qtd_pedido_layout");
  const rows: PedidoPorLayoutRow[] = [];
  for (const raw of dados) {
    const r = stripBomKeys(raw as Record<string, unknown>);
    const layout = String(r["Layout"] ?? "").trim();
    const estado = String(r["estado"] ?? r["Estado"] ?? "").trim().toUpperCase();
    if (!layout || !estado) continue; // descarta linhas sem rede/UF
    rows.push({
      estado,
      layout,
      qtdPedidos: Math.round(parseNumeroBr(r["Qt_Ped"]) ?? 0),
      valorPedido: parseNumeroBr(r["Vl_pedido"] ?? r["VALOR"]) ?? 0,
      dtHora: normalizaDataHoraIso(r["DT_HORA"]),
    });
  }
  return rows;
}

/**
 * Executa a query "qtd_pedido_cortado_layout" (codigoQuery 1016) — pedidos CORTADOS do dia
 * por layout. Mesma forma normalizada da `fetchPedidosPorLayout`, mas a origem usa outro casing
 * (`VALOR` / `Estado`) — tratado aqui de forma tolerante.
 */
export async function fetchPedidosCortadosPorLayout(): Promise<PedidoPorLayoutRow[]> {
  const dados = await executarQuery("qtd_pedido_cortado_layout");
  const rows: PedidoPorLayoutRow[] = [];
  for (const raw of dados) {
    const r = stripBomKeys(raw as Record<string, unknown>);
    const layout = String(r["Layout"] ?? "").trim();
    const estado = String(r["Estado"] ?? r["estado"] ?? "").trim().toUpperCase();
    if (!layout || !estado) continue;
    rows.push({
      estado,
      layout,
      qtdPedidos: Math.round(parseNumeroBr(r["Qt_Ped"]) ?? 0),
      valorPedido: parseNumeroBr(r["VALOR"] ?? r["Vl_pedido"]) ?? 0,
      dtHora: normalizaDataHoraIso(r["DT_HORA"]),
    });
  }
  return rows;
}

/** Uma linha de total de pedidos do dia por layout (sem valor/hora). */
export type QtdPedidoDiaRow = { estado: string; layout: string; qtd: number };

/**
 * Executa a query "qtd_pedido_dia" (codigoQuery 1018) — TOTAL de pedidos do dia por layout
 * (todos os status), agregado por (estado, layout). Alimenta a coluna "Pedidos" do painel
 * (o total do dia), enquanto aceitos/cortados vêm das queries 16/1016.
 */
export async function fetchQtdPedidoDia(): Promise<QtdPedidoDiaRow[]> {
  const dados = await executarQuery("qtd_pedido_dia");
  const rows: QtdPedidoDiaRow[] = [];
  for (const raw of dados) {
    const r = stripBomKeys(raw as Record<string, unknown>);
    const layout = String(r["Layout"] ?? "").trim();
    const estado = String(r["Estado"] ?? r["estado"] ?? "").trim().toUpperCase();
    if (!layout || !estado) continue;
    rows.push({ estado, layout, qtd: Math.round(parseNumeroBr(r["Qt_Ped"]) ?? 0) });
  }
  return rows;
}

/** Uma linha de cliente↔grupo de associativismo (1 grupo por cliente). */
export type GrupoClienteRow = { cnpj: string; codGrupo: number; desGrupo: string };

/**
 * Executa a query "grupo_clientes_cnpj" (codigoQuery 1019) — clientes de associativismo por CNPJ,
 * cada um no seu grupo (`Des_GrpCli`/`Cod_GrpCli`/`Cgc_Cpf`). É a base da conciliação do submódulo
 * Comercial → Associativismo. CNPJ normalizado (só dígitos, preserva zeros à esquerda).
 */
export async function fetchGrupoClientesCnpj(): Promise<GrupoClienteRow[]> {
  const dados = await executarQuery("grupo_clientes_cnpj");
  const rows: GrupoClienteRow[] = [];
  for (const raw of dados) {
    const r = stripBomKeys(raw as Record<string, unknown>);
    const cnpj = String(r["Cgc_Cpf"] ?? "").replace(/\D/g, "");
    const codGrupo = Math.round(parseNumeroBr(r["Cod_GrpCli"]) ?? 0);
    const desGrupo = String(r["Des_GrpCli"] ?? "").trim();
    if (!cnpj || !codGrupo) continue;
    rows.push({ cnpj, codGrupo, desGrupo });
  }
  return rows;
}

/* ───────────────────── Pescador — Triagem / MC (codigoQuery 15, chave "pescador_3") ───────────────────── */

/** Uma posição da janela móvel de 15 dias úteis. */
export type JanelaDia = { data: string | null; venda: number };

/**
 * Parâmetros da MC (Margem de Contribuição) enviados à consulta `pescador_3`.
 * São a "premissa" do cálculo — defaults definidos pela área; ficam no config do módulo.
 * Os `var*` vão como FRAÇÃO (ex.: "0.04" = 4%).
 */
export type PescadorMCParams = {
  empresa: string;
  idPolCom: string;
  regiaoTributaria: string;
  varFrete: string;
  varPerdasVencidos: string;
  varContratos: string;
  varInvestEmp: string;
  varAssociativismo: string;
};

/**
 * Linha normalizada da consulta de Triagem/MC do Pescador (chave "pescador_3", codigoQuery 15).
 * Superset da antiga `pescador`/9: traz a **MC** (R$ e %), o **Giro_Estoque** e os
 * **percentuais efetivos** de cada componente (sobre o Preço Líquido) — que permitem
 * recalcular a MC ao vivo quando o operador edita o Pç unitário ou as premissas.
 */
export type PescadorTriagemRow = {
  estabelecimento: string;
  ean: string;
  codInterno: string;
  descricao: string;
  /** Fabricante (fantasia, API "fantasia"). Mantido no dado; a coluna do painel usa fornecedor. */
  fabricante: string | null;
  /** Fornecedor (API "fornecedor" = fantasia do fornecedor; fallback p/ fabricante quando vazio). */
  fornecedor: string | null;
  politica: string;
  idPolCom: number | null;
  estoqueSc: number;
  curvaAbc: string | null;
  precoUnitario: number | null;
  precoPraticado: number | null;
  margem: number | null;
  markup: number | null;
  /** Custo da última compra c/ IPI. A `pescador_3` não retorna direto → derivado de preço/markup. */
  valorUltimaCompraIpi: number | null;
  /** MC em R$/unidade (API: "MC"). */
  mc: number | null;
  /** MC em % do preço líquido (API: "Perc_MC" × 100). */
  percMc: number | null;
  /** Giro de estoque (API: "Giro_Estoque"). Preenche a coluna Giro. */
  giroEstoque: number | null;
  /** Custo médio comercial em R$ (API: "Vlr_CustoMedio") — abatido integral na MC. */
  vlrCustoMedio: number | null;
  /** Percentuais efetivos sobre o preço líquido (já em %, ex.: ICMS = 12). */
  percIcms: number | null;
  percPis: number | null;
  percCofins: number | null;
  percComissao: number | null;
  percFrete: number | null;
  percInvestEmp: number | null;
  percAssociativismo: number | null;
  percPerdasVencidos: number | null;
  percContratos: number | null;
  /** Repasse: informativo (reduz a base na consulta; NÃO é abatido direto da MC). */
  percRepasse: number | null;
  qtdVendidaMes: number;
  qtdVendidaMesAnterior: number;
  acompanhamento: string | null;
  /** D1..D15 (índice 0 = D1). */
  janela: JanelaDia[];
  codLote: string | null;
  loteEstoque: number;
  loteVencimento: string | null;
  statusValidadeLote: string | null;
  embalagem: string | null;
};

// Helpers de parse para a resposta do Pescador (números JSON / strings ISO).
function pNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!s || s.toUpperCase() === "NULL") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function pInt(v: unknown): number | null {
  const n = pNum(v);
  return n === null ? null : Math.trunc(n);
}
function pStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" || s.toUpperCase() === "NULL" ? null : s;
}
function pDate(v: unknown): string | null {
  const s = pStr(v);
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

/**
 * Normaliza o status de venda que vem PRONTO da API (coluna "Caiu/ Subiu venda") para os
 * rótulos que a UI usa. A regra (inclusive excluir o dia corrente) é da consulta `pescador_3`
 * — aqui só padronizamos o texto (a API manda em caixa alta / sem acento).
 */
function normAcompanhamento(v: unknown): string | null {
  const s = pStr(v);
  if (!s) return null;
  if (/subiu/i.test(s)) return "Subiu";
  if (/caiu/i.test(s)) return "Caiu";
  if (/est[aá]vel/i.test(s)) return "Estável";
  if (/sem\s*movimento/i.test(s)) return "Sem movimento";
  if (/sem\s*venda/i.test(s)) return "Sem venda";
  return s;
}

/**
 * Executa a consulta de Triagem/MC do Pescador (`codigoQuery 15`, chave `pescador_3`).
 * Superset da antiga (9): além da Triagem, traz a MC e os percentuais que a alimentam.
 * A região/cliente está implícita na query; filtra-se pelas políticas (idPolCom) e recebe
 * os parâmetros da MC (frete, perdas, contratos, etc.).
 */
export async function fetchPescadorTriagem(params: PescadorMCParams): Promise<PescadorTriagemRow[]> {
  const resp = await erpApiPost<{ dados?: unknown }>("api/consulta/executar", {
    codigoQuery: 15,
    chave: "pescador_3",
    parametros: {
      empresa: params.empresa,
      idPolCom: params.idPolCom,
      regiaoTributaria: params.regiaoTributaria,
      varFrete: params.varFrete,
      varPerdasVencidos: params.varPerdasVencidos,
      varContratos: params.varContratos,
      varInvestEmp: params.varInvestEmp,
      varAssociativismo: params.varAssociativismo,
    },
  });
  const dados = Array.isArray(resp?.dados) ? resp.dados : [];

  const rows: PescadorTriagemRow[] = [];
  for (const raw of dados) {
    const r = stripBomKeys(raw as Record<string, unknown>);

    const ean = pStr(r["Cod_EAN"]);
    const politica = pStr(r["cod_polcom"]);
    if (!ean || !politica) continue; // chave natural (ean, política)

    const janela: JanelaDia[] = [];
    for (let d = 1; d <= 15; d++) {
      const k = String(d).padStart(2, "0");
      janela.push({ data: pDate(r[`Data_DU_${k}`]), venda: pInt(r[`Venda_DU_${k}`]) ?? 0 });
    }

    const precoPraticado = pNum(r["Preco Final"]);
    const markup = pNum(r["Markup"]);
    const percMcFrac = pNum(r["Perc_MC"]); // vem como fração (0.158413) → guardamos em %
    const qtdMes = pInt(r["Qtd_Vendida_Mes_Atual"]) ?? 0;
    const qtdMesAnt = pInt(r["Qtd_Vendida_Mes_Anterior"]) ?? 0;

    rows.push({
      estabelecimento: pStr(r["Estado_CliPag"]) ?? "SC",
      ean,
      codInterno: pStr(r["codigo"]) ?? "",
      descricao: pStr(r["descricao"]) ?? "",
      fabricante: pStr(r["fantasia"]),
      fornecedor: pStr(r["fornecedor"]) ?? pStr(r["fantasia"]),
      politica,
      idPolCom: pInt(r["id_polcom"]),
      estoqueSc: pInt(r["Estoque_Disponivel"]) ?? 0,
      curvaAbc: pStr(r["Curva_ABC"]),
      precoUnitario: pNum(r["Preco Liquido"]),
      precoPraticado,
      margem: pNum(r["Margem"]),
      markup,
      valorUltimaCompraIpi: pNum(r["ValorUltimaCompraComIPI"]), // legado (não vem na 15); o custo agora é Vlr_CustoMedio

      mc: pNum(r["MC"]),
      percMc: percMcFrac == null ? null : percMcFrac * 100,
      giroEstoque: pNum(r["Giro_Estoque"]),
      vlrCustoMedio: pNum(r["Vlr_CustoMedio"]),
      percIcms: pNum(r["Perc_ICMS_Aplicado"]),
      percPis: pNum(r["Perc_PIS_Aplicado"]),
      percCofins: pNum(r["Perc_COFINS_Aplicado"]),
      percComissao: pNum(r["Perc_Comissao_Aplicada"]),
      percFrete: pNum(r["Perc_Frete_Aplicado"]),
      percInvestEmp: pNum(r["Perc_Investimento_Empresa_Aplicado"]),
      percAssociativismo: pNum(r["Perc_Associativismo_Aplicado"]),
      percPerdasVencidos: pNum(r["Perc_Perdas_Vencidos_Aplicado"]),
      percContratos: pNum(r["Perc_Contratos_Aplicado"]),
      percRepasse: pNum(r["Perc_Repasse_Aplicado"]),
      qtdVendidaMes: qtdMes,
      qtdVendidaMesAnterior: qtdMesAnt,
      acompanhamento: normAcompanhamento(r["Caiu/ Subiu venda"]),
      janela,
      codLote: pStr(r["Cod_Lote_Venc_Proximo"]),
      loteEstoque: pInt(r["Qtd_Lote_Venc_Proximo"]) ?? 0,
      loteVencimento: pDate(r["Data_Venc_Proximo"]),
      statusValidadeLote: pStr(r["Status_Validade_Lote_Proximo"]),
      embalagem: pStr(r["Embalagem"]),
    });
  }
  return rows;
}
