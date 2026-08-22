import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { PurchasingKanban } from "@/components/PurchasingKanban";
import PurchasingLayout from '@/components/PurchasingLayout';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Plus } from "lucide-react";
import { Link } from "wouter";

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

export default function PurchasingTasks() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<PurchasingTask | null>(null);
  const [defaultStatus, setDefaultStatus] = useState<string>("todo");
  
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    priority: "medium" as "low" | "medium" | "high" | "urgent",
    assignedToId: undefined as number | undefined,
    tags: [] as string[],
    dueDate: "",
  });

  const { data: tasks = [], refetch } = (trpc as any).purchasingTasks.list.useQuery();
  const { data: users = [] } = (trpc as any).userManagement.listUsers.useQuery();
  
  const createMutation = (trpc as any).purchasingTasks.create.useMutation({
    onSuccess: () => {
      toast.success("Tarefa criada com sucesso!");
      refetch();
      setIsCreateModalOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(`Erro ao criar tarefa: ${error.message}`);
    },
  });

  const updateMutation = (trpc as any).purchasingTasks.update.useMutation({
    onSuccess: () => {
      toast.success("Tarefa atualizada com sucesso!");
      refetch();
      setIsEditModalOpen(false);
      setSelectedTask(null);
    },
    onError: (error: any) => {
      toast.error(`Erro ao atualizar tarefa: ${error.message}`);
    },
  });

  const deleteMutation = (trpc as any).purchasingTasks.delete.useMutation({
    onSuccess: () => {
      toast.success("Tarefa excluída com sucesso!");
      refetch();
      setIsEditModalOpen(false);
      setSelectedTask(null);
    },
    onError: (error: any) => {
      toast.error(`Erro ao excluir tarefa: ${error.message}`);
    },
  });

  const resetForm = () => {
    setNewTask({
      title: "",
      description: "",
      priority: "medium",
      assignedToId: undefined,
      tags: [],
      dueDate: "",
    });
  };

  const handleCreateTask = (status: string) => {
    setDefaultStatus(status);
    setIsCreateModalOpen(true);
  };

  const handleTaskMove = (taskId: number, newStatus: string) => {
    updateMutation.mutate({ id: taskId, status: newStatus as any });
  };

  const handleTaskClick = (task: PurchasingTask) => {
    setSelectedTask(task);
    setIsEditModalOpen(true);
  };

  const handleSubmitCreate = () => {
    if (!newTask.title.trim()) {
      toast.error("Título é obrigatório");
      return;
    }

    createMutation.mutate({
      ...newTask,
      tags: newTask.tags || [],
      status: defaultStatus as any,
      position: 0,
    });
  };

  const handleSubmitEdit = () => {
    if (!selectedTask) return;

    updateMutation.mutate({
      id: selectedTask.id,
      title: selectedTask.title,
      description: selectedTask.description || undefined,
      priority: selectedTask.priority as any,
      assignedToId: selectedTask.assignedToId || undefined,
      tags: selectedTask.tags,
      dueDate: selectedTask.dueDate || undefined,
    });
  };

  const handleDelete = () => {
    if (!selectedTask) return;
    
    if (confirm("Tem certeza que deseja excluir esta tarefa?")) {
      deleteMutation.mutate({ id: selectedTask.id });
    }
  };

  return (
    <PurchasingLayout 
      title="Tarefas Diárias" 
      description="Kanban de tarefas do setor de compras"
    >
      <div className="max-w-full mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-end mb-6">
          <Button onClick={() => handleCreateTask("todo")}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Tarefa
          </Button>
        </div>

        {/* Kanban Board */}
        <PurchasingKanban
          tasks={tasks}
          onTaskClick={handleTaskClick}
          onCreateTask={handleCreateTask}
        />

        {/* Create Task Modal */}
        <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Nova Tarefa</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="title">Título *</Label>
                <Input
                  id="title"
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  placeholder="Ex: Cotar medicamento X"
                />
              </div>

              <div>
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  value={newTask.description}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                  placeholder="Detalhes da tarefa..."
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="priority">Prioridade</Label>
                  <Select
                    value={newTask.priority}
                    onValueChange={(value) => setNewTask({ ...newTask, priority: value as any })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Baixa</SelectItem>
                      <SelectItem value="medium">Média</SelectItem>
                      <SelectItem value="high">Alta</SelectItem>
                      <SelectItem value="urgent">Urgente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="assignedTo">Responsável</Label>
                  <Select
                    value={newTask.assignedToId?.toString() || "unassigned"}
                    onValueChange={(value) => setNewTask({ ...newTask, assignedToId: value === "unassigned" ? undefined : parseInt(value) })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Nenhum</SelectItem>
                      {users.map((user: any) => (
                        <SelectItem key={user.id} value={user.id.toString()}>
                          {user.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="dueDate">Prazo</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={newTask.dueDate}
                  onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="tags">Etiquetas (separadas por vírgula)</Label>
                <Input
                  id="tags"
                  value={(newTask.tags || []).join(", ")}
                  onChange={(e) => setNewTask({ ...newTask, tags: e.target.value.split(",").map(t => t.trim()).filter(Boolean) })}
                  placeholder="Ex: Urgente, Estoque Baixo"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSubmitCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Criando..." : "Criar Tarefa"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Task Modal */}
        <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Editar Tarefa</DialogTitle>
            </DialogHeader>
            
            {selectedTask && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="edit-title">Título *</Label>
                  <Input
                    id="edit-title"
                    value={selectedTask.title}
                    onChange={(e) => setSelectedTask({ ...selectedTask, title: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="edit-description">Descrição</Label>
                  <Textarea
                    id="edit-description"
                    value={selectedTask.description || ""}
                    onChange={(e) => setSelectedTask({ ...selectedTask, description: e.target.value })}
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit-priority">Prioridade</Label>
                    <Select
                      value={selectedTask.priority}
                      onValueChange={(value) => setSelectedTask({ ...selectedTask, priority: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Baixa</SelectItem>
                        <SelectItem value="medium">Média</SelectItem>
                        <SelectItem value="high">Alta</SelectItem>
                        <SelectItem value="urgent">Urgente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="edit-assignedTo">Responsável</Label>
                    <Select
                      value={selectedTask.assignedToId?.toString() || "unassigned"}
                      onValueChange={(value) => setSelectedTask({ ...selectedTask, assignedToId: value === "unassigned" ? undefined : parseInt(value) })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Nenhum</SelectItem>
                        {users.map((user: any) => (
                          <SelectItem key={user.id} value={user.id.toString()}>
                            {user.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="edit-dueDate">Prazo</Label>
                  <Input
                    id="edit-dueDate"
                    type="date"
                    value={selectedTask.dueDate || ""}
                    onChange={(e) => setSelectedTask({ ...selectedTask, dueDate: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="edit-tags">Etiquetas (separadas por vírgula)</Label>
                  <Input
                    id="edit-tags"
                    value={(selectedTask.tags || []).join(", ")}
                    onChange={(e) => setSelectedTask({ ...selectedTask, tags: e.target.value.split(",").map(t => t.trim()).filter(Boolean) })}
                  />
                </div>
              </div>
            )}

            <DialogFooter className="flex justify-between">
              <Button variant="destructive" onClick={handleDelete}>
                Excluir
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSubmitEdit} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PurchasingLayout>
  );
}
