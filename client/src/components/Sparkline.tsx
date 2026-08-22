import { useId } from "react";

import { cn } from "@/lib/utils";

export interface SparklineProps {
  /** Série de valores (ordem cronológica). Precisa de ≥ 2 pontos para desenhar a linha. */
  data: number[];
  width?: number;
  height?: number;
  /** Cor CSS da linha (default herda de `currentColor` via a classe do contêiner). */
  color?: string;
  /** Preenche a área sob a linha com um gradiente suave (fade até transparente embaixo). */
  fill?: boolean;
  className?: string;
}

type Pt = readonly [number, number];

/**
 * Constrói um caminho SVG SUAVE (spline Catmull-Rom → curvas de Bézier cúbicas) passando por
 * todos os pontos. Deixa a mini-tendência com curvas arredondadas (em vez de segmentos retos).
 */
function smoothPath(pts: readonly Pt[]): string {
  if (pts.length < 2) return "";
  if (pts.length === 2) return `M${pts[0]![0]},${pts[0]![1]} L${pts[1]![0]},${pts[1]![1]}`;
  let d = `M${pts[0]![0].toFixed(2)},${pts[0]![1].toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return d;
}

/**
 * Sparkline em SVG puro (sem libs). Curva mini de tendência para KPIs. Escala automática (min→max).
 * Linha suave + área em gradiente (quando `fill`) + ponto final com halo. Com < 2 pontos, mostra um
 * traço neutro (não inventa tendência). Reutilizável em qualquer painel.
 */
export default function Sparkline({
  data,
  width = 84,
  height = 30,
  color = "currentColor",
  fill = false,
  className,
}: SparklineProps) {
  const rawId = useId();
  const gradId = `spark-grad-${rawId.replace(/:/g, "")}`;
  const pad = 3;
  const w = width;
  const h = height;

  if (!data || data.length < 2) {
    // Sem histórico suficiente: linha neutra pontilhada (honesto — não há tendência ainda).
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={cn("overflow-visible", className)}>
        <line x1={pad} y1={h / 2} x2={w - pad} y2={h / 2} stroke="currentColor" strokeWidth={1} strokeDasharray="2 3" opacity={0.4} />
      </svg>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const stepX = (w - pad * 2) / (data.length - 1);
  const pts: Pt[] = data.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + (1 - (v - min) / span) * (h - pad * 2);
    return [x, y] as const;
  });
  const linha = smoothPath(pts);
  const area = `${linha} L${pts[pts.length - 1]![0].toFixed(2)},${h} L${pts[0]![0].toFixed(2)},${h} Z`;
  const [ux, uy] = pts[pts.length - 1]!;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={cn("overflow-visible", className)}>
      {fill && (
        <>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradId})`} stroke="none" />
        </>
      )}
      <path d={linha} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      {/* Ponto final com halo suave. */}
      <circle cx={ux} cy={uy} r={3.2} fill={color} opacity={0.18} />
      <circle cx={ux} cy={uy} r={2} fill={color} />
    </svg>
  );
}
