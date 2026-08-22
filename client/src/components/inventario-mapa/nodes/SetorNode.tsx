import { memo } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import { Pencil, Trash2, Users } from "lucide-react";
import type { Setor } from "@shared/inventarioMapa";

export interface SetorNodeData {
  setor: Setor;
  quantidade: number;
  onEdit: (setor: Setor) => void;
  onDelete: (setor: Setor) => void;
  onResizeEnd: (id: string, dims: { x: number; y: number; width: number; height: number }) => void;
}

const MIN_WIDTH = 180;
const MIN_HEIGHT = 140;

function SetorNodeInner({ data, selected }: NodeProps) {
  const { setor, quantidade, onEdit, onDelete, onResizeEnd } = data as unknown as SetorNodeData;
  const cor = setor.cor;

  return (
    <>
      <NodeResizer
        color={cor}
        isVisible={!!selected}
        minWidth={MIN_WIDTH}
        minHeight={MIN_HEIGHT}
        lineStyle={{ borderColor: cor }}
        handleStyle={{ width: 8, height: 8, borderRadius: 2, background: cor }}
        onResizeEnd={(_, params) =>
          onResizeEnd(setor.id, { x: params.x, y: params.y, width: params.width, height: params.height })
        }
      />
      <div
        className="flex h-full w-full flex-col overflow-hidden rounded-2xl"
        style={{
          border: `1.5px ${selected ? "solid" : "dashed"} ${cor}`,
          background: `${cor}12`,
          boxShadow: selected ? `0 0 0 3px ${cor}22` : "none",
        }}
      >
        <div
          className="flex items-center gap-1.5 px-2.5 py-1.5"
          style={{ background: `${cor}22`, borderBottom: `1px solid ${cor}44` }}
        >
          <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: cor }} />
          <span className="flex-1 truncate text-[13px] font-bold text-foreground">{setor.nome}</span>
          <span className="mr-0.5 flex items-center gap-0.5 text-[11px] font-bold" style={{ color: cor }}>
            <Users size={12} />
            {quantidade}
          </span>
          <button
            className="nodrag rounded p-1 text-muted-foreground hover:bg-black/5 hover:text-foreground"
            title="Editar setor"
            onClick={(e) => { e.stopPropagation(); onEdit(setor); }}
          >
            <Pencil size={13} />
          </button>
          <button
            className="nodrag rounded p-1 text-red-500 hover:bg-red-500/10"
            title="Excluir setor"
            onClick={(e) => { e.stopPropagation(); onDelete(setor); }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </>
  );
}

export const SetorNode = memo(SetorNodeInner);
