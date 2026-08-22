import { Clock } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Selo de "frescor" reutilizável para o header de painéis: um horário PRIMÁRIO (em destaque) e um
 * SECUNDÁRIO opcional (muted), cada um com tooltip próprio. Serve para separar visualmente duas
 * informações de tempo distintas — ex.: quando o painel sincronizou × hora do dado mais recente.
 *
 * Hierarquia: o primário é maior/mais forte (com pontinho "live" pulsante quando `live`); o
 * secundário é menor, muted e só aparece a partir de `md` (some em telas estreitas, sem quebrar o
 * header). O primário aparece a partir de `sm` (padrão dos selos de header do projeto).
 */
export interface FreshnessStampProps {
  /** Horário primário já formatado (ex.: "15:52"). Se null/vazio, nada é renderizado. */
  primary: string | null;
  /** Rótulo antes do horário primário. Default: "Atualizado às". */
  primaryLabel?: string;
  /** Tooltip do primário. */
  primaryTitle?: string;
  /** Horário secundário já formatado (ex.: "15:49"). Opcional. */
  secondary?: string | null;
  /** Rótulo antes do horário secundário (ex.: "último pedido"). */
  secondaryLabel?: string;
  /** Tooltip do secundário. */
  secondaryTitle?: string;
  /** Mostra um pontinho verde pulsante ("ao vivo") no lugar do relógio no primário. */
  live?: boolean;
  className?: string;
}

export default function FreshnessStamp({
  primary,
  primaryLabel = "Atualizado às",
  primaryTitle,
  secondary,
  secondaryLabel,
  secondaryTitle,
  live = false,
  className,
}: FreshnessStampProps) {
  if (!primary) return null;
  return (
    <span className={cn("hidden items-center gap-2 sm:inline-flex", className)}>
      <span
        className="inline-flex items-center gap-1.5 text-xs font-medium tabular-nums text-foreground sm:text-sm"
        title={primaryTitle}
      >
        {live ? (
          <span className="relative flex h-2 w-2" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
        ) : (
          <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        )}
        {primaryLabel} {primary}
      </span>
      {secondary && (
        <span
          className="hidden items-center gap-1 text-[11px] tabular-nums text-muted-foreground md:inline-flex"
          title={secondaryTitle}
        >
          <span className="text-muted-foreground/40" aria-hidden>
            ·
          </span>
          {secondaryLabel ? `${secondaryLabel} ` : ""}
          {secondary}
        </span>
      )}
    </span>
  );
}
