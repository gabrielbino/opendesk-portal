import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * RankingTV — casco reutilizável das telas de "modo TV" (monitor do comercial).
 * Cuida do shell escuro em tela cheia, da barra de controles (SC/RS/Unificado ·
 * Top 10/20 · Rotação, com auto-hide), do cabeçalho, do dimensionamento por `vh`
 * (cabe sem scroll em qualquer resolução), da rotação entre regiões e do refetch
 * alinhado ao horário do sync (sem polling). Cada painel injeta os dados e como
 * renderizar cada linha (colunas). Usado por Rupturas e Superestocados.
 */

export type RankingRegion = "SC" | "RS" | "UNIFICADO";

export const RANKING_REGION_LABEL: Record<RankingRegion, string> = {
  SC: "Santa Catarina",
  RS: "Rio Grande do Sul",
  UNIFICADO: "Unificado",
};

export type SyncSlot = { h: number; m: number };

/** Horários padrão do sync (dias úteis, BRT) — mesmos do Rupturas e Superestocados. */
const DEFAULT_SYNC_SLOTS: SyncSlot[] = [
  { h: 7, m: 30 },
  { h: 10, m: 0 },
  { h: 15, m: 0 },
  { h: 17, m: 0 },
];
const BUFFER_MS = 3 * 60 * 1000;

export function parseRankingParams(search: string): { regiao: RankingRegion; top: number; rotacao: number } {
  const p = new URLSearchParams(search);
  const regiaoRaw = (p.get("regiao") ?? "UNIFICADO").toUpperCase();
  const regiao: RankingRegion = regiaoRaw === "SC" || regiaoRaw === "RS" ? (regiaoRaw as RankingRegion) : "UNIFICADO";
  const top = Number(p.get("top")) === 20 ? 20 : 10;
  const rotacao = Math.max(0, Number(p.get("rotacao")) || 0);
  return { regiao, top, rotacao };
}

/** Próximo horário de sync (estritamente após `from`), só dias úteis. */
function proximoSync(from: Date, slots: SyncSlot[]): Date {
  for (let addDays = 0; addDays < 8; addDays++) {
    const base = new Date(from.getFullYear(), from.getMonth(), from.getDate() + addDays);
    const dow = base.getDay();
    if (dow === 0 || dow === 6) continue;
    for (const s of slots) {
      const cand = new Date(base.getFullYear(), base.getMonth(), base.getDate(), s.h, s.m, 0, 0);
      if (cand.getTime() > from.getTime()) return cand;
    }
  }
  return new Date(from.getTime() + 24 * 60 * 60 * 1000);
}

const fmtHora = (ms: number) =>
  new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(ms));

export type RankingSizing = {
  rowVh: number;
  fs: (frac: number, min: number, max: number) => string;
  fsName: string;
  fsSub: string;
  fsMetric: string;
  fsRank: string;
};

export type RowAccent = { text?: string; ring?: string; critico?: boolean };

type RankingTVProps<T> = {
  title: string;
  subtitle: string;
  regiao: RankingRegion;
  top: number;
  rotacao: number;
  /** Rota base do painel TV (ex.: "/superestocados/painel"). */
  basePath: string;
  /** Rota de saída do modo TV (ex.: "/superestocados"). */
  exitPath: string;
  rows: T[];
  rowKey: (row: T) => string;
  /** Cor/realce da linha (opcional) — específico da métrica de cada painel. */
  rowAccent?: (row: T, idx: number) => RowAccent;
  /** Conteúdo da linha após o número do ranking (colunas específicas do painel). */
  renderRowContent: (row: T, idx: number, sizing: RankingSizing) => ReactNode;
  isLoading: boolean;
  isFetching: boolean;
  ultimaAtualizacaoMs: number | null;
  refetch: () => void;
  syncSlots?: SyncSlot[];
  legend?: ReactNode;
  emptyMessage?: string;
  /** Modo embutido (dentro do player /monitor): esconde a barra de controles/navegação. */
  embedded?: boolean;
  /** Controles extras à esquerda da barra (ex.: toggle de visão). Só aparecem fora do embedded. */
  extraControls?: ReactNode;
  /** Query params extras preservados ao trocar região/top/rotação (ex.: `{ visao: "produtos" }`). */
  extraQuery?: Record<string, string>;
  /** Bloco de KPIs no centro do cabeçalho (ex.: Valor imobilizado + evolução semanal). */
  headerStats?: ReactNode;
};

function RankingTV<T>({
  title,
  subtitle,
  regiao,
  top,
  rotacao,
  basePath,
  exitPath,
  rows,
  rowKey,
  rowAccent,
  renderRowContent,
  isLoading,
  isFetching,
  ultimaAtualizacaoMs,
  refetch,
  syncSlots = DEFAULT_SYNC_SLOTS,
  legend,
  emptyMessage = "Sem dados",
  embedded = false,
  extraControls,
  extraQuery,
  headerStats,
}: RankingTVProps<T>) {
  const [, setLocation] = useLocation();

  const setParams = (next: Partial<{ regiao: RankingRegion; top: number; rotacao: number }>) => {
    const merged = { regiao, top, rotacao, ...next };
    const extra = extraQuery
      ? Object.entries(extraQuery).map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join("")
      : "";
    setLocation(`${basePath}?regiao=${merged.regiao}&top=${merged.top}${merged.rotacao ? `&rotacao=${merged.rotacao}` : ""}${extra}`);
  };

  // Refetch alinhado ao sync (agenda logo após o próximo horário e se reprograma).
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  const slotsRef = useRef(syncSlots);
  slotsRef.current = syncSlots;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const agendar = () => {
      const alvo = proximoSync(new Date(), slotsRef.current).getTime() + BUFFER_MS;
      timer = setTimeout(() => {
        refetchRef.current();
        agendar();
      }, Math.max(alvo - Date.now(), 1000));
    };
    agendar();
    return () => clearTimeout(timer);
  }, []);

  // Rotação automática entre regiões.
  useEffect(() => {
    if (!rotacao) return;
    const ordem: RankingRegion[] = ["SC", "RS", "UNIFICADO"];
    const id = setInterval(() => {
      const proxima = ordem[(ordem.indexOf(regiao) + 1) % ordem.length];
      setParams({ regiao: proxima });
    }, rotacao * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotacao, regiao]);

  // Barra de controles some após inatividade.
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const wake = () => {
      setControlsVisible(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setControlsVisible(false), 6000);
    };
    wake();
    window.addEventListener("mousemove", wake);
    window.addEventListener("keydown", wake);
    return () => {
      window.removeEventListener("mousemove", wake);
      window.removeEventListener("keydown", wake);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const proxima = proximoSync(new Date(), syncSlots);

  // Dimensionamento para caber tudo sem scroll (fontes proporcionais à altura da linha).
  const n = Math.max(rows.length, 1);
  const gapVh = n > 12 ? 0.6 : 1;
  const listVh = 80;
  const rowVh = (listVh - (n - 1) * gapVh) / n;
  // Fonte = menor entre o orçamento de ALTURA (vh, p/ caber sem scroll na TV) e o de
  // LARGURA (vw). Em telas largas/altas o vh manda (não muda a TV); em telas estreitas
  // (celular) o vw limita e as fontes encolhem, dando espaço pro texto sem truncar.
  const fs = (frac: number, min: number, max: number) =>
    `clamp(${min}px, min(${(rowVh * frac).toFixed(2)}vh, ${(frac * 9.5).toFixed(2)}vw), ${max}px)`;
  const sizing: RankingSizing = {
    rowVh,
    fs,
    fsName: fs(0.33, 14, 88),
    fsSub: fs(0.18, 10, 38),
    fsMetric: fs(0.52, 18, 150),
    fsRank: fs(0.34, 12, 86),
  };

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-slate-950 text-white">
      {/* Barra de controles (auto-hide) */}
      <div
        className={cn(
          "fixed inset-x-0 top-0 z-20 flex flex-wrap items-center justify-between gap-3 bg-slate-900/80 px-4 py-2 backdrop-blur transition-opacity duration-500 sm:px-8",
          !embedded && controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
      >
        <button onClick={() => setLocation(exitPath)} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-slate-300 hover:bg-slate-800">
          <ArrowLeft className="h-4 w-4" /> Sair do modo TV
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {extraControls && (
            <>
              {extraControls}
              <span className="mx-1 h-4 w-px bg-slate-700" />
            </>
          )}
          <Preset ativo={regiao === "SC"} onClick={() => setParams({ regiao: "SC" })}>SC</Preset>
          <Preset ativo={regiao === "RS"} onClick={() => setParams({ regiao: "RS" })}>RS</Preset>
          <Preset ativo={regiao === "UNIFICADO"} onClick={() => setParams({ regiao: "UNIFICADO" })}>Unificado</Preset>
          <span className="mx-1 h-4 w-px bg-slate-700" />
          <Preset ativo={top === 10} onClick={() => setParams({ top: 10 })}>Top 10</Preset>
          <Preset ativo={top === 20} onClick={() => setParams({ top: 20 })}>Top 20</Preset>
          <span className="mx-1 h-4 w-px bg-slate-700" />
          <Preset ativo={rotacao > 0} onClick={() => setParams({ rotacao: rotacao > 0 ? 0 : 30 })}>
            {rotacao > 0 ? "Rotação on" : "Rotação off"}
          </Preset>
        </div>
      </div>

      {/* Cabeçalho */}
      <header className="shrink-0 px-6 sm:px-12" style={{ paddingTop: "clamp(44px, 5.5vh, 110px)", paddingBottom: "1.2vh" }}>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            <h1 className="font-black tracking-tight text-white" style={{ fontSize: "clamp(24px, min(4.4vh, 8.5vw), 96px)", lineHeight: 1.05 }}>
              {title}
            </h1>
            <p className="font-medium text-slate-200" style={{ fontSize: "clamp(13px, min(2.3vh, 4.4vw), 44px)" }}>{subtitle}</p>
          </div>
          {headerStats && <div className="min-w-0 shrink-0">{headerStats}</div>}
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2 text-slate-300" style={{ fontSize: "clamp(12px, 1.6vh, 28px)" }}>
              <RefreshCw className={cn("h-[1.1em] w-[1.1em]", isFetching && "animate-spin")} />
              <span>
                {ultimaAtualizacaoMs ? `Atualizado ${fmtHora(ultimaAtualizacaoMs)}` : "Aguardando dados"}
                <span className="mx-1.5 text-slate-500">•</span>
                Próxima {fmtHora(proxima.getTime())}
              </span>
            </div>
            {legend && (
              <div className="flex items-center gap-4 font-medium text-slate-200" style={{ fontSize: "clamp(13px, 1.9vh, 34px)" }}>
                {legend}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Lista do ranking */}
      <main className="flex min-h-0 flex-1 flex-col px-6 pb-[2vh] sm:px-12" style={{ gap: `${gapVh}vh` }}>
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center text-2xl text-slate-500">Carregando…</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-3xl font-bold text-emerald-400">{emptyMessage}</div>
        ) : (
          rows.map((row, idx) => {
            const accent = rowAccent?.(row, idx) ?? {};
            const critico = accent.critico ?? idx === 0;
            return (
              <div
                key={rowKey(row)}
                className={cn(
                  "flex min-h-0 flex-1 items-center gap-[1.5vw] overflow-hidden rounded-2xl bg-slate-900/80 px-4 ring-1 ring-inset sm:px-8",
                  accent.ring,
                  critico && "ring-2",
                )}
              >
                <div
                  className={cn(
                    "flex aspect-square h-[1.7em] shrink-0 items-center justify-center rounded-full font-black tabular-nums",
                    critico ? cn("bg-white/10", accent.text) : "text-slate-500",
                  )}
                  style={{ fontSize: sizing.fsRank }}
                >
                  {idx + 1}
                </div>
                {renderRowContent(row, idx, sizing)}
              </div>
            );
          })
        )}
      </main>
    </div>
  );
}

function Preset({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg px-3 py-1 text-sm font-medium transition-colors",
        ativo ? "bg-white text-slate-900" : "bg-slate-800 text-slate-300 hover:bg-slate-700",
      )}
    >
      {children}
    </button>
  );
}

/** Chip da barra de controles — exportado para montar controles extras com o mesmo estilo. */
export const RankingTVChip = Preset;

export default RankingTV;
