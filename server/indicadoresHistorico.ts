/**
 * Histórico do painel "Pedidos por Layout" (Indicadores) — acesso ao banco.
 *
 * Grava fotos periódicas (30 min, janela 08:00–22:00 SP) do agregado por (dia, hhmm, estado,
 * layout) e lê a série dos últimos N dias no "mesmo horário do dia" (comparação justa: hoje-até-
 * agora × dias anteriores até o mesmo horário). Os helpers puros (janela/slot/clamp/variação) e os
 * tipos vivem em @shared/indicadoresHistorico. Ver docs/indicadores-handoff.md.
 */

import { and, gte, lte, sql } from "drizzle-orm";
import { getDb } from "./db";
import { indicadoresPedidoLayoutHist } from "../drizzle/schema";
import { partesSP } from "@shared/agenda";
import { dataSP } from "@shared/monitorArquivosBackup";
import {
  clampHHMM,
  dentroDaJanela,
  formatarHHMM,
  slot30,
  type HistoricoLayout,
  type PontoHistorico,
} from "@shared/indicadoresHistorico";
import { fetchPedidosPorLayout, fetchPedidosCortadosPorLayout, fetchQtdPedidoDia } from "./erpQueries";

const DIA_MS = 24 * 60 * 60 * 1000;
const ESTADOS_GRAVADOS = new Set(["SC", "RS"]);

async function db() {
  const conn = await getDb();
  if (!conn) throw new Error("Banco de dados indisponível.");
  return conn;
}

type LinhaSnap = {
  estado: string;
  layout: string;
  qtdPedidos: number;
  valorPedido: number;
  qtdCortados: number;
  valorCortados: number;
  qtdTotal: number;
};

/** Funde aceitos + cortados + total do dia por (estado, layout), só para SC e RS. */
function fundirSCeRS(
  aceitos: { estado: string; layout: string; qtdPedidos: number; valorPedido: number }[],
  cortados: { estado: string; layout: string; qtdPedidos: number; valorPedido: number }[],
  totais: { estado: string; layout: string; qtd: number }[],
): LinhaSnap[] {
  const map = new Map<string, LinhaSnap>();
  const pega = (estado: string, layout: string) => {
    const k = `${estado}||${layout}`;
    let l = map.get(k);
    if (!l) {
      l = { estado, layout, qtdPedidos: 0, valorPedido: 0, qtdCortados: 0, valorCortados: 0, qtdTotal: 0 };
      map.set(k, l);
    }
    return l;
  };
  for (const r of aceitos) {
    if (!ESTADOS_GRAVADOS.has(r.estado) || !r.layout) continue;
    const l = pega(r.estado, r.layout);
    l.qtdPedidos += r.qtdPedidos;
    l.valorPedido += r.valorPedido;
  }
  for (const r of cortados) {
    if (!ESTADOS_GRAVADOS.has(r.estado) || !r.layout) continue;
    const l = pega(r.estado, r.layout);
    l.qtdCortados += r.qtdPedidos;
    l.valorCortados += r.valorPedido;
  }
  for (const r of totais) {
    if (!ESTADOS_GRAVADOS.has(r.estado) || !r.layout) continue;
    pega(r.estado, r.layout).qtdTotal += r.qtd;
  }
  return Array.from(map.values());
}

/**
 * Grava uma foto do agregado atual (UPSERT por slot de 30 min). Só roda dentro da janela
 * 08:00–22:00 SP; fora dela é no-op. Retorna quantas linhas foram gravadas (0 = fora da janela).
 */
export async function snapshotPedidosLayout(agora: Date = new Date()): Promise<{ gravadas: number; slot: string | null }> {
  const p = partesSP(agora);
  const minutosDoDia = p.hora * 60 + p.minuto;
  if (!dentroDaJanela(minutosDoDia)) return { gravadas: 0, slot: null };

  const dia = dataSP(agora);
  const slot = slot30(p.hora, p.minuto);

  const [aceitos, cortados, totais] = await Promise.all([
    fetchPedidosPorLayout(),
    fetchPedidosCortadosPorLayout(),
    fetchQtdPedidoDia(),
  ]);
  const linhas = fundirSCeRS(aceitos, cortados, totais);
  if (linhas.length === 0) return { gravadas: 0, slot };

  const conn = await db();
  await conn
    .insert(indicadoresPedidoLayoutHist)
    .values(
      linhas.map((l) => ({
        dia,
        hhmm: slot,
        estado: l.estado,
        layout: l.layout.slice(0, 120),
        qtdPedidos: l.qtdPedidos,
        valorPedido: l.valorPedido,
        qtdCortados: l.qtdCortados,
        valorCortados: l.valorCortados,
        qtdTotal: l.qtdTotal,
      })),
    )
    .onDuplicateKeyUpdate({
      set: {
        qtdPedidos: sql`values(\`qtdPedidos\`)`,
        valorPedido: sql`values(\`valorPedido\`)`,
        qtdCortados: sql`values(\`qtdCortados\`)`,
        valorCortados: sql`values(\`valorCortados\`)`,
        qtdTotal: sql`values(\`qtdTotal\`)`,
        capturadoEm: sql`current_timestamp()`,
      },
    });
  return { gravadas: linhas.length, slot };
}

const pontoVazio = (dia: string): PontoHistorico => ({ dia, qtd: 0, valor: 0, qtdCort: 0, valorCort: 0, total: 0 });

/**
 * Série dos últimos `dias` (default 14) no "mesmo horário do dia" (maior slot ≤ alvo, sendo alvo o
 * horário atual limitado à janela). Cada ponto = acumulado daquele dia até aquele horário. Agrega
 * SC, RS e Unificado (SC+RS). Só retorna os dias que têm foto (não inventa passado).
 */
export async function getHistoricoLayout(agora: Date = new Date(), dias = 14): Promise<HistoricoLayout> {
  const p = partesSP(agora);
  const alvo = clampHHMM(formatarHHMM(p.hora, p.minuto));
  const diaHoje = dataSP(agora);
  const diaMin = dataSP(new Date(agora.getTime() - (dias - 1) * DIA_MS));

  const conn = await db();
  const rows = await conn
    .select()
    .from(indicadoresPedidoLayoutHist)
    .where(
      and(
        gte(indicadoresPedidoLayoutHist.dia, diaMin),
        lte(indicadoresPedidoLayoutHist.dia, diaHoje),
        lte(indicadoresPedidoLayoutHist.hhmm, alvo),
      ),
    );

  // 1) Para cada (dia, estado, layout) fica a foto de MAIOR hhmm ≤ alvo ("mesmo horário do dia").
  const maisRecente = new Map<string, typeof rows[number]>();
  for (const r of rows) {
    const k = `${r.dia}||${r.estado}||${r.layout}`;
    const atual = maisRecente.get(k);
    if (!atual || r.hhmm > atual.hhmm) maisRecente.set(k, r);
  }

  // 2) Agrega por dia (SC, RS e a soma Unificado).
  const porDia = new Map<string, { SC: PontoHistorico; RS: PontoHistorico; UNIFICADO: PontoHistorico }>();
  const garante = (dia: string) => {
    let d = porDia.get(dia);
    if (!d) {
      d = { SC: pontoVazio(dia), RS: pontoVazio(dia), UNIFICADO: pontoVazio(dia) };
      porDia.set(dia, d);
    }
    return d;
  };
  for (const r of Array.from(maisRecente.values())) {
    const d = garante(r.dia);
    const alvos = r.estado === "SC" ? [d.SC, d.UNIFICADO] : r.estado === "RS" ? [d.RS, d.UNIFICADO] : [];
    for (const ponto of alvos) {
      ponto.qtd += r.qtdPedidos;
      ponto.valor += r.valorPedido;
      ponto.qtdCort += r.qtdCortados;
      ponto.valorCort += r.valorCortados;
      ponto.total += r.qtdTotal;
    }
  }

  const diasOrdenados = Array.from(porDia.keys()).sort();
  const serie = (reg: "SC" | "RS" | "UNIFICADO") => diasOrdenados.map((dia) => porDia.get(dia)![reg]);

  return {
    SC: serie("SC"),
    RS: serie("RS"),
    UNIFICADO: serie("UNIFICADO"),
    desde: diasOrdenados[0] ?? null,
    alvo,
  };
}
