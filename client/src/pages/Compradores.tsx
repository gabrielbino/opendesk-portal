import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Plus, RefreshCw, Trash2, Users, X, ChevronsUpDown, Check } from "lucide-react";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import PanelHeader from "@/components/PanelHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Compradores (compartilhada — painéis de estoque). Cria/edita/exclui comprador
 * e vincula/desvincula marcas (Fornecedor da base). Cada marca em UM só comprador — tentar
 * vincular uma marca já atribuída abre a modal de bloqueio apontando o dono atual.
 */
export default function Compradores() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const compradoresQ = trpc.compradores.listCompradores.useQuery();
  const marcasQ = trpc.compradores.listMarcas.useQuery();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [novoNome, setNovoNome] = useState("");
  const [nomeEdit, setNomeEdit] = useState<string | null>(null);
  const [conflito, setConflito] = useState<string | null>(null);
  const [excluir, setExcluir] = useState<{ id: number; nome: string } | null>(null);
  const [comboOpen, setComboOpen] = useState(false);

  const compradores = compradoresQ.data ?? [];
  const marcas = marcasQ.data ?? [];
  const selected = compradores.find((c) => c.id === selectedId) ?? null;
  const marcasDoComprador = useMemo(
    () => marcas.filter((m) => m.compradorId === selectedId).sort((a, b) => a.marca.localeCompare(b.marca, "pt-BR")),
    [marcas, selectedId],
  );

  const invalidarTudo = async () => {
    await Promise.all([utils.compradores.listCompradores.invalidate(), utils.compradores.listMarcas.invalidate()]);
  };

  const criar = trpc.compradores.createComprador.useMutation({
    onSuccess: async (c) => { setNovoNome(""); setSelectedId(c.id); await invalidarTudo(); toast.success(`Comprador "${c.nome}" criado.`); },
    onError: (e) => toast.error(e.message),
  });
  const renomear = trpc.compradores.renameComprador.useMutation({
    onSuccess: async () => { setNomeEdit(null); await invalidarTudo(); toast.success("Nome atualizado."); },
    onError: (e) => toast.error(e.message),
  });
  const remover = trpc.compradores.deleteComprador.useMutation({
    onSuccess: async () => { if (excluir?.id === selectedId) setSelectedId(null); setExcluir(null); await invalidarTudo(); toast.success("Comprador excluído."); },
    onError: (e) => { setExcluir(null); toast.error(e.message); },
  });
  const atribuir = trpc.compradores.atribuirMarca.useMutation({
    onSuccess: async () => { setComboOpen(false); await invalidarTudo(); toast.success("Marca vinculada."); },
    onError: (e) => { if ((e.data as { code?: string } | undefined)?.code === "CONFLICT") setConflito(e.message); else toast.error(e.message); },
  });
  const desvincular = trpc.compradores.desvincularMarca.useMutation({
    onSuccess: async () => { await invalidarTudo(); toast.success("Marca desvinculada."); },
    onError: (e) => toast.error(e.message),
  });
  const syncMarcas = trpc.compradores.syncMarcas.useMutation({
    onSuccess: async (r) => { await utils.compradores.listMarcas.invalidate(); toast.success(`Catálogo atualizado: ${r.total} marcas.`); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen w-full bg-[var(--background)]">
      <div className="mx-auto max-w-7xl 2xl:max-w-[1600px] min-[1920px]:max-w-[1800px] min-[2560px]:max-w-[2200px] space-y-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <PanelHeader
          onBack={() => setLocation("/negocios")}
          backLabel="Gestão de Negócios"
          icon={Users}
          title="Compradores"
          subtitle="Vínculo de marcas por comprador"
          color="teal"
          actions={
            <Button variant="outline" size="sm" disabled={syncMarcas.isPending} onClick={() => syncMarcas.mutate()} title="Puxar marcas novas da base">
              <RefreshCw size={15} className={cn("mr-1.5", syncMarcas.isPending && "animate-spin")} /> <span className="hidden sm:inline">Atualizar marcas</span>
            </Button>
          }
        />
        <main className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
        {/* Compradores */}
        <aside className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <Label htmlFor="novo-comprador" className="text-xs font-semibold text-muted-foreground">Novo comprador</Label>
            <div className="mt-2 flex gap-2">
              <Input id="novo-comprador" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Ex.: Humbertho"
                onKeyDown={(e) => { if (e.key === "Enter" && novoNome.trim()) criar.mutate({ nome: novoNome.trim() }); }} />
              <Button size="icon" disabled={!novoNome.trim() || criar.isPending} onClick={() => criar.mutate({ nome: novoNome.trim() })} title="Criar comprador"><Plus size={16} /></Button>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-2">
            {compradoresQ.isLoading ? (
              <div className="space-y-2 p-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
            ) : compradores.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">Nenhum comprador ainda.</p>
            ) : (
              <ul className="space-y-1">
                {compradores.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => { setSelectedId(c.id); setNomeEdit(null); }}
                      className={cn("flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors",
                        selectedId === c.id ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60")}>
                      <span className="truncate">{c.nome}</span>
                      <span className="ml-2 shrink-0 rounded-full bg-muted px-2 text-xs text-muted-foreground">{c.qtdMarcas}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* Detalhe do comprador */}
        <section>
          {!selected ? (
            <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
              Selecione ou crie um comprador para vincular marcas.
            </div>
          ) : (
            <div className="space-y-5">
              {/* Nome + ações */}
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[200px] flex-1">
                  <Label className="text-xs font-semibold text-muted-foreground">Comprador</Label>
                  <div className="mt-1 flex gap-2">
                    <Input value={nomeEdit ?? selected.nome} onChange={(e) => setNomeEdit(e.target.value)} />
                    <Button variant="secondary" disabled={nomeEdit === null || !nomeEdit.trim() || nomeEdit.trim() === selected.nome || renomear.isPending}
                      onClick={() => renomear.mutate({ id: selected.id, nome: (nomeEdit ?? "").trim() })}>Renomear</Button>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setExcluir({ id: selected.id, nome: selected.nome })}>
                  <Trash2 size={15} className="mr-1.5" /> Excluir
                </Button>
              </div>

              {/* Adicionar marca (combobox) */}
              <div>
                <Label className="text-xs font-semibold text-muted-foreground">Adicionar marca</Label>
                <Popover open={comboOpen} onOpenChange={setComboOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="mt-1 w-full justify-between font-normal text-muted-foreground">
                      Buscar marca da base… <ChevronsUpDown size={16} className="opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar marca…" />
                      <CommandList>
                        <CommandEmpty>{marcasQ.isLoading ? "Carregando…" : "Nenhuma marca. Rode \"Atualizar marcas\"."}</CommandEmpty>
                        <CommandGroup>
                          {marcas.map((m) => {
                            const doOutro = m.compradorId !== null && m.compradorId !== selected.id;
                            const jaAqui = m.compradorId === selected.id;
                            return (
                              <CommandItem key={m.marca} value={m.marca}
                                onSelect={() => { if (jaAqui) { setComboOpen(false); return; } atribuir.mutate({ marca: m.marca, compradorId: selected.id }); }}>
                                <Check size={14} className={cn("mr-2", jaAqui ? "opacity-100" : "opacity-0")} />
                                <span className="flex-1 truncate">{m.marca}</span>
                                {doOutro && <span className="ml-2 shrink-0 text-xs text-amber-600">{m.compradorNome}</span>}
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <p className="mt-1 text-xs text-muted-foreground">Marcas em âmbar já são de outro comprador — desvincule de lá antes.</p>
              </div>

              {/* Marcas do comprador */}
              <div>
                <div className="mb-2 text-xs font-semibold text-muted-foreground">Marcas deste comprador ({marcasDoComprador.length})</div>
                {marcasDoComprador.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nenhuma marca vinculada ainda.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {marcasDoComprador.map((m) => (
                      <span key={m.marca} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card py-1 pl-3 pr-1 text-sm">
                        {m.marca}
                        <button onClick={() => desvincular.mutate({ marca: m.marca })} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Desvincular">
                          <X size={14} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
        </main>
      </div>

      {/* Modal de bloqueio (marca já vinculada) */}
      <AlertDialog open={conflito !== null} onOpenChange={(o) => !o && setConflito(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marca já vinculada</AlertDialogTitle>
            <AlertDialogDescription>{conflito}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setConflito(null)}>Entendi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmar exclusão de comprador */}
      <AlertDialog open={excluir !== null} onOpenChange={(o) => !o && setExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir comprador?</AlertDialogTitle>
            <AlertDialogDescription>
              "{excluir?.nome}" será removido e suas marcas ficam <strong>livres</strong> (sem comprador). Isso não apaga nenhuma marca.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={remover.isPending}
              onClick={() => excluir && remover.mutate({ id: excluir.id })}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
