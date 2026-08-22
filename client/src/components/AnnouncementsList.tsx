import { useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle, ChevronRight, Info, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type AnnouncementType = "info" | "warning" | "success" | "error";

/** Forma mínima de um comunicado consumida pela UI (desacoplada do schema do servidor). */
export interface AnnouncementLike {
  id?: number | string;
  title: string;
  content?: string | null;
  type: string;
  createdAt?: number | null;
}

interface AnnouncementStyle {
  Icon: LucideIcon;
  icon: string; // cor do ícone
  borderL: string; // borda-esquerda de acento
  bg: string; // fundo sutil
}

/**
 * Fonte ÚNICA de estilo por tipo de comunicado (ícone + cores). Use SEMPRE isto — não recrie o
 * switch de cores/ícone em cada painel. Consumido pela lista, pelo modal e por quem mais precisar.
 */
const STYLES: Record<AnnouncementType, AnnouncementStyle> = {
  info: { Icon: Info, icon: "text-blue-700", borderL: "border-l-blue-500", bg: "bg-blue-50" },
  warning: { Icon: AlertTriangle, icon: "text-amber-500", borderL: "border-l-amber-500", bg: "bg-amber-50" },
  success: { Icon: CheckCircle, icon: "text-emerald-700", borderL: "border-l-emerald-500", bg: "bg-emerald-50" },
  error: { Icon: AlertCircle, icon: "text-red-600", borderL: "border-l-red-500", bg: "bg-red-50" },
};

export function announcementStyle(type: string): AnnouncementStyle {
  return STYLES[type as AnnouncementType] ?? STYLES.info;
}

function formatarData(ms?: number | null): string | null {
  if (!ms) return null;
  return new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Modal que expande UM comunicado: mantém o acento de cor do tipo e mostra o conteúdo completo. */
function AnnouncementDialog({
  item,
  open,
  onOpenChange,
}: {
  item: AnnouncementLike | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const s = announcementStyle(item?.type ?? "info");
  const data = formatarData(item?.createdAt);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className={cn("flex items-start gap-3 rounded-lg border-l-4 p-3", s.borderL, s.bg)}>
            <s.Icon className={cn("mt-0.5 h-5 w-5 shrink-0", s.icon)} aria-hidden />
            <DialogTitle className="text-base leading-snug text-foreground">{item?.title}</DialogTitle>
          </div>
        </DialogHeader>
        <DialogDescription
          className={cn(
            "whitespace-pre-wrap text-sm leading-relaxed",
            item?.content ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {item?.content || "Sem detalhes adicionais."}
        </DialogDescription>
        {data && <p className="text-xs text-muted-foreground">Publicado em {data}</p>}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Lista de comunicados clicáveis — cada item abre em modal com o conteúdo completo (o resumo é
 * truncado em 2 linhas). Inclui empty state. Reutilizável (home, e onde mais precisar mostrar avisos).
 */
export default function AnnouncementsList({ items, limit = 6 }: { items: AnnouncementLike[]; limit?: number }) {
  const [selecionado, setSelecionado] = useState<AnnouncementLike | null>(null);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
        <Info size={22} className="text-muted-foreground/40" aria-hidden />
        <p className="text-sm font-medium text-foreground">Nenhum aviso no momento</p>
        <p className="text-xs text-muted-foreground">Novos comunicados aparecerão aqui.</p>
      </div>
    );
  }

  return (
    <>
      <ul className="divide-y divide-border">
        {items.slice(0, limit).map((a, idx) => {
          const s = announcementStyle(a.type);
          return (
            <li key={a.id ?? idx}>
              <button
                type="button"
                onClick={() => setSelecionado(a)}
                title="Ver aviso completo"
                className={cn(
                  "flex w-full items-start gap-3 border-l-2 px-4 py-3 text-left transition-[filter] hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  s.borderL,
                  s.bg,
                )}
              >
                <s.Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", s.icon)} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{a.title}</p>
                  {a.content && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{a.content}</p>}
                </div>
                <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
      <AnnouncementDialog item={selecionado} open={selecionado !== null} onOpenChange={(o) => !o && setSelecionado(null)} />
    </>
  );
}
