import { ArrowDown, ArrowUp, Minus } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { brlCompacto, labelDataResumo, type DirecaoResumo } from "@/lib/superestocadosResumo";

type TipoBalde = "medicamento" | "medicamento_zerado" | "nao_medicamento" | "nao_medicamento_zerado";

/**
 * Faixa "Valor imobilizado — últimas 4 semanas" do PAINEL (tema claro).
 * Reage aos filtros de tipo: sem tipos = total da região; com tipos = soma dos baldes.
 * Semanas capturadas antes do recorte por tipo vêm marcadas `semDado` (bloco tracejado).
 * Mobile-first: grade 2×2 no celular (tudo visível) → linha de 4 no desktop.
 */
export default function SuperestocadosValorTrend({
  region,
  tipos,
}: {
  region: "SC" | "RS" | "UNIFICADO";
  tipos: TipoBalde[];
}) {
  const q = trpc.superestocados.getResumoPainel.useQuery(
    { region, tipos: tipos.length ? tipos : undefined },
    { staleTime: 5 * 60_000, refetchOnWindowFocus: false },
  );

  if (q.isLoading) {
    return <div className="h-[104px] w-full animate-pulse rounded-xl border border-slate-200 bg-white" />;
  }
  const data = q.data;
  if (!data) return null;

  const semanas = data.semanas;
  const vazios = Math.max(0, 4 - semanas.length);
  const temTipos = tipos.length > 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 text-[13px]">
        <span className="font-medium uppercase tracking-wide text-slate-600">Valor imobilizado</span>
        <span className="text-slate-400"> · últimas 4 semanas</span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {Array.from({ length: vazios }).map((_, i) => (
          <BlocoVazio key={`vazio-${i}`} rotulo="aguardando" sub="sem dado" />
        ))}

        {semanas.map((s, i) => {
          const atual = i === semanas.length - 1 && !s.semDado;
          if (s.semDado) {
            return <BlocoVazio key={s.anoSemana} rotulo={labelDataResumo(s.inicioSemana)} sub="sem dado por tipo" />;
          }
          return (
            <div
              key={s.anoSemana}
              className={cn(
                "flex flex-col gap-0.5 rounded-xl border p-3",
                atual ? "border-teal-500 bg-teal-50" : "border-slate-200 bg-white",
              )}
            >
              <span className={cn("text-xs font-medium", atual ? "text-teal-700" : "text-slate-500")}>
                {atual ? `Atual · ${labelDataResumo(s.inicioSemana)}` : labelDataResumo(s.inicioSemana)}
              </span>
              <span className="text-lg font-bold tabular-nums text-slate-900 sm:text-xl">
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

function BlocoVazio({ rotulo, sub }: { rotulo: string; sub: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-dashed border-slate-300 p-3">
      <span className="text-xs text-slate-400">{rotulo}</span>
      <span className="text-lg font-bold tabular-nums text-slate-300 sm:text-xl">—</span>
      <span className="text-xs text-slate-400">{sub}</span>
    </div>
  );
}

function DeltaPill({ dir, pct }: { dir: DirecaoResumo; pct: number | null }) {
  if (dir === null || pct === null) {
    return <span className="text-xs text-slate-400">—</span>;
  }
  // reduziu (down) = bom (verde) · cresceu (up) = ruim (vermelho) · manteve (flat) = neutro.
  const estilo =
    dir === "down"
      ? { cls: "bg-emerald-50 text-emerald-700", Icon: ArrowDown }
      : dir === "up"
        ? { cls: "bg-rose-50 text-rose-700", Icon: ArrowUp }
        : { cls: "bg-slate-100 text-slate-500", Icon: Minus };
  const { cls, Icon } = estilo;
  return (
    <span className={cn("inline-flex w-fit items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums", cls)}>
      <Icon className="h-3 w-3" />
      {Math.abs(Math.round(pct))}%
    </span>
  );
}
