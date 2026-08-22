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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, AlertCircle } from "lucide-react";

interface CreateItInventoryItemModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Array<{ id: number; name: string }>;
  onSuccess?: () => void;
}

export default function CreateItInventoryItemModal({
  open,
  onOpenChange,
  categories,
  onSuccess,
}: CreateItInventoryItemModalProps) {

  const [formData, setFormData] = useState({
    name: "",
    tag: "",
    sector: "",
    responsible: "",
    status: "Disponível",
  });

  const [tagError, setTagError] = useState("");

  // Verifica se a TAG já existe em tempo real
  const { data: tagCheck } = trpc.itInventory.items.checkTag.useQuery(
    { tag: formData.tag },
    { enabled: formData.tag.trim().length > 0 }
  );

  const createMutation = trpc.itInventory.items.create.useMutation({
    onSuccess: () => {
      toast.success("Equipamento criado com sucesso!");
      setFormData({
        name: "",
        tag: "",
        sector: "",
        responsible: "",
        status: "Disponível",
      });
      setTagError("");
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error) => {
      toast.error(`Erro ao criar equipamento: ${error.message}`);
    },
  });

  const isStatusRequiresSectorResponsible = formData.status !== "Disponível";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error("Nome do equipamento é obrigatório");
      return;
    }

    if (!formData.tag.trim()) {
      toast.error("TAG é obrigatória");
      return;
    }

    if (tagCheck?.exists) {
      toast.error("Esta TAG já está em uso por outro equipamento");
      return;
    }

    if (isStatusRequiresSectorResponsible) {
      if (!formData.sector.trim()) {
        toast.error("Setor é obrigatório quando o equipamento não está disponível");
        return;
      }
      if (!formData.responsible.trim()) {
        toast.error("Responsável é obrigatório quando o equipamento não está disponível");
        return;
      }
    }

    createMutation.mutate({
      name: formData.name,
      tag: formData.tag.trim(),
      sector: formData.sector.trim() || undefined,
      responsible: formData.responsible.trim() || undefined,
      status: formData.status as any,
      categoryId: 0,
      categoryName: "",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-white/95 backdrop-blur-xl border-border">
        <DialogHeader>
          <DialogTitle className="text-gray-900">Novo Equipamento</DialogTitle>
          <DialogDescription className="text-gray-600">
            Adicione um novo equipamento ao almoxarifado de TI
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nome */}
          <div className="space-y-2">
            <Label htmlFor="name" className="text-gray-700 font-medium">
              Nome do Equipamento *
            </Label>
            <Input
              id="name"
              placeholder="Ex: Notebook Dell Latitude 5520"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400"
            />
          </div>

          {/* Tag */}
          <div className="space-y-2">
            <Label htmlFor="tag" className="text-gray-700 font-medium">
              TAG * <span className="text-xs text-muted-foreground font-normal">(identificador único)</span>
            </Label>
            <Input
              id="tag"
              placeholder="Ex: NB-001"
              value={formData.tag}
              onChange={(e) => {
                setFormData({ ...formData, tag: e.target.value });
                setTagError("");
              }}
              className={`bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 ${
                tagCheck?.exists ? "border-red-400 focus:ring-red-200" : ""
              }`}
            />
            {tagCheck?.exists && (
              <p className="text-xs text-red-500 flex items-center gap-1">
                <AlertCircle size={12} />
                Esta TAG já está em uso
              </p>
            )}
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label htmlFor="status" className="text-gray-700 font-medium">
              Status
            </Label>
            <Select
              value={formData.status}
              onValueChange={(value) =>
                setFormData({ ...formData, status: value })
              }
            >
              <SelectTrigger className="bg-gray-50 border-gray-200 text-gray-900">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Disponível">Disponível</SelectItem>
                <SelectItem value="Em Uso">Em Uso</SelectItem>
                <SelectItem value="Manutenção">Manutenção</SelectItem>
                <SelectItem value="Emprestado">Emprestado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Setor */}
          <div className="space-y-2">
            <Label htmlFor="sector" className="text-gray-700 font-medium">
              Setor {isStatusRequiresSectorResponsible ? "*" : ""}
            </Label>
            <Input
              id="sector"
              placeholder="Ex: TI, RH, Logística"
              value={formData.sector}
              onChange={(e) =>
                setFormData({ ...formData, sector: e.target.value })
              }
              className="bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400"
            />
            {!isStatusRequiresSectorResponsible && (
              <p className="text-xs text-muted-foreground">Opcional quando status é "Disponível"</p>
            )}
          </div>

          {/* Responsável */}
          <div className="space-y-2">
            <Label htmlFor="responsible" className="text-gray-700 font-medium">
              Responsável {isStatusRequiresSectorResponsible ? "*" : ""}
            </Label>
            <Input
              id="responsible"
              placeholder="Ex: João Silva"
              value={formData.responsible}
              onChange={(e) =>
                setFormData({ ...formData, responsible: e.target.value })
              }
              className="bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400"
            />
            {!isStatusRequiresSectorResponsible && (
              <p className="text-xs text-muted-foreground">Opcional quando status é "Disponível"</p>
            )}
          </div>

          {/* Botões */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 border-gray-200 text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || (tagCheck?.exists ?? false)}
              className="flex-1 bg-primary text-primary-foreground hover:opacity-90"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Criando...
                </>
              ) : (
                "Criar Equipamento"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
