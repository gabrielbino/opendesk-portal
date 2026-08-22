import { useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Paginação PADRÃO do projeto para tabelas (atuais e futuras).
 *
 * Boas práticas de UI/UX cobertas:
 *  - contador "Mostrando X–Y de Z";
 *  - primeira/última página (« »), anterior/próxima (‹ ›);
 *  - números de página com reticências — a 1ª e a última ficam sempre visíveis,
 *    então depois de avançar várias dá para voltar à 1/2 num clique;
 *  - campo "Ir para" página (Enter ou botão);
 *  - responsivo (no mobile vira "Pág. X/Y" + navegação compacta);
 *  - acessível (aria-labels, aria-current na página ativa).
 *
 * É agnóstico de fonte de dados: serve tanto para paginação server-side
 * (page/pageSize/total vindos da API) quanto client-side.
 */
export interface DataTablePaginationProps {
  /** Página atual (1-based). */
  page: number;
  pageSize: number;
  /** Total de itens (não de páginas). */
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
  /** Rótulo opcional no contador, ex.: "produtos" → "… de 4.067 produtos". */
  itemLabel?: string;
  /** Quantos números mostrar de cada lado da página atual (default 1). */
  siblingCount?: number;
}

const nf = new Intl.NumberFormat("pt-BR");

/** Sequência de páginas a exibir, com "ellipsis" nos buracos. 1 e última sempre presentes. */
function buildPages(current: number, totalPages: number, sibling: number): Array<number | "ellipsis"> {
  const wanted = new Set<number>([1, totalPages]);
  for (let p = current - sibling; p <= current + sibling; p++) {
    if (p >= 1 && p <= totalPages) wanted.add(p);
  }
  const sorted = Array.from(wanted).sort((a, b) => a - b);
  const out: Array<number | "ellipsis"> = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev) {
      if (p - prev === 2) out.push(prev + 1); // só 1 buraco → mostra o número em vez de "…"
      else if (p - prev > 2) out.push("ellipsis");
    }
    out.push(p);
    prev = p;
  }
  return out;
}

export function DataTablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  className,
  itemLabel,
  siblingCount = 1,
}: DataTablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const current = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);
  const pages = buildPages(current, totalPages, siblingCount);

  const [jump, setJump] = useState("");
  const irPara = () => {
    const n = Number.parseInt(jump, 10);
    if (!Number.isNaN(n)) onPageChange(Math.min(Math.max(1, n), totalPages));
    setJump("");
  };

  const goto = (p: number) => onPageChange(Math.min(Math.max(1, p), totalPages));

  return (
    <div
      className={cn(
        "flex flex-col gap-2 border-t border-border/60 px-3 py-2 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <p className="text-xs text-muted-foreground">
        Mostrando <span className="font-medium text-foreground tabular-nums">{nf.format(from)}</span>
        –<span className="font-medium text-foreground tabular-nums">{nf.format(to)}</span>
        {" de "}
        <span className="font-medium text-foreground tabular-nums">{nf.format(total)}</span>
        {itemLabel ? ` ${itemLabel}` : ""}
      </p>

      <div className="flex items-center gap-1">
        <Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label="Primeira página"
          disabled={current <= 1} onClick={() => goto(1)}>
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label="Página anterior"
          disabled={current <= 1} onClick={() => goto(current - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {/* Números (desktop) */}
        <div className="hidden items-center gap-1 sm:flex">
          {pages.map((p, i) =>
            p === "ellipsis" ? (
              <span key={`e${i}`} className="px-1.5 text-sm text-muted-foreground" aria-hidden>…</span>
            ) : (
              <Button
                key={p}
                type="button"
                variant={p === current ? "default" : "outline"}
                size="icon"
                className="h-8 min-w-8 px-2 tabular-nums"
                aria-label={`Página ${p}`}
                aria-current={p === current ? "page" : undefined}
                onClick={() => goto(p)}
              >
                {p}
              </Button>
            ),
          )}
        </div>

        {/* Compacto (mobile) */}
        <span className="px-2 text-xs text-muted-foreground tabular-nums sm:hidden">
          Pág. {current}/{totalPages}
        </span>

        <Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label="Próxima página"
          disabled={current >= totalPages} onClick={() => goto(current + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label="Última página"
          disabled={current >= totalPages} onClick={() => goto(totalPages)}>
          <ChevronsRight className="h-4 w-4" />
        </Button>

        {/* Ir para página */}
        {totalPages > 1 && (
          <div className="ml-1 hidden items-center gap-1 lg:flex">
            <span className="text-xs text-muted-foreground">Ir para</span>
            <Input
              type="number"
              min={1}
              max={totalPages}
              value={jump}
              onChange={(e) => setJump(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") irPara(); }}
              placeholder={String(current)}
              aria-label="Ir para página"
              className="h-8 w-16 px-2 text-center text-xs"
            />
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={irPara}>
              Ir
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
