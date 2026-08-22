import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
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
import { Loader2, Trash2, AlertCircle } from "lucide-react";

interface EditItInventoryItemModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: number | null;
  onSuccess?: () => void;
}

export default function EditItInventoryItemModal({
  open,
  onOpenChange,
  itemId,
  onSuccess,
}: EditItInventoryItemModalProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [formData, setFormData] = useState({
    name: "",
    tag: "",
    sector: "",
    responsible: "",
    status: "Disponível",
  });

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Fetch item details
  const { data: item, isLoading: itemLoading } = trpc.itInventory.items.getById.useQuery(
    { id: itemId || 0 },
    { enabled: open && itemId !== null }
  );

  // Verificar se a TAG já existe (excluindo o item atual)
  const { data: tagCheck } = trpc.itInventory.items.checkTag.useQuery(
    { tag: formData.tag, excludeId: itemId || undefined },
    { enabled: formData.tag.trim().length > 0 && open }
  );

  // Update form when item data is loaded
  useEffect(() => {
    if (item) {
      setFormData({
        name: item.name || "",
        tag: item.tag || "",
        sector: item.sector || "",
        responsible: item.responsible || "",
        status: item.status || "Disponível",
      });
    }
  }, [item]);

  const updateMutation = trpc.itInventory.items.update.useMutation({
    onSuccess: () => {
      toast.success("Equipamento atualizado com sucesso!");
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar equipamento: ${error.message}`);
    },
  });

  const deleteMutation = trpc.itInventory.items.delete.useMutation({
    onSuccess: () => {
      toast.success("Equipamento excluído com sucesso!");
      setShowDeleteConfirm(false);
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error) => {
      toast.error(`Erro ao excluir equipamento: ${error.message}`);
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

    if (!itemId) return;

    updateMutation.mutate({
      id: itemId,
      name: formData.name,
      tag: formData.tag.trim(),
      sector: formData.sector.trim() || null,
      responsible: formData.responsible.trim() || null,
      status: formData.status as any,
    });
  };

  const handleDelete = () => {
    if (!itemId) return;
    deleteMutation.mutate({ id: itemId });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-white/95 backdrop-blur-xl border-border">
        <DialogHeader>
          <DialogTitle className="text-gray-900">Editar Equipamento</DialogTitle>
          <DialogDescription className="text-gray-600">
            Atualize as informações do equipamento
          </DialogDescription>
        </DialogHeader>

        {itemLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-600" />
          </div>
        ) : showDeleteConfirm ? (
          <div className="space-y-4 py-4">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
                <Trash2 size={20} className="text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Confirmar Exclusão</h3>
              <p className="text-sm text-gray-600 mt-1">
                Tem certeza que deseja excluir o equipamento <strong>{item?.name}</strong> (TAG: {item?.tag})?
                Esta ação não pode ser desfeita.
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 text-gray-900 border-gray-300 hover:bg-gray-100"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              >
                {deleteMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Excluindo...
                  </>
                ) : (
                  "Excluir"
                )}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-gray-700 font-medium">
                Nome do Equipamento *
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="Ex: Notebook Dell"
                className="bg-white/50 border-gray-300 text-gray-900 placeholder-gray-500"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tag" className="text-gray-700 font-medium">
                TAG * <span className="text-xs text-muted-foreground font-normal">(identificador único)</span>
              </Label>
              <Input
                id="tag"
                value={formData.tag}
                onChange={(e) =>
                  setFormData({ ...formData, tag: e.target.value })
                }
                placeholder="Ex: NB-001"
                className={`bg-white/50 border-gray-300 text-gray-900 placeholder-gray-500 ${
                  tagCheck?.exists ? "border-red-400 focus:ring-red-200" : ""
                }`}
              />
              {tagCheck?.exists && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <AlertCircle size={12} />
                  Esta TAG já está em uso por outro equipamento
                </p>
              )}
            </div>

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
                <SelectTrigger className="bg-white/50 border-gray-300 text-gray-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Disponível">Disponível</SelectItem>
                  <SelectItem value="Em Uso">Em Uso</SelectItem>
                  <SelectItem value="Manutenção">Manutenção</SelectItem>
                  <SelectItem value="Descartado">Descartado</SelectItem>
                  <SelectItem value="Emprestado">Emprestado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sector" className="text-gray-700 font-medium">
                Setor {isStatusRequiresSectorResponsible ? "*" : ""}
              </Label>
              <Input
                id="sector"
                value={formData.sector}
                onChange={(e) =>
                  setFormData({ ...formData, sector: e.target.value })
                }
                placeholder="Ex: TI"
                className="bg-white/50 border-gray-300 text-gray-900 placeholder-gray-500"
              />
              {!isStatusRequiresSectorResponsible && (
                <p className="text-xs text-muted-foreground">Opcional quando status é "Disponível"</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="responsible" className="text-gray-700 font-medium">
                Responsável {isStatusRequiresSectorResponsible ? "*" : ""}
              </Label>
              <Input
                id="responsible"
                value={formData.responsible}
                onChange={(e) =>
                  setFormData({ ...formData, responsible: e.target.value })
                }
                placeholder="Ex: João Silva"
                className="bg-white/50 border-gray-300 text-gray-900 placeholder-gray-500"
              />
              {!isStatusRequiresSectorResponsible && (
                <p className="text-xs text-muted-foreground">Opcional quando status é "Disponível"</p>
              )}
            </div>

            {/* Timestamps info */}
            {item && (
              <div className="text-xs text-muted-foreground border-t border-gray-200 pt-3 space-y-1">
                <p>Cadastrado em: {new Date(item.createdAt).toLocaleString("pt-BR")}</p>
                <p>Última atualização: {new Date(item.updatedAt).toLocaleString("pt-BR")}</p>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              {/* Botão de exclusão - apenas para admin */}
              {isAdmin && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
                  title="Excluir equipamento"
                >
                  <Trash2 size={16} />
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1 text-gray-900 border-gray-300 hover:bg-gray-100"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={updateMutation.isPending || (tagCheck?.exists ?? false)}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              >
                {updateMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar Alterações"
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
