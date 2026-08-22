import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Plus, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/_core/hooks/useAuth";

interface CreateProjectModalProps {
  onClose: () => void;
  onSuccess?: () => void;
}

export default function CreateProjectModal({ onClose, onSuccess }: CreateProjectModalProps) {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"Baixa" | "Média" | "Alta" | "Crítica">("Média");
  const [sector, setSector] = useState<"TI" | "RH" | "Financeiro" | "Comercial" | "Suporte" | "Operações">("TI");
  const [ownerId, setOwnerId] = useState<number>(user?.id || 0);
  const [ownerName, setOwnerName] = useState(user?.name || "");
  const [projectType, setProjectType] = useState<"Integração Interna" | "Integração Externa">("Integração Interna");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [phases, setPhases] = useState<Array<{ name: string; description: string; startDate?: Date; endDate?: Date }>>([]);
  const [newPhaseName, setNewPhaseName] = useState("");
  const [newPhaseDescription, setNewPhaseDescription] = useState("");

  const { data: users = [] } = trpc.users.list.useQuery();

  const createPhaseMutation = trpc.projectPhases.create.useMutation();

  const createProjectMutation = trpc.projects.create.useMutation({
    onSuccess: async (project) => {
      // Create phases if any
      if (phases.length > 0 && project) {
        try {
          for (let i = 0; i < phases.length; i++) {
            const phase = phases[i];
            await createPhaseMutation.mutateAsync({
              projectId: project.id,
              name: phase.name,
              description: phase.description || undefined,
              order: i + 1,
              startDate: phase.startDate?.getTime(),
              endDate: phase.endDate?.getTime(),
            });
          }
        } catch (error) {
          console.error("Error creating phases:", error);
          toast.error("Projeto criado, mas houve erro ao criar algumas fases");
        }
      }

      await utils.projects.list.invalidate();
      toast.success("Projeto criado com sucesso!");
      onSuccess?.();
      onClose();
    },
    onError: (error) => {
      toast.error(`Erro ao criar projeto: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Nome do projeto é obrigatório");
      return;
    }

    if (!ownerId) {
      toast.error("Selecione um responsável");
      return;
    }

    createProjectMutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      priority,
      sector,
      projectType: projectType as any,
      ownerId,
      ownerName,
      startDate: startDate?.getTime(),
      endDate: endDate?.getTime(),
    });
  };

  const addPhase = () => {
    if (!newPhaseName.trim()) {
      toast.error("Nome da fase é obrigatório");
      return;
    }

    setPhases([...phases, {
      name: newPhaseName.trim(),
      description: newPhaseDescription.trim(),
    }]);
    setNewPhaseName("");
    setNewPhaseDescription("");
  };

  const removePhase = (index: number) => {
    setPhases(phases.filter((_, i) => i !== index));
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Criar Novo Projeto</DialogTitle>
          <DialogDescription>
            Preencha as informações do projeto e suas fases
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          {/* Basic Info */}
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

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="priority">Prioridade *</Label>
                <Select value={priority} onValueChange={(v: any) => setPriority(v)}>
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
                <Label htmlFor="sector">Setor *</Label>
                <Select value={sector} onValueChange={(v: any) => setSector(v)}>
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
                <Select value={projectType} onValueChange={(v: any) => setProjectType(v)}>
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

            <div>
              <Label htmlFor="owner">Responsável *</Label>
              <Select
                value={ownerId.toString()}
                onValueChange={(v) => {
                  const selectedUser = users.find(u => u.id === parseInt(v));
                  if (selectedUser) {
                    setOwnerId(selectedUser.id);
                    setOwnerName(selectedUser.name);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Data de Início</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecionar"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <Label>Data de Término</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecionar"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          {/* Phases Section */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold mb-4">Fases do Projeto</h3>
            
            {/* Added Phases */}
            {phases.length > 0 && (
              <div className="space-y-2 mb-4">
                {phases.map((phase, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium">{phase.name}</p>
                      {phase.description && (
                        <p className="text-sm text-gray-600">{phase.description}</p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removePhase(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Add Phase Form */}
            <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
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
              <Button type="button" onClick={addPhase} variant="outline" size="sm" className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Fase
              </Button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createProjectMutation.isPending}>
              {createProjectMutation.isPending ? "Criando..." : "Criar Projeto"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
