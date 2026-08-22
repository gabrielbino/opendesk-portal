import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface KpiGridProps {
  children: ReactNode;
  /**
   * Nº de colunas no DESKTOP (padrão 4). No mobile é SEMPRE 1 (cards empilhados,
   * full-width — valor nunca quebra), subindo para 2 no `sm` e `cols` no `lg`.
   */
  cols?: 3 | 4;
  className?: string;
}

/**
 * KpiGrid — grade responsiva PADRÃO para faixas de KPI (mobile-first).
 *
 * Regra do projeto (ver CLAUDE.md): 1 coluna no mobile → 2 no `sm` → `cols` no `lg`.
 * Empilhar no mobile garante que valores grandes (R$ ...) não quebrem e mantém a
 * leitura "bate o olho". Use SEMPRE este wrapper ao criar uma faixa de KPIs.
 */
export default function KpiGrid({ children, cols = 4, className }: KpiGridProps) {
  const desktopCols = cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4";
  return <div className={cn("grid grid-cols-1 gap-3", desktopCols, className)}>{children}</div>;
}
