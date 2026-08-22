import { Component, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useLocation, useSearch } from "wouter";
import { ArrowLeft, SlidersHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import type { RankingRegion } from "@/components/RankingTV";
import {
  MONITOR_PANEL_KEYS,
  MONITOR_PANEL_LABELS,
  MONITOR_REGION_MODES,
  MONITOR_REGION_MODE_EXPANSION,
  MONITOR_REGION_MODE_LABELS,
  isMonitorPanelKey,
  type MonitorPanelKey,
  type MonitorRegionMode,
} from "@shared/monitorTv";
import { TV_PANELS } from "./tv/panels";

/**
 * MonitorTV — player que rotaciona os painéis modo TV em tela cheia (monitor do
 * comercial). Dois modos:
 *
 *  1. Playlist no banco (recomendado): `/monitor?playlist=<slug>` carrega a playlist
 *     nomeada e usa o modo de região / top / tempo POR ITEM. As mudanças feitas no
 *     editor entram na próxima volta da rotação (refetch ao dar loop).
 *  2. Ad-hoc pela URL (compat): `/monitor?paineis=...&regiao=...&top=...&seg=...` —
 *     controles na tela gravam na querystring (compartilhável, sem banco).
 *
 * Em ambos, o "modo de região" EXPANDE cada painel em slides de região FIXA (sem
 * timers aninhados). Cada slide tem error boundary; a página se auto-recarrega
 * periodicamente (defesa p/ monitor 24/7).
 */

const AUTO_RELOAD_MS = 6 * 60 * 60 * 1000; // 6h

/** Um slide já expandido: painel + região fixa + top + tempo na tela. */
type Slide = { key: MonitorPanelKey; region: RankingRegion; top: number; dwellSeconds: number };

function parseUrlParams(search: string) {
  const p = new URLSearchParams(search);
  const paineis = (p.get("paineis") ?? MONITOR_PANEL_KEYS.join(","))
    .split(",")
    .map((s) => s.trim())
    .filter(isMonitorPanelKey);
  const regiaoRaw = (p.get("regiao") ?? "estados_unificado") as MonitorRegionMode;
  const regiao: MonitorRegionMode = regiaoRaw in MONITOR_REGION_MODE_EXPANSION ? regiaoRaw : "estados_unificado";
  const top = Number(p.get("top")) === 20 ? 20 : 10;
  const seg = Math.max(5, Number(p.get("seg")) || 30);
  return {
    playlist: p.get("playlist")?.trim() || null,
    paineis: paineis.length ? paineis : [...MONITOR_PANEL_KEYS],
    regiao,
    top,
    seg,
  };
}

/** Um painel com erro não derruba a rotação — mostra aviso e o timer segue. */
class SlideBoundary extends Component<{ children: ReactNode }, { erro: boolean }> {
  state = { erro: false };
  static getDerivedStateFromError() {
    return { erro: true };
  }
  render() {
    if (this.state.erro) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-slate-950 text-2xl text-slate-500">
          Painel indisponível no momento.
        </div>
      );
    }
    return this.props.children;
  }
}

export default function MonitorTV() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { playlist: playlistSlug, paineis, regiao, top, seg } = useMemo(() => parseUrlParams(search), [search]);
  const playlistMode = !!playlistSlug;

  // Modo playlist: carrega do banco. Refetch ao dar loop (mudanças entram na próxima volta).
  const playlistQuery = trpc.monitor.getPlaylist.useQuery(
    { slug: playlistSlug ?? "" },
    { enabled: playlistMode, refetchOnWindowFocus: false, staleTime: 60 * 1000 },
  );

  // Sequência plana de slides fixos (expande cada painel pelo seu modo de região).
  const slides = useMemo<Slide[]>(() => {
    if (playlistMode) {
      const pl = playlistQuery.data;
      if (!pl) return [];
      return pl.itens
        .filter((it) => it.enabled && isMonitorPanelKey(it.panelKey))
        .flatMap((it) =>
          MONITOR_REGION_MODE_EXPANSION[it.regionMode].map((region) => ({
            key: it.panelKey,
            region,
            top: it.top,
            dwellSeconds: it.dwellSeconds,
          })),
        );
    }
    return paineis.flatMap((key) =>
      MONITOR_REGION_MODE_EXPANSION[regiao].map((region) => ({ key, region, top, dwellSeconds: seg })),
    );
  }, [playlistMode, playlistQuery.data, paineis, regiao, top, seg]);

  const slidesKey = useMemo(
    () => slides.map((s) => `${s.key}:${s.region}:${s.top}:${s.dwellSeconds}`).join("|"),
    [slides],
  );

  const [idx, setIdx] = useState(0);
  // Reinicia a rotação quando a lista de slides muda.
  useEffect(() => setIdx(0), [slidesKey]);

  // Refetch ao completar a volta (playlist mode) — mantido em ref p/ não recriar o timer.
  const onLoopRef = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    onLoopRef.current = playlistMode ? () => void playlistQuery.refetch() : undefined;
  }, [playlistMode, playlistQuery.refetch]);

  // Timer por slide (o tempo pode variar item a item na playlist).
  useEffect(() => {
    if (slides.length <= 1) return;
    const atual = slides[idx % slides.length];
    const dwellMs = Math.max(5, atual?.dwellSeconds ?? 30) * 1000;
    const t = setTimeout(() => {
      setIdx((i) => {
        const next = (i + 1) % slides.length;
        if (next === 0) onLoopRef.current?.();
        return next;
      });
    }, dwellMs);
    return () => clearTimeout(t);
  }, [idx, slides, slidesKey]);

  // Auto-reload defensivo (monitor 24/7).
  useEffect(() => {
    const t = setTimeout(() => window.location.reload(), AUTO_RELOAD_MS);
    return () => clearTimeout(t);
  }, []);

  const setParams = (next: Partial<{ paineis: MonitorPanelKey[]; regiao: MonitorRegionMode; top: number; seg: number }>) => {
    const m = { paineis, regiao, top, seg, ...next };
    setLocation(`/monitor?paineis=${m.paineis.join(",")}&regiao=${m.regiao}&top=${m.top}&seg=${m.seg}`);
  };
  const togglePainel = (k: MonitorPanelKey) => {
    const set = new Set(paineis);
    set.has(k) ? set.delete(k) : set.add(k);
    // Mantém a ordem do registry.
    setParams({ paineis: MONITOR_PANEL_KEYS.filter((x) => set.has(x)) });
  };

  // Controles com auto-hide.
  const [visivel, setVisivel] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const wake = () => {
      setVisivel(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setVisivel(false), 6000);
    };
    wake();
    window.addEventListener("mousemove", wake);
    window.addEventListener("keydown", wake);
    return () => {
      window.removeEventListener("mousemove", wake);
      window.removeEventListener("keydown", wake);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const slide = slides.length ? slides[idx % slides.length] : null;
  const Panel = slide ? TV_PANELS[slide.key].View : null;

  // Mensagem central quando não há slide (loading / playlist inexistente / vazia).
  const mensagemVazia = (() => {
    if (playlistMode) {
      if (playlistQuery.isLoading) return "Carregando playlist…";
      if (!playlistQuery.data) return "Playlist não encontrada.";
      return "A playlist não tem painéis ativos. Edite a playlist para adicionar.";
    }
    return "Selecione ao menos um painel.";
  })();

  return (
    <div className="relative h-screen w-full overflow-hidden bg-slate-950 text-white">
      {slide && Panel ? (
        <SlideBoundary key={`${slide.key}-${slide.region}-${idx}`}>
          <Panel regiao={slide.region} top={slide.top} embedded />
        </SlideBoundary>
      ) : (
        <div className="flex h-full items-center justify-center text-2xl text-slate-500">
          {mensagemVazia}
        </div>
      )}

      {/* Barra de controles (auto-hide) */}
      <div
        className={cn(
          "fixed inset-x-0 top-0 z-30 flex flex-wrap items-center justify-between gap-3 bg-slate-900/85 px-4 py-2 backdrop-blur transition-opacity duration-500 sm:px-8",
          visivel ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
      >
        <button onClick={() => setLocation("/negocios")} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-slate-300 hover:bg-slate-800">
          <ArrowLeft className="h-4 w-4" /> Sair do modo TV
        </button>

        {playlistMode ? (
          // Playlist é a fonte da verdade — sem chips de config; só nome + atalho p/ o editor.
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-200">
              {playlistQuery.data?.nome ?? playlistSlug}
            </span>
            <button
              onClick={() => setLocation("/monitor/playlists")}
              className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1 text-sm text-slate-300 hover:bg-slate-700"
            >
              <SlidersHorizontal className="h-4 w-4" /> Editar playlist
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {MONITOR_PANEL_KEYS.map((k) => (
              <Chip key={k} ativo={paineis.includes(k)} onClick={() => togglePainel(k)}>{MONITOR_PANEL_LABELS[k]}</Chip>
            ))}
            <span className="mx-1 h-4 w-px bg-slate-700" />
            {MONITOR_REGION_MODES.map((m) => (
              <Chip key={m} ativo={regiao === m} onClick={() => setParams({ regiao: m })}>{MONITOR_REGION_MODE_LABELS[m]}</Chip>
            ))}
            <span className="mx-1 h-4 w-px bg-slate-700" />
            <Chip ativo={top === 10} onClick={() => setParams({ top: 10 })}>Top 10</Chip>
            <Chip ativo={top === 20} onClick={() => setParams({ top: 20 })}>Top 20</Chip>
            <span className="mx-1 h-4 w-px bg-slate-700" />
            <label className="flex items-center gap-1 text-xs text-slate-300">
              {seg}s/tela
              <input
                type="range"
                min={10}
                max={90}
                step={5}
                value={seg}
                onChange={(e) => setParams({ seg: Number(e.target.value) })}
                className="w-20"
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg px-3 py-1 text-sm font-medium transition-colors",
        ativo ? "bg-white text-slate-900" : "bg-slate-800 text-slate-300 hover:bg-slate-700",
      )}
    >
      {children}
    </button>
  );
}
