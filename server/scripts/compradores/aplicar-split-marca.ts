/**
 * Corrige marcas que aparecem com DOIS nomes na base porque o FANTASIA (Fabricante) vazou
 * pro campo Fornecedor em alguns estabelecimentos/regiões (ex.: AGPMED × AGAPLASTIC).
 * Detecção prévia em `diagnostico-split-marca.ts` (read-only).
 *
 * Diferente de `reconciliar-catalogo.ts`: aqui o fantasia ESTÁ no campo Fornecedor (não é
 * fantasia "pura"), então a reconciliação genérica o trata como canônico. Por isso o de/para
 * precisa ser explícito.
 *
 * O que faz (idempotente; dry-run por padrão):
 *   1. Semeia gn_marca_aliases com os pares confirmados (variante fantasia → razão canônica).
 *   2. Ajusta gn_comprador_marcas, derivando a ação de cada par pelos vínculos ATUAIS:
 *        - DEDUPE  : fantasia e razão vinculadas ao MESMO comprador → apaga o vínculo do fantasia.
 *        - REMAP   : só o fantasia está vinculado (razão livre) → renomeia o vínculo p/ a razão.
 *        - CONFLITO: fantasia num comprador e razão em OUTRO → só reporta (não toca).
 *        - (nada)  : fantasia sem vínculo → só o catálogo muda.
 *   3. Reconstrói gn_marcas a partir da base JÁ canonizada (fetchProdutosEstoque aplica o de/para),
 *      então a entrada fantasia some do catálogo/dropdown.
 *
 *   npx tsx server/scripts/compradores/aplicar-split-marca.ts           (dry-run: só relatório)
 *   npx tsx server/scripts/compradores/aplicar-split-marca.ts --apply   (grava)
 */

import "dotenv/config";
import mysql from "mysql2/promise";
import { fetchProdutosEstoque } from "../../erpQueries";
import { invalidarMarcaAliases } from "../../db/marcaAliases";

const APPLY = process.argv.includes("--apply");

/** Pares confirmados: [fantasia (variante), razão social (canônica)]. */
const PARES: Array<[string, string]> = [
  ["AGPMED", "AGAPLASTIC INDUSTRIA E COMERCIO LTDA"],
  ["BALY", "BEBIDAS GRASSI DO BRASIL LTDA"],
  ["DIFARMA IMPORTACAO E DIST", "DIFARMA IMPORTACAO E DISTRIBUICAO LTDA"],
  ["DUX COMPANY", "DUX COMPANY S.A."],
  ["GIOVANNA BABY", "PRO NOVA DISTRIBUIDORA E COMERCIO DE COSMETICOS LTDA (GIOVANNA BABY)"],
  ["MERHEJE", "MEREJE BRAZIL INDUSTRIA DE METALURGIA DE PRECISAO LTDA."],
  ["PAPAPÁ", "BABY ROO COMERCIO DE ALIMENTOS (PAPAPA)"],
  ["RILEX", "INDUSTRIA DE ARTEFATOS DE BORRACHA INOVATEX LTDA"],
  ["TROLL", "HADASSAH COSM.LTDA"],
];

type Vinc = { id: number; marca: string; comprador: string };
const norm = (s: string) => s.trim().toUpperCase();

async function main() {
  if (!process.env.DATABASE_URL || !process.env.ERP_API_URL) {
    console.error("DATABASE_URL e ERP_API_URL precisam estar no .env. Aborte.");
    process.exit(1);
  }
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const log: string[] = [];
  const warn: string[] = [];
  try {
    const [rows] = await conn.execute(
      `SELECT cm.id, cm.marca, c.nome AS comprador
         FROM gn_comprador_marcas cm JOIN gn_compradores c ON c.id = cm.compradorId`,
    );
    const vinc = rows as Vinc[];
    const porMarca = new Map(vinc.map((v) => [norm(v.marca), v]));

    // 1) ALIASES
    log.push(`\n== 1. De/para (gn_marca_aliases): ${PARES.length} ==`);
    for (const [f, r] of PARES) log.push(`   "${f}" → "${r}"`);
    if (APPLY) {
      for (const [f, r] of PARES) {
        await conn.execute(
          `INSERT INTO gn_marca_aliases (variante, canonica) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE canonica = VALUES(canonica), updatedAt = CURRENT_TIMESTAMP`,
          [f, r],
        );
      }
    }

    // 2) Vínculos — deriva dedupe/remap/conflito
    log.push(`\n== 2. Vínculos (gn_comprador_marcas) ==`);
    const idsDedupe: number[] = [];
    const remaps: Array<{ id: number; de: string; para: string; comprador: string }> = [];
    for (const [f, r] of PARES) {
      const vf = porMarca.get(norm(f));
      const vr = porMarca.get(norm(r));
      if (!vf) { log.push(`   "${f}": sem vínculo — só catálogo.`); continue; }
      if (vr) {
        if (vr.comprador === vf.comprador) {
          idsDedupe.push(vf.id);
          log.push(`   [DEDUPE] "${f}" (${vf.comprador}) — já tem "${r}" → apaga o fantasia.`);
        } else {
          warn.push(`CONFLITO "${f}" está em ${vf.comprador}, mas "${r}" é de ${vr.comprador} — NÃO tocado (resolver na tela).`);
        }
      } else {
        remaps.push({ id: vf.id, de: f, para: r, comprador: vf.comprador });
        log.push(`   [REMAP] ${vf.comprador} :: "${f}" → "${r}"`);
      }
    }
    if (APPLY) {
      if (idsDedupe.length) await conn.query(`DELETE FROM gn_comprador_marcas WHERE id IN (?)`, [idsDedupe]);
      for (const m of remaps) await conn.execute(`UPDATE gn_comprador_marcas SET marca = ? WHERE id = ?`, [m.para, m.id]);
    }

    // 3) Reconstrói o catálogo a partir da base canonizada
    log.push(`\n== 3. Reconstruir catálogo gn_marcas (base canonizada) ==`);
    if (APPLY) {
      invalidarMarcaAliases(); // garante que fetchProdutosEstoque leia os aliases recém-semeados
      const [sc, rs] = await Promise.all([fetchProdutosEstoque("SC"), fetchProdutosEstoque("RS")]);
      const marcas = new Set<string>();
      for (const p of [...sc, ...rs]) { const n = p.fornecedor.trim(); if (n) marcas.add(n); }
      await conn.execute(`DELETE FROM gn_marcas`);
      const lista = Array.from(marcas);
      const CHUNK = 500;
      for (let i = 0; i < lista.length; i += CHUNK) {
        await conn.query(`INSERT INTO gn_marcas (marca) VALUES ?`, [lista.slice(i, i + CHUNK).map((m) => [m])]);
      }
      log.push(`   catálogo reconstruído com ${lista.length} marcas canônicas.`);
    } else {
      log.push(`   (dry-run) no --apply, reconstrói gn_marcas a partir de fetchProdutosEstoque (com o de/para novo).`);
    }

    console.log(log.join("\n"));
    console.log(`\nResumo: ${PARES.length} aliases · ${idsDedupe.length} dedupe · ${remaps.length} remap` +
      (warn.length ? ` · ${warn.length} conflito(s)` : ""));
    if (warn.length) { console.log(`\n⚠ AVISOS:`); warn.forEach((w) => console.log("   " + w)); }
    console.log(APPLY ? `\n✓ Aplicado.` : `\n(dry-run) Nada gravado. Rode com --apply para efetivar.`);
  } catch (e) {
    console.error("\n✗ Falha:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();
