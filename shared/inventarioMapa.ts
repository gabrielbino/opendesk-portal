/**
 * Contrato de domínio do Mapa de Inventário (Almoxarifado de TI).
 * Compartilhado entre servidor (server/db + router) e cliente (canvas React
 * Flow) — fonte única dos tipos, para não haver drift. Hierarquia:
 * Área → Setor → Equipamento → Periféricos.
 */

export interface Position {
  x: number;
  y: number;
}

export interface Tamanho {
  width: number;
  height: number;
}

// ── Equipamento ──────────────────────────────────────────────────────────

export type EquipmentType = "Computador";

export type EquipmentStatus = "Online" | "Offline" | "Alerta" | "Manutencao";

export type PerifericoTipo =
  | "Monitor"
  | "Nobreak"
  | "Estabilizador"
  | "Leitor de código de barras"
  | "Outro";

/** Periférico acessório de um computador (monitor, nobreak, etc.). */
export interface Periferico {
  id: string;
  tipo: PerifericoTipo;
  descricao: string;
  patrimonio: string;
}

export interface EquipmentGeral {
  nome: string;
  patrimonio: string;
  mac: string;
  sistemaOperacional: string;
  responsavel: string;
  departamento: string;
  status: EquipmentStatus;
}

export interface Equipment {
  id: string;
  tipo: EquipmentType;
  /** Setor ao qual pertence; `null` = solto no mapa (posição absoluta). */
  setorId: string | null;
  posicao: Position;
  geral: EquipmentGeral;
  perifericos: Periferico[];
}

// ── Setor ────────────────────────────────────────────────────────────────

export interface Setor {
  id: string;
  nome: string;
  cor: string;
  /** Área à qual pertence; `null` = solto no mapa (posição absoluta). */
  areaId: string | null;
  posicao: Position;
  tamanho: Tamanho;
}

// ── Área ─────────────────────────────────────────────────────────────────

export interface Area {
  id: string;
  nome: string;
  cor: string;
  posicao: Position;
  tamanho: Tamanho;
}

// ── Snapshot / projeto ─────────────────────────────────────────────────────

export interface MapaSnapshot {
  areas: Area[];
  setores: Setor[];
  equipamentos: Equipment[];
}

// ── Constantes de apoio (UI) ───────────────────────────────────────────────

export const EQUIPMENT_TYPES: EquipmentType[] = ["Computador"];

export const EQUIPMENT_STATUSES: EquipmentStatus[] = [
  "Online",
  "Offline",
  "Alerta",
  "Manutencao",
];

export const PERIFERICO_TIPOS: PerifericoTipo[] = [
  "Monitor",
  "Nobreak",
  "Estabilizador",
  "Leitor de código de barras",
  "Outro",
];

export const SETOR_TAMANHO_PADRAO: Tamanho = { width: 320, height: 240 };
export const AREA_TAMANHO_PADRAO: Tamanho = { width: 640, height: 460 };

/** Paleta de cores sugeridas para novos setores. */
export const SETOR_CORES: string[] = [
  "#22D3EE",
  "#818CF8",
  "#F472B6",
  "#34D399",
  "#FBBF24",
  "#F87171",
  "#A78BFA",
  "#38BDF8",
];

/** Cores sugeridas para novas áreas. */
export const AREA_CORES: string[] = [
  "#38BDF8",
  "#F472B6",
  "#A78BFA",
  "#F59E0B",
  "#34D399",
  "#F87171",
];
