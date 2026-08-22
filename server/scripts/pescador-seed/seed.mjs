/**
 * Seed das tabelas Pescador a partir do snapshot estático do protótipo (data.js).
 *
 * Uso:
 *   node server/scripts/pescador-seed/seed.mjs
 *
 * Requer DATABASE_URL no ambiente (mesma do app helpdesk).
 *
 * NOTA: Esta pasta inteira é descartável quando a integração com a API real
 * estiver implementada. Veja README.md para detalhes.
 */

import "dotenv/config";
import mysql from "mysql2/promise";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_JS_PATH = path.join(__dirname, "data.js");

/** Histórico só dos últimos N dias (a partir da data mais recente do snapshot). */
const HISTORICO_DIAS = 15;

/** Tamanho dos batches de INSERT. MySQL aceita até ~65k placeholders por query. */
const BATCH_SIZE = 500;

/* ─── Carrega data.js como JSON ─────────────────────────────────────────── */

async function loadDataset() {
  const raw = await fs.readFile(DATA_JS_PATH, "utf8");
  // data.js declara `window.DATASET = {...};`. Extraímos o objeto literal.
  const match = raw.match(/window\.DATASET\s*=\s*({[\s\S]*});?\s*$/m);
  if (!match) throw new Error("data.js: não encontrei a expressão window.DATASET = {...};");
  return JSON.parse(match[1]);
}

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function idxMap(cols) {
  const m = {};
  cols.forEach((c, i) => { m[c] = i; });
  return m;
}

function asNum(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string" && v.trim().toUpperCase() === "NULL") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function asInt(v) {
  const n = asNum(v);
  return n == null ? null : Math.trunc(n);
}

function asStr(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length === 0 || s.toUpperCase() === "NULL" ? null : s;
}

function asDate(v) {
  const s = asStr(v);
  if (!s) return null;
  // já vem em "YYYY-MM-DD" do gen_data.py
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

async function insertBatch(conn, table, columns, rows) {
  if (rows.length === 0) return 0;
  const placeholders = `(${columns.map(() => "?").join(",")})`;
  let total = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const slice = rows.slice(i, i + BATCH_SIZE);
    const values = slice.flatMap((r) => columns.map((c) => r[c] ?? null));
    const sql = `INSERT INTO ${table} (${columns.join(",")}) VALUES ${slice.map(() => placeholders).join(",")}`;
    const [res] = await conn.execute(sql, values);
    total += res.affectedRows ?? 0;
  }
  return total;
}

/* ─── Triagem ───────────────────────────────────────────────────────────────
 * A Triagem NÃO é mais semeada aqui — passou a vir da API OpenDesk
 * (server/pescadorApiSync.ts, consulta "pescador"). Este seed cobre apenas
 * Pedidos e Histórico até eles terem suas próprias consultas na API.
 * ─────────────────────────────────────────────────────────────────────────── */

/* ─── Pedidos + Itens ───────────────────────────────────────────────────── */

async function seedPedidos(conn, dataset) {
  const { cols, rows } = dataset.pedidos;
  const I = idxMap(cols);

  // Agrupa pela CHAVE NATURAL: CNPJ + nº do pedido do cliente + desdobramento.
  // NUMERO_PEDIDO_VENDA fica '0' para pedidos rejeitados que não viraram venda
  // (sequencial interna do ERP), então NÃO identifica o pedido.
  const pedidosMap = new Map();
  for (const r of rows) {
    const numero = asStr(r[I.NUMERO_PEDIDO_VENDA]) ?? "0";
    const cnpj = asStr(r[I.CNPJ_CLIENTE]) ?? "";
    const codCliente = asStr(r[I.CODIGO_PEDIDO_CLIENTE]) ?? "";
    const desdo = asInt(r[I.NUMERO_DESDOBRAMENTO]) ?? 0;
    if (!cnpj && !codCliente) continue;
    const key = `${cnpj}::${codCliente}::${desdo}`;
    if (!pedidosMap.has(key)) {
      pedidosMap.set(key, {
        header: {
          dataPedido: asDate(r[I.DATA_PEDIDO]),
          numeroPedidoVenda: numero,
          codigoPedidoCliente: asStr(r[I.CODIGO_PEDIDO_CLIENTE]),
          cnpjCliente: asStr(r[I.CNPJ_CLIENTE]),
          numeroDesdobramento: desdo,
          valorTotalPedido: asNum(r[I.VALOR_TOTAL_PEDIDO]),
          motivoRejeicaoPedido: asStr(r[I.MOTIVO_REJEICAO_PEDIDO]),
        },
        itens: [],
      });
    }
    pedidosMap.get(key).itens.push({
      codInterno: asStr(r[I.COD_INTERNO]) ?? "",
      ean: asStr(r[I.EAN]),
      descricao: asStr(r[I.DESCRICAO]),
      fabricante: asStr(r[I.FABRICANTE]),
      politica: asStr(r[I.POLITICA]),
      qtdSolicitada: asInt(r[I.QTD_SOLICITADA]) ?? 0,
      qtdAtendida: asInt(r[I.QTD_ATENDIDA]) ?? 0,
      statusAtendimento: asStr(r[I.STATUS_ATENDIMENTO]),
      motivoRejeicaoItem: asStr(r[I.MOTIVO_REJEICAO_ITEM]),
      precoUnitarioPedido: asNum(r[I.PRECO_UNITARIO_PEDIDO]),
      descontoPedidoPerc: asNum(r[I.DESCONTO_PEDIDO_PERC]),
      valorTotalItemPedido: asNum(r[I.VALOR_TOTAL_ITEM_PEDIDO]),
      numeroNota: asStr(r[I.NUMERO_NOTA]),
      dataNota: asDate(r[I.DATA_NOTA]),
      qtdFaturada: asInt(r[I.QTD_FATURADA]) ?? 0,
      precoPraticadoNota: asNum(r[I.PRECO_PRATICADO_NOTA]),
    });
  }

  // Insere headers e captura IDs.
  const headerCols = [
    "dataPedido", "numeroPedidoVenda", "codigoPedidoCliente", "cnpjCliente",
    "numeroDesdobramento", "valorTotalPedido", "motivoRejeicaoPedido",
  ];
  let totalHeaders = 0;
  let totalItens = 0;
  // Inserimos um pedido por vez para conseguir capturar lastInsertId associado.
  for (const { header, itens } of pedidosMap.values()) {
    const values = headerCols.map((c) => header[c] ?? null);
    const [res] = await conn.execute(
      `INSERT INTO pescador_pedidos (${headerCols.join(",")}) VALUES (${headerCols.map(() => "?").join(",")})`,
      values,
    );
    const pedidoId = res.insertId;
    totalHeaders += 1;

    if (itens.length > 0) {
      const itemCols = [
        "pedidoId", "codInterno", "ean", "descricao", "fabricante", "politica",
        "qtdSolicitada", "qtdAtendida", "statusAtendimento", "motivoRejeicaoItem",
        "precoUnitarioPedido", "descontoPedidoPerc", "valorTotalItemPedido",
        "numeroNota", "dataNota", "qtdFaturada", "precoPraticadoNota",
      ];
      const itemRows = itens.map((it) => ({ ...it, pedidoId }));
      totalItens += await insertBatch(conn, "pescador_pedidos_itens", itemCols, itemRows);
    }
  }

  return { pedidos: totalHeaders, itens: totalItens };
}

/* ─── Histórico (filtrado para últimos 15 dias) ─────────────────────────── */

async function seedHistorico(conn, dataset) {
  const { cols, rows } = dataset.historico;
  const I = idxMap(cols);

  // Determina a data de corte: 15 dias antes da data mais recente do snapshot.
  let maxData = null;
  for (const r of rows) {
    const d = asDate(r[I.DATA_EMISSAO]);
    if (d && (!maxData || d > maxData)) maxData = d;
  }
  let cutoff = null;
  if (maxData) {
    const dt = new Date(maxData + "T00:00:00Z");
    dt.setUTCDate(dt.getUTCDate() - HISTORICO_DIAS);
    cutoff = dt.toISOString().slice(0, 10);
  }

  const records = [];
  for (const r of rows) {
    const dataEmissao = asDate(r[I.DATA_EMISSAO]);
    if (!dataEmissao) continue;
    if (cutoff && dataEmissao < cutoff) continue;

    const numeroNota = asStr(r[I.NUMERO_NOTA]);
    const serieNota = asStr(r[I.SERIE_NOTA]);
    const seqItem = asInt(r[I.SEQ_ITEM]);
    if (!numeroNota || seqItem == null) continue;

    records.push({
      estabelecimento: asStr(r[I.ESTABELECIMENTO]) ?? "1",
      numeroNota,
      serieNota,
      dataEmissao,
      layoutOrigem: asStr(r[I.LAYOUT_ORIGEM]),
      pedidoVenda: asStr(r[I.PEDIDO_VENDA]),
      seqItem,
      codInterno: asStr(r[I.COD_INTERNO]) ?? "",
      ean: asStr(r[I.EAN]),
      descricao: asStr(r[I.DESCRICAO]),
      fabricante: asStr(r[I.FABRICANTE]),
      codLote: asStr(r[I.COD_LOTE]),
      qtdFaturada: asInt(r[I.QTD_FATURADA]) ?? 0,
      precoLiquido: asNum(r[I.PRECO_LIQUIDO]),
      valorStUnitario: asNum(r[I.VALOR_ST_UNITARIO]),
      precoFinal: asNum(r[I.PRECO_FINAL]),
      descontoPerc: asNum(r[I.DESCONTO_PERC]),
      valorTotalItem: asNum(r[I.VALOR_TOTAL_ITEM]),
      embalagem: asStr(r[I.EMBALAGEM]),
    });
  }

  // Dedupe por (numeroNota, serieNota, seqItem) — UNIQUE no schema.
  const seen = new Set();
  const deduped = [];
  for (const r of records) {
    const k = `${r.numeroNota}::${r.serieNota ?? ""}::${r.seqItem}`;
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(r);
  }

  const columns = [
    "estabelecimento", "numeroNota", "serieNota", "dataEmissao", "layoutOrigem",
    "pedidoVenda", "seqItem", "codInterno", "ean", "descricao", "fabricante",
    "codLote", "qtdFaturada", "precoLiquido", "valorStUnitario", "precoFinal",
    "descontoPerc", "valorTotalItem", "embalagem",
  ];
  const inserted = await insertBatch(conn, "pescador_historico", columns, deduped);
  return { inserted, totalAntes: records.length, cutoff };
}

/* ─── Meta ──────────────────────────────────────────────────────────────── */

async function recordMeta(conn, dataset, totals) {
  const meta = dataset.meta ?? {};
  const geradoEm = meta.gerado_em ? new Date(meta.gerado_em) : new Date();
  await conn.execute(
    `INSERT INTO pescador_meta
     (geradoEm, estabelecimento, cliente, janela, totalTriagem, totalPedidos, totalHistorico, fonte)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      geradoEm,
      meta.estabelecimento ?? "SC",
      meta.cliente ?? "CLAMED",
      meta.janela ?? null,
      totals.triagem,
      totals.pedidos,
      totals.historico,
      "seed",
    ],
  );
}

/* ─── Main ──────────────────────────────────────────────────────────────── */

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não definida no ambiente. Aborte.");
    process.exit(1);
  }

  console.log("→ Carregando data.js…");
  const dataset = await loadDataset();
  console.log(`  triagem: ${dataset.triagem.rows.length} | pedidos: ${dataset.pedidos.rows.length} | historico: ${dataset.historico.rows.length}`);

  console.log("→ Conectando ao MySQL…");
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  conn.config.multipleStatements = false;

  try {
    console.log("→ Limpando Pedidos/Histórico (TRUNCATE)…");
    await conn.execute("SET FOREIGN_KEY_CHECKS = 0");
    await conn.execute("TRUNCATE TABLE pescador_historico");
    await conn.execute("TRUNCATE TABLE pescador_pedidos_itens");
    await conn.execute("TRUNCATE TABLE pescador_pedidos");
    await conn.execute("TRUNCATE TABLE pescador_meta");
    await conn.execute("SET FOREIGN_KEY_CHECKS = 1");
    // pescador_triagem NÃO é tocada — é alimentada pela API (server/pescadorApiSync.ts).

    console.log("→ Inserindo Pedidos + Itens…");
    const pedidos = await seedPedidos(conn, dataset);
    console.log(`  ${pedidos.pedidos} pedidos, ${pedidos.itens} itens`);

    console.log(`→ Inserindo Histórico (últimos ${HISTORICO_DIAS} dias)…`);
    const hist = await seedHistorico(conn, dataset);
    console.log(`  ${hist.inserted} linhas inseridas em pescador_historico (corte: ${hist.cutoff ?? "—"})`);

    // Triagem vem da API; conta o que já existe na tabela só para a meta.
    const [trows] = await conn.execute("SELECT COUNT(*) AS n FROM pescador_triagem");
    const triagemTotal = Number(trows[0]?.n ?? 0);

    console.log("→ Registrando meta…");
    await recordMeta(conn, dataset, {
      triagem: triagemTotal,
      pedidos: pedidos.pedidos,
      historico: hist.inserted,
    });

    console.log("\n✓ Seed do Pescador concluído com sucesso.");
  } catch (error) {
    console.error("\n✗ Falha durante o seed:", error.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();
