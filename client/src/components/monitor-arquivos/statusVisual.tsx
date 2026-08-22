import { cn } from "@/lib/utils";
import type { StatusCor } from "@shared/monitorArquivos";

/**
 * Estilo visual compartilhado do status de um caminho monitorado (Monitor de Integrações),
 * no padrão dos selos de banda do Validades Curtas: pill `rounded-lg border` + bolinha colorida.
 * Reutilizado pela tabela do painel e pela modal de detalhe (fonte única — sem duplicar cor/rótulo).
 */

export const STATUS_META: Record<
  StatusCor,
  { label: string; pill: string; dot: string; ping: string }
> = {
  vermelho: {
    label: "Travado",
    pill: "border-red-300 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300",
    dot: "bg-red-500",
    ping: "bg-red-500",
  },
  amarelo: {
    label: "Sem pedidos",
    pill: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300",
    dot: "bg-amber-500",
    ping: "bg-amber-500",
  },
  azul: {
    label: "Aguardando novos pedidos",
    pill: "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300",
    dot: "bg-blue-500",
    ping: "bg-blue-500",
  },
  verde: {
    label: "Em dia",
    pill: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300",
    dot: "bg-emerald-500",
    ping: "bg-emerald-500",
  },
  inativo: {
    label: "Inativo",
    pill: "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300",
    dot: "bg-slate-400",
    ping: "bg-slate-400",
  },
};

/**
 * Título "plural" de cada cor — fonte ÚNICA usada pelos KPIs (drill-down) e pelo cabeçalho de
 * filtro da tabela. Evita repetir os nomes em dois lugares. Um mapa por VISÃO (pedidos × listas),
 * pois as cores significam coisas diferentes em cada uma.
 */
export const STATUS_TITULO: Record<StatusCor, string> = {
  vermelho: "Travados",
  amarelo: "Sem pedidos",
  azul: "Aguardando novos pedidos",
  verde: "Na última hora",
  inativo: "Inativos",
};

export const STATUS_TITULO_LISTAS: Record<StatusCor, string> = {
  vermelho: "Atrasadas",
  amarelo: "—", // listas não têm amarelo
  azul: "Aguardando",
  verde: "Geradas",
  inativo: "Inativas",
};

/** Rótulo do selo (singular) por visão — usado no StatusBadge. */
export const STATUS_LABEL_LISTAS: Record<StatusCor, string> = {
  vermelho: "Atrasada",
  amarelo: "—",
  azul: "Aguardando",
  verde: "Gerada",
  inativo: "Inativa",
};

/** Títulos por visão, num só lugar (o painel escolhe pelo modo ativo). */
export function statusTitulo(modo: "pedidos" | "listas"): Record<StatusCor, string> {
  return modo === "listas" ? STATUS_TITULO_LISTAS : STATUS_TITULO;
}

/** Minutos decorridos desde um ISO (para o contador vivo). */
export function minutosDesde(iso: string, agoraMs: number): number {
  return (agoraMs - new Date(iso).getTime()) / 60000;
}

/**
 * Selo de status no padrão de banda. `pulsante` (padrão: só no vermelho) adiciona um "ping"
 * de destaque na bolinha para chamar atenção nos casos em alerta.
 */
export function StatusBadge({
  cor,
  className,
  modo = "pedidos",
}: {
  cor: StatusCor;
  className?: string;
  /** 'listas' troca o rótulo para o vocabulário de geração (Atrasada/Gerada/…). */
  modo?: "pedidos" | "listas";
}) {
  const meta = STATUS_META[cor];
  const label = modo === "listas" ? STATUS_LABEL_LISTAS[cor] : meta.label;
  const pulsante = cor === "vermelho";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold sm:text-xs",
        meta.pill,
        className,
      )}
    >
      <span className="relative flex h-2 w-2 shrink-0">
        {pulsante && (
          <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-75", meta.ping)} />
        )}
        <span className={cn("relative inline-flex h-2 w-2 rounded-full", meta.dot)} />
      </span>
      {label}
    </span>
  );
}
