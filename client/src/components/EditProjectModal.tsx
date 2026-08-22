import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Plus, Trash2, Check, Pencil } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface EditProjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
  onSuccess?: () => void;
}

export default function EditProjectModal({ open, onOpenChange, projectId, onSuccess }: EditProjectModalProps) {
  const utils = trpc.useUtils();
  
  // Fetch project data
  const { data: project, isLoading: projectLoading } = trpc.projects.getById.useQuery(
    { id: projectId },
    { enabled: open && projectId > 0 }
  );

  // Fetch phases
  const { data: phases = [], isLoading: phasesLoading } = trpc.projectPhases.listByProject.useQuery(
    { projectId },
    { enabled: open && projectId > 0 }
  );

  // Fetch users for owner selection
  const { data: users = [] } = trpc.users.list.useQuery(
    undefined,
    { enabled: open }
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"Baixa" | "Média" | "Alta" | "Crítica">("Média");
  const [status, setStatus] = useState<"Planejamento" | "Em Andamento" | "Em Pausa" | "Concluído" | "Cancelado">("Planejamento");
  const [projectType, setProjectType] = useState<"Integração Interna" | "Integração Externa">("Integração Interna");
  const [sector, setSector] = useState<"TI" | "RH" | "Financeiro" | "Comercial" | "Suporte" | "Operações">("TI");
  const [ownerId, setOwnerId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);

  // Phase editing state
  const [editingPhaseId, setEditingPhaseId] = useState<number | null>(null);
  const [newPhases, setNewPhases] = useState<Array<{ name: string; description: string; startDate?: Date; endDate?: Date }>>([]);
  const [newPhaseName, setNewPhaseName] = useState("");
  const [newPhaseDescription, setNewPhaseDescription] = useState("");
  const [newPhaseStartDate, setNewPhaseStartDate] = useState<Date | undefined>(undefined);
  const [newPhaseEndDate, setNewPhaseEndDate] = useState<Date | undefined>(undefined);

  // Load project data into form
  useEffect(() => {
    if (project) {
      setName(project.name);
      setDescription(project.description || "");
      setPriority(project.priority as any);
      setStatus(project.status as any);
      setProjectType((project as any).projectType || "Integração Interna");
      setSector(project.sector as any);
      setOwnerId(project.ownerId);
      setStartDate(project.startDate ? new Date(project.startDate) : undefined);
      setEndDate(project.endDate ? new Date(project.endDate) : undefined);
    }
  }, [project]);

  const updateProjectMutation = trpc.projects.update.useMutation({
    onSuccess: () => {
      toast.success("Projeto atualizado com sucesso!");
      utils.projects.list.invalidate();
      utils.projects.getById.invalidate({ id: projectId });
      onSuccess?.();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar projeto: ${error.message}`);
    },
  });

  const addPhaseMutation = trpc.projectPhases.create.useMutation({
    onSuccess: () => {
      toast.success("Fase adicionada com sucesso!");
      utils.projectPhases.listByProject.invalidate({ projectId });
      utils.projects.getById.invalidate({ id: projectId });
      utils.projects.list.invalidate();
    },
    onError: (error: any) => {
      toast.error(`Erro ao adicionar fase: ${error.message}`);
    },
  });

  const updatePhaseMutation = trpc.projectPhases.update.useMutation({
    onSuccess: () => {
      toast.success("Fase atualizada com sucesso!");
      utils.projectPhases.listByProject.invalidate({ projectId });
      utils.projects.getById.invalidate({ id: projectId });
      utils.projects.list.invalidate();
      setEditingPhaseId(null);
    },
    onError: (error: any) => {
      toast.error(`Erro ao atualizar fase: ${error.message}`);
    },
  });

  const deletePhaseMutation = trpc.projectPhases.delete.useMutation({
    onSuccess: () => {
      toast.success("Fase removida com sucesso!");
      utils.projectPhases.listByProject.invalidate({ projectId });
      utils.projects.getById.invalidate({ id: projectId });
      utils.projects.list.invalidate();
    },
    onError: (error: any) => {
      toast.error(`Erro ao remover fase: ${error.message}`);
    },
  });

  const completePhaseMutation = trpc.projectPhases.update.useMutation({
    onSuccess: () => {
      toast.success("Fase concluída!");
      utils.projectPhases.listByProject.invalidate({ projectId });
      utils.projects.getById.invalidate({ id: projectId });
      utils.projects.list.invalidate();
    },
    onError: (error: any) => {
      toast.error(`Erro ao concluir fase: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Nome do projeto é obrigatório");
      return;
    }

    if (!ownerId) {
      toast.error("Responsável é obrigatório");
      return;
    }

    const owner = users.find(u => u.id === ownerId);

    updateProjectMutation.mutate({
      id: projectId,
      name: name.trim(),
      description: description.trim(),
      priority,
      status,
      projectType,
      ownerId,
      ownerName: owner?.name || "",
      startDate: startDate?.getTime(),
      endDate: endDate?.getTime(),
    });
  };

  const handleAddNewPhase = () => {
    if (!newPhaseName.trim()) {
      toast.error("Nome da fase é obrigatório");
      return;
    }

    // Get next order number
    const nextOrder = phases.length > 0 ? Math.max(...phases.map(p => p.order)) + 1 : 1;

    addPhaseMutation.mutate({
      projectId,
      name: newPhaseName.trim(),
      description: newPhaseDescription.trim(),
      order: nextOrder,
      startDate: newPhaseStartDate?.getTime(),
      endDate: newPhaseEndDate?.getTime(),
    });

    // Reset form
    setNewPhaseName("");
    setNewPhaseDescription("");
    setNewPhaseStartDate(undefined);
    setNewPhaseEndDate(undefined);
  };

  const handleCompletePhase = (phaseId: number) => {
    completePhaseMutation.mutate({ 
      id: phaseId,
      projectId,
      status: "Concluída",
      completedAt: Date.now(),
    });
  };

  const handleDeletePhase = (phaseId: number) => {
    if (confirm("Tem certeza que deseja remover esta fase?")) {
      deletePhaseMutation.mutate({ id: phaseId, projectId });
    }
  };

  if (projectLoading || phasesLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Projeto</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Project Basic Info */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Nome do Projeto *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Migração de Sistema"
                required
              />
            </div>

            <div>
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descreva o objetivo e escopo do projeto"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="status">Status *</Label>
                <Select value={status} onValueChange={(value: any) => setStatus(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Planejamento">Planejamento</SelectItem>
                    <SelectItem value="Em Andamento">Em Andamento</SelectItem>
                    <SelectItem value="Em Pausa">Em Pausa</SelectItem>
                    <SelectItem value="Concluído">Concluído</SelectItem>
                    <SelectItem value="Cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="priority">Prioridade *</Label>
                <Select value={priority} onValueChange={(value: any) => setPriority(value)}>
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
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="sector">Setor *</Label>
                <Select value={sector} onValueChange={(value: any) => setSector(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TI">TI</SelectItem>
                    <SelectItem value="RH">RH</SelectItem>
                    <SelectItem value="Financeiro">Financeiro</SelectItem>
                    <SelectItem value="Comercial">Comercial</SelectItem>
                    <SelectItem value="Suporte">Suporte</SelectItem>
                    <SelectItem value="Operações">Operações</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="projectType">Tipo de Projeto *</Label>
                <Select value={projectType} onValueChange={(value: any) => setProjectType(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Integração Interna">Integração Interna</SelectItem>
                    <SelectItem value="Integração Externa">Integração Externa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="owner">Responsável *</Label>
                <Select value={ownerId?.toString() || ""} onValueChange={(value) => setOwnerId(parseInt(value))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o responsável" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id.toString()}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Data de Início</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, "PPP", { locale: ptBR }) : "Selecionar"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={startDate} onSelect={setStartDate} locale={ptBR} />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <Label>Data de Término</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, "PPP", { locale: ptBR }) : "Selecionar"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={endDate} onSelect={setEndDate} locale={ptBR} />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          {/* Phases Section */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold mb-4">Fases do Projeto</h3>
            
            {/* Existing Phases */}
            <div className="space-y-3 mb-4">
              {phases.map((phase: any) => (
                <div key={phase.id} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{phase.name}</span>
                      <span className={`text-xs px-2 py-1 rounded ${
                        phase.status === "Concluída" ? "bg-green-100 text-green-700" :
                        phase.status === "Em Andamento" ? "bg-blue-100 text-blue-700" :
                        "bg-gray-100 text-gray-700"
                      }`}>
                        {phase.status}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {phase.status !== "Concluída" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleCompletePhase(phase.id)}
                          disabled={completePhaseMutation.isPending}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Concluir
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeletePhase(phase.id)}
                        disabled={deletePhaseMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {phase.description && (
                    <p className="text-sm text-muted-foreground">{phase.description}</p>
                  )}
                  {(phase.startDate || phase.endDate) && (
                    <div className="text-xs text-muted-foreground flex gap-4">
                      {phase.startDate && <span>Início: {format(new Date(phase.startDate), "dd/MM/yyyy")}</span>}
                      {phase.endDate && <span>Término: {format(new Date(phase.endDate), "dd/MM/yyyy")}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Add New Phase */}
            <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <h4 className="font-medium">Adicionar Nova Fase</h4>
              <Input
                placeholder="Nome da fase"
                value={newPhaseName}
                onChange={(e) => setNewPhaseName(e.target.value)}
              />
              <Textarea
                placeholder="Descrição da fase (opcional)"
                value={newPhaseDescription}
                onChange={(e) => setNewPhaseDescription(e.target.value)}
                rows={2}
              />
              <div className="grid grid-cols-2 gap-3">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="justify-start text-left font-normal" type="button">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {newPhaseStartDate ? format(newPhaseStartDate, "dd/MM/yyyy") : "Data início"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={newPhaseStartDate} onSelect={setNewPhaseStartDate} locale={ptBR} />
                  </PopoverContent>
                </Popover>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="justify-start text-left font-normal" type="button">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {newPhaseEndDate ? format(newPhaseEndDate, "dd/MM/yyyy") : "Data término"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={newPhaseEndDate} onSelect={setNewPhaseEndDate} locale={ptBR} />
                  </PopoverContent>
                </Popover>
              </div>
              <Button
                type="button"
                onClick={handleAddNewPhase}
                disabled={addPhaseMutation.isPending}
                size="sm"
              >
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Fase
              </Button>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={updateProjectMutation.isPending}>
              {updateProjectMutation.isPending ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
