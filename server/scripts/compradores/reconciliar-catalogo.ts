/**
 * Limpa e reconcilia o catálogo/vínculos de compradores usando a regra oficial de marca
 * (razão social "Fornecedor"; fantasia "Fabricante" só quando a razão vem vazia).
 *
 * O que faz:
 *   1. Lê a base dia_estoque (SC+RS) — colunas Fornecedor + Fabricante.
 *   2. Define a marca CANÔNICA de cada produto = Fornecedor || Fabricante.
 *   3. Reconstrói gn_marcas com as marcas canônicas distintas.
 *   4. Remapeia vínculos legados que usaram a FANTASIA → razão social canônica
 *      (dedupe se já existir; reporta conflito se a razão já é de outro comprador).
 *   5. Lista marcas ÓRFÃS (vínculos que não casam com nada na base) pra você decidir.
 *
 * Uso (ambiente com .env de produção — ERP_API_* + DATABASE_URL):
 *   npx tsx server/scripts/compradores/reconciliar-catalogo.ts          (dry-run: só relatório)
 *   npx tsx server/scripts/compradores/reconciliar-catalogo.ts --apply  (aplica as mudanças)
 */

import "dotenv/config";
import mysql from "mysql2/promise";
import { executarQuery } from "../../erpApi";

const APPLY = process.argv.includes("--apply");
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

  const [sc, rs] = await Promise.all([executarQuery("dia_estoque_sc"), executarQuery("dia_estoque_rs")]);
  const canonicas = new Set<string>();
  const fantasiaToRazao = new Map<string, string>();
  for (const raw of [...sc, ...rs] as Record<string, unknown>[]) {
    const razao = campo(raw, /^fornecedor$/i);
    const fantasia = campo(raw, /fabric|fantasia/i);
    const canonica = razao || fantasia;
    if (!canonica) continue;
    canonicas.add(canonica);
    if (razao && fantasia && fantasia !== razao && !fantasiaToRazao.has(fantasia)) {
      fantasiaToRazao.set(fantasia, razao);
    }
  }
  console.log(`Base: ${canonicas.size} marcas canônicas · ${fantasiaToRazao.size} fantasias mapeáveis.`);

  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [vinculos] = await conn.execute(
      `SELECT cm.id, cm.marca, cm.compradorId, c.nome
         FROM gn_comprador_marcas cm JOIN gn_compradores c ON c.id = cm.compradorId`,
    );
    const marcasVinculadas = new Map((vinculos as any[]).map((v) => [v.marca, v]));

    const remapear: Array<{ id: number; de: string; para: string; nome: string }> = [];
    const dedupe: Array<{ id: number; marca: string }> = [];
    const conflitos: Array<{ marca: string; de: string; jaDe: string }> = [];
    const orfas: Array<{ marca: string; nome: string }> = [];

    for (const v of vinculos as any[]) {
      if (canonicas.has(v.marca)) continue; // já é razão social — ok
      const alvo = fantasiaToRazao.get(v.marca);
      if (!alvo) { orfas.push({ marca: v.marca, nome: v.nome }); continue; }
      const existente = marcasVinculadas.get(alvo);
      if (existente) {
        if (existente.compradorId === v.compradorId) dedupe.push({ id: v.id, marca: v.marca });
        else conflitos.push({ marca: v.marca, de: v.nome, jaDe: existente.nome });
      } else {
        remapear.push({ id: v.id, de: v.marca, para: alvo, nome: v.nome });
        marcasVinculadas.set(alvo, { ...v, marca: alvo }); // reserva o alvo
      }
    }

    console.log(`\n== Vínculos ==`);
    console.log(`  Remapear (fantasia→razão): ${remapear.length}`);
    remapear.forEach((r) => console.log(`    "${r.de}" → "${r.para}" (${r.nome})`));
    console.log(`  Dedupe (fantasia duplicada do mesmo comprador): ${dedupe.length}`);
    console.log(`  Conflitos (razão já é de outro comprador — NÃO tocado): ${conflitos.length}`);
    conflitos.forEach((c) => console.log(`    "${c.de}" → já pertence a "${c.jaDe}"`));
    console.log(`  Órfãs (não casam com a base — resolver manualmente): ${orfas.length}`);
    orfas.forEach((o) => console.log(`    "${o.marca}" (${o.nome})`));

    if (!APPLY) {
      console.log(`\n(dry-run) Rode com --apply pra gravar. gn_marcas será reconstruído com ${canonicas.size} marcas.`);
      return;
    }

    for (const r of remapear) {
      await conn.execute("UPDATE gn_comprador_marcas SET marca = ? WHERE id = ?", [r.para, r.id]);
    }
    for (const d of dedupe) {
      await conn.execute("DELETE FROM gn_comprador_marcas WHERE id = ?", [d.id]);
    }
    // Reconstrói o catálogo com as canônicas.
    await conn.execute("DELETE FROM gn_marcas");
    const lista = Array.from(canonicas);
    const CHUNK = 500;
    for (let i = 0; i < lista.length; i += CHUNK) {
      const bloco = lista.slice(i, i + CHUNK);
      await conn.query("INSERT INTO gn_marcas (marca) VALUES ?", [bloco.map((m) => [m])]);
    }
    console.log(`\n✓ Aplicado: ${remapear.length} remapeados, ${dedupe.length} dedupe, catálogo com ${lista.length} marcas.` +
      (conflitos.length || orfas.length ? ` ⚠ ${conflitos.length} conflito(s) + ${orfas.length} órfã(s) ficaram pra resolver na tela.` : ""));
  } finally {
    await conn.end();
  }
}

main().catch((e) => { console.error("✗", e instanceof Error ? e.message : e); process.exit(1); });
