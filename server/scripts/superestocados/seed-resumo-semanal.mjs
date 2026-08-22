/**
 * Seed do retrato semanal de Superestocados a partir do relatório de estoque (xlsx),
 * UMA região por vez (idempotente — upsert por região+semana).
 *
 * Soma a coluna "Custo Médio Total" (= valorCusto) APENAS dos produtos que estão no
 * painel (superestocados_produtos, estoqueAtual>0) da região, e grava como o "Valor
 * imobilizado" da semana ISO da data do relatório (lida do cabeçalho "Estoque em
 * DD/MM/YYYY"). Só semeia a semana daquele arquivo; as demais se preenchem pela captura
 * automática do sync ao longo do tempo.
 *
 * Uso (num ambiente com DATABASE_URL no .env, com o painel já populado):
 *   node server/scripts/superestocados/seed-resumo-semanal.mjs SC OpenDeskSC.xlsx
 *   node server/scripts/superestocados/seed-resumo-semanal.mjs RS OpenDeskRS.xlsx
 */

import "dotenv/config";
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import * as XLSX from "xlsx";

const region = String(process.argv[2] || "").toUpperCase();
const arquivo = process.argv[3];

if (region !== "SC" && region !== "RS") {
  console.error('Região inválida. Uso: node seed-resumo-semanal.mjs <SC|RS> <relatorio.xlsx>');
  process.exit(1);
}
if (!arquivo) {
  console.error("Informe o caminho do relatório xlsx. Uso: node seed-resumo-semanal.mjs <SC|RS> <relatorio.xlsx>");
  process.exit(1);
}

/** Semana ISO "YYYY-Www" a partir de uma data calendário (ano, mês 1-12, dia). */
function isoWeekFromYMD(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (dt.getUTCDay() + 6) % 7; // segunda=0 … domingo=6
  dt.setUTCDate(dt.getUTCDate() - dayNum + 3); // quinta-feira da semana ISO
  const firstThu = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
  const fdn = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - fdn + 3);
  const week = 1 + Math.round((dt.getTime() - firstThu.getTime()) / (7 * 86_400_000));
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não definida no .env. Aborte.");
    process.exit(1);
  }

  const wb = XLSX.read(readFileSync(arquivo), { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
  if (!rows.length) throw new Error(`Planilha vazia (${arquivo}).`);

  const cols = Object.keys(rows[0]);
  const estoqueCol = cols.find((k) => /Estoque em \d{2}\/\d{2}\/\d{4}/.test(k));
  const md = estoqueCol && /(\d{2})\/(\d{2})\/(\d{4})/.exec(estoqueCol);
  if (!md) throw new Error(`Não achei a coluna "Estoque em DD/MM/YYYY" em ${arquivo}.`);
  const anoSemana = isoWeekFromYMD(Number(md[3]), Number(md[2]), Number(md[1]));

  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [panelRows] = await conn.execute(
      "SELECT codigo FROM superestocados_produtos WHERE region = ? AND estoqueAtual > 0",
      [region],
    );
    const panel = new Set(panelRows.map((r) => Number(r.codigo)));
    if (panel.size === 0) {
      throw new Error(`Painel de ${region} vazio no banco — rode o sync antes de semear.`);
    }

    let total = 0;
    let qtd = 0;
    for (const row of rows) {
      const cod = Number(String(row["Código Produto"] ?? "").trim());
      if (!Number.isFinite(cod) || !panel.has(cod)) continue;
      total += Number(row["Custo Médio Total"] ?? 0);
      qtd++;
    }

    await conn.execute(
      `INSERT INTO superestocados_resumo_semanal (region, anoSemana, valorEstoqueTotal, qtdProdutos)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE valorEstoqueTotal = VALUES(valorEstoqueTotal), qtdProdutos = VALUES(qtdProdutos)`,
      [region, anoSemana, total, qtd],
    );

    const naoCasados = panel.size - qtd;
    console.log(
      `✓ ${region} ${anoSemana}: ${qtd}/${panel.size} produtos do painel casados` +
        (naoCasados > 0 ? ` (${naoCasados} sem linha no relatório)` : "") +
        ` · Valor imobilizado: R$ ${total.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`,
    );
  } catch (err) {
    console.error("\n✗ Falha:", err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();
