/**
 * Diagnóstico READ-ONLY: por que o catálogo (gn_marcas) e os vínculos
 * (gn_comprador_marcas) ainda trazem "um ou outro" nome FANTASIA em vez da razão social.
 *
 * Regra única de marca (server/erpQueries.ts:fetchProdutosEstoque):
 *   fornecedor = canonizarMarca( razão("Fornecedor") || fantasia("Fabricante"), aliases )
 * → uma entrada só é FANTASIA quando (1) a razão veio VAZIA na origem, ou
 *   (2) a razão existe mas está escrita diferente e não há de/para em gn_marca_aliases.
 *
 * O script NÃO grava nada. Ele:
 *   1. Lê dia_estoque SC+RS (via fetchProdutosEstoque, que já canoniza) + as linhas cruas
 *      (para medir razão-vazia e o mapa fantasia→razão).
 *   2. Lê gn_marcas + gn_comprador_marcas (só SELECT).
 *   3. Classifica cada entrada do catálogo que NÃO casa com nenhuma razão social da base em:
 *        - VARIANTE  : a fantasia também aparece COM razão na base → sugerir alias fantasia→razão.
 *        - FANTASIA  : a fantasia só aparece com razão VAZIA → aceitar ou corrigir cadastro na origem.
 *        - ÓRFÃ      : não está na base (resíduo de migração) → revisar cadastro.
 *      Marca se há comprador vinculado (aparece no dropdown / conta como problema real).
 *
 * Uso (ambiente com .env de produção — ERP_API_* + DATABASE_URL):
 *   npx tsx server/scripts/compradores/diagnostico-fantasia.ts
 */

import "dotenv/config";
import mysql from "mysql2/promise";
import { executarQuery } from "../../erpApi";
import { fetchProdutosEstoque } from "../../erpQueries";
import { loadMarcaAliases, canonizarMarca, normMarcaKey } from "../../db/marcaAliases";

const strip = (k: string) => k.replace(/^﻿/, "");
function campo(row: Record<string, unknown>, re: RegExp): string {
  const k = Object.keys(row).find((x) => re.test(strip(x)));
  return k ? String((row as any)[k] ?? "").trim() : "";
}

async function main() {
  if (!process.env.DATABASE_URL || !process.env.ERP_API_URL) {
    console.error("DATABASE_URL e ERP_API_URL precisam estar no .env. Aborte.");
    process.exit(1);
  }

  const aliases = await loadMarcaAliases();
  console.log(`De/para (gn_marca_aliases): ${aliases.size} variante(s) mapeada(s).`);

  // ── 1. Base: linhas cruas (razão-vazia + fantasia→razão) e o conjunto canônico de razões ──
  const [scRaw, rsRaw] = await Promise.all([executarQuery("dia_estoque_sc"), executarQuery("dia_estoque_rs")]);

  const razoesCanon = new Set<string>();          // razões sociais canonizadas (normKey)
  const razaoLabel = new Map<string, string>();   // normKey → rótulo original
  const fantasiaComRazao = new Map<string, string>(); // fantasia(normKey) → 1ª razão canônica vista
  const fantasiaLabel = new Map<string, string>();
  let vaziosSc = 0, vaziosRs = 0;

  const acumula = (rows: unknown[], regiao: "SC" | "RS") => {
    for (const raw of rows as Record<string, unknown>[]) {
      const razao = campo(raw, /^fornecedor$/i);
      const fantasia = campo(raw, /fabric|fantasia/i);
      if (razao) {
        const canon = canonizarMarca(razao, aliases);
        razoesCanon.add(normMarcaKey(canon));
        if (!razaoLabel.has(normMarcaKey(canon))) razaoLabel.set(normMarcaKey(canon), canon);
        if (fantasia && !fantasiaComRazao.has(normMarcaKey(fantasia))) {
          fantasiaComRazao.set(normMarcaKey(fantasia), canon);
        }
      } else {
        if (regiao === "SC") vaziosSc++; else vaziosRs++;
      }
      if (fantasia && !fantasiaLabel.has(normMarcaKey(fantasia))) fantasiaLabel.set(normMarcaKey(fantasia), fantasia);
    }
  };
  acumula(scRaw, "SC");
  acumula(rsRaw, "RS");

  console.log(`\n== Base dia_estoque ==`);
  console.log(`  SC: ${scRaw.length} linhas · Fornecedor(razão) VAZIO em ${vaziosSc}`);
  console.log(`  RS: ${rsRaw.length} linhas · Fornecedor(razão) VAZIO em ${vaziosRs}`);
  console.log(`  Razões sociais canônicas distintas: ${razoesCanon.size}`);
  console.log(`  Fantasias distintas: ${fantasiaLabel.size} (com razão em algum item: ${fantasiaComRazao.size})`);

  // Conjunto canônico completo (o que fetchProdutosEstoque produziria como marca).
  const [scCanon, rsCanon] = await Promise.all([fetchProdutosEstoque("SC"), fetchProdutosEstoque("RS")]);
  const catalogoEsperado = new Set<string>();
  for (const p of [...scCanon, ...rsCanon]) { const n = p.fornecedor.trim(); if (n) catalogoEsperado.add(normMarcaKey(n)); }

  // ── 2. Catálogo e vínculos gravados ──
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [marcasRows] = await conn.execute(`SELECT marca FROM gn_marcas`);
    const [vincRows] = await conn.execute(
      `SELECT cm.marca, c.nome AS comprador
         FROM gn_comprador_marcas cm JOIN gn_compradores c ON c.id = cm.compradorId`,
    );
    const catalogo = (marcasRows as { marca: string }[]).map((r) => r.marca);
    const vinculadoA = new Map<string, string>();
    for (const v of vincRows as { marca: string; comprador: string }[]) vinculadoA.set(normMarcaKey(v.marca), v.comprador);

    console.log(`\n== Catálogo gravado ==`);
    console.log(`  gn_marcas: ${catalogo.length} entradas · gn_comprador_marcas: ${(vincRows as any[]).length} vínculos`);

    // ── 3. Classificar entradas do catálogo que NÃO são razão social ──
    const variantes: Array<{ e: string; sugestao: string; comprador?: string }> = [];
    const fantasias: Array<{ e: string; comprador?: string }> = [];
    const orfas: Array<{ e: string; comprador?: string; naBase: boolean }> = [];

    for (const e of catalogo) {
      const k = normMarcaKey(e);
      if (razoesCanon.has(k)) continue; // é razão social — ok
      const comprador = vinculadoA.get(k);
      const alvo = fantasiaComRazao.get(k);
      if (alvo) {
        variantes.push({ e, sugestao: alvo, comprador });
      } else if (fantasiaLabel.has(k)) {
        fantasias.push({ e, comprador });
      } else {
        orfas.push({ e, comprador, naBase: catalogoEsperado.has(k) });
      }
    }

    // Também: vínculos apontando p/ marca que NÃO é razão social atual (mesmo fora do catálogo).
    const vincSuspeitos = (vincRows as { marca: string; comprador: string }[])
      .filter((v) => !razoesCanon.has(normMarcaKey(v.marca)))
      .map((v) => {
        const k = normMarcaKey(v.marca);
        const alvo = fantasiaComRazao.get(k);
        const tipo = alvo ? "VARIANTE→alias" : fantasiaLabel.has(k) ? "FANTASIA(razão vazia)" : "ÓRFÃ(fora da base)";
        return { ...v, tipo, sugestao: alvo ?? null };
      });

    const linha = (x: { e: string; comprador?: string }) =>
      `    "${x.e}"${x.comprador ? `  →  comprador: ${x.comprador}` : "  (sem comprador vinculado)"}`;

    console.log(`\n== A. VARIANTE — fantasia que TAMBÉM tem razão na base → sugerir alias (${variantes.length}) ==`);
    variantes.forEach((v) => console.log(`${linha(v)}\n        ↳ alias sugerido: "${v.e}" → "${v.sugestao}"`));

    console.log(`\n== B. FANTASIA — só aparece com razão VAZIA → aceitar ou corrigir origem (${fantasias.length}) ==`);
    fantasias.forEach((f) => console.log(linha(f)));

    console.log(`\n== C. ÓRFÃ — não casa com a base (resíduo) (${orfas.length}) ==`);
    orfas.forEach((o) => console.log(`${linha(o)}${o.naBase ? "  [ainda produzida pela base?!]" : "  [fora da base atual]"}`));

    console.log(`\n== Resumo ==`);
    console.log(`  Entradas do catálogo que NÃO são razão social: ${variantes.length + fantasias.length + orfas.length} de ${catalogo.length}`);
    console.log(`    · Variantes (sugerir alias): ${variantes.length}  (${variantes.filter((v) => v.comprador).length} c/ comprador)`);
    console.log(`    · Fantasias (razão vazia):   ${fantasias.length}  (${fantasias.filter((v) => v.comprador).length} c/ comprador)`);
    console.log(`    · Órfãs:                     ${orfas.length}  (${orfas.filter((v) => v.comprador).length} c/ comprador)`);
    console.log(`\n== D. VÍNCULOS apontando p/ NÃO-razão (o que aparece "fantasia" no painel) — ${vincSuspeitos.length} ==`);
    vincSuspeitos.forEach((v) =>
      console.log(`    "${v.marca}"  →  comprador: ${v.comprador}  [${v.tipo}]` + (v.sugestao ? `\n        ↳ alias sugerido: "${v.marca}" → "${v.sugestao}"` : "")));
    console.log(`\n(read-only) Nada foi gravado.`);
  } finally {
    await conn.end();
  }
}

main().catch((e) => { console.error("✗", e instanceof Error ? e.message : e); process.exit(1); });
