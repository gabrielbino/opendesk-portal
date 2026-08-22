import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowDown, ArrowUp, Play, Plus, Save, Trash2, Tv } from "lucide-react";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import PanelHeader from "@/components/PanelHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  MONITOR_ITEM_DEFAULTS,
  MONITOR_PANEL_KEYS,
  MONITOR_PANEL_LABELS,
  MONITOR_REGION_MODES,
  MONITOR_REGION_MODE_LABELS,
  MONITOR_TOPS,
  type MonitorPanelKey,
  type MonitorRegionMode,
} from "@shared/monitorTv";

/**
 * Editor de playlists do Monitor TV. Lista/cria/renomeia/exclui playlists e edita a
 * sequência de painéis (painel · modo de região · top · tempo · on/off · ordem). O
 * player abre `/monitor?playlist=<slug>` e pega as mudanças na próxima volta.
 */

/** Item editável (sem id — o save substitui a lista inteira; ordem = posição). */
type DraftItem = {
  panelKey: MonitorPanelKey;
  regionMode: MonitorRegionMode;
  top: number;
  dwellSeconds: number;
  enabled: boolean;
};

export default function MonitorPlaylists() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const listQuery = trpc.monitor.listPlaylists.useQuery();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [novoNome, setNovoNome] = useState("");

  const playlists = listQuery.data ?? [];

  // Seleciona a primeira playlist automaticamente quando a lista carrega.
  useEffect(() => {
    if (!selectedSlug && playlists.length) setSelectedSlug(playlists[0].slug);
  }, [playlists, selectedSlug]);

  const createPlaylist = trpc.monitor.createPlaylist.useMutation({
    onSuccess: async (pl) => {
      setNovoNome("");
      setSelectedSlug(pl.slug);
      await utils.monitor.listPlaylists.invalidate();
      toast.success(`Playlist "${pl.nome}" criada.`);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen w-full bg-[var(--background)]">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <PanelHeader
          onBack={() => setLocation("/negocios")}
          backLabel="Gestão de Negócios"
          icon={Tv}
          title="Monitor TV"
          subtitle="Playlists de rotação de painéis"
          color="violet"
        />
        <main className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        {/* Coluna esquerda: lista de playlists + criar */}
        <aside className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <Label htmlFor="nova-playlist" className="text-xs font-semibold text-muted-foreground">
              Nova playlist
            </Label>
            <div className="mt-2 flex gap-2">
              <Input
                id="nova-playlist"
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                placeholder="Ex.: Comercial"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && novoNome.trim()) createPlaylist.mutate({ nome: novoNome.trim() });
                }}
              />
              <Button
                size="icon"
                disabled={!novoNome.trim() || createPlaylist.isPending}
                onClick={() => createPlaylist.mutate({ nome: novoNome.trim() })}
                title="Criar playlist"
              >
                <Plus size={16} />
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-2">
            {listQuery.isLoading ? (
              <div className="space-y-2 p-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
              </div>
            ) : playlists.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">Nenhuma playlist ainda.</p>
            ) : (
              <ul className="space-y-1">
                {playlists.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => setSelectedSlug(p.slug)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors",
                        selectedSlug === p.slug ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60",
                      )}
                    >
                      <span className="truncate">{p.nome}</span>
                      <span className="ml-2 shrink-0 text-xs text-muted-foreground">{p.totalItens}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* Coluna direita: editor da playlist selecionada */}
        <section>
          {selectedSlug ? (
            <PlaylistEditor
              key={selectedSlug}
              slug={selectedSlug}
              onDeleted={() => {
                setSelectedSlug(null);
                void utils.monitor.listPlaylists.invalidate();
              }}
            />
          ) : (
            <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
              Selecione ou crie uma playlist para editar.
            </div>
          )}
        </section>
        </main>
      </div>
    </div>
  );
}

function PlaylistEditor({ slug, onDeleted }: { slug: string; onDeleted: () => void }) {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const playlistQuery = trpc.monitor.getPlaylist.useQuery({ slug });

  const [nome, setNome] = useState("");
  const [itens, setItens] = useState<DraftItem[]>([]);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  // Carrega o estado editável quando a playlist chega/muda.
  useEffect(() => {
    if (playlistQuery.data) {
      setNome(playlistQuery.data.nome);
      setItens(
        playlistQuery.data.itens.map((it) => ({
          panelKey: it.panelKey,
          regionMode: it.regionMode,
          top: it.top,
          dwellSeconds: it.dwellSeconds,
          enabled: it.enabled,
        })),
      );
      setConfirmandoExclusao(false);
    }
  }, [playlistQuery.data]);

  const original = useMemo(
    () =>
      (playlistQuery.data?.itens ?? []).map((it) => ({
        panelKey: it.panelKey,
        regionMode: it.regionMode,
        top: it.top,
        dwellSeconds: it.dwellSeconds,
        enabled: it.enabled,
      })),
    [playlistQuery.data],
  );
  const itensDirty = JSON.stringify(itens) !== JSON.stringify(original);
  const nomeDirty = playlistQuery.data ? nome.trim() !== playlistQuery.data.nome : false;

  const saveItens = trpc.monitor.saveItens.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.monitor.getPlaylist.invalidate({ slug }), utils.monitor.listPlaylists.invalidate()]);
      toast.success("Playlist salva.");
    },
    onError: (e) => toast.error(e.message),
  });
  const rename = trpc.monitor.renamePlaylist.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.monitor.getPlaylist.invalidate({ slug }), utils.monitor.listPlaylists.invalidate()]);
      toast.success("Nome atualizado.");
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.monitor.deletePlaylist.useMutation({
    onSuccess: () => {
      toast.success("Playlist excluída.");
      onDeleted();
    },
    onError: (e) => toast.error(e.message),
  });

  if (playlistQuery.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-1/2" />
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }
  if (!playlistQuery.data) {
    return <div className="rounded-xl border border-border p-6 text-sm text-muted-foreground">Playlist não encontrada.</div>;
  }

  const id = playlistQuery.data.id;

  const updateItem = (idx: number, patch: Partial<DraftItem>) =>
    setItens((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const addItem = () =>
    setItens((prev) => [
      ...prev,
      {
        panelKey: MONITOR_PANEL_KEYS[0],
        regionMode: MONITOR_ITEM_DEFAULTS.regionMode,
        top: MONITOR_ITEM_DEFAULTS.top,
        dwellSeconds: MONITOR_ITEM_DEFAULTS.dwellSeconds,
        enabled: MONITOR_ITEM_DEFAULTS.enabled,
      },
    ]);
  const removeItem = (idx: number) => setItens((prev) => prev.filter((_, i) => i !== idx));
  const move = (idx: number, dir: -1 | 1) =>
    setItens((prev) => {
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[j]] = [copy[j], copy[idx]];
      return copy;
    });

  return (
    <div className="space-y-5">
      {/* Nome + ações da playlist */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <Label htmlFor="nome-playlist" className="text-xs font-semibold text-muted-foreground">
            Nome da playlist
          </Label>
          <div className="mt-1 flex gap-2">
            <Input id="nome-playlist" value={nome} onChange={(e) => setNome(e.target.value)} />
            <Button
              variant="secondary"
              disabled={!nomeDirty || !nome.trim() || rename.isPending}
              onClick={() => rename.mutate({ id, nome: nome.trim() })}
            >
              Renomear
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            URL do monitor: <code className="rounded bg-muted px-1">/monitor?playlist={slug}</code>
          </p>
        </div>
        <Button variant="outline" onClick={() => setLocation(`/monitor?playlist=${slug}`)}>
          <Play size={16} className="mr-1.5" /> Abrir no monitor
        </Button>
      </div>

      {/* Itens */}
      <div className="space-y-3">
        {itens.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Sem painéis nesta playlist. Adicione o primeiro abaixo.
          </div>
        ) : (
          itens.map((it, idx) => (
            <div
              key={idx}
              className={cn(
                "rounded-xl border border-border bg-card p-3",
                !it.enabled && "opacity-60",
              )}
            >
              {/* Barra: ordem (esquerda) · ativo + remover (direita) */}
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <button
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                    className="rounded p-1 hover:bg-accent disabled:opacity-30"
                    title="Subir"
                  >
                    <ArrowUp size={15} />
                  </button>
                  <span className="text-xs tabular-nums">#{idx + 1}</span>
                  <button
                    onClick={() => move(idx, 1)}
                    disabled={idx === itens.length - 1}
                    className="rounded p-1 hover:bg-accent disabled:opacity-30"
                    title="Descer"
                  >
                    <ArrowDown size={15} />
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    Ativo
                    <Switch checked={it.enabled} onCheckedChange={(v) => updateItem(idx, { enabled: v })} />
                  </label>
                  <button
                    onClick={() => removeItem(idx)}
                    className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    title="Remover painel"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* Campos: 2 colunas no mobile, 4 no desktop. Painel ocupa a linha no mobile. */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="col-span-2 min-w-0 sm:col-span-1">
                  <Label className="text-[11px] text-muted-foreground">Painel</Label>
                  <Select value={it.panelKey} onValueChange={(v) => updateItem(idx, { panelKey: v as MonitorPanelKey })}>
                    <SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONITOR_PANEL_KEYS.map((k) => (
                        <SelectItem key={k} value={k}>{MONITOR_PANEL_LABELS[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="col-span-2 min-w-0 sm:col-span-1">
                  <Label className="text-[11px] text-muted-foreground">Modo de região</Label>
                  <Select value={it.regionMode} onValueChange={(v) => updateItem(idx, { regionMode: v as MonitorRegionMode })}>
                    <SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONITOR_REGION_MODES.map((m) => (
                        <SelectItem key={m} value={m}>{MONITOR_REGION_MODE_LABELS[m]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="min-w-0">
                  <Label className="text-[11px] text-muted-foreground">Top</Label>
                  <Select value={String(it.top)} onValueChange={(v) => updateItem(idx, { top: Number(v) })}>
                    <SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONITOR_TOPS.map((t) => (
                        <SelectItem key={t} value={String(t)}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="min-w-0">
                  <Label className="text-[11px] text-muted-foreground">Tempo (s)</Label>
                  <Input
                    type="number"
                    min={5}
                    max={600}
                    value={it.dwellSeconds}
                    onChange={(e) => updateItem(idx, { dwellSeconds: Math.max(5, Math.min(600, Number(e.target.value) || 0)) })}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>
          ))
        )}

        <Button variant="outline" onClick={addItem} className="w-full border-dashed">
          <Plus size={16} className="mr-1.5" /> Adicionar painel
        </Button>
      </div>

      {/* Ações de rodapé */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        {confirmandoExclusao ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Excluir esta playlist?</span>
            <Button variant="destructive" size="sm" disabled={remove.isPending} onClick={() => remove.mutate({ id })}>
              Confirmar
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmandoExclusao(false)}>Cancelar</Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmandoExclusao(true)}>
            <Trash2 size={15} className="mr-1.5" /> Excluir playlist
          </Button>
        )}

        <div className="flex items-center gap-3">
          {itensDirty && <span className="text-xs text-amber-600">Alterações não salvas</span>}
          <Button
            disabled={!itensDirty || saveItens.isPending}
            onClick={() => saveItens.mutate({ playlistId: id, itens })}
          >
            <Save size={16} className="mr-1.5" /> Salvar playlist
          </Button>
        </div>
      </div>
    </div>
  );
}
