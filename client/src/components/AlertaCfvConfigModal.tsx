import { useState, useEffect, useMemo } from "react";
import { X, Search, AlertTriangle, Bell, MessageSquare } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import ContatoPicker from "@/components/ContatoPicker";
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
import { toast } from "sonner";

const DIAS_SEMANA = [
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
];

const HORAS = Array.from({ length: 24 }, (_, i) => i);

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function AlertaCfvConfigModal({ open, onClose }: Props) {
  const configQuery = trpc.indicadores.getAlertaCfvConfig.useQuery(undefined, { enabled: open });
  const usersQuery = trpc.indicadores.getUsuariosPortal.useQuery(undefined, { enabled: open });
  const saveMutation = trpc.indicadores.setAlertaCfvConfig.useMutation({
    onSuccess: () => {
      toast.success("Configuração salva com sucesso");
      configQuery.refetch();
      onClose();
    },
    onError: (err) => toast.error(`Erro ao salvar: ${err.message}`),
  });
  const testarWa = trpc.indicadores.testarAlertaCfvWhatsapp.useMutation();

  // Form state
  const [layouts, setLayouts] = useState<string[]>(["CFV"]);
  const [regioes, setRegioes] = useState<("SC" | "RS")[]>(["SC", "RS"]);
  const [gapMinutos, setGapMinutos] = useState(30);
  const [horaInicio, setHoraInicio] = useState(8);
  const [horaFim, setHoraFim] = useState(18);
  const [diasSemana, setDiasSemana] = useState<number[]>([1, 2, 3, 4, 5]);
  const [destinatarioIds, setDestinatarioIds] = useState<Set<number>>(new Set());
  const [destinoIds, setDestinoIds] = useState<number[]>([]); // contatos WhatsApp (monarq_destino)
  const [waRealertaMin, setWaRealertaMin] = useState(60);
  const [ativo, setAtivo] = useState(true);
  const [busca, setBusca] = useState("");

  // Populate from existing config
  useEffect(() => {
    if (configQuery.data) {
      const c = configQuery.data;
      setLayouts(c.layouts);
      setRegioes(c.regioes as ("SC" | "RS")[]);
      setGapMinutos(c.gapMinutos);
      setHoraInicio(c.horaInicio);
      setHoraFim(c.horaFim);
      setDiasSemana(c.diasSemana);
      setDestinatarioIds(new Set(c.destinatarioIds));
      setDestinoIds(Array.isArray(c.destinoIds) ? c.destinoIds : []);
      setWaRealertaMin(c.waRealertaMin ?? 60);
      setAtivo(c.ativo);
    }
  }, [configQuery.data]);

  const usuariosFiltrados = useMemo(() => {
    const lista = usersQuery.data ?? [];
    if (!busca.trim()) return lista;
    const q = busca.toLowerCase();
    return lista.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [usersQuery.data, busca]);

  function toggleDestinatario(id: number) {
    setDestinatarioIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleDia(dia: number) {
    setDiasSemana((prev) => (prev.includes(dia) ? prev.filter((d) => d !== dia) : [...prev, dia]));
  }

  function toggleRegiao(r: "SC" | "RS") {
    setRegioes((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  }

  function salvar() {
    if (regioes.length === 0) return toast.error("Selecione ao menos uma região");
    if (diasSemana.length === 0) return toast.error("Selecione ao menos um dia da semana");
    if (destinatarioIds.size === 0) return toast.error("Selecione ao menos um destinatário");
    if (horaInicio >= horaFim) return toast.error("Hora início deve ser menor que hora fim");
    saveMutation.mutate({
      layouts,
      regioes,
      gapMinutos,
      horaInicio,
      horaFim,
      diasSemana,
      destinatarioIds: Array.from(destinatarioIds),
      destinoIds,
      waRealertaMin,
      ativo,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} className="flex max-h-[90vh] w-[95vw] max-w-lg flex-col gap-0 overflow-hidden p-0">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-card px-4 py-3 sm:px-6">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Configurar Alerta CFV
          </DialogTitle>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <DialogHeader className="sr-only">
          <DialogDescription>Configure o alerta de gap de pedidos do layout CFV.</DialogDescription>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6">
          {/* Ativo */}
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Alerta ativo</Label>
            <Switch checked={ativo} onCheckedChange={setAtivo} />
          </div>

          {/* Layout (fixo CFV por enquanto) */}
          <div>
            <Label className="mb-1.5 block text-sm font-medium">Layout monitorado</Label>
            <Input value={layouts.join(", ")} onChange={(e) => setLayouts(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} placeholder="CFV" className="h-9 text-sm" />
            <p className="mt-1 text-[11px] text-muted-foreground">Separe múltiplos por vírgula (ex.: CFV, OUTRO)</p>
          </div>

          {/* Regiões */}
          <div>
            <Label className="mb-1.5 block text-sm font-medium">Regiões</Label>
            <div className="flex gap-3">
            {["SC", "RS"].map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={regioes.includes(r as "SC" | "RS")} onCheckedChange={() => toggleRegiao(r as "SC" | "RS")} />
                  {r}
                </label>
              ))}
            </div>
          </div>

          {/* Gap minutos */}
          <div>
            <Label className="mb-1.5 block text-sm font-medium">Alertar após (minutos sem pedido)</Label>
            <Input type="number" min={1} max={1440} value={gapMinutos} onChange={(e) => setGapMinutos(Number(e.target.value))} className="h-9 w-28 text-sm" />
          </div>

          {/* Range de horário */}
          <div>
            <Label className="mb-1.5 block text-sm font-medium">Janela de monitoramento (horário SP)</Label>
            <div className="flex items-center gap-2">
              <select value={horaInicio} onChange={(e) => setHoraInicio(Number(e.target.value))} className="h-9 rounded-md border bg-background px-2 text-sm">
                {HORAS.map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
              </select>
              <span className="text-sm text-muted-foreground">até</span>
              <select value={horaFim} onChange={(e) => setHoraFim(Number(e.target.value))} className="h-9 rounded-md border bg-background px-2 text-sm">
                {HORAS.map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
              </select>
            </div>
          </div>

          {/* Dias da semana */}
          <div>
            <Label className="mb-1.5 block text-sm font-medium">Dias da semana</Label>
            <div className="flex flex-wrap gap-2">
              {DIAS_SEMANA.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => toggleDia(d.value)}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                    diasSemana.includes(d.value)
                      ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
                      : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400",
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Destinatários */}
          <div>
            <Label className="mb-1.5 block text-sm font-medium">
              Destinatários do alerta ({destinatarioIds.size} selecionado{destinatarioIds.size !== 1 ? "s" : ""})
            </Label>
            <div className="rounded-lg border">
              {/* Busca */}
              <div className="relative border-b px-3 py-2">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por nome ou e-mail…"
                  className="h-8 border-0 pl-6 text-xs shadow-none focus-visible:ring-0"
                />
              </div>
              {/* Lista */}
              <div className="max-h-48 overflow-y-auto">
                {usersQuery.isLoading && <p className="px-3 py-3 text-xs text-muted-foreground">Carregando…</p>}
                {usuariosFiltrados.length === 0 && !usersQuery.isLoading && (
                  <p className="px-3 py-3 text-xs text-muted-foreground">Nenhum usuário encontrado.</p>
                )}
                {usuariosFiltrados.map((u) => (
                  <label
                    key={u.id}
                    className="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <Checkbox checked={destinatarioIds.has(u.id)} onCheckedChange={() => toggleDestinatario(u.id)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-foreground">{u.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{u.email}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* WhatsApp — contatos da base compartilhada (além do alerta em tela) */}
          <div>
            <Label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
              <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />
              Enviar WhatsApp para ({destinoIds.length} contato{destinoIds.length !== 1 ? "s" : ""})
            </Label>
            <ContatoPicker selectedIds={destinoIds} onChange={setDestinoIds} />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Base compartilhada de contatos do portal. O envio roda no servidor (mesmo sem ninguém com o
              painel aberto). Deixe vazio para não enviar WhatsApp.
            </p>
            {destinoIds.length > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Re-alertar a cada (min)</Label>
                <Input
                  type="number"
                  min={1}
                  max={1440}
                  value={waRealertaMin}
                  onChange={(e) => setWaRealertaMin(Math.max(1, Number(e.target.value) || 1))}
                  className="h-8 w-24 text-sm tabular-nums"
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t bg-card px-4 py-3 sm:px-6">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300"
            onClick={async () => {
              window.dispatchEvent(new CustomEvent("cfv-alert-test", {
                detail: { mensagem: `[TESTE] Layout CFV sem pedidos há ${gapMinutos} min` },
              }));
              toast.info("Alerta de teste disparado — verifique a tela");
              if (destinoIds.length > 0) {
                try {
                  const { enviados } = await testarWa.mutateAsync({ destinoIds });
                  toast.success(`Teste de WhatsApp enfileirado para ${enviados} contato(s).`);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Falha ao enviar teste no WhatsApp.");
                }
              }
            }}
          >
            <Bell className="mr-1.5 h-3.5 w-3.5" />
            Testar alerta
          </Button>
          <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={salvar} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Salvando…" : "Salvar"}
          </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
