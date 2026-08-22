import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import type { Equipment } from "@shared/inventarioMapa";
import { equipmentIcons, equipmentColors, statusColors } from "../constants";

export interface EquipmentNodeData {
  equipment: Equipment;
  dimmed?: boolean;
}

function EquipmentNodeInner({ data, selected }: NodeProps) {
  const { equipment, dimmed } = data as unknown as EquipmentNodeData;
  const Icon = equipmentIcons[equipment.tipo];
  const color = equipmentColors[equipment.tipo];
  const statusColor = statusColors[equipment.geral.status];

  return (
    <div
      className="transition-transform duration-150 hover:-translate-y-0.5"
      style={{ opacity: dimmed ? 0.3 : 1 }}
    >
      <div
        className="flex w-[108px] cursor-pointer flex-col items-center gap-1 rounded-2xl px-2.5 py-2"
        style={{
          background: "linear-gradient(180deg, rgba(30,41,59,0.06), rgba(15,23,42,0.03))",
          border: selected ? `1.5px solid ${color}` : "1.5px solid rgba(148,163,184,0.28)",
          boxShadow: selected
            ? `0 0 0 3px ${color}33, 0 8px 20px rgba(0,0,0,0.18)`
            : "0 2px 8px rgba(0,0,0,0.10)",
        }}
      >
        <div
          className="relative flex h-10 w-10 items-center justify-center rounded-[10px]"
          style={{ background: `${color}1A`, border: `1px solid ${color}55` }}
        >
          <Icon size={20} color={color} strokeWidth={2} />
          <span
            className="absolute -right-[3px] -top-[3px] h-2.5 w-2.5 rounded-full border-2 border-background"
            style={{ background: statusColor, boxShadow: `0 0 6px ${statusColor}` }}
          />
        </div>
        <p className="max-w-full truncate text-center text-[11px] font-bold leading-tight text-foreground">
          {equipment.geral.nome}
        </p>
        <p className="font-mono text-[9.5px] text-muted-foreground">
          {equipment.geral.patrimonio || "—"}
        </p>
      </div>
    </div>
  );
}

export const EquipmentNode = memo(EquipmentNodeInner);
