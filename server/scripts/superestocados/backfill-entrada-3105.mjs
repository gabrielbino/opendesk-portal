/**
 * BACKFILL ÚNICO (pedido da diretoria) — fixa a ENTRADA no painel em 31/05/2026.
 *
 * Para cada produto do painel PRINCIPAL (vendaMedia≥1) que já era superestocado em
 * 31/05 (segundo os arquivos), grava o snapshot de entrada com os valores daquela data:
 *   - painelEntradaEm     = 2026-05-31
 *   - diasEstoqueEntrada  = "Dias de Estoque" do arquivo (fixado)
 *   - excessoEntradaReais = excesso calculado com a MESMA fórmula do painel
 *                           (shared/superestocados.ts): ⌈vendaMédia×2⌉ = ideal;
 *                           excesso = (estoque − ideal) × (CustoMédioTotal ÷ estoque).
 *
 * Assim o "↓ Excesso" e o bloco "Evolução desde a entrada" passam a contar de 31/05.
 *
 * NÃO toca em mais nada (campanhas, estoque atual, status — tudo preservado).
 * Só atualiza produtos presentes NO ARQUIVO **e** NO PAINEL que **já eram
 * superestocados em 31/05** (venda média ≥ 1 e dias > 90 no arquivo). Quem entrou
 * depois mantém sua entrada real.
 *
 * Uso (dry-run — não grava, só mostra o que faria):
 *   node server/scripts/superestocados/backfill-entrada-3105.mjs <SC.xlsx> <RS.xlsx>
 * Para aplicar de verdade:
 *   node server/scripts/superestocados/backfill-entrada-3105.mjs <SC.xlsx> <RS.xlsx> --apply
 */

import "dotenv/config";
import mysql from "mysql2/promise";
import * as XLSX from "xlsx";
import { readFileSync } from "node:fs";

const DATA_ENTRADA = "2026-05-31 12:00:00"; // meio-dia p/ não deslocar a data por fuso
const DIAS_LIMITE_ENTRADA = 90; // padrão do painel (DIAS_ESTOQUE_ENTRADA)
const VENDA_MEDIA_MINIMA = 1; // padrão do painel (separa principal × zerados)

/** Excesso em R$ — idêntico a excessoReaisSuperestocado (shared/superestocados.ts). */
function excessoReais(estoque, vendaMedia, custoTotal) {
  const ideal = Math.ceil((vendaMedia ?? 0) * 2);
  const excedente = Math.max(0, estoque - ideal);
  const custoUnit = estoque > 0 ? (custoTotal ?? 0) / estoque : 0;
  return excedente * custoUnit;
}

function num(v) {
  if (v === null || v === undefined) return 0;
  const n = Number(String(v).replace(/\./g, "").replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
}
/** Números que já vêm como Number do xlsx (não formato BR) — usa direto. */
function numDireto(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function lerArquivo(path) {
  const wb = XLSX.read(readFileSync(path), { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
  const map = new Map();
  for (const r of rows) {
    const codigo = parseInt(String(r["Código Produto"] ?? "").trim(), 10);
    if (!Number.isFinite(codigo) || codigo <= 0) continue;
    map.set(codigo, {
      estoque: numDireto(r["Estoque em 31/05/2026"]),
      custoTotal: numDireto(r["Custo Médio Total"]),
      custoMedio: numDireto(r["Custo Médio"]),
      vendaMedia: numDireto(r["Qtd Venda Média Mês"]),
      dias: numDireto(r["Dias de Estoque"]), // "-" → 0
    });
  }
  return map;
}

async function processarRegiao(conn, region, path, apply) {
  const fileMap = lerArquivo(path);
  const [panel] = await conn.execute(
    "SELECT `id`, `codigo` FROM `superestocados_produtos` WHERE `superestoqueRegion` = ? AND `vendaZeradaEntradaEm` IS NULL",
    [region],
  );

  let aplicar = 0;
  let semArquivo = 0;
  let naoEra3105 = 0;
  const amostra = [];
  const updates = [];

  for (const p of panel) {
    const f = fileMap.get(p.codigo);
    if (!f) {
      semArquivo++;
      continue;
    }
    // Era superestocado em 31/05? (mesmos critérios de entrada do painel)
    if (f.vendaMedia < VENDA_MEDIA_MINIMA || f.dias <= DIAS_LIMITE_ENTRADA) {
      naoEra3105++;
      continue;
    }
    // Fallback: se "Custo Médio Total" vier 0, usa "Custo Médio" × estoque.
    const custoTotalEff = f.custoTotal > 0 ? f.custoTotal : f.custoMedio * f.estoque;
    const excesso = excessoReais(f.estoque, f.vendaMedia, custoTotalEff);
    const diasEntrada = Math.round(f.dias);
    updates.push({ id: p.id, diasEntrada, excesso });
    if (amostra.length < 5) {
      amostra.push(
        `  cod ${p.codigo}: est=${f.estoque} vm=${f.vendaMedia.toFixed(1)} dias=${diasEntrada} → excesso=R$ ${excesso.toFixed(2)}`,
      );
    }
    aplicar++;
  }

  console.log(`\n=== ${region} (${path}) ===`);
  console.log(`  produtos no painel principal: ${panel.length}`);
  console.log(`  → BACKFILL (era superestocado em 31/05): ${aplicar}`);
  console.log(`  · pulados (não era superestocado em 31/05): ${naoEra3105}`);
  console.log(`  · pulados (código não achado no arquivo): ${semArquivo}`);
  if (amostra.length) console.log("  amostra:\n" + amostra.join("\n"));

  if (apply && updates.length) {
    for (const u of updates) {
      await conn.execute(
        "UPDATE `superestocados_produtos` SET `painelEntradaEm` = ?, `diasEstoqueEntrada` = ?, `excessoEntradaReais` = ? WHERE `id` = ?",
        [DATA_ENTRADA, u.diasEntrada, u.excesso, u.id],
      );
    }
    console.log(`  ✓ APLICADO: ${updates.length} produtos atualizados.`);
  }
  return aplicar;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const files = args.filter((a) => !a.startsWith("--"));
  if (files.length < 2) {
    console.error("Uso: node backfill-entrada-3105.mjs <SC.xlsx> <RS.xlsx> [--apply]");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não definida no .env. Aborte.");
    process.exit(1);
  }
  const [scPath, rsPath] = files;

  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    console.log(
      apply
        ? "→ MODO APLICAR (vai gravar no banco)\n"
        : "→ DRY-RUN (não grava nada; use --apply para gravar)\n",
    );
    let total = 0;
    total += await processarRegiao(conn, "SC", scPath, apply);
    total += await processarRegiao(conn, "RS", rsPath, apply);
    console.log(`\n${apply ? "✓ Total aplicado" : "Total que SERIA aplicado"}: ${total} produtos.`);
    if (!apply) console.log("Rode de novo com --apply para gravar.");
  } finally {
    await conn.end();
  }
}

main();
