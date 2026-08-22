import { ArrowDown, ArrowUp, Minus } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { brlCompacto, labelDataResumo } from "@/lib/superestocadosResumo";
import type { RankingRegion } from "@/components/RankingTV";

/**
 * Cabeçalho do modo TV de Superestocados: evolução do "Valor imobilizado" nas últimas
 * 4 semanas (janela deslizante). Rótulo em cima + 4 blocos abaixo; o bloco "Atual" traz
 * o valor ao vivo (sem número grande duplicado). Injetado no `headerStats` do RankingTV;
 * reusado por indústrias e produtos. Fontes escalam por `vh` e os blocos quebram em
 * telas menores (responsivo).
 */

type Direcao = "up" | "down" | "flat" | null;

const FS_WEEK = "clamp(9px, 1.05vh, 18px)";
const FS_VAL = "clamp(13px, 1.7vh, 32px)";
const FS_DELTA = "clamp(9px, 1.05vh, 17px)";
const BLOCK_MIN_W = "clamp(82px, 8vw, 168px)";

function DeltaPill({ dir, pct }: { dir: Direcao; pct: number | null }) {
  if (dir === null || pct === null) {
    return <span className="text-slate-500" style={{ fontSize: FS_DELTA }}>—</span>;
  }
  const estilo =
    dir === "down"
      ? { bg: "bg-emerald-500/15", text: "text-emerald-300", Icon: ArrowDown } // reduziu = bom
      : dir === "up"
        ? { bg: "bg-red-500/15", text: "text-red-300", Icon: ArrowUp } // cresceu = ruim
        : { bg: "bg-slate-600/25", text: "text-slate-300", Icon: Minus }; // manteve
  const { bg, text, Icon } = estilo;
  return (
    <span
      className={cn("inline-flex w-fit items-center gap-0.5 rounded-full px-1.5 font-semibold tabular-nums", bg, text)}
      style={{ fontSize: FS_DELTA }}
    >
      <Icon className="h-[1em] w-[1em]" />
      {Math.abs(Math.round(pct))}%
    </span>
  );
}

export default function SuperestocadosHeaderStats({ region }: { region: RankingRegion }) {
  const q = trpc.superestocados.getResumoPainel.useQuery(
    { region },
    { refetchOnWindowFocus: false, staleTime: 30 * 60 * 1000, refetchInterval: 30 * 60 * 1000 },
  );

  const data = q.data;
  const semanas = data?.semanas ?? [];

  if (q.isLoading) {
    return <div className="h-14 w-full max-w-md animate-pulse rounded-xl bg-slate-800/50" />;
  }
  if (!data) return null;

  const vazios = Math.max(0, 4 - semanas.length);

  return (
    <div className="flex flex-col gap-[0.6vh]">
      {/* Rótulo da faixa — diz o que os blocos representam (o valor atual vive no bloco "Atual"). */}
      <div className="flex items-baseline gap-1.5" style={{ fontSize: FS_WEEK }}>
        <span className="font-semibold uppercase tracking-wide text-slate-300">Valor imobilizado</span>
        <span className="text-slate-500">· {data.qtdProdutos.toLocaleString("pt-BR")} produtos</span>
      </div>

      {/* 4 blocos (janela deslizante). Quebram/encolhem em telas menores. */}
      <div className="flex flex-wrap gap-[0.5vw] gap-y-1.5">
        {Array.from({ length: vazios }).map((_, i) => (
          <div
            key={`vazio-${i}`}
            className="flex flex-col gap-0.5 rounded-xl border border-dashed border-slate-700/50 px-3 py-1.5"
            style={{ minWidth: BLOCK_MIN_W }}
          >
            <span className="text-slate-600" style={{ fontSize: FS_WEEK }}>aguardando</span>
            <span className="font-black leading-tight text-slate-700 tabular-nums" style={{ fontSize: FS_VAL }}>—</span>
            <span className="text-slate-600" style={{ fontSize: FS_DELTA }}>sem dado</span>
          </div>
        ))}

        {semanas.map((s, i) => {
          const atual = i === semanas.length - 1;
          return (
            <div
              key={s.anoSemana}
              className={cn(
                "flex flex-col gap-0.5 rounded-xl px-3 py-1.5 ring-1 ring-inset",
                atual ? "bg-emerald-500/10 ring-emerald-500/50" : "bg-slate-900/70 ring-slate-700/50",
              )}
              style={{ minWidth: BLOCK_MIN_W }}
            >
              <span
                className={cn("flex items-center gap-1 leading-none", atual ? "text-emerald-300" : "text-slate-400")}
                style={{ fontSize: FS_WEEK }}
              >
                {atual ? <span className="font-semibold">Atual</span> : labelDataResumo(s.inicioSemana)}
                {atual && <span className="text-slate-500">· {labelDataResumo(s.inicioSemana)}</span>}
              </span>
              <span className="font-black leading-tight text-white tabular-nums" style={{ fontSize: FS_VAL }}>
                {brlCompacto(s.valorEstoqueTotal)}
              </span>
              <DeltaPill dir={s.direcao} pct={s.deltaPct} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
