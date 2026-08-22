import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, CheckCircle2, Circle, Clock, Trash2, Calendar as CalendarIcon, User } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface DailyTasksPanelProps {
  projectId: number;
}

export function DailyTasksPanel({ projectId }: DailyTasksPanelProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    priority: 'Média' as 'Baixa' | 'Média' | 'Alta' | 'Crítica',
    dueDate: '',
  });

  const utils = trpc.useUtils();
  const { data: tasks = [], isLoading } = trpc.dailyTasks.listByProject.useQuery({ projectId });

  const createMutation = trpc.dailyTasks.create.useMutation({
    onSuccess: () => {
      utils.dailyTasks.listByProject.invalidate({ projectId });
      utils.dailyTasks.getToday.invalidate();
      toast.success('Tarefa criada com sucesso');
      setIsCreateOpen(false);
      setNewTask({ title: '', description: '', priority: 'Média', dueDate: '' });
    },
    onError: (error) => {
      toast.error(error.message || 'Erro ao criar tarefa');
    },
  });

  const completeMutation = trpc.dailyTasks.complete.useMutation({
    onSuccess: () => {
      utils.dailyTasks.listByProject.invalidate({ projectId });
      utils.dailyTasks.getToday.invalidate();
      toast.success('Tarefa concluída');
    },
  });

  const deleteMutation = trpc.dailyTasks.delete.useMutation({
    onSuccess: () => {
      utils.dailyTasks.listByProject.invalidate({ projectId });
      utils.dailyTasks.getToday.invalidate();
      toast.success('Tarefa excluída');
    },
  });

  const handleCreate = () => {
    if (!newTask.title.trim()) {
      toast.error('Título é obrigatório');
      return;
    }

    const dueDate = newTask.dueDate ? new Date(newTask.dueDate).getTime() : undefined;

    createMutation.mutate({
      projectId,
      title: newTask.title,
      description: newTask.description || undefined,
      priority: newTask.priority,
      dueDate,
    });
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Crítica': return 'text-red-600 bg-red-50 border-red-200';
      case 'Alta': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'Média': return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'Baixa': return 'text-gray-600 bg-gray-50 border-gray-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Concluída': return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'Em Andamento': return <Clock className="w-5 h-5 text-yellow-600" />;
      default: return <Circle className="w-5 h-5 text-muted-foreground" />;
    }
  };

  if (isLoading) {
    return <div className="text-center py-8">Carregando tarefas...</div>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Tarefas Diárias</CardTitle>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Nova Tarefa
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Tarefa Diária</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Título *</label>
                <Input
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  placeholder="Ex: Revisar documentação"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Descrição</label>
                <Textarea
                  value={newTask.description}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                  placeholder="Detalhes da tarefa..."
                  rows={3}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Prioridade</label>
                <Select
                  value={newTask.priority}
                  onValueChange={(value: any) => setNewTask({ ...newTask, priority: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Baixa">Baixa</SelectItem>
                    <SelectItem value="Média">Média</SelectItem>
                    <SelectItem value="Alta">Alta</SelectItem>
                    <SelectItem value="Crítica">Crítica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Data de Vencimento</label>
                <Input
                  type="date"
                  value={newTask.dueDate}
                  onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleCreate} disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Criando...' : 'Criar'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhuma tarefa criada ainda
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => (
              <div
                key={task.id}
                className={`flex items-start gap-3 p-3 rounded-lg border ${
                  task.status === 'Concluída' ? 'opacity-60' : ''
                }`}
              >
                <button
                  onClick={() => {
                    if (task.status !== 'Concluída') {
                      completeMutation.mutate({ id: task.id });
                    }
                  }}
                  className="mt-0.5"
                  disabled={task.status === 'Concluída'}
                >
                  {getStatusIcon(task.status)}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className={`font-medium ${task.status === 'Concluída' ? 'line-through' : ''}`}>
                      {task.title}
                    </h4>
                    <span className={`text-xs px-2 py-1 rounded-full border ${getPriorityColor(task.priority)}`}>
                      {task.priority}
                    </span>
                  </div>
                  {task.description && (
                    <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs flex-wrap">
                    {task.dueDate && (
                      <span className="text-blue-700 flex items-center gap-1">
                        <CalendarIcon className="w-3 h-3" /><span className="font-semibold">Vencimento:</span> {format(new Date(task.dueDate), 'dd/MM/yyyy', { locale: ptBR })}
                      </span>
                    )}
                    {task.assignedToName && (
                      <span className="text-blue-700 flex items-center gap-1"><User className="w-3 h-3" /><span className="font-semibold">Responsável:</span> {task.assignedToName}</span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (confirm('Deseja excluir esta tarefa?')) {
                      deleteMutation.mutate({ id: task.id });
                    }
                  }}
                >
                  <Trash2 className="w-4 h-4 text-red-600" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
