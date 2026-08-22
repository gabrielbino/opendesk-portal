import { useEffect, useMemo, useState } from "react";
import { Bell, PackageX, Search, X } from "lucide-react";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Config do ALERTA EM TELA de pedidos travados (overlay + aba + som). Define quem vê (destinatários)
 * e liga/desliga. A janela/dias/SLA já vêm de cada integração — aqui só decidimos QUEM e SE. Espelha
 * o seletor de usuários do Alerta CFV. Dispara para TODAS as integrações de pedidos que travarem.
 */
export default function AlertaTelaModal({ open, onClose }: Props) {
  const configQuery = trpc.monitorArquivos.getAlertaTelaConfig.useQuery(undefined, { enabled: open });
  const usersQuery = trpc.monitorArquivos.getUsuariosPortal.useQuery(undefined, { enabled: open });
  const saveMutation = trpc.monitorArquivos.setAlertaTelaConfig.useMutation({
    onSuccess: () => {
      toast.success("Configuração salva com sucesso");
      configQuery.refetch();
      onClose();
    },
    onError: (err) => toast.error(`Erro ao salvar: ${err.message}`),
  });

  const [ativo, setAtivo] = useState(true);
  const [destinatarioIds, setDestinatarioIds] = useState<Set<number>>(new Set());
  const [busca, setBusca] = useState("");

  useEffect(() => {
    if (configQuery.data) {
      setAtivo(configQuery.data.ativo);
      setDestinatarioIds(new Set(configQuery.data.destinatarioIds ?? []));
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

  function salvar() {
    if (ativo && destinatarioIds.size === 0) return toast.error("Selecione ao menos um destinatário (ou desative o alerta)");
    saveMutation.mutate({ ativo, destinatarioIds: Array.from(destinatarioIds) });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} className="flex max-h-[90vh] w-[95vw] max-w-lg flex-col gap-0 overflow-hidden p-0">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-card px-4 py-3 sm:px-6">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <PackageX className="h-4 w-4 text-red-500" />
            Alerta em tela — pedidos travados
          </DialogTitle>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <DialogHeader className="sr-only">
          <DialogDescription>
            Configure quem vê o alerta em tela (overlay + aba + som) quando uma integração de pedidos trava.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Alerta em tela ativo</Label>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Dispara para TODAS as integrações de pedidos que travarem (só pedidos — listas ficam de fora).
                O WhatsApp por integração segue independente.
              </p>
            </div>
            <Switch checked={ativo} onCheckedChange={setAtivo} />
          </div>

          <div>
            <Label className="mb-1.5 block text-sm font-medium">
              Quem vê o alerta ({destinatarioIds.size} selecionado{destinatarioIds.size !== 1 ? "s" : ""})
            </Label>
            <div className="rounded-lg border">
              <div className="relative border-b px-3 py-2">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por nome ou e-mail…"
                  className="h-8 border-0 pl-6 text-xs shadow-none focus-visible:ring-0"
                />
              </div>
              <div className="max-h-56 overflow-y-auto">
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
        </div>

        <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t bg-card px-4 py-3 sm:px-6">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300"
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent("monitor-travados-test", {
                  detail: { mensagem: "[TESTE] Integração de exemplo — 2 pedidos travados no ERP" },
                }),
              );
              toast.info("Alerta de teste disparado — verifique a tela");
            }}
          >
            <Bell className="mr-1.5 h-3.5 w-3.5" />
            Testar alerta
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button size="sm" onClick={salvar} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
