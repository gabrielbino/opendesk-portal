import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FolderCog, MessageSquare, Pencil, Plus, Search, X } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ConfirmDialog from "@/components/ConfirmDialog";
import CaminhoForm from "./CaminhoForm";
import { descreverAgenda } from "@shared/agenda";
import type { ConfigRow } from "./types";

export type { ConfigRow } from "./types";

export interface ConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  configs: ConfigRow[];
  /** Revalida o painel após qualquer mudança. */
  onChanged: () => void;
}

export default function ConfigModal({ open, onOpenChange, configs, onChanged }: ConfigModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[96vw] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderCog className="h-5 w-5 text-indigo-600" />
            Configurar o Monitor de Integrações
          </DialogTitle>
          <DialogDescription>
            Cadastre os caminhos a acompanhar e os destinos que recebem os alertas no WhatsApp.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="caminhos" className="mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="caminhos">Caminhos</TabsTrigger>
            <TabsTrigger value="destinos">Destinos WhatsApp</TabsTrigger>
          </TabsList>
          <TabsContent value="caminhos" className="mt-4">
            <CaminhosTab configs={configs} onChanged={onChanged} />
          </TabsContent>
          <TabsContent value="destinos" className="mt-4">
            <DestinosTab onChanged={onChanged} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Aba Caminhos ────────────────────────────────────────────────────────── */

function CaminhosTab({ configs, onChanged }: { configs: ConfigRow[]; onChanged: () => void }) {
  const [editando, setEditando] = useState<ConfigRow | "novo" | null>(null);
  const [busca, setBusca] = useState("");

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return configs;
    return configs.filter((c) => c.nome.toLowerCase().includes(q) || c.caminho.toLowerCase().includes(q));
  }, [configs, busca]);

  if (editando) {
    return (
      <CaminhoForm
        inicial={editando === "novo" ? null : editando}
        onCancel={() => setEditando(null)}
        onSaved={() => {
          setEditando(null);
          onChanged();
        }}
        onDeleted={() => {
          setEditando(null);
          onChanged();
        }}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{configs.length} integração(ões) cadastrada(s)</p>
        <Button size="sm" onClick={() => setEditando("novo")}>
          <Plus className="mr-1 h-4 w-4" />
          Nova integração
        </Button>
      </div>

      {configs.length > 0 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou caminho…"
            className="h-9 pl-8"
          />
        </div>
      )}

      {configs.length === 0 ? (
        <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
          Nenhuma integração ainda. Clique em "Nova integração".
        </p>
      ) : filtrados.length === 0 ? (
        <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
          Nenhum caminho encontrado para "{busca}".
        </p>
      ) : (
        <ul className="max-h-[45vh] divide-y overflow-y-auto rounded-lg border">
          {filtrados.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", c.ativo ? "bg-emerald-500" : "bg-slate-300")} />
                  <span className="truncate text-sm font-medium" title={c.nome}>
                    {c.nome}
                  </span>
                </div>
                <p className="truncate pl-4 text-[11px] text-muted-foreground" title={c.caminho}>
                  {c.caminho ? c.caminho : "Sem pasta de pedidos (só listas)"}
                </p>
                <p className="pl-4 text-[11px] text-muted-foreground">
                  {descreverAgenda({ diasSemana: c.diasSemana ?? [], horaInicio: c.horaInicio, horaFim: c.horaFim })}
                  {c.caminho ? ` · SLA ${c.slaLeituraMin}min` : ""}
                </p>
              </div>
              <Button size="icon" variant="ghost" className="shrink-0" onClick={() => setEditando(c)}>
                <Pencil className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ─── Aba Destinos ────────────────────────────────────────────────────────── */

function DestinosTab({ onChanged }: { onChanged: () => void }) {
  const utils = trpc.useUtils();
  const destinosQuery = trpc.monitorArquivos.listDestinos.useQuery();
  const [tipo, setTipo] = useState<"grupo" | "contato">("grupo");
  const [identificador, setIdentificador] = useState("");
  const [nome, setNome] = useState("");
  const [universal, setUniversal] = useState(false);
  const [removendo, setRemovendo] = useState<{ id: number; nome: string } | null>(null);

  const createM = trpc.monitorArquivos.createDestino.useMutation();
  const updateM = trpc.monitorArquivos.updateDestino.useMutation();
  const deleteM = trpc.monitorArquivos.deleteDestino.useMutation();

  async function adicionar() {
    if (!identificador.trim() || !nome.trim()) {
      toast.error("Preencha o nome e o identificador do destino.");
      return;
    }
    try {
      await createM.mutateAsync({ tipo, identificador, nome, universal });
      setIdentificador("");
      setNome("");
      setUniversal(false);
      await utils.monitorArquivos.listDestinos.invalidate();
      toast.success("Destino cadastrado.");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao cadastrar.");
    }
  }

  async function alternarUniversal(id: number, valor: boolean) {
    try {
      await updateM.mutateAsync({ id, universal: valor });
      await utils.monitorArquivos.listDestinos.invalidate();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao atualizar.");
    }
  }

  async function confirmarRemocao() {
    if (!removendo) return;
    await deleteM.mutateAsync({ id: removendo.id });
    await utils.monitorArquivos.listDestinos.invalidate();
    toast.success("Destino removido.");
    onChanged();
  }

  const destinos = destinosQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <MessageSquare className="h-3.5 w-3.5" /> Novo destino
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[7rem_1fr]">
          <Select value={tipo} onValueChange={(v) => setTipo(v as "grupo" | "contato")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="grupo">Grupo</SelectItem>
              <SelectItem value="contato">Contato</SelectItem>
            </SelectContent>
          </Select>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Apelido (ex.: TI Plantão)" />
          <Input
            value={identificador}
            onChange={(e) => setIdentificador(e.target.value)}
            placeholder={tipo === "grupo" ? "Nome exato do grupo no WhatsApp" : "Número E.164 (ex.: 5548999999999)"}
            className="sm:col-span-2"
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={universal} onCheckedChange={setUniversal} />
            <span>
              Universal
              <span className="ml-1 text-[11px] text-muted-foreground">(recebe de todas as integrações)</span>
            </span>
          </label>
          <Button size="sm" onClick={adicionar} disabled={createM.isPending}>
            <Plus className="mr-1 h-4 w-4" /> Adicionar
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          <strong>Universal</strong> = recebe os alertas de <strong>todas</strong> as integrações. Deixe
          desligado para um destino específico e vincule-o ao caminho na aba "Caminhos".
        </p>
      </div>

      {destinos.length === 0 ? (
        <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
          Nenhum destino cadastrado ainda.
        </p>
      ) : (
        <ul className="max-h-[45vh] divide-y overflow-y-auto rounded-lg border">
          {destinos.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {d.tipo}
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                    {d.nome}
                    {d.universal && (
                      <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                        universal
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">{d.identificador}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <label className="flex items-center gap-1 text-[11px] text-muted-foreground" title="Recebe de todas as integrações">
                  <Switch
                    checked={d.universal}
                    onCheckedChange={(v) => alternarUniversal(d.id, v)}
                    disabled={updateM.isPending}
                  />
                  universal
                </label>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-red-600"
                  onClick={() => setRemovendo({ id: d.id, nome: d.nome })}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={removendo !== null}
        onOpenChange={(o) => !o && setRemovendo(null)}
        title={removendo ? `Remover o destino "${removendo.nome}"?` : "Remover destino?"}
        description="Ele será desvinculado dos caminhos que o utilizam."
        confirmLabel="Remover"
        destructive
        onConfirm={confirmarRemocao}
      />
    </div>
  );
}
