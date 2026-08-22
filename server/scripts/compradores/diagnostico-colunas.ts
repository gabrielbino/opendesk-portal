/**
 * Diagnóstico: mostra as COLUNAS cruas que a query `dia_estoque_sc` devolve e uma amostra
 * dos campos de marca (Fornecedor / Fabricante / fantasia), pra decidirmos a regra de
 * ingestão da marca (razão social; fantasia só quando razão vazia).
 *
 * Uso (ambiente com .env de produção — ERP_API_*):
 *   npx tsx server/scripts/compradores/diagnostico-colunas.ts
 */

import "dotenv/config";
import { executarQuery } from "../../erpApi";

async function main() {
  if (!process.env.ERP_API_URL) {
    console.error("ERP_API_URL não definida no .env. Aborte.");
    process.exit(1);
  }
  const dados = await executarQuery("dia_estoque_sc");
  if (!Array.isArray(dados) || !dados.length) {
    console.log("Query dia_estoque_sc não retornou linhas.");
    return;
  }

  const stripBom = (k: string) => k.replace(/^﻿/, "");
  const colunas = Object.keys(dados[0] as Record<string, unknown>).map(stripBom);
  console.log(`Total de linhas: ${dados.length}`);
  console.log(`\nCOLUNAS (${colunas.length}):\n  ${colunas.join(" · ")}`);

  // Amostra dos campos de marca.
  const chave = (row: Record<string, unknown>, re: RegExp) => {
    const k = Object.keys(row).find((x) => re.test(stripBom(x)));
    return k ? String((row as any)[k] ?? "").trim() : "(coluna ausente)";
  };
  console.log(`\nAmostra (Fornecedor / Fabricante-fantasia):`);
  let vaziosForn = 0;
  for (const raw of dados as Record<string, unknown>[]) {
    if (chave(raw, /^fornecedor$/i) === "") vaziosForn++;
  }
  for (const raw of (dados as Record<string, unknown>[]).slice(0, 10)) {
    console.log(`  Fornecedor="${chave(raw, /^fornecedor$/i)}" · Fabricante/fantasia="${chave(raw, /fabric|fantasia/i)}"`);
  }
  console.log(`\nLinhas com "Fornecedor" VAZIO: ${vaziosForn} de ${dados.length}`);
}

main().catch((e) => { console.error("✗", e instanceof Error ? e.message : e); process.exit(1); });
