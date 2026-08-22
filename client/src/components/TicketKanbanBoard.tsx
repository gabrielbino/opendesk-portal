import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertCircle,
  Clock,
  Pause,
  CheckCircle,
  XCircle,
  User,
  UserCheck,
  ChevronDown,
  GripVertical,
  RotateCcw,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { Ticket } from "@/pages/Dashboard";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  pointerWithin,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
  useDroppable,
  MeasuringStrategy,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTicketView } from "@/contexts/TicketViewContext";

// ─── Column definitions ────────────────────────────────────────────────────────

const DEFAULT_COLUMNS = [
  { id: "Novos", title: "Novos", color: "bg-blue-400" },
  { id: "Em Andamento", title: "Em Andamento", color: "bg-yellow-400" },
  { id: "Pendente Cliente", title: "Pendente Cliente", color: "bg-purple-400" },
  { id: "Em Análise", title: "Em Análise", color: "bg-green-400" },
  { id: "Pendente ERP", title: "Pendente ERP", color: "bg-orange-400" },
  { id: "Resolvido / Aguardando Validação", title: "Resolvido", color: "bg-amber-400" },
  { id: "Concluído", title: "Concluído", color: "bg-emerald-400" },
] as const;

type ColumnDef = { id: string; title: string; color: string };

const STORAGE_KEY = "kanban-column-order";

function loadColumnOrder(): string[] | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const order = JSON.parse(stored) as string[];
      // Validate that all columns are present
      const defaultIds = DEFAULT_COLUMNS.map((c) => c.id);
      if (
        order.length === defaultIds.length &&
        defaultIds.every((id) => order.includes(id))
      ) {
        return order;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function saveColumnOrder(order: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  } catch {
    // ignore
  }
}

function getOrderedColumns(order: string[] | null): ColumnDef[] {
  if (!order) return [...DEFAULT_COLUMNS];
  return order
    .map((id) => DEFAULT_COLUMNS.find((c) => c.id === id))
    .filter(Boolean) as ColumnDef[];
}

// ─── DraggableTicketCard ──────────────────────────────────────────────────────

function DraggableTicketCard({
  ticket,
  admins,
  onStatusChange,
  onAssign,
  onSelect,
}: {
  ticket: Ticket;
  admins: { id: number; name: string }[];
  onStatusChange: (id: number, status: string) => void;
  onAssign: (id: number, adminId: number, adminName: string) => void;
  onSelect: (ticket: Ticket) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({
    id: `ticket-${ticket.id}`,
    data: { type: "ticket", ticket },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };

  const priorityColors: Record<string, string> = {
    CRÍTICA: "bg-red-100 text-red-800",
    ALTA: "bg-orange-100 text-orange-800",
    MÉDIA: "bg-yellow-100 text-yellow-800",
    BAIXA: "bg-green-100 text-green-800",
  };

  const statusColors: Record<string, string> = {
    Novos: "bg-blue-100 text-blue-800",
    "Em Andamento": "bg-yellow-100 text-yellow-800",
    "Pendente Cliente": "bg-purple-100 text-purple-800",
    "Em Análise": "bg-green-100 text-green-800",
    "Pendente ERP": "bg-orange-100 text-orange-800",
    Concluído: "bg-emerald-100 text-emerald-800",
    "Resolvido / Aguardando Validação": "bg-amber-100 text-amber-800",
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="bg-white rounded-lg border border-gray-200 p-3 cursor-move hover:shadow-md transition-shadow"
      onClick={() => onSelect(ticket)}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-muted-foreground">#{ticket.id}</p>
          <p className="text-sm font-semibold text-gray-800 truncate">{ticket.title}</p>
        </div>
        <span className={`text-xs font-bold px-2 py-1 rounded whitespace-nowrap flex-shrink-0 ${priorityColors[ticket.priority] || "bg-gray-100 text-gray-800"}`}>
          {ticket.priority}
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <span className={`px-2 py-1 rounded ${statusColors[ticket.status] || "bg-gray-100 text-gray-800"}`}>
            {ticket.status}
          </span>
        </div>

        <div className="flex items-center justify-between text-xs text-gray-600">
          <div className="flex items-center gap-1">
            {ticket.assignedToName ? (
              <>
                <UserCheck className="w-3 h-3" />
                <span>{ticket.assignedToName}</span>
              </>
            ) : (
              <>
                <User className="w-3 h-3" />
                <span>Não atribuído</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 justify-between">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                Atribuir
                <ChevronDown className="w-3 h-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40">
              {admins.map((admin) => (
                <DropdownMenuItem
                  key={admin.id}
                  onClick={() => onAssign(ticket.id, admin.id, admin.name)}
                >
                  {admin.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                {formatDistanceToNow(new Date(ticket.createdAt), {
                  addSuffix: true,
                  locale: ptBR,
                })}
              </div>
            </TooltipTrigger>
            <TooltipContent side="top">
              {new Date(ticket.createdAt).toLocaleString("pt-BR")}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </motion.div>
  );
}

// ─── SortableKanbanColumn ─────────────────────────────────────────────────────

function SortableKanbanColumn({
  column,
  tickets,
  admins,
  onStatusChange,
  onAssign,
  onSelect,
  isDraggingColumn,
}: {
  column: ColumnDef;
  tickets: Ticket[];
  admins: { id: number; name: string }[];
  onStatusChange: (id: number, status: string) => void;
  onAssign: (id: number, adminId: number, adminName: string) => void;
  onSelect: (ticket: Ticket) => void;
  isDraggingColumn: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef: setSortableNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `col-sortable-${column.id}`,
    data: { type: "column", column },
  });

  const ticketIds = tickets.map((t) => `ticket-${t.id}`);
  const { setNodeRef: setDroppableNodeRef } = useDroppable({
    id: `column-${column.id}`,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    width: "clamp(240px, 18vw, 300px)",
  };

  return (
    <div
      ref={setSortableNodeRef}
      style={style}
      className={`flex-shrink-0 flex flex-col rounded-xl bg-gray-50 border transition-all duration-200 ${
        isDragging
          ? "border-blue-400 shadow-lg shadow-blue-100 ring-2 ring-blue-200"
          : "border-gray-200"
      }`}
      data-column-id={column.id}
      id={`column-${column.id}`}
    >
      {/* Column header with drag handle */}
      <div
        className="px-3 py-2.5 border-b border-gray-200 cursor-grab active:cursor-grabbing select-none"
        {...attributes}
        {...listeners}
      >
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <GripVertical className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className={`w-3 h-3 rounded-full ${column.color} flex-shrink-0`} />
            <span className="text-sm font-semibold text-gray-700">{column.title}</span>
          </div>
          <span className="text-xs font-bold text-foreground bg-gray-200 rounded-full px-2 py-0.5 min-w-[22px] text-center">
            {tickets.length}
          </span>
        </div>
        <div className={`h-1 rounded-full ${column.color} opacity-60`} />
      </div>

      {/* Cards - Droppable area */}
      <SortableContext items={ticketIds} strategy={verticalListSortingStrategy}>
        <div
          ref={setDroppableNodeRef}
          className="flex-1 overflow-y-auto p-2 space-y-2 max-h-[calc(100vh-260px)]"
          style={{ minHeight: "40px" }}
        >
          <AnimatePresence>
            {tickets.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground">
                Nenhum chamado
              </div>
            ) : (
              tickets.map((ticket) => (
                <DraggableTicketCard
                  key={ticket.id}
                  ticket={ticket}
                  admins={admins}
                  onStatusChange={onStatusChange}
                  onAssign={onAssign}
                  onSelect={onSelect}
                />
              ))
            )}
          </AnimatePresence>
        </div>
      </SortableContext>
    </div>
  );
}

// ─── TicketKanbanBoard ────────────────────────────────────────────────────────

export function TicketKanbanBoard({
  tickets: initialTickets,
  adminUsers,
  onSelectTicket,
}: {
  tickets: Ticket[];
  adminUsers: { id: number; name: string }[];
  onSelectTicket: (ticket: Ticket) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<"ticket" | "column" | null>(null);
  const [localTickets, setLocalTickets] = useState<Ticket[]>(initialTickets);
  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    const stored = loadColumnOrder();
    return stored || DEFAULT_COLUMNS.map((c) => c.id);
  });
  const { data: serverTickets = initialTickets } = trpc.tickets.list.useQuery();
  const utils = trpc.useUtils();
  const tickets = localTickets;

  const orderedColumns = useMemo(() => getOrderedColumns(columnOrder), [columnOrder]);
  const columnSortableIds = useMemo(
    () => orderedColumns.map((c) => `col-sortable-${c.id}`),
    [orderedColumns]
  );

  const isDefaultOrder = useMemo(() => {
    const defaultOrder = DEFAULT_COLUMNS.map((c) => c.id);
    return columnOrder.every((id, i) => id === defaultOrder[i]);
  }, [columnOrder]);

  const updateTicketMutation = trpc.tickets.update.useMutation({
    onMutate: async (newData) => {
      await utils.tickets.list.cancel();
      const previousTickets = localTickets;
      setLocalTickets((prev) =>
        prev.map((t) =>
          t.id === newData.id
            ? { ...t, status: newData.status as string, order: newData.order ?? t.order }
            : t
        )
      );
      return { previousTickets };
    },
    onError: (err, newData, context) => {
      if (context?.previousTickets) setLocalTickets(context.previousTickets);
      toast.error("Erro ao atualizar chamado");
    },
    onSuccess: () => utils.tickets.list.invalidate(),
  });

  useEffect(() => {
    setLocalTickets(serverTickets);
  }, [serverTickets]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const activeStr = active.id.toString();

    if (activeStr.startsWith("col-sortable-")) {
      setActiveType("column");
      setActiveId(activeStr);
    } else if (activeStr.startsWith("ticket-")) {
      setActiveType("ticket");
      setActiveId(activeStr);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setActiveType(null);

    if (!over) return;

    const activeStr = active.id.toString();
    const overStr = over.id.toString();

    // ── Column reorder ──
    if (activeStr.startsWith("col-sortable-") && overStr.startsWith("col-sortable-")) {
      const activeColId = activeStr.replace("col-sortable-", "");
      const overColId = overStr.replace("col-sortable-", "");

      if (activeColId !== overColId) {
        const oldIndex = columnOrder.indexOf(activeColId);
        const newIndex = columnOrder.indexOf(overColId);

        if (oldIndex !== -1 && newIndex !== -1) {
          const newOrder = arrayMove(columnOrder, oldIndex, newIndex);
          setColumnOrder(newOrder);
          saveColumnOrder(newOrder);
          toast.success("Colunas reordenadas");
        }
      }
      return;
    }

    // ── Ticket drag ──
    if (activeStr.startsWith("ticket-")) {
      const activeTicketId = parseInt(activeStr.split("-")[1]);
      const activeTicket = tickets.find((t) => t.id === activeTicketId);

      if (!activeTicket) return;

      let overColumnId: string | null = null;
      let overTicketId: number | null = null;

      if (overStr.startsWith("column-")) {
        overColumnId = overStr.replace("column-", "");
      } else if (overStr.startsWith("ticket-")) {
        overTicketId = parseInt(overStr.split("-")[1]);
        const overTicket = tickets.find((t) => t.id === overTicketId);
        overColumnId = overTicket?.status || null;
      }

      if (!overColumnId) return;

      if (activeTicket.status !== overColumnId) {
        updateTicketMutation.mutate({
          id: activeTicketId,
          status: overColumnId as any,
        });
        toast.success(`Chamado movido para "${overColumnId}"`);
      } else if (overTicketId && overTicketId !== activeTicketId) {
        const columnTickets = tickets.filter((t) => t.status === overColumnId);
        const activeIndex = columnTickets.findIndex((t) => t.id === activeTicketId);
        const overIndex = columnTickets.findIndex((t) => t.id === overTicketId);

        if (activeIndex !== -1 && overIndex !== -1) {
          const reorderedTickets = Array.from(columnTickets);
          const [movedTicket] = reorderedTickets.splice(activeIndex, 1);
          reorderedTickets.splice(overIndex, 0, movedTicket);

          reorderedTickets.forEach((ticket, idx) => {
            updateTicketMutation.mutate({
              id: ticket.id,
              order: idx,
            });
          });
          toast.success("Ordem atualizada");
        }
      }
    }
  };

  const handleStatusChange = (ticketId: number, newStatus: string) => {
    updateTicketMutation.mutate({ id: ticketId, status: newStatus as any });
    toast.success(`Chamado movido para "${newStatus}"`);
  };

  const handleAssign = (ticketId: number, adminId: number, adminName: string) => {
    updateTicketMutation.mutate({
      id: ticketId,
      assignedToId: adminId,
      assignedToName: adminName,
    });
    toast.success(`Chamado atribuído para ${adminName}`);
  };

  const handleResetColumnOrder = () => {
    const defaultOrder = DEFAULT_COLUMNS.map((c) => c.id);
    setColumnOrder(defaultOrder);
    saveColumnOrder(defaultOrder);
    toast.success("Ordem das colunas restaurada");
  };

  // Group tickets by status and sort by order
  const grouped = orderedColumns.reduce(
    (acc, col) => {
      acc[col.id] = tickets
        .filter((t) => t.status === col.id)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      return acc;
    },
    {} as Record<string, Ticket[]>
  );

  // Find the active dragging column for overlay
  const activeColumn = activeType === "column" && activeId
    ? orderedColumns.find((c) => `col-sortable-${c.id}` === activeId)
    : null;

  // Find the active dragging ticket for overlay
  const activeTicket = activeType === "ticket" && activeId
    ? tickets.find((t) => `ticket-${t.id}` === activeId)
    : null;

  return (
    <div className="flex flex-col gap-2">
      {/* Reset button - only visible when order is customized */}
      {!isDefaultOrder && (
        <div className="flex justify-end px-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResetColumnOrder}
            className="text-xs text-muted-foreground hover:text-foreground gap-1.5 h-7"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restaurar ordem padrão
          </Button>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        measuring={{
          droppable: {
            strategy: MeasuringStrategy.Always,
          },
        }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          setActiveId(null);
          setActiveType(null);
        }}
      >
        <SortableContext items={columnSortableIds} strategy={horizontalListSortingStrategy}>
          <div className="kanban-scroll-outer">
            <div
              className="flex gap-3 pb-4"
              style={{ minWidth: "max-content" }}
            >
              {orderedColumns.map((col) => (
                <SortableKanbanColumn
                  key={col.id}
                  column={col}
                  tickets={grouped[col.id] ?? []}
                  admins={adminUsers}
                  onStatusChange={handleStatusChange}
                  onAssign={handleAssign}
                  onSelect={onSelectTicket}
                  isDraggingColumn={activeType === "column"}
                />
              ))}
            </div>
          </div>
        </SortableContext>

        <DragOverlay dropAnimation={null}>
          {activeColumn && (
            <div
              className="flex-shrink-0 flex flex-col rounded-xl bg-blue-50 border-2 border-blue-400 shadow-xl shadow-blue-200/50 opacity-90"
              style={{ width: "clamp(240px, 18vw, 300px)" }}
            >
              <div className="px-3 py-2.5 border-b border-blue-300">
                <div className="flex items-center gap-2 mb-1.5">
                  <GripVertical className="w-4 h-4 text-blue-500" />
                  <span className={`w-3 h-3 rounded-full ${activeColumn.color}`} />
                  <span className="text-sm font-semibold text-blue-700">
                    {activeColumn.title}
                  </span>
                  <span className="ml-auto text-xs font-bold text-blue-600 bg-blue-200 rounded-full px-2 py-0.5">
                    {(grouped[activeColumn.id] ?? []).length}
                  </span>
                </div>
                <div className={`h-1 rounded-full ${activeColumn.color} opacity-60`} />
              </div>
              <div className="p-2 text-center text-xs text-blue-500 py-6">
                {(grouped[activeColumn.id] ?? []).length} chamado(s)
              </div>
            </div>
          )}
          {activeTicket && (
            <div className="bg-white rounded-xl border border-gray-300 shadow-lg p-3 max-w-xs opacity-90">
              <p className="text-sm font-semibold text-gray-800">
                {activeTicket.title}
              </p>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
