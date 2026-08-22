import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, Send, Save } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { DIAS_SEMANA_LABEL } from "@shared/agenda";

/**
 * Painel ADMIN do "Resumo diário" (Monitor de Integrações).
 *
 * Configura o envio de UMA imagem por dia no WhatsApp com o cenário de integrações (pedidos +
 * listas), no fim da última janela (horário configurável). O gatilho roda no heartbeat do coletor
 * (sem cron) — depende do coletor estar online no horário. "Enviar agora" dispara um teste sem
 * consumir o dia. Só é montado para administradores.
 */
export interface ResumoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function fmtDataHora(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const hhmm = (h: number, m: number) =>
  `${String(Math.min(23, Math.max(0, h))).padStart(2, "0")}:${String(Math.min(59, Math.max(0, m))).padStart(2, "0")}`;

export default function ResumoModal({ open, onOpenChange }: ResumoModalProps) {
  const utils = trpc.useUtils();
  const cfgQuery = trpc.monitorArquivos.getResumoConfig.useQuery(undefined, { enabled: open });
  const destinosQuery = trpc.monitorArquivos.listDestinos.useQuery(undefined, { enabled: open });
  const cfg = cfgQuery.data;

  const setM = trpc.monitorArquivos.setResumoConfig.useMutation();
  const enviarM = trpc.monitorArquivos.enviarResumoAgora.useMutation();

  const [ativo, setAtivo] = useState(false);
  const [horario, setHorario] = useState("21:00");
  const [dias, setDias] = useState<number[]>([1, 2, 3, 4, 5]);
  const [incluirPedidos, setIncluirPedidos] = useState(true);
  const [incluirListas, setIncluirListas] = useState(true);
  const [destinoIds, setDestinoIds] = useState<number[]>([]);

  useEffect(() => {
    if (!cfg) return;
    setAtivo(Boolean(cfg.ativo));
    setHorario(hhmm(cfg.hora ?? 21, cfg.minuto ?? 0));
    setDias(Array.isArray(cfg.diasSemana) ? cfg.diasSemana : [1, 2, 3, 4, 5]);
    setIncluirPedidos(cfg.incluirPedidos ?? true);
    setIncluirListas(cfg.incluirListas ?? true);
    setDestinoIds(Array.isArray(cfg.destinoIds) ? cfg.destinoIds : []);
  }, [cfg]);

  const toggleDia = (d: number) =>
    setDias((arr) => (arr.includes(d) ? arr.filter((x) => x !== d) : [...arr, d].sort()));
  const toggleDestino = (id: number) =>
    setDestinoIds((arr) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]));

  function parseHorario(): { hora: number; minuto: number } {
    const [h, m] = horario.split(":");
    return { hora: Number(h) || 0, minuto: Number(m) || 0 };
  }

  async function salvar() {
    if (ativo && (!incluirPedidos && !incluirListas)) {
      toast.error("Selecione ao menos uma seção (pedidos ou listas).");
      return;
    }
    if (ativo && dias.length === 0) {
      toast.error("Marque ao menos um dia da semana.");
      return;
    }
    const { hora, minuto } = parseHorario();
    try {
      await setM.mutateAsync({ ativo, hora, minuto, diasSemana: dias, incluirPedidos, incluirListas, destinoIds });
      await utils.monitorArquivos.getResumoConfig.invalidate();
      toast.success("Resumo diário salvo.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar.");
    }
  }

  async function enviarAgora() {
    try {
      const r = await enviarM.mutateAsync();
      await utils.monitorArquivos.getResumoConfig.invalidate();
      if (r.destinos === 0) {
        toast.warning("Nenhum destino: selecione destinos ou cadastre um destino universal.");
      } else {
        toast.success(`Resumo enfileirado para ${r.destinos} destino(s). A imagem chega em instantes.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar.");
    }
  }

  const destinos = destinosQuery.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[96vw] max-w-lg overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>Resumo diário no WhatsApp</DialogTitle>
          <DialogDescription>
            Envia <strong>uma imagem por dia</strong> com o cenário de integrações (pedidos e listas) no
            horário definido. O disparo depende do <strong>coletor estar online</strong> no horário.
          </DialogDescription>
        </DialogHeader>

        {cfgQuery.isLoading ? (
          <div className="space-y-3">
            <div className="h-10 animate-pulse rounded bg-muted" />
            <div className="h-24 animate-pulse rounded bg-muted" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Ativo */}
            <label className="flex items-center justify-between gap-2 rounded-lg border p-3">
              <span className="text-sm font-medium">Envio automático diário</span>
              <Switch checked={ativo} onCheckedChange={setAtivo} />
            </label>

            {/* Horário */}
            <div className="space-y-1.5">
              <Label className="text-xs">Horário (fuso de São Paulo)</Label>
              <Input
                type="time"
                value={horario}
                onChange={(e) => setHorario(e.target.value)}
                className="w-32 tabular-nums"
              />
              <p className="text-[11px] text-muted-foreground">
                Dica: use o fim da última janela cadastrada (ex.: 21:00).
              </p>
            </div>

            {/* Dias */}
            <div className="space-y-1.5">
              <Label className="text-xs">Dias</Label>
              <div className="flex flex-wrap gap-1.5">
                {DIAS_SEMANA_LABEL.map((lbl, d) => {
                  const on = dias.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDia(d)}
                      className={cn(
                        "h-8 min-w-[2.5rem] rounded-md border px-2 text-xs font-medium transition-colors",
                        on
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-border bg-background text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {lbl}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Seções */}
            <div className="space-y-2">
              <Label className="text-xs">Seções na imagem</Label>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={incluirPedidos} onCheckedChange={setIncluirPedidos} />
                  Pedidos
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={incluirListas} onCheckedChange={setIncluirListas} />
                  Listas
                </label>
              </div>
            </div>

            {/* Destinos */}
            <div className="space-y-1.5">
              <Label className="text-xs">Destinos</Label>
              <p className="text-[11px] text-muted-foreground">
                Nenhum selecionado = envia para todos os destinos <strong>universais</strong>.
              </p>
              {destinos.length === 0 ? (
                <p className="rounded-md border border-dashed py-3 text-center text-[11px] text-muted-foreground">
                  Nenhum destino cadastrado. Cadastre em Configurar → Destinos WhatsApp.
                </p>
              ) : (
                <ul className="max-h-40 divide-y overflow-y-auto rounded-lg border">
                  {destinos.map((d) => (
                    <li key={d.id} className="flex items-center gap-2 px-3 py-2">
                      <Checkbox
                        checked={destinoIds.includes(d.id)}
                        onCheckedChange={() => toggleDestino(d.id)}
                        id={`resumo-dest-${d.id}`}
                      />
                      <label htmlFor={`resumo-dest-${d.id}`} className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {d.tipo}
                        </span>
                        <span className="truncate">{d.nome}</span>
                        {d.universal && (
                          <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                            universal
                          </span>
                        )}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Ações */}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button size="sm" variant="outline" onClick={enviarAgora} disabled={enviarM.isPending}>
                <Send className="mr-1 h-4 w-4" /> Enviar agora (teste)
              </Button>
              <Button size="sm" onClick={salvar} disabled={setM.isPending}>
                <Save className="mr-1 h-4 w-4" /> Salvar
              </Button>
            </div>

            {/* Último envio (só leitura) */}
            <div className="rounded-lg border p-3">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Último envio
              </p>
              {cfg?.ultimoEnvioEm ? (
                <p className="flex items-center gap-1.5 text-sm">
                  {cfg.ultimoOk ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                  )}
                  {cfg.ultimoOk ? "ok" : "falha"} · {cfg.ultimoDetalhe ?? "—"} · {fmtDataHora(cfg.ultimoEnvioEm)}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum envio ainda.</p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
