import React, { useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Calendar, User, Tag, Edit2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type PurchasingTask = {
  id: number;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  assignedToId?: number | null;
  tags: string[];
  dueDate?: string | null;
  position: number;
  createdById: number;
  createdAt: Date;
  updatedAt: Date;
};

const COLUMNS = [
  { id: "todo", title: "A Fazer", color: "bg-gray-500" },
  { id: "quoting", title: "Cotando", color: "bg-blue-500" },
  { id: "awaiting_approval", title: "Aguardando Aprovação", color: "bg-yellow-500" },
  { id: "ordered", title: "Pedido Realizado", color: "bg-purple-500" },
  { id: "received", title: "Recebido", color: "bg-green-500" },
  { id: "completed", title: "Concluído", color: "bg-emerald-600" },
];

const PRIORITY_COLORS = {
  low: "bg-gray-200 text-gray-800",
  medium: "bg-blue-200 text-blue-800",
  high: "bg-orange-200 text-orange-800",
  urgent: "bg-red-200 text-red-800",
};

const PRIORITY_LABELS = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

interface TaskCardProps {
  task: PurchasingTask;
  onClick: (task: PurchasingTask) => void;
}

function TaskCard({ task, onClick }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onClick(task)}
      className="mb-2 cursor-pointer"
    >
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-3">
          <div className="space-y-2">
            <h4 className="font-medium text-sm">{task.title}</h4>
            
            {task.description && (
              <p className="text-xs text-muted-foreground line-clamp-2">
                {task.description}
              </p>
            )}

            <div className="flex flex-wrap gap-2 items-center">
              <Badge className={PRIORITY_COLORS[task.priority as keyof typeof PRIORITY_COLORS]}>
                {PRIORITY_LABELS[task.priority as keyof typeof PRIORITY_LABELS]}
              </Badge>

              {task.dueDate && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {format(new Date(task.dueDate), "dd/MM", { locale: ptBR })}
                </div>
              )}

              {task.tags && task.tags.length > 0 && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Tag className="h-3 w-3" />
                  {task.tags.length}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface ColumnHeaderProps {
  column: typeof COLUMNS[0];
  taskCount: number;
  customName?: string | null;
  onRename: (columnId: string) => void;
  onAddTask: () => void;
}

function ColumnHeader({ column, taskCount, customName, onRename, onAddTask }: ColumnHeaderProps) {
  return (
    <CardHeader className="pb-3">
      <div className="flex items-center justify-between">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 flex-1">
          <div className={`w-3 h-3 rounded-full ${column.color} flex-shrink-0`} />
          <div className="flex items-center gap-1">
            <span>{customName || column.title}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onRename(column.id)}
              className="h-5 w-5 p-0 opacity-40 hover:opacity-100 transition-opacity"
              title="Clique para renomear esta coluna"
            >
              <Edit2 className="h-3 w-3" />
            </Button>
          </div>
          <Badge variant="secondary" className="ml-1">
            {taskCount}
          </Badge>
        </CardTitle>
        <Button
          size="sm"
          variant="ghost"
          onClick={onAddTask}
          className="h-6 w-6 p-0"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </CardHeader>
  );
}

interface RenameColumnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columnId: string;
  currentName: string;
  onSave: (columnId: string, newName: string) => void;
}

function RenameColumnDialog({ open, onOpenChange, columnId, currentName, onSave }: RenameColumnDialogProps) {
  const [newName, setNewName] = useState(currentName);

  const handleSave = () => {
    if (newName.trim() && newName !== currentName) {
      onSave(columnId, newName.trim());
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Renomear Coluna</DialogTitle>
          <DialogDescription>
            Digite o novo nome para esta coluna do Kanban.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
            }}
            placeholder="Nome da coluna"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface PurchasingKanbanProps {
  tasks: PurchasingTask[];
  onTaskClick: (task: PurchasingTask) => void;
  onCreateTask: (status: string) => void;
}

export function PurchasingKanban({ tasks, onTaskClick, onCreateTask }: PurchasingKanbanProps) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renamingColumn, setRenamingColumn] = useState<{ id: string; name: string } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const utils = trpc.useUtils();
  const { data: columnSettings } = trpc.kanbanColumns.getAll.useQuery() as any;
  const saveColumnName = trpc.kanbanColumns.save.useMutation() as any;
  const updateTaskMutation = trpc.purchasingTasks.update.useMutation({
    onSuccess: () => {
      utils.purchasingTasks.list.invalidate();
    },
    onError: (error: any) => {
      const errorMsg = typeof error === 'string' ? error : (error?.message || "Erro desconhecido");
      toast.error("Erro ao mover tarefa: " + errorMsg);
    },
  });
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as number);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over) return;

    const taskId = active.id as number;
    const newStatus = over.id as string;

    const task = tasks.find(t => t.id === taskId);
    if (task && task.status !== newStatus) {
      updateTaskMutation.mutate({
        id: taskId,
        status: newStatus as any,
      });
    }

    setActiveId(null);
  };

  const handleRenameColumn = (columnId: string) => {
    const column = COLUMNS.find(c => c.id === columnId);
    if (!column) return;

    const customName = columnSettings?.find((s: any) => s.columnKey === columnId)?.customName;
    setRenamingColumn({ id: columnId, name: customName || column.title });
    setRenameDialogOpen(true);
  };

  const handleSaveColumnName = (columnId: string, newName: string) => {
    saveColumnName.mutate(
      { columnId, customName: newName },
      {
        onSuccess: () => {
          utils.kanbanColumns.getAll.invalidate();
          toast.success("Nome da coluna atualizado!");
        },
        onError: (error: any) => {
          toast.error("Erro ao atualizar nome da coluna");
        },
      }
    );
  };

  const getCustomName = (columnId: string) => {
    return columnSettings?.find((s: any) => s.columnKey === columnId)?.customName;
  };

  const activeTask = activeId ? tasks.find(t => t.id === activeId) : null;

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {COLUMNS.map((column) => {
            const columnTasks = tasks.filter((task) => task.status === column.id);
            const customName = getCustomName(column.id);

            return (
              <Card key={column.id} className="flex flex-col h-[600px]">
                <ColumnHeader
                  column={column}
                  taskCount={columnTasks.length}
                  customName={customName}
                  onRename={handleRenameColumn}
                  onAddTask={() => onCreateTask(column.id)}
                />
                <CardContent className="flex-1 overflow-y-auto">
                  <SortableContext
                    id={column.id}
                    items={columnTasks.map(t => t.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {columnTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onClick={onTaskClick}
                      />
                    ))}
                  </SortableContext>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <DragOverlay>
          {activeTask ? (
            <Card className="w-64 opacity-90 rotate-3 shadow-lg">
              <CardContent className="p-3">
                <h4 className="font-medium text-sm">{activeTask.title}</h4>
              </CardContent>
            </Card>
          ) : null}
        </DragOverlay>
      </DndContext>

      {renamingColumn && (
        <RenameColumnDialog
          open={renameDialogOpen}
          onOpenChange={setRenameDialogOpen}
          columnId={renamingColumn.id}
          currentName={renamingColumn.name}
          onSave={handleSaveColumnName}
        />
      )}
    </>
  );
}
