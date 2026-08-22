import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Um segmento do donut: valor (na mesma unidade do `total`) + cor CSS do arco. */
export interface DonutSegment {
  value: number;
  color: string;
}

export interface DonutProps {
  /** Segmentos desenhados em sequência a partir do topo. */
  segments: DonutSegment[];
  /** Diâmetro em px. */
  size?: number;
  /** Espessura do anel em px. */
  thickness?: number;
  /**
   * Denominador (o "100%"). Se omitido, usa a soma dos segmentos. Para um ANEL de porcentagem
   * (ex.: índice de corte) passe `total={100}` e um único segmento — o resto fica como trilho.
   */
  total?: number;
  /** Conteúdo central em destaque (número/valor). */
  centerLabel?: ReactNode;
  /** Segunda linha central (rótulo pequeno). */
  centerSub?: ReactNode;
  /**
   * Efeito 3D: brilho glossy (highlight no topo → sombra embaixo) sobreposto ao anel + relevo
   * (drop-shadow) + pontas arredondadas no anel de 1 segmento. Mesma linguagem visual das barras.
   */
  glossy?: boolean;
  className?: string;
}

/**
 * Donut/anel em SVG puro, reutilizável e theme-aware (trilho via classes Tailwind). Serve tanto
 * para um ANEL de porcentagem (1 segmento + `total=100`) quanto para um donut de composição (N
 * segmentos que somam o total). Sem dependências externas.
 *
 * Nota técnica: só o GRUPO dos arcos é rotacionado (-90° p/ começar no topo). O SVG em si NÃO gira,
 * para o gradiente de brilho (`glossy`) ficar vertical de verdade (topo claro, base escura).
 */
export default function Donut({
  segments,
  size = 72,
  thickness = 10,
  total,
  centerLabel,
  centerSub,
  glossy = false,
  className,
}: DonutProps) {
  const glossId = useId();
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const denom = total ?? segments.reduce((acc, s) => acc + Math.max(0, s.value), 0);
  const cx = size / 2;
  // Pontas arredondadas só quando há 1 segmento (no donut de N segmentos elas se sobreporiam na junção).
  const cap = glossy && segments.length === 1 ? "round" : "butt";

  let acumulado = 0;
  const arcos = segments.map((s, i) => {
    const frac = denom > 0 ? Math.max(0, s.value) / denom : 0;
    const len = frac * c;
    const dash = `${len} ${c - len}`;
    const offset = -acumulado * c;
    acumulado += frac;
    return (
      <circle
        key={i}
        cx={cx}
        cy={cx}
        r={r}
        fill="none"
        stroke={s.color}
        strokeWidth={thickness}
        strokeDasharray={dash}
        strokeDashoffset={offset}
        strokeLinecap={cap}
      />
    );
  });

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {glossy && (
          <defs>
            {/* Brilho vertical (topo claro → base escura), como nas barras. */}
            <linearGradient id={glossId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.28" />
              <stop offset="50%" stopColor="#ffffff" stopOpacity="0.03" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.1" />
            </linearGradient>
          </defs>
        )}
        {/* Trilho + arcos giram -90° (começam no topo); o SVG não gira. */}
        <g transform={`rotate(-90 ${cx} ${cx})`}>
          <circle cx={cx} cy={cx} r={r} fill="none" strokeWidth={thickness} className="stroke-slate-200 dark:stroke-slate-800" />
          <g style={glossy ? { filter: "drop-shadow(0 1px 2px rgba(2,6,23,0.28))" } : undefined}>{arcos}</g>
        </g>
        {/* Sobreposição de brilho: anel cheio com gradiente vertical (não gira). */}
        {glossy && <circle cx={cx} cy={cx} r={r} fill="none" strokeWidth={thickness} stroke={`url(#${glossId})`} />}
      </svg>
      {(centerLabel != null || centerSub != null) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-none">
          {centerLabel != null && <span className="text-sm font-medium tabular-nums text-muted-foreground">{centerLabel}</span>}
          {centerSub != null && <span className="mt-0.5 text-[10px] text-muted-foreground">{centerSub}</span>}
        </div>
      )}
    </div>
  );
}
