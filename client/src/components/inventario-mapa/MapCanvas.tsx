import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  ControlButton,
  MiniMap,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Node,
} from "@xyflow/react";
import { Maximize2, Minimize2 } from "lucide-react";
import { useTheme } from "next-themes";
import type { Area, Equipment, Position, Setor } from "@shared/inventarioMapa";
import { useNetworkMap } from "./NetworkMapContext";
import { EquipmentNode, type EquipmentNodeData } from "./nodes/EquipmentNode";
import { SetorNode, type SetorNodeData } from "./nodes/SetorNode";
import { AreaNode, type AreaNodeData } from "./nodes/AreaNode";
import { EquipmentPanel } from "./EquipmentPanel";
import { EquipmentFormDialog } from "./dialogs/EquipmentFormDialog";
import { SetorFormDialog } from "./dialogs/SetorFormDialog";
import { ConfirmDeleteDialog } from "./dialogs/ConfirmDeleteDialog";
import { equipmentColors } from "./constants";

const nodeTypes = { equipment: EquipmentNode, setor: SetorNode, area: AreaNode };

type Dims = { x: number; y: number; width: number; height: number };

interface BuildNodesArgs {
  equipments: Equipment[];
  setores: Setor[];
  areas: Area[];
  filteredIds: Set<string>;
  hasActiveFilter: boolean;
  equipCounts: Record<string, number>;
  setorCounts: Record<string, number>;
  onEditSetor: (setor: Setor) => void;
  onDeleteSetor: (setor: Setor) => void;
  onResizeSetorEnd: (id: string, dims: Dims) => void;
  onEditArea: (area: Area) => void;
  onDeleteArea: (area: Area) => void;
  onResizeAreaEnd: (id: string, dims: Dims) => void;
}

function buildNodes(args: BuildNodesArgs): Node[] {
  const {
    equipments, setores, areas, filteredIds, hasActiveFilter, equipCounts, setorCounts,
    onEditSetor, onDeleteSetor, onResizeSetorEnd, onEditArea, onDeleteArea, onResizeAreaEnd,
  } = args;

  // Ordem obrigatória no React Flow: pais antes dos filhos.
  const areaNodes: Node[] = areas.map((area) => ({
    id: area.id,
    type: "area",
    position: area.posicao,
    style: { width: area.tamanho.width, height: area.tamanho.height },
    data: {
      area,
      quantidadeSetores: setorCounts[area.id] ?? 0,
      onEdit: onEditArea,
      onDelete: onDeleteArea,
      onResizeEnd: onResizeAreaEnd,
    } satisfies AreaNodeData as unknown as Record<string, unknown>,
  }));

  const setorNodes: Node[] = setores.map((setor) => ({
    id: setor.id,
    type: "setor",
    position: setor.posicao,
    parentId: setor.areaId ?? undefined,
    style: { width: setor.tamanho.width, height: setor.tamanho.height },
    data: {
      setor,
      quantidade: equipCounts[setor.id] ?? 0,
      onEdit: onEditSetor,
      onDelete: onDeleteSetor,
      onResizeEnd: onResizeSetorEnd,
    } satisfies SetorNodeData as unknown as Record<string, unknown>,
  }));

  const equipmentNodes: Node[] = equipments.map((equipment) => ({
    id: equipment.id,
    type: "equipment",
    position: equipment.posicao,
    parentId: equipment.setorId ?? undefined,
    data: {
      equipment,
      dimmed: hasActiveFilter && !filteredIds.has(equipment.id),
    } satisfies EquipmentNodeData as unknown as Record<string, unknown>,
  }));

  return [...areaNodes, ...setorNodes, ...equipmentNodes];
}

export interface MapCanvasProps {
  /** Estado de tela cheia (maximizado no viewport). */
  maximized?: boolean;
  /** Alterna a tela cheia. Omitido = botão não aparece. */
  onToggleMaximize?: () => void;
}

export function MapCanvas({ maximized, onToggleMaximize }: MapCanvasProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const { getIntersectingNodes, getInternalNode } = useReactFlow();
  const {
    equipments, setores, areas, filteredEquipmentIds, searchTerm, filters,
    selectedEquipmentId, setSelectedEquipmentId,
    updatePosition, reparentEquipment, updateEquipment, deleteEquipment,
    updateSetor, deleteSetor, reparentSetor, updateArea, deleteArea,
  } = useNetworkMap();

  const hasActiveFilter =
    searchTerm.trim().length > 0 || filters.tipos.length > 0 || filters.status.length > 0;

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges] = useEdgesState([]);

  const [panelAnchor, setPanelAnchor] = useState<{ x: number; y: number } | null>(null);
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingSetor, setEditingSetor] = useState<Setor | null>(null);
  const [deletingSetor, setDeletingSetor] = useState<Setor | null>(null);
  const [editingArea, setEditingArea] = useState<Area | null>(null);
  const [deletingArea, setDeletingArea] = useState<Area | null>(null);

  const equipCounts = useMemo(() => {
    const acc: Record<string, number> = {};
    equipments.forEach((eq) => { if (eq.setorId) acc[eq.setorId] = (acc[eq.setorId] ?? 0) + 1; });
    return acc;
  }, [equipments]);

  const setorCounts = useMemo(() => {
    const acc: Record<string, number> = {};
    setores.forEach((s) => { if (s.areaId) acc[s.areaId] = (acc[s.areaId] ?? 0) + 1; });
    return acc;
  }, [setores]);

  const handleResizeSetorEnd = useCallback((id: string, dims: Dims) => {
    updateSetor(id, { posicao: { x: dims.x, y: dims.y }, tamanho: { width: dims.width, height: dims.height } });
  }, [updateSetor]);

  const handleResizeAreaEnd = useCallback((id: string, dims: Dims) => {
    updateArea(id, { posicao: { x: dims.x, y: dims.y }, tamanho: { width: dims.width, height: dims.height } });
  }, [updateArea]);

  useEffect(() => {
    setNodes(
      buildNodes({
        equipments, setores, areas, filteredIds: filteredEquipmentIds, hasActiveFilter,
        equipCounts, setorCounts,
        onEditSetor: setEditingSetor, onDeleteSetor: setDeletingSetor, onResizeSetorEnd: handleResizeSetorEnd,
        onEditArea: setEditingArea, onDeleteArea: setDeletingArea, onResizeAreaEnd: handleResizeAreaEnd,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipments, setores, areas, filteredEquipmentIds, hasActiveFilter, equipCounts, setorCounts]);

  useEffect(() => {
    if (selectedEquipmentId && !panelAnchor) {
      setPanelAnchor({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEquipmentId]);

  const selectedEquipment = useMemo(
    () => equipments.find((eq) => eq.id === selectedEquipmentId) ?? null,
    [equipments, selectedEquipmentId],
  );

  const absOf = useCallback((n: Node): Position => {
    const internal = getInternalNode(n.id);
    return internal?.internals.positionAbsolute ?? n.position;
  }, [getInternalNode]);

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    if (node.type !== "equipment") {
      setSelectedEquipmentId(null);
      setPanelAnchor(null);
      return;
    }
    setSelectedEquipmentId(node.id);
    setPanelAnchor({ x: event.clientX, y: event.clientY });
  }, [setSelectedEquipmentId]);

  const onPaneClick = useCallback(() => {
    setSelectedEquipmentId(null);
    setPanelAnchor(null);
  }, [setSelectedEquipmentId]);

  const onNodeDragStop = useCallback((_: MouseEvent | TouchEvent, node: Node) => {
    if (node.type === "area") {
      updateArea(node.id, { posicao: node.position });
      return;
    }

    if (node.type === "setor") {
      const abs = absOf(node);
      const areaAlvo = getIntersectingNodes(node).find((n) => n.type === "area");
      if (areaAlvo) {
        const areaAbs = absOf(areaAlvo);
        const rel: Position = { x: abs.x - areaAbs.x, y: abs.y - areaAbs.y };
        if (node.parentId === areaAlvo.id) updateSetor(node.id, { posicao: node.position });
        else reparentSetor(node.id, areaAlvo.id, rel);
      } else if (node.parentId) {
        reparentSetor(node.id, null, abs);
      } else {
        updateSetor(node.id, { posicao: node.position });
      }
      return;
    }

    // Equipamento
    const abs = absOf(node);
    const setorAlvo = getIntersectingNodes(node).find((n) => n.type === "setor");
    if (setorAlvo) {
      const setorAbs = absOf(setorAlvo);
      const rel: Position = { x: abs.x - setorAbs.x, y: abs.y - setorAbs.y };
      if (node.parentId === setorAlvo.id) updatePosition(node.id, node.position);
      else reparentEquipment(node.id, setorAlvo.id, rel);
    } else if (node.parentId) {
      reparentEquipment(node.id, null, abs);
    } else {
      updatePosition(node.id, node.position);
    }
  }, [absOf, getIntersectingNodes, updatePosition, reparentEquipment, updateSetor, reparentSetor, updateArea]);

  return (
    <div className="relative h-full flex-1">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={onNodeClick}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={onPaneClick}
        nodesConnectable={false}
        deleteKeyCode={null}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.3} color={isDark ? "#1E293B" : "#CBD5E1"} />
        <Controls showInteractive={false}>
          {onToggleMaximize && (
            <ControlButton
              onClick={onToggleMaximize}
              title={maximized ? "Sair da tela cheia (Esc)" : "Tela cheia"}
              aria-label={maximized ? "Sair da tela cheia" : "Tela cheia"}
            >
              {maximized ? <Minimize2 /> : <Maximize2 />}
            </ControlButton>
          )}
        </Controls>
        <MiniMap
          pannable
          zoomable
          maskColor={isDark ? "rgba(10,15,28,0.75)" : "rgba(238,241,246,0.75)"}
          nodeColor={(n) => {
            if (n.type === "area") return `${(n.data as unknown as AreaNodeData).area.cor}55`;
            if (n.type === "setor") return (n.data as unknown as SetorNodeData).setor.cor;
            return equipmentColors[(n.data as unknown as EquipmentNodeData).equipment.tipo];
          }}
          style={{
            background: isDark ? "#111A2C" : "#FFFFFF",
            border: `1px solid ${isDark ? "rgba(148,163,184,0.14)" : "rgba(15,23,42,0.1)"}`,
          }}
        />
      </ReactFlow>

      {selectedEquipment && panelAnchor && (
        <EquipmentPanel
          equipment={selectedEquipment}
          anchor={panelAnchor}
          onClose={onPaneClick}
          onEdit={() => setEditingEquipment(selectedEquipment)}
          onDelete={() => setDeletingId(selectedEquipment.id)}
        />
      )}

      <EquipmentFormDialog
        open={!!editingEquipment}
        equipment={editingEquipment}
        setores={setores}
        onClose={() => setEditingEquipment(null)}
        onSubmit={(data) => {
          if (editingEquipment) {
            const proximoSetor = data.setorId ?? null;
            if (proximoSetor !== editingEquipment.setorId) {
              const posicao: Position = proximoSetor ? { x: 24, y: 64 } : editingEquipment.posicao;
              reparentEquipment(editingEquipment.id, proximoSetor, posicao);
            }
            const { setorId, ...resto } = data;
            updateEquipment(editingEquipment.id, resto);
          }
          setEditingEquipment(null);
        }}
      />

      <SetorFormDialog
        open={!!editingSetor}
        titulo="Editar setor"
        valor={editingSetor}
        areas={areas}
        areaIdAtual={editingSetor?.areaId ?? null}
        onClose={() => setEditingSetor(null)}
        onSubmit={(data) => {
          if (editingSetor) {
            const proximaArea = data.areaId;
            if (proximaArea !== editingSetor.areaId) {
              const posicao: Position = proximaArea ? { x: 24, y: 56 } : editingSetor.posicao;
              reparentSetor(editingSetor.id, proximaArea, posicao);
            }
            updateSetor(editingSetor.id, { nome: data.nome, cor: data.cor });
          }
          setEditingSetor(null);
        }}
      />

      <SetorFormDialog
        open={!!editingArea}
        titulo="Editar área"
        valor={editingArea}
        onClose={() => setEditingArea(null)}
        onSubmit={(data) => {
          if (editingArea) updateArea(editingArea.id, { nome: data.nome, cor: data.cor });
          setEditingArea(null);
        }}
      />

      <ConfirmDeleteDialog
        open={!!deletingId}
        title="Excluir equipamento"
        description="Esta ação removerá o equipamento do mapa. Deseja continuar?"
        onCancel={() => setDeletingId(null)}
        onConfirm={() => {
          if (deletingId) { deleteEquipment(deletingId); setPanelAnchor(null); }
          setDeletingId(null);
        }}
      />

      <ConfirmDeleteDialog
        open={!!deletingSetor}
        title="Excluir setor"
        description="O setor será removido. Os equipamentos que estavam dentro dele continuarão no mapa, porém sem setor. Deseja continuar?"
        onCancel={() => setDeletingSetor(null)}
        onConfirm={() => { if (deletingSetor) deleteSetor(deletingSetor.id); setDeletingSetor(null); }}
      />

      <ConfirmDeleteDialog
        open={!!deletingArea}
        title="Excluir área"
        description="A área será removida. Os setores que estavam dentro dela continuarão no mapa, porém sem área. Deseja continuar?"
        onCancel={() => setDeletingArea(null)}
        onConfirm={() => { if (deletingArea) deleteArea(deletingArea.id); setDeletingArea(null); }}
      />
    </div>
  );
}
