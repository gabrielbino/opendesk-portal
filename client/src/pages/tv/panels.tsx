import type { ComponentType, ReactNode } from "react";

import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { emojiRuptura, formatPct, FAIXAS_RUPTURA } from "@/lib/rupturas";
import { MONITOR_PANEL_KEYS, MONITOR_PANEL_LABELS, type MonitorPanelKey } from "@shared/monitorTv";
import RankingTV, {
  RANKING_REGION_LABEL,
  type RankingRegion,
  type RankingSizing,
} from "@/components/RankingTV";
import SuperestocadosHeaderStats from "./SuperestocadosHeaderStats";

/**
 * Registry dos painéis de TV + suas views embutíveis (fetch + RankingTV).
 * Cada view roda standalone (com controles) ou dentro do player /monitor (embedded).
 * Adicionar um painel novo do backlog = criar a view aqui e registrar em TV_PANELS.
 */

export type TvViewProps = {
  regiao: RankingRegion;
  top: number;
  /** Rotação de região interna (só standalone; no player fica 0). */
  rotacao?: number;
  /** Embutido no player: esconde os controles do RankingTV. */
  embedded?: boolean;
  /** Controles extras na barra (ex.: toggle de visão no painel standalone). */
  extraControls?: ReactNode;
  /** Query params preservados ao trocar região/top (ex.: `{ visao: "produtos" }`). */
  extraQuery?: Record<string, string>;
};

/* ─── Rupturas ─── */
type MarcaRow = {
  fornecedor: string;
  comprador: string | null;
  qtdRuptura: number;
  totalAtivos: number;
  qtdZerados: number;
  pctRuptura: number;
};
function corRiscoTV(pct: number): { text: string; ring: string } {
  // Fundo padrão (slate, igual ao Superestocados) — a cor da faixa fica só no CONTORNO,
  // pra não deixar o ranking "vermelho demais" (pedido do time comercial).
  if (pct > 15) return { text: "text-red-400", ring: "ring-red-500/50" };
  if (pct > 10) return { text: "text-orange-400", ring: "ring-orange-500/50" };
  if (pct > 5) return { text: "text-amber-300", ring: "ring-amber-500/50" };
  return { text: "text-emerald-400", ring: "ring-emerald-500/50" };
}
export function RupturasTVView({ regiao, top, rotacao = 0, embedded = false, extraControls, extraQuery }: TvViewProps) {
  const q = trpc.rupturas.getRanking.useQuery(
    { region: regiao, top },
    { refetchOnWindowFocus: false, staleTime: 60 * 60 * 1000 },
  );
  const rows = (q.data?.marcas ?? []) as MarcaRow[];
  return (
    <RankingTV<MarcaRow>
      title="Ranking de Rupturas"
      subtitle={`${RANKING_REGION_LABEL[regiao]} · Top ${top} marcas mais críticas`}
      regiao={regiao}
      top={top}
      rotacao={rotacao}
      basePath="/rupturas/painel"
      exitPath="/rupturas"
      embedded={embedded}
      extraControls={extraControls}
      extraQuery={extraQuery}
      rows={rows}
      rowKey={(r) => r.fornecedor}
      isLoading={q.isLoading}
      isFetching={q.isFetching}
      ultimaAtualizacaoMs={q.data?.ultimaAtualizacaoMs ?? null}
      refetch={q.refetch}
      emptyMessage="Nenhuma marca em ruptura"
      legend={FAIXAS_RUPTURA.map((l) => (
        <span key={l.key} className="flex items-center gap-1.5">
          <span className="leading-none" style={{ fontSize: "1.5em" }}>{l.emoji}</span>
          {l.label}
        </span>
      ))}
      rowAccent={(row) => {
        const c = corRiscoTV(row.pctRuptura);
        return { ring: c.ring, text: c.text };
      }}
      renderRowContent={(row, _i, s: RankingSizing) => {
        const c = corRiscoTV(row.pctRuptura);
        return (
          <>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold leading-tight text-white" style={{ fontSize: s.fsName }}>{row.fornecedor}</p>
              <p className="truncate leading-tight text-slate-300" style={{ fontSize: s.fsSub }}>
                {row.comprador ? `Comprador: ${row.comprador}` : "Comprador não atribuído"}
                {" · "}{row.qtdRuptura} de {row.totalAtivos} ativos
                {row.qtdZerados > 0 && <span className="font-semibold text-red-300"> · {row.qtdZerados} zerados</span>}
              </p>
            </div>
            <div className="shrink-0 leading-none" style={{ fontSize: s.fs(0.56, 24, 160) }}>{emojiRuptura(row.pctRuptura)}</div>
            <div className={cn("shrink-0 text-right font-black leading-none tabular-nums", c.text)} style={{ fontSize: s.fsMetric }}>{formatPct(row.pctRuptura)}</div>
          </>
        );
      }}
    />
  );
}

/* ─── Superestocadas ─── */
type RankItem = {
  fornecedor: string;
  excessoReais: number;
  excessoEntradaReais: number;
  tempoMedioDias: number | null;
  acompPct: number | null;
  produtos: number;
};
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
function corAcomp(pct: number | null): string {
  if (pct === null) return "text-slate-400";
  if (pct >= 20) return "text-emerald-400";
  if (pct > 0) return "text-emerald-300";
  if (pct === 0) return "text-slate-300";
  return "text-red-400";
}
function fmtAcomp(pct: number | null): string {
  if (pct === null) return "—";
  const v = Math.round(pct);
  return `${v > 0 ? "↓" : v < 0 ? "↑" : ""}${Math.abs(v)}%`;
}

/**
 * Colunas de excesso da direita: "entrada → %variação → atual" (lê da esquerda p/ direita:
 * quando entrou tinha X, reduziu/cresceu Y%, agora tem Z). A entrada só aparece quando há
 * base (acompPct != null). Reutilizada pelas views de indústrias e produtos.
 */
function MetricaExcesso({ entrada, acompPct, atual, s }: { entrada: number | null; acompPct: number | null; atual: number; s: RankingSizing }) {
  return (
    <>
      {acompPct !== null && entrada !== null && (
        <div className="shrink-0 text-right leading-tight">
          <div className="uppercase tracking-wide text-slate-500" style={{ fontSize: s.fsSub }}>entrada</div>
          <div className="font-semibold tabular-nums text-slate-300" style={{ fontSize: s.fs(0.3, 12, 64) }}>{brl.format(Math.round(entrada))}</div>
        </div>
      )}
      <div className={cn("shrink-0 text-right font-black leading-none tabular-nums", corAcomp(acompPct))} style={{ fontSize: s.fs(0.34, 16, 90) }}>{fmtAcomp(acompPct)}</div>
      <div className="shrink-0 text-right font-black leading-none tabular-nums text-white" style={{ fontSize: s.fsMetric }}>{brl.format(Math.round(atual))}</div>
    </>
  );
}
export function SuperestocadosTVView({ regiao, top, rotacao = 0, embedded = false, extraControls, extraQuery }: TvViewProps) {
  const q = trpc.superestocados.getRanking.useQuery(
    { region: regiao, top },
    { refetchOnWindowFocus: false, staleTime: 60 * 60 * 1000 },
  );
  const itens = (q.data?.itens ?? []) as RankItem[];
  return (
    <RankingTV<RankItem>
      title="Indústrias Superestocadas"
      subtitle={`${RANKING_REGION_LABEL[regiao]} · Top ${top} indústrias mais superestocadas`}
      regiao={regiao}
      top={top}
      rotacao={rotacao}
      basePath="/superestocados/painel"
      exitPath="/superestocados"
      embedded={embedded}
      extraControls={extraControls}
      extraQuery={extraQuery}
      headerStats={<SuperestocadosHeaderStats region={regiao} />}
      rows={itens}
      rowKey={(r) => r.fornecedor}
      isLoading={q.isLoading}
      isFetching={q.isFetching}
      ultimaAtualizacaoMs={q.data?.ultimaAtualizacaoMs ?? null}
      refetch={q.refetch}
      emptyMessage="Nenhuma indústria superestocada"
      legend={
        <>
          <span className="flex items-center gap-1.5"><span className="text-emerald-400">↓</span> excesso reduziu</span>
          <span className="flex items-center gap-1.5"><span className="text-red-400">↑</span> excesso cresceu</span>
        </>
      }
      rowAccent={(_r, idx) => ({ ring: idx === 0 ? "ring-amber-400/50" : "ring-slate-700/60", text: "text-amber-300", critico: idx === 0 })}
      renderRowContent={(row, _i, s: RankingSizing) => (
        <>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold leading-tight text-white" style={{ fontSize: s.fsName }}>{row.fornecedor}</p>
            <p className="truncate leading-tight text-slate-300" style={{ fontSize: s.fsSub }}>
              {row.produtos} {row.produtos === 1 ? "produto" : "produtos"}
              {" · "}
              {row.tempoMedioDias !== null ? `${row.tempoMedioDias} dias no painel (média)` : "sem tempo"}
            </p>
          </div>
          <MetricaExcesso entrada={row.excessoEntradaReais} acompPct={row.acompPct} atual={row.excessoReais} s={s} />
        </>
      )}
    />
  );
}

/* ─── Superestocados: PRODUTOS ───
 * Visão alternativa da de indústrias: 1 linha por produto, com o tempo EXATO no
 * painel (não a média). Mesmo casco/estilo (RankingTV). */
type ProdutoRankItem = {
  codigo: number;
  region: RankingRegion;
  nomeProduto: string;
  fornecedor: string;
  excessoReais: number;
  excessoEntradaReais: number | null;
  diasNoPainel: number | null;
  acompPct: number | null;
};
export function SuperestocadosProdutosTVView({ regiao, top, rotacao = 0, embedded = false, extraControls, extraQuery }: TvViewProps) {
  const q = trpc.superestocados.getProdutosRanking.useQuery(
    { region: regiao, top },
    { refetchOnWindowFocus: false, staleTime: 60 * 60 * 1000 },
  );
  const itens = (q.data?.itens ?? []) as ProdutoRankItem[];
  return (
    <RankingTV<ProdutoRankItem>
      title="Produtos Superestocados"
      subtitle={`${RANKING_REGION_LABEL[regiao]} · Top ${top} produtos mais superestocados`}
      regiao={regiao}
      top={top}
      rotacao={rotacao}
      basePath="/superestocados/painel"
      exitPath="/superestocados"
      embedded={embedded}
      extraControls={extraControls}
      extraQuery={extraQuery}
      headerStats={<SuperestocadosHeaderStats region={regiao} />}
      rows={itens}
      rowKey={(r) => `${r.codigo}-${r.region}`}
      isLoading={q.isLoading}
      isFetching={q.isFetching}
      ultimaAtualizacaoMs={q.data?.ultimaAtualizacaoMs ?? null}
      refetch={q.refetch}
      emptyMessage="Nenhum produto superestocado"
      legend={
        <>
          <span className="flex items-center gap-1.5"><span className="text-emerald-400">↓</span> excesso reduziu</span>
          <span className="flex items-center gap-1.5"><span className="text-red-400">↑</span> excesso cresceu</span>
        </>
      }
      rowAccent={(_r, idx) => ({ ring: idx === 0 ? "ring-amber-400/50" : "ring-slate-700/60", text: "text-amber-300", critico: idx === 0 })}
      renderRowContent={(row, _i, s: RankingSizing) => (
        <>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold leading-tight text-white" style={{ fontSize: s.fsName }}>{row.nomeProduto}</p>
            <p className="truncate leading-tight text-slate-300" style={{ fontSize: s.fsSub }}>
              {row.fornecedor}
              {" · "}
              {row.diasNoPainel !== null ? `${row.diasNoPainel} ${row.diasNoPainel === 1 ? "dia" : "dias"} no painel` : "sem tempo"}
            </p>
          </div>
          <MetricaExcesso entrada={row.excessoEntradaReais} acompPct={row.acompPct} atual={row.excessoReais} s={s} />
        </>
      )}
    />
  );
}

/* ─── Registry ───
 * key → view embutível. As chaves/labels vêm do shared (fonte única, validada no
 * server); aqui só mapeamos para o componente. Painel novo = 1 entrada aqui + a key
 * em shared/monitorTv.ts. */
export type TvPanelKey = MonitorPanelKey;
export const TV_PANELS: Record<TvPanelKey, { label: string; View: ComponentType<TvViewProps> }> = {
  superestocados: { label: MONITOR_PANEL_LABELS.superestocados, View: SuperestocadosTVView },
  superestocados_produtos: { label: MONITOR_PANEL_LABELS.superestocados_produtos, View: SuperestocadosProdutosTVView },
  rupturas: { label: MONITOR_PANEL_LABELS.rupturas, View: RupturasTVView },
};
export const TV_PANEL_KEYS: TvPanelKey[] = [...MONITOR_PANEL_KEYS];
