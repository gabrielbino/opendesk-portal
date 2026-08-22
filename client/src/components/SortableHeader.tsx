import { ArrowUpDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Cabeçalho de coluna ordenável PADRÃO das tabelas de dados (Superestocados, Validades
 * Curtas, Rupturas, futuros). Vai DENTRO do `<th>` do header escuro (`bg-slate-900`).
 *
 * Mostra a seta de ordenação e, quando é a coluna ativa, um indicador ASC/DESC em teal.
 * O `<th>` continua sendo do painel (largura/sticky/frozen); este componente é só o gatilho.
 */
export interface SortableHeaderProps {
  label: string;
  /** É a coluna atualmente ordenada? */
  active: boolean;
  /** Direção atual (só relevante quando `active`). */
  direction: "asc" | "desc";
  /** Alterna a ordenação desta coluna. */
  onSort: () => void;
  /** Alinhamento do rótulo (numéricos à direita, centralizados quando a coluna é center). Default "left". */
  align?: "left" | "center" | "right";
}

const ALIGN_CLASS: Record<"left" | "center" | "right", string> = {
  left: "justify-start text-left",
  center: "justify-center text-center",
  right: "justify-end text-right",
};

export default function SortableHeader({ label, active, direction, onSort, align = "left" }: SortableHeaderProps) {
  return (
    <button
      type="button"
      onClick={onSort}
      aria-label={`Ordenar por ${label}`}
      className={cn(
        "flex w-full items-center gap-1.5 rounded-lg px-1 py-0.5 text-xs font-semibold transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
        ALIGN_CLASS[align],
      )}
    >
      <span>{label}</span>
      <ArrowUpDown className={cn("h-3 w-3 shrink-0 opacity-70", active && "text-teal-200 opacity-100")} />
      {active && (
        <span className="text-[10px] uppercase tracking-[0.15em] text-teal-200">{direction}</span>
      )}
    </button>
  );
}
