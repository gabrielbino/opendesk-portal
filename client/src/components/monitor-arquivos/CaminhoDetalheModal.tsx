import { useEffect, useState } from "react";
import { useMemo } from "react";
import { AlertTriangle, CalendarDays, Pencil, X } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatarDuracaoMin } from "@shared/monitorArquivos";
import CaminhoForm from "./CaminhoForm";
import { StatusBadge } from "./statusVisual";
import type { PainelItem } from "./types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Modal de detalhe de UM caminho. Abre em VISUALIZAÇÃO (parâmetros com campos travados);
 * quem tem permissão vê o lápis "Editar" no cabeçalho, que libera os campos (mesmo modal).
 * Salvar/Excluir vêm do CaminhoForm (edição). Mobile-first.
 */
export interface CaminhoDetalheModalProps {
  item: PainelItem | null;
  onClose: () => void;
  podeGerenciar: boolean;
  /** Revalida o painel após salvar/excluir. */
  onChanged: () => void;
}

export default function CaminhoDetalheModal({ item, onClose, podeGerenciar, onChanged }: CaminhoDetalheModalProps) {
  const [editando, setEditando] = useState(false);

  // Sempre que abre outro caminho (ou fecha), volta para visualização.
  useEffect(() => setEditando(false), [item?.config.id]);

  return (
    <Dialog open={item !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] w-[95vw] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        {item && (
          <>
            {/* Header sticky */}
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-card px-4 py-3 sm:px-6 sm:py-4">
              <DialogTitle className="min-w-0 flex-1 truncate text-base font-semibold leading-tight sm:text-lg" title={item.config.nome}>
                {item.config.nome}
              </DialogTitle>
              <div className="flex shrink-0 items-center gap-1">
                {podeGerenciar && !editando && (
                  <Button variant="outline" size="sm" className="h-8" onClick={() => setEditando(true)}>
                    <Pencil className="h-3.5 w-3.5 sm:mr-1.5" />
                    <span className="hidden sm:inline">Editar</span>
                  </Button>
                )}
                <DialogClose asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <X className="h-4 w-4" />
                    <span className="sr-only">Fechar</span>
                  </Button>
                </DialogClose>
              </div>
            </div>

            <DialogHeader className="sr-only">
              <DialogDescription>
                Parâmetros do caminho monitorado. Use "Editar" para ajustar (requer permissão).
              </DialogDescription>
            </DialogHeader>

            {/* Corpo rolável — uma integração pode ter pedidos e/ou listas (cada área some se vazia). */}
            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
              <HistoricoHeatmap configId={item.config.id} />
              <ListasArea configId={item.config.id} />
              <EventosAbertosArea configId={item.config.id} />
              <CaminhoForm
                inicial={item.config}
                readOnly={!editando}
                onCancel={() => setEditando(false)}
                onSaved={() => {
                  onChanged();
                  setEditando(false);
                }}
                onDeleted={() => {
                  onChanged();
                  onClose();
                }}
              />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Área de pedidos em ABERTO do caminho (atrasados primeiro), para o operador achar rápido
 * qual arquivo está preso e ir conferir na pasta. Mostra o nome do arquivo pendente + há quanto
 * tempo caiu. Some quando não há nada em aberto.
 */
function EventosAbertosArea({ configId }: { configId: number }) {
  const q = trpc.monitorArquivos.getEventosAbertos.useQuery({ configId }, { refetchInterval: 30_000 });
  const eventos = q.data ?? [];
  if (eventos.length === 0) return null;

  const now = Date.now();
  const qtdAtrasados = eventos.filter((e) => e.estado === "atrasado").length;

  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        Pedidos em aberto ({eventos.length}
        {qtdAtrasados > 0 ? ` · ${qtdAtrasados} atrasado${qtdAtrasados > 1 ? "s" : ""}` : ""})
      </p>
      <ul className="space-y-1.5">
        {eventos.map((e) => {
          const min = (now - new Date(e.caiuEm).getTime()) / 60000;
          const atrasado = e.estado === "atrasado";
          return (
            <li
              key={e.nomeBase}
              className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-md bg-background/70 px-2 py-1.5"
            >
              <span
                className="min-w-0 flex-1 truncate font-mono text-xs font-medium text-foreground"
                title={e.arquivoPendente ?? e.nomeBase}
              >
                {e.arquivoPendente ?? e.nomeBase}
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium tabular-nums",
                  atrasado
                    ? "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300"
                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
                )}
              >
                {atrasado ? "atrasado" : "aguardando"} há {formatarDuracaoMin(min)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Área de status das LISTAS de uma integração: cada lista com seu selo de cor, o detalhe (gerada às /
 * aguardando até / não gerada há · X/Y) e o último arquivo. As ATRASADAS ficam realçadas (fundo
 * vermelho), no padrão dos pedidos. Atualiza a cada 30s. Some quando a integração não tem listas.
 */
/**
 * Heatmap compacto dos últimos 30 dias úteis: um quadradinho por dia, colorido pelo status de
 * processamento (verde = teve pedido, cinza = sem pedido, tracejado = sem dados). Mobile-first.
 */
function HistoricoHeatmap({ configId }: { configId: number }) {
  const q = trpc.monitorArquivos.getHistoricoDias.useQuery({ configId }, { refetchInterval: 60_000 });
  const registros = q.data ?? [];

  // Gera os últimos 30 dias ÚTEIS (seg-sex) a partir de hoje para trás.
  const dias = useMemo(() => {
    const result: string[] = [];
    const d = new Date();
    // Ajusta para fuso SP (UTC-3)
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset() - 180);
    while (result.length < 30) {
      const dow = d.getDay(); // 0=dom, 6=sáb
      if (dow !== 0 && dow !== 6) {
        const iso = d.toISOString().slice(0, 10);
        result.push(iso);
      }
      d.setDate(d.getDate() - 1);
    }
    return result.reverse(); // mais antigo primeiro
  }, []);

  // Mapa dia → registro para lookup O(1).
  const mapa = useMemo(() => {
    const m = new Map<string, { tevePedido: boolean; qtdPedidos: number; qtdLidos: number }>();
    for (const r of registros) m.set(r.dia, r);
    return m;
  }, [registros]);

  // Contagem de dias com pedido (para o resumo textual).
  const diasComPedido = dias.filter((d) => mapa.get(d)?.tevePedido).length;
  const diasComDados = dias.filter((d) => mapa.has(d)).length;

  return (
    <div className="mb-4 rounded-lg border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5 shrink-0" />
          Histórico (30 dias úteis)
        </p>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {diasComDados > 0 ? `${diasComPedido}/${diasComDados} com pedidos` : "Coletando dados..."}
        </span>
      </div>

      {/* Grid de quadradinhos — 6 colunas mobile (5 semanas), 10 desktop */}
      <div className="grid grid-cols-6 gap-1 sm:grid-cols-10">
        {dias.map((dia) => {
          const reg = mapa.get(dia);
          const semDados = !reg;
          const tevePedido = reg?.tevePedido ?? false;

          // Cores: verde (teve), cinza (sem), tracejado (sem dados)
          const bg = semDados
            ? "border-dashed border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/30"
            : tevePedido
              ? "border-emerald-300 bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50"
              : "border-slate-300 bg-slate-200/60 dark:border-slate-700 dark:bg-slate-800/50";

          // Label da data (DD/MM)
          const [, m, d] = dia.split("-");
          const label = `${d}/${m}`;
          const tooltipText = semDados
            ? `${label} — sem dados`
            : tevePedido
              ? `${label} — ${reg.qtdPedidos} pedido(s), ${reg.qtdLidos} lido(s)`
              : `${label} — sem processamento`;

          return (
            <Tooltip key={dia}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "flex aspect-square items-center justify-center rounded border text-[9px] font-medium tabular-nums transition-colors",
                    bg,
                    "cursor-default select-none",
                  )}
                  title={tooltipText}
                >
                  <span className="opacity-70">{d}/{m}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {tooltipText}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      {/* Legenda */}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm border border-emerald-300 bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50" />
          Com pedidos
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm border border-slate-300 bg-slate-200/60 dark:border-slate-700 dark:bg-slate-800/50" />
          Sem pedidos
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm border border-dashed border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/30" />
          Sem dados
        </span>
      </div>
    </div>
  );
}

function ListasArea({ configId }: { configId: number }) {
  const q = trpc.monitorArquivos.getListas.useQuery({ configId }, { refetchInterval: 30_000 });
  const listas = q.data ?? [];
  if (listas.length === 0) return null;

  const atrasadas = listas.filter((l) => l.status.cor === "vermelho").length;

  return (
    <div className="mb-4 space-y-1.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        {atrasadas > 0 && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-600" />}
        Listas ({listas.length}
        {atrasadas > 0 ? ` · ${atrasadas} atrasada${atrasadas > 1 ? "s" : ""}` : ""})
      </p>
      <ul className="space-y-1.5">
        {listas.map((l) => {
          const atrasada = l.status.cor === "vermelho";
          return (
            <li
              key={l.id}
              className={cn(
                "flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-md border px-2.5 py-1.5",
                atrasada
                  ? "border-red-300 bg-red-50 dark:border-red-900/60 dark:bg-red-950/30"
                  : "bg-background/70",
                !l.ativo && "opacity-60",
              )}
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground" title={l.rotulo}>
                  {l.rotulo}
                  {l.status.cor === "verde" && l.deteccao === "pasta" && (
                    <span
                      className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                      title="Detectado pelo horário da pasta (o arquivo já havia sido capturado quando o coletor varreu)"
                    >
                      por horário da pasta
                    </span>
                  )}
                </span>
                <span className="truncate text-[11px] text-muted-foreground" title={l.status.detalhe}>
                  {l.status.detalhe}
                  {l.ultimoArquivo ? ` · ${l.ultimoArquivo}` : ""}
                </span>
              </div>
              <StatusBadge cor={l.status.cor} modo="listas" className="shrink-0" />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
