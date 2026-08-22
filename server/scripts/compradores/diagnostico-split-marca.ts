/**
 * Diagnóstico READ-ONLY: acha marcas que aparecem com DOIS nomes na base porque o
 * FANTASIA (Fabricante) vazou pro campo Fornecedor em alguns estabelecimentos/regiões.
 *
 * Sintoma (ex.: AGPMED): a MESMA marca vira duas entradas —
 *   linha A → Fornecedor="AGAPLASTIC INDUSTRIA E COMERCIO LTDA", Fabricante="AGPMED"
 *   linha B → Fornecedor="AGPMED",                               Fabricante="AGPMED"
 * Como o campo Fornecedor de B não é vazio, o fallback `Fornecedor || Fabricante` não
 * dispara e "AGPMED" entra como se fosse razão. → duas entradas p/ o mesmo fornecedor.
 *
 * Detecção: para cada FANTASIA (Fabricante) F, junta o conjunto de valores de Fornecedor
 * vistos com ela. Se F também aparece como Fornecedor (vazou) E existe outro Fornecedor
 * "de verdade" (≠ F, não-vazio) → sugere alias  F → razão.  (razão = a mais frequente ≠ F.)
 *
 * Uso (.env de produção — ERP_API_*):
 *   npx tsx server/scripts/compradores/diagnostico-split-marca.ts
 */

import "dotenv/config";
import { executarQuery } from "../../erpApi";
import { loadMarcaAliases, canonizarMarca, normMarcaKey } from "../../db/marcaAliases";

const strip = (k: string) => k.replace(/^﻿/, "");
function campo(row: Record<string, unknown>, re: RegExp): string {
  const k = Object.keys(row).find((x) => re.test(strip(x)));
  return k ? String((row as any)[k] ?? "").trim() : "";
}

async function main() {
  if (!process.env.ERP_API_URL) { console.error("ERP_API_URL não definida. Aborte."); process.exit(1); }

  const aliases = await loadMarcaAliases();
  const [sc, rs] = await Promise.all([executarQuery("dia_estoque_sc"), executarQuery("dia_estoque_rs")]);

  // fantasia(normKey) → Map<fornecedorLabel, contagem>   (Fornecedor canonizado pelo de/para atual)
  const porFantasia = new Map<string, { label: string; fornecedores: Map<string, number> }>();
  // conjunto de Fornecedores (canon) que existem na base — pra saber se a fantasia "vazou".
  const fornecedoresBase = new Set<string>();

  for (const raw of [...sc, ...rs] as Record<string, unknown>[]) {
    const razao = canonizarMarca(campo(raw, /^fornecedor$/i), aliases).trim();
    const fantasia = campo(raw, /fabric|fantasia/i);
    if (razao) fornecedoresBase.add(normMarcaKey(razao));
    if (!fantasia) continue;
    const fk = normMarcaKey(fantasia);
    let e = porFantasia.get(fk);
    if (!e) { e = { label: fantasia, fornecedores: new Map() }; porFantasia.set(fk, e); }
    if (razao) e.fornecedores.set(razao, (e.fornecedores.get(razao) ?? 0) + 1);
  }

  // Casos onde a fantasia vazou pro Fornecedor E existe uma razão "de verdade".
  type Caso = { fantasia: string; razaoSugerida: string; qtdVazou: number; qtdRazao: number; ambiguo: string[] };
  const casos: Caso[] = [];
  const soFantasia: string[] = []; // fantasia é o único nome (Fornecedor == fantasia sempre) → sem razão p/ mapear

  for (const [fk, e] of Array.from(porFantasia)) {
    if (!fornecedoresBase.has(fk)) continue; // a fantasia NÃO vazou pro Fornecedor → ok
    const entradas = Array.from(e.fornecedores.entries());
    const proprias = entradas.filter(([r]) => normMarcaKey(r) !== fk);
    const vazou = e.fornecedores.get(entradas.map(([r]) => r).find((r) => normMarcaKey(r) === fk) ?? "") ?? 0;
    if (proprias.length === 0) { soFantasia.push(`${e.label} (${vazou} linhas — não há razão social na base)`); continue; }
    proprias.sort((a, b) => b[1] - a[1]);
    casos.push({
      fantasia: e.label,
      razaoSugerida: proprias[0][0],
      qtdVazou: vazou,
      qtdRazao: proprias[0][1],
      ambiguo: proprias.slice(1).map(([r, n]) => `${r} (${n})`),
    });
  }

  casos.sort((a, b) => a.fantasia.localeCompare(b.fantasia));

  console.log(`Base: SC ${sc.length} + RS ${rs.length} linhas · de/para atual: ${aliases.size} alias(es).`);
  console.log(`\n== Fantasia VAZOU pro campo Fornecedor (mesma marca, dois nomes) — ${casos.length} ==`);
  console.log(`(sugestão de alias:  "FANTASIA"  →  "RAZÃO")\n`);
  for (const c of casos) {
    console.log(`  "${c.fantasia}"  →  "${c.razaoSugerida}"`);
    console.log(`      vazou como Fornecedor em ${c.qtdVazou} linha(s); razão aparece em ${c.qtdRazao} linha(s).` +
      (c.ambiguo.length ? `  ⚠ outras razões p/ a mesma fantasia: ${c.ambiguo.join(" · ")}` : ""));
  }

  console.log(`\n== Fantasia que é o ÚNICO nome (sem razão social na base — nada a fazer) — ${soFantasia.length} ==`);
  soFantasia.sort().forEach((s) => console.log(`  ${s}`));

  console.log(`\n== Bloco pronto p/ colar em ALIASES (aplicar-decisoes / novo script) ==`);
  for (const c of casos) console.log(`  ["${c.fantasia}", "${c.razaoSugerida}"],`);

  console.log(`\n(read-only) Nada foi gravado.`);
}

main().catch((e) => { console.error("✗", e instanceof Error ? e.message : e); process.exit(1); });
