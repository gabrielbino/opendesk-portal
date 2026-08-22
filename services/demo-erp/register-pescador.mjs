#!/usr/bin/env node
/**
 * Registra a query nomeada `pescador_3` (Triagem/MC) na query-api.
 * A consulta é grande (~40 colunas + janela D01..D15), então montamos o SQL
 * programaticamente sobre o demo-erp (erp_produtos, estabelecimento SC).
 *
 * Uso: node services/demo-erp/register-pescador.mjs
 */
const BASE = process.env.QAPI_URL || "http://localhost:4000";
const USER = process.env.QAPI_ADMIN_USER || "admin";
const PASS = process.env.QAPI_ADMIN_PASSWORD || "admin";

// Janela móvel de 15 dias úteis (demo: dias corridos).
const dataCols = Array.from({ length: 15 }, (_, i) => {
  const k = String(i + 1).padStart(2, "0");
  return `DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL ${i + 1} DAY), '%Y-%m-%d') AS \`Data_DU_${k}\``;
}).join(",\n  ");
const vendaCols = Array.from({ length: 15 }, (_, i) => {
  const k = String(i + 1).padStart(2, "0");
  return `GREATEST(0, FLOOR(venda_media_mes/22 * (0.5 + MOD(codigo+${i}, 7)/10))) AS \`Venda_DU_${k}\``;
}).join(",\n  ");

const sql = `
SELECT
  CONCAT('789', LPAD(codigo, 10, '0')) AS \`Cod_EAN\`,
  '88371' AS \`cod_polcom\`,
  88371 AS \`id_polcom\`,
  'SC' AS \`Estado_CliPag\`,
  codigo AS \`codigo\`,
  nome AS \`descricao\`,
  fabricante AS \`fantasia\`,
  fornecedor AS \`fornecedor\`,
  qtd_estoque AS \`Estoque_Disponivel\`,
  CASE WHEN venda_media_mes >= 40 THEN 'A' WHEN venda_media_mes >= 20 THEN 'B' ELSE 'C' END AS \`Curva_ABC\`,
  ROUND(preco_politica, 4) AS \`Preco Liquido\`,
  ROUND(preco_politica * 1.02, 4) AS \`Preco Final\`,
  ROUND((preco_politica - custo_medio_liquido) / NULLIF(preco_politica, 0) * 100, 2) AS \`Margem\`,
  ROUND(preco_politica / NULLIF(custo_medio_liquido, 0), 4) AS \`Markup\`,
  NULL AS \`ValorUltimaCompraComIPI\`,
  ROUND(preco_politica * 0.16, 4) AS \`MC\`,
  0.1600 AS \`Perc_MC\`,
  ROUND(venda_media_mes / NULLIF(qtd_estoque, 0), 4) AS \`Giro_Estoque\`,
  ROUND(custo_medio_liquido, 4) AS \`Vlr_CustoMedio\`,
  12.00 AS \`Perc_ICMS_Aplicado\`,
  1.65 AS \`Perc_PIS_Aplicado\`,
  7.60 AS \`Perc_COFINS_Aplicado\`,
  1.50 AS \`Perc_Comissao_Aplicada\`,
  0.50 AS \`Perc_Frete_Aplicado\`,
  2.00 AS \`Perc_Investimento_Empresa_Aplicado\`,
  1.00 AS \`Perc_Associativismo_Aplicado\`,
  0.50 AS \`Perc_Perdas_Vencidos_Aplicado\`,
  1.00 AS \`Perc_Contratos_Aplicado\`,
  0.00 AS \`Perc_Repasse_Aplicado\`,
  qtd_venda_mes_atual AS \`Qtd_Vendida_Mes_Atual\`,
  qtd_venda_mes_anterior AS \`Qtd_Vendida_Mes_Anterior\`,
  CASE WHEN qtd_venda_mes_atual > qtd_venda_mes_anterior THEN 'SUBIU VENDA'
       WHEN qtd_venda_mes_atual < qtd_venda_mes_anterior THEN 'CAIU VENDA'
       ELSE 'ESTAVEL' END AS \`Caiu/ Subiu venda\`,
  ${dataCols},
  ${vendaCols},
  lote AS \`Cod_Lote_Venc_Proximo\`,
  estoque_lote AS \`Qtd_Lote_Venc_Proximo\`,
  DATE_FORMAT(validade_lote, '%Y-%m-%d') AS \`Data_Venc_Proximo\`,
  CASE WHEN validade_lote IS NULL THEN NULL
       WHEN DATEDIFF(validade_lote, CURDATE()) < 90 THEN 'CRITICO'
       WHEN DATEDIFF(validade_lote, CURDATE()) < 180 THEN 'ATENCAO'
       ELSE 'OK' END AS \`Status_Validade_Lote_Proximo\`,
  'CX C/1' AS \`Embalagem\`
FROM erp_produtos
WHERE cod_estabe = 1 AND qtd_estoque > 0
ORDER BY venda_media_mes DESC
LIMIT 60
`.trim();

const login = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ usuario: USER, senha: PASS }),
});
if (!login.ok) { console.error(`login admin falhou: HTTP ${login.status}`); process.exit(1); }
const { token } = await login.json();

const r = await fetch(`${BASE}/admin/queries/pescador_3`, {
  method: "PUT",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify({ descricao: "Triagem/MC do Pescador (demo, estab. SC)", sql_text: sql }),
});
console.log(r.ok ? "✔ pescador_3 registrada" : `✖ HTTP ${r.status} ${await r.text()}`);
