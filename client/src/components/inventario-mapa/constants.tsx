/**
 * Ícones e cores do Mapa de Inventário. Cores de status pensadas para
 * NOC (verde/vermelho/âmbar/azul) e funcionam em tema claro e escuro.
 */
import {
  Monitor,
  MonitorSmartphone,
  BatteryCharging,
  Plug,
  ScanBarcode,
  Cable,
  type LucideIcon,
} from "lucide-react";
import type { EquipmentType, EquipmentStatus, PerifericoTipo } from "@shared/inventarioMapa";

export const equipmentIcons: Record<EquipmentType, LucideIcon> = {
  Computador: Monitor,
};

export const equipmentColors: Record<EquipmentType, string> = {
  Computador: "#22D3EE",
};

export const perifericoIcons: Record<PerifericoTipo, LucideIcon> = {
  Monitor: MonitorSmartphone,
  Nobreak: BatteryCharging,
  Estabilizador: Plug,
  "Leitor de código de barras": ScanBarcode,
  Outro: Cable,
};

/** Cor de cada status (hex — usada em pontos/indicadores no canvas). */
export const statusColors: Record<EquipmentStatus, string> = {
  Online: "#34D399",
  Offline: "#F87171",
  Alerta: "#FBBF24",
  Manutencao: "#60A5FA",
};

/** Rótulo amigável do status (o enum usa "Manutencao" sem acento). */
export const statusLabels: Record<EquipmentStatus, string> = {
  Online: "Online",
  Offline: "Offline",
  Alerta: "Alerta",
  Manutencao: "Manutenção",
};
