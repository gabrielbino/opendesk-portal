/**
 * Aplica as decisões do comercial sobre marcas duplicadas na Compradores
 * (planilha de validação, jul/2026). Idempotente; dry-run por padrão.
 *
 *   npx tsx server/scripts/compradores/aplicar-decisoes.ts           (dry-run: só relatório)
 *   npx tsx server/scripts/compradores/aplicar-decisoes.ts --apply   (grava)
 *
 * O que faz, na ordem:
 *   1. Semeia gn_marca_aliases (13 de/para variante→razão oficial). FARMAX fica de fora
 *      (comercial marcou "manter separado").
 *   2. Ajusta os vínculos gn_comprador_marcas:
 *        - REMOVER (nome antigo/variante; o comprador já tem a razão oficial);
 *        - REMAP (renomear a marca do vínculo p/ a razão informada);
 *        - MOVER (ZIIN ZIIN: tira COMERCIO DE MEL LIMA da EDUARDA e passa p/ a JULIA).
 *   3. Reconstrói gn_marcas a partir da base JÁ canonizada (fetchProdutosEstoque aplica o
 *      de/para), então as variantes somem do catálogo/dropdown.
 *
 * Cada operação confere o dono atual antes de agir e AVISA se algo diverge (não força).
 */

import "dotenv/config";
import mysql from "mysql2/promise";
import { fetchProdutosEstoque } from "../../erpQueries";
import { invalidarMarcaAliases } from "../../db/marcaAliases";

const APPLY = process.argv.includes("--apply");

// ── Decisões ────────────────────────────────────────────────────────────────

/** De/para permanente (variante → razão oficial). */
const ALIASES: Array<[string, string]> = [
  ["LHS FOODS", "LHS INDUSTRIA E COMERCIO DE ALIMENTOS LTDA"],
  ["LOLLY", "LOLLY BRASIL LTDA"],
  ["NATIVITA", "NATIVITA INDUSTRIA E COMERCIO LTDA"],
  ["PHARMASCIENCE", "PHARMASCIENCE INDUSTRIA FARMACEUTICA S.A"],
  ["SANFARMA IND., COM. E IMPORT. E EXP. LTDA", "SANFARMA INDUSTRIA, COMERCIO E IMPORTACAO E EXPORTACAO LTDA"],
  ["MULTILAB - JAGUARIUNA", "MULTILAB INDÚSTRIA E COM. PROD. FARMAC. LTDA"],
  ["MULTILAB INDUSTRIA E COMERCIO DE PRODUTOS FARMAC LTDA", "MULTILAB INDÚSTRIA E COM. PROD. FARMAC. LTDA"],
  ["CCM INDUSTRIA E COMERCIO DE PRODUTOS DESCARTAVEIS S.A.", "CCM IND. E COM. DE PROD. DESCARTAVEIS LTDA"],
  ["LBS", "LBS LABORASA IND FARMA LTDA"],
  ["MUNILA", "MUNILA DESENVOLVEDORA DE PROJETOS LTDA"],
  ["TECHLINE", "TECHLINE COMERCIAL, IMPORTADORA, EXPORTADORA E SERVICOS LTDA"],
  ["NDS DISTRIBUIDORA DE MEDICAMENTOS LTDA (PRATI)", "PRATI, DONADUZZI E CIA LTDA"],
  ["LAB. CATARINENSE S/A", "LABORATORIO CATARINENSE LTDA"],
];

/** Vínculos a REMOVER: comprador esperado + marca. */
const REMOVER: Array<{ comprador: string; marca: string; motivo: string }> = [
  // Tipo 1 — nome curto legado (comprador já tem a razão)
  { comprador: "EDUARDA", marca: "IMEC", motivo: "T1" },
  { comprador: "EDUARDA", marca: "VIDORA", motivo: "T1" },
  { comprador: "HUMBERTHO", marca: "EMS MARCAS", motivo: "T1" },
  { comprador: "HUMBERTHO", marca: "GEOLAB", motivo: "T1" },
  { comprador: "HUMBERTHO", marca: "LEGRAND", motivo: "T1" },
  { comprador: "HUMBERTHO", marca: "MEDQUIMICA", motivo: "T1" },
  { comprador: "HUMBERTHO", marca: "PHARLAB", motivo: "T1" },
  { comprador: "HUMBERTHO", marca: "TEUTO", motivo: "T1" },
  { comprador: "HUMBERTHO", marca: "MULTILAB", motivo: "T1" },
  { comprador: "JULIA", marca: "FINI", motivo: "T1" },
  { comprador: "JULIA", marca: "FLORA (HYDRATTA)", motivo: "T1" },
  { comprador: "JULIA", marca: "PHISALIA", motivo: "T1" },
  // Tipo 2 — dedupe (comprador já tem a razão informada)
  { comprador: "HUMBERTHO", marca: "NEO QUIMICA", motivo: "T2 dedupe (tem HYPERA S.A.)" },
  { comprador: "JULIA", marca: "KAZE", motivo: "T2 dedupe (tem SUSAKI...)" },
  { comprador: "JULIA", marca: "MAM", motivo: "T2 dedupe (tem BEBE SAUDE LTDA)" },
  // Tipo 3 — variantes (mantém a razão oficial já vinculada)
  { comprador: "EDUARDA", marca: "LHS FOODS", motivo: "T3" },
  { comprador: "EDUARDA", marca: "LOLLY", motivo: "T3" },
  { comprador: "EDUARDA", marca: "NATIVITA", motivo: "T3" },
  { comprador: "EDUARDA", marca: "PHARMASCIENCE", motivo: "T3" },
  { comprador: "EDUARDA", marca: "SANFARMA IND., COM. E IMPORT. E EXP. LTDA", motivo: "T3" },
  { comprador: "HUMBERTHO", marca: "MULTILAB - JAGUARIUNA", motivo: "T3" },
  { comprador: "HUMBERTHO", marca: "MULTILAB INDUSTRIA E COMERCIO DE PRODUTOS FARMAC LTDA", motivo: "T3" },
  { comprador: "HUMBERTHO", marca: "LAB. CATARINENSE S/A", motivo: "T3" },
  { comprador: "JULIA", marca: "CCM INDUSTRIA E COMERCIO DE PRODUTOS DESCARTAVEIS S.A.", motivo: "T3" },
  { comprador: "JULIA", marca: "LBS", motivo: "T3" },
  { comprador: "JULIA", marca: "MUNILA", motivo: "T3" },
  { comprador: "JULIA", marca: "TECHLINE", motivo: "T3" },
];

/** Vínculos a RENOMEAR (a marca do comprador vira a razão informada; alvo precisa estar livre). */
const REMAP: Array<{ comprador: string; de: string; para: string }> = [
  { comprador: "JULIA", de: "NATUPHITUS", para: "NATUPHITUS IND. E COM DE COSMETICOS LTDA" },
  { comprador: "JULIA", de: "TRILAB (TRIHAIR)", para: "EXATA DISTRIBUIDORA DE COSMETICOS LTDA" },
];

/** MOVER: tira a marca do comprador atual e passa a marca ao 'de' do outro comprador. */
const MOVER = { marca: "COMERCIO DE MEL LIMA LTDA", deComprador: "EDUARDA", paraComprador: "JULIA", renomeando: "ZIIN ZIIN" };

// ── Execução ──────────────────────────────────────────────────────────────

type Vinc = { id: number; comprador: string; marca: string };

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
    const porMarca = new Map(vinc.map((v) => [v.marca, v]));
    const idComprador = new Map<string, number>();
    {
      const [cs] = await conn.execute(`SELECT id, nome FROM gn_compradores`);
      for (const c of cs as { id: number; nome: string }[]) idComprador.set(c.nome, c.id);
    }
    console.log(`Vínculos hoje: ${vinc.length}`);

    // 1) ALIASES
    log.push(`\n== 1. De/para (gn_marca_aliases): ${ALIASES.length} ==`);
    for (const [v, c] of ALIASES) log.push(`   "${v}" → "${c}"`);
    if (APPLY) {
      for (const [v, c] of ALIASES) {
        await conn.execute(
          `INSERT INTO gn_marca_aliases (variante, canonica) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE canonica = VALUES(canonica), updatedAt = CURRENT_TIMESTAMP`,
          [v, c],
        );
      }
    }

    // 2a) REMOVER
    log.push(`\n== 2a. Remover vínculos: ${REMOVER.length} ==`);
    const idsRemover: number[] = [];
    for (const r of REMOVER) {
      const cur = porMarca.get(r.marca);
      if (!cur) { warn.push(`REMOVER "${r.marca}" (${r.comprador}): não existe (já removido?)`); continue; }
      if (cur.comprador !== r.comprador) { warn.push(`REMOVER "${r.marca}": esperado ${r.comprador}, está em ${cur.comprador} — PULADO`); continue; }
      idsRemover.push(cur.id);
      log.push(`   [${r.motivo}] ${r.comprador} :: "${r.marca}"`);
    }
    if (APPLY && idsRemover.length) {
      await conn.query(`DELETE FROM gn_comprador_marcas WHERE id IN (?)`, [idsRemover]);
    }

    // 2b) MOVER (ZIIN ZIIN → COMERCIO DE MEL LIMA na JULIA)
    log.push(`\n== 2b. Mover "${MOVER.marca}" de ${MOVER.deComprador} → ${MOVER.paraComprador} (renomeando "${MOVER.renomeando}") ==`);
    const marcaMove = porMarca.get(MOVER.marca);
    const ziin = porMarca.get(MOVER.renomeando);
    if (!marcaMove || marcaMove.comprador !== MOVER.deComprador) {
      warn.push(`MOVER: "${MOVER.marca}" não está em ${MOVER.deComprador} — PULADO`);
    } else if (!ziin || ziin.comprador !== MOVER.paraComprador) {
      warn.push(`MOVER: "${MOVER.renomeando}" não está em ${MOVER.paraComprador} — PULADO`);
    } else {
      log.push(`   remove ${MOVER.deComprador} :: "${MOVER.marca}"  +  renomeia ${MOVER.paraComprador} :: "${MOVER.renomeando}" → "${MOVER.marca}"`);
      if (APPLY) {
        await conn.execute(`DELETE FROM gn_comprador_marcas WHERE id = ?`, [marcaMove.id]);
        await conn.execute(`UPDATE gn_comprador_marcas SET marca = ? WHERE id = ?`, [MOVER.marca, ziin.id]);
      }
    }

    // 2c) REMAP
    log.push(`\n== 2c. Renomear vínculos (fantasma — razão não está na base): ${REMAP.length} ==`);
    for (const r of REMAP) {
      const cur = porMarca.get(r.de);
      if (!cur || cur.comprador !== r.comprador) { warn.push(`REMAP "${r.de}" (${r.comprador}): não encontrado — PULADO`); continue; }
      const ocupado = porMarca.get(r.para);
      if (ocupado) { warn.push(`REMAP "${r.de}" → "${r.para}": alvo já é de ${ocupado.comprador} — PULADO`); continue; }
      log.push(`   ${r.comprador} :: "${r.de}" → "${r.para}"`);
      if (APPLY) await conn.execute(`UPDATE gn_comprador_marcas SET marca = ? WHERE id = ?`, [r.para, cur.id]);
    }

    // 3) Reconstrói gn_marcas da base JÁ canonizada
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
      log.push(`   (dry-run) no --apply, reconstrói gn_marcas a partir de fetchProdutosEstoque (com o de/para).`);
    }

    console.log(log.join("\n"));
    if (warn.length) { console.log(`\n⚠ AVISOS (${warn.length}):`); warn.forEach((w) => console.log("   " + w)); }
    console.log(APPLY ? `\n✓ Aplicado.` : `\n(dry-run) Nada gravado. Rode com --apply para efetivar.`);
  } catch (e) {
    console.error("\n✗ Falha:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();
