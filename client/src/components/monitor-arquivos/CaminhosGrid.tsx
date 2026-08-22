import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { DataTablePagination } from "@/components/DataTablePagination";
import { formatarDuracaoMin, formatarHoraSP, type StatusCor } from "@shared/monitorArquivos";
import { STATUS_META, statusTitulo, minutosDesde } from "./statusVisual";
import type { ConfigRow, PainelItem, VistaMonitor } from "./types";

/**
 * Grid de mini-KPIs do painel Monitor de Integrações: um mini-card por caminho, com fundo na cor
 * do status, nome, o tempo (fonte menor) e — no vermelho — selo de "N atrasados" + anel pulsante.
 * Ordenado por prioridade de cor (vermelho → amarelo → azul → verde → inativo) e, DENTRO de cada
 * cor, pelo horário do mais antigo para o mais recente. Clique abre a modal de detalhe/edição.
 * Cabeçalho mostra o filtro atual + contagem; rodapé o total configurado (padrão das tabelas de
 * estoque). Busca + filtro por cor (drill-down dos KPIs) + paginação. Mobile-first.
 */

/**
 * DENSIDADE do grid — ajuste AQUI quantos mini-cards por linha em cada breakpoint.
 * Ex.: para densidade máxima, suba o xl para `xl:grid-cols-9` (e mobile para `grid-cols-3`).
 */
const GRID_COLS = "grid-cols-2 min-[420px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8";

// Ordem das cores (pior → melhor). Azul entra entre amarelo e verde; a ordem relativa das demais
// não muda. Dentro de cada cor, ordena pelo horário (mais antigo primeiro).
const PESO: Record<StatusCor, number> = { vermelho: 0, amarelo: 1, azul: 2, verde: 3, inativo: 4 };
const PAGE_SIZE = 60;

export interface CaminhosGridProps {
  itens: PainelItem[];
  /** Texto de busca (controlado pela página, na barra de ações). */
  busca: string;
  /** Filtro por cor vindo do drill-down dos KPIs (null = todas). */
  filtroCor: StatusCor | null;
  onCardClick: (config: ConfigRow) => void;
  /** Limpa o filtro por cor (link "ver todos" no cabeçalho). */
  onLimparFiltro?: () => void;
  /** Visão ativa — define o vocabulário do cabeçalho/tempo (pedidos × listas). */
  modo?: VistaMonitor;
  /**
   * Sobrescreve a CONTAGEM do cabeçalho (ex.: na visão Listas contamos as listas, não os cards de
   * integração). `filtrado` = contagem quando há filtro de cor (null = usa o total).
   */
  contagemCustom?: { total: number; filtrado: number | null; unidade: string };
}

export default function CaminhosGrid({ itens, busca, filtroCor, onCardClick, onLimparFiltro, modo = "pedidos", contagemCustom }: CaminhosGridProps) {
  const [page, setPage] = useState(1);

  // Contador vivo: um tick/seg, só quando há caminho "quente" (com tempo correndo: verm/amar/azul).
  const temHot = useMemo(
    () => itens.some((i) => i.status.cor === "vermelho" || i.status.cor === "amarelo" || i.status.cor === "azul"),
    [itens],
  );
  const [agoraMs, setAgoraMs] = useState(() => Date.now());
  useEffect(() => {
    if (!temHot) return;
    const t = setInterval(() => setAgoraMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [temHot]);

  useEffect(() => setPage(1), [busca, filtroCor]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    let arr = itens;
    if (filtroCor) arr = arr.filter((i) => i.status.cor === filtroCor);
    if (q) arr = arr.filter((i) => i.config.nome.toLowerCase().includes(q) || i.config.caminho.toLowerCase().includes(q));

    const anc = (i: PainelItem) => (i.status.ancoraEm ? new Date(i.status.ancoraEm).getTime() : Number.POSITIVE_INFINITY);
    return [...arr].sort((a, b) => {
      const dp = PESO[a.status.cor] - PESO[b.status.cor];
      if (dp !== 0) return dp;
      // Dentro da cor: do horário MAIS ANTIGO para o mais recente; empate desempata por nome.
      const da = anc(a) - anc(b);
      if (da !== 0) return da;
      return a.config.nome.localeCompare(b.config.nome, "pt-BR");
    });
  }, [itens, busca, filtroCor]);

  const total = filtrados.length;
  const pageItens = filtrados.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Título do cabeçalho segue o filtro (padrão das tabelas de estoque): "Todos" ou o nome da cor.
  const titulo = filtroCor ? statusTitulo(modo)[filtroCor] : modo === "listas" ? "Todas as listas" : "Todos os caminhos";
  const itemLabel = contagemCustom?.unidade ?? (modo === "listas" ? "integrações" : "caminhos");
  // Contagem exibida: custom (ex.: listas) ou a dos próprios cards.
  const contTotal = contagemCustom ? (filtroCor ? contagemCustom.filtrado ?? 0 : contagemCustom.total) : total;
  const contGeral = contagemCustom ? contagemCustom.total : itens.length;

  return (
    <div className="space-y-3">
      {/* Cabeçalho: filtro selecionado + contagem (padrão estoque). */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b pb-2">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-semibold text-foreground">{titulo}</h3>
          <span className="text-xs text-muted-foreground tabular-nums">
            {contTotal} {contTotal === 1 ? itemLabel.replace(/s$/, "") : itemLabel}
            {filtroCor && ` de ${contGeral}`}
          </span>
        </div>
        {filtroCor && onLimparFiltro && (
          <button
            type="button"
            onClick={onLimparFiltro}
            className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            ver todos
          </button>
        )}
      </div>

      {total === 0 ? (
        <div className="rounded-xl border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">
          {busca || filtroCor ? "Nenhum caminho para o filtro atual." : "Nenhum caminho monitorado ainda."}
        </div>
      ) : (
        <>
          <div className={cn("grid gap-8", GRID_COLS)}>
            {pageItens.map((it) => (
              <MiniCard key={it.config.id} item={it} agoraMs={agoraMs} modo={modo} onClick={() => onCardClick(it.config)} />
            ))}
          </div>
          {total > PAGE_SIZE && (
            <DataTablePagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} itemLabel={itemLabel} />
          )}
        </>
      )}
    </div>
  );
}

/** Texto de tempo do mini-card, curto (fonte menor). Difere entre pedidos e geração. */
function textoTempo(item: PainelItem, agoraMs: number, modo: VistaMonitor): string {
  const { cor, ancoraEm } = item.status;
  const geracao = modo === "listas";
  if (cor === "inativo" || !ancoraEm) return "—";
  if (cor === "verde") return geracao ? `gerada ${formatarHoraSP(new Date(ancoraEm))}` : `lido ${formatarHoraSP(new Date(ancoraEm))}`;
  if (geracao && cor === "azul") return `até ${formatarHoraSP(new Date(ancoraEm))}`;
  return `há ${formatarDuracaoMin(minutosDesde(ancoraEm, agoraMs))}`;
}

function MiniCard({ item, agoraMs, modo, onClick }: { item: PainelItem; agoraMs: number; modo: VistaMonitor; onClick: () => void }) {
  const cor = item.status.cor;
  const meta = STATUS_META[cor];
  const vermelho = cor === "vermelho";

  return (
    <button
      type="button"
      onClick={onClick}
      title={`${item.config.nome} — ${item.status.detalhe}`}
      className={cn(
        "relative flex min-h-[3.5rem] flex-col justify-between gap-1 overflow-hidden rounded-lg border p-2 text-left transition",
        "hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        meta.pill,
      )}
    >
      {/* Anel pulsante de alerta (só no vermelho; não intercepta clique). */}
      {vermelho && (
        <span aria-hidden className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-red-500/60 animate-pulse" />
      )}

      <span className="min-w-0 truncate text-xs font-semibold leading-tight" title={item.config.nome}>
        {item.config.nome}
      </span>

      <div className="flex items-center justify-between gap-1">
        <span className="min-w-0 truncate text-[10px] tabular-nums opacity-80">{textoTempo(item, agoraMs, modo)}</span>
        {vermelho && item.resumo.qtdAtrasados > 0 && (
          <span className="shrink-0 rounded bg-red-600 px-1 py-0.5 text-[9px] font-bold text-white tabular-nums">
            {item.resumo.qtdAtrasados}
          </span>
        )}
      </div>
    </button>
  );
}
