import { memo } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import { Pencil, Trash2, Boxes } from "lucide-react";
import type { Area } from "@shared/inventarioMapa";

export interface AreaNodeData {
  area: Area;
  quantidadeSetores: number;
  onEdit: (area: Area) => void;
  onDelete: (area: Area) => void;
  onResizeEnd: (id: string, dims: { x: number; y: number; width: number; height: number }) => void;
}

const MIN_WIDTH = 320;
const MIN_HEIGHT = 260;

function AreaNodeInner({ data, selected }: NodeProps) {
  const { area, quantidadeSetores, onEdit, onDelete, onResizeEnd } = data as unknown as AreaNodeData;
  const cor = area.cor;

  return (
    <>
      <NodeResizer
        color={cor}
        isVisible={!!selected}
        minWidth={MIN_WIDTH}
        minHeight={MIN_HEIGHT}
        lineStyle={{ borderColor: cor }}
        handleStyle={{ width: 9, height: 9, borderRadius: 2, background: cor }}
        onResizeEnd={(_, params) =>
          onResizeEnd(area.id, { x: params.x, y: params.y, width: params.width, height: params.height })
        }
      />
      <div
        className="flex h-full w-full flex-col overflow-hidden rounded-[20px]"
        style={{
          border: `2px ${selected ? "solid" : "dashed"} ${cor}`,
          background: `${cor}0D`,
          boxShadow: selected ? `0 0 0 4px ${cor}22` : "none",
        }}
      >
        <div
          className="flex items-center gap-2 px-4 py-2"
          style={{ background: `${cor}26`, borderBottom: `1px solid ${cor}44` }}
        >
          <Boxes size={18} color={cor} />
          <span className="flex-1 truncate text-[15px] font-extrabold uppercase tracking-wide text-foreground">
            {area.nome}
          </span>
          <span className="mr-0.5 text-[11.5px] font-bold" style={{ color: cor }}>
            {quantidadeSetores} setor(es)
          </span>
          <button
            className="nodrag rounded p-1 text-muted-foreground hover:bg-black/5 hover:text-foreground"
            title="Editar área"
            onClick={(e) => { e.stopPropagation(); onEdit(area); }}
          >
            <Pencil size={14} />
          </button>
          <button
            className="nodrag rounded p-1 text-red-500 hover:bg-red-500/10"
            title="Excluir área"
            onClick={(e) => { e.stopPropagation(); onDelete(area); }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </>
  );
}

export const AreaNode = memo(AreaNodeInner);
