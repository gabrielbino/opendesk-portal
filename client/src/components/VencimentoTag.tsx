import { AlertTriangle } from "lucide-react";

/**
 * Tag de vencimento — PADRÃO do projeto (origem: Superestocados).
 *
 * Mostra SEMPRE a data (DD/MM/YYYY); o realce muda pelo `status`:
 *   - "vencido"  → tag vermelha com ⚠ (data já passou / fora da validade)
 *   - "proximo"  → tag âmbar com ⚠ (vencimento próximo)
 *   - "ok"/null  → data em texto neutro
 *
 * É só visual: quem chama decide o `status` (regra de negócio fica no chamador —
 * ex.: proximidade por data no Superestocados, `statusValidadeLote` no Pescador).
 */

export type VencimentoStatus = "vencido" | "proximo" | "ok" | null;

function formatDateBR(isoDate: string | null): string {
  if (!isoDate) return "—";
  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) return isoDate;
  return `${day}/${month}/${year}`;
}

export function VencimentoTag({ isoDate, status }: { isoDate: string | null; status: VencimentoStatus }) {
  const formatted = formatDateBR(isoDate);

  if (status === "vencido") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-800 animate-pulse">
        <AlertTriangle className="h-3 w-3" />
        {formatted}
      </span>
    );
  }

  if (status === "proximo") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
        <AlertTriangle className="h-3 w-3" />
        {formatted}
      </span>
    );
  }

  return <span className="text-slate-600">{formatted}</span>;
}
