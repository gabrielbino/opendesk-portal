/**
 * Monitor TV — fonte ÚNICA das chaves/labels de painel e dos modos de região.
 *
 * Compartilhado por:
 *  - client (registry `TV_PANELS` mapeia key → view; player e editor usam labels/modos);
 *  - server (validação zod do router + persistência da playlist).
 *
 * Adicionar um painel novo do backlog = 1 entrada aqui (key + label) + a view no
 * registry do client. `panelKey` é gravado como VARCHAR (não ENUM) justamente para
 * um painel novo não exigir ALTER TABLE — a validação vem daqui.
 */

/** Painéis modo TV disponíveis para a rotação. Ordem = ordem padrão no player. */
export const MONITOR_PANEL_KEYS = ["superestocados", "superestocados_produtos", "rupturas"] as const;
export type MonitorPanelKey = (typeof MONITOR_PANEL_KEYS)[number];

export const MONITOR_PANEL_LABELS: Record<MonitorPanelKey, string> = {
  superestocados: "Superestocadas (indústrias)",
  superestocados_produtos: "Superestocados (produtos)",
  rupturas: "Rupturas",
};

/**
 * Modo de região de um item: o player EXPANDE cada modo em slides de região FIXA
 * (sem timers aninhados — decisão travada no handoff).
 */
export const MONITOR_REGION_MODES = ["unificado", "estados", "estados_unificado"] as const;
export type MonitorRegionMode = (typeof MONITOR_REGION_MODES)[number];

export const MONITOR_REGION_MODE_LABELS: Record<MonitorRegionMode, string> = {
  unificado: "Unificado",
  estados: "Por estado",
  estados_unificado: "Estado + unificado",
};

/** Regiões concretas (RankingRegion) em que cada modo se expande, na ordem exibida. */
export type MonitorRegion = "SC" | "RS" | "UNIFICADO";
export const MONITOR_REGION_MODE_EXPANSION: Record<MonitorRegionMode, MonitorRegion[]> = {
  unificado: ["UNIFICADO"],
  estados: ["SC", "RS"],
  estados_unificado: ["SC", "RS", "UNIFICADO"],
};

/** Opções de Top oferecidas no editor. */
export const MONITOR_TOPS = [10, 20] as const;
export type MonitorTop = (typeof MONITOR_TOPS)[number];

/** Padrões de um item novo criado no editor. */
export const MONITOR_ITEM_DEFAULTS = {
  regionMode: "estados_unificado" as MonitorRegionMode,
  top: 10,
  dwellSeconds: 30,
  enabled: true,
};

/** Item da playlist (como devolvido pelo router / consumido pelo player e editor). */
export type MonitorPlaylistItem = {
  id: number;
  ordem: number;
  panelKey: MonitorPanelKey;
  regionMode: MonitorRegionMode;
  top: number;
  dwellSeconds: number;
  enabled: boolean;
};

export type MonitorPlaylist = {
  id: number;
  slug: string;
  nome: string;
  itens: MonitorPlaylistItem[];
};

/** Resumo de playlist para a lista do editor. */
export type MonitorPlaylistSummary = {
  id: number;
  slug: string;
  nome: string;
  totalItens: number;
};

/** É uma chave de painel conhecida? (defesa no player contra keys órfãs no banco). */
export function isMonitorPanelKey(k: string): k is MonitorPanelKey {
  return (MONITOR_PANEL_KEYS as readonly string[]).includes(k);
}

/**
 * slug canônico a partir de um nome livre (kebab-case, sem acento). A unicidade é
 * garantida no server (sufixo -2, -3… em colisão).
 */
export function slugifyPlaylist(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove marcas diacríticas (acentos)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
