import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Edit, Trash2, AlertCircle, Info, CheckCircle, XCircle, Newspaper } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import SubmodulePage from "@/components/templates/SubmodulePage";

type AnnouncementType = "info" | "warning" | "success" | "error";

export default function Announcements() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    type: "info" as AnnouncementType,
    expiresAt: "",
  });

  const { data: announcements = [], refetch } = trpc.announcements.list.useQuery();
  const createMutation = trpc.announcements.create.useMutation({
    onSuccess: () => {
      toast.success("Noticia criada com sucesso!");
      refetch();
      resetForm();
    },
    onError: () => toast.error("Erro ao criar noticia"),
  });
  const updateMutation = trpc.announcements.update.useMutation({
    onSuccess: () => {
      toast.success("Noticia atualizada com sucesso!");
      refetch();
      resetForm();
    },
    onError: () => toast.error("Erro ao atualizar noticia"),
  });
  const deleteMutation = trpc.announcements.delete.useMutation({
    onSuccess: () => {
      toast.success("Noticia excluida com sucesso!");
      refetch();
    },
    onError: () => toast.error("Erro ao excluir noticia"),
  });

  const resetForm = () => {
    setFormData({ title: "", content: "", type: "info", expiresAt: "" });
    setShowCreateModal(false);
    setEditingId(null);
  };

  const handleSubmit = () => {
    if (!formData.title.trim()) {
      toast.error("Titulo e obrigatorio");
      return;
    }

    const data = {
      title: formData.title,
      content: formData.content || undefined,
      type: formData.type,
      expiresAt: formData.expiresAt ? new Date(formData.expiresAt).getTime() : undefined,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (announcement: any) => {
    setEditingId(announcement.id);
    setFormData({
      title: announcement.title,
      content: announcement.content || "",
      type: announcement.type,
      expiresAt: announcement.expiresAt 
        ? format(new Date(announcement.expiresAt), "yyyy-MM-dd'T'HH:mm")
        : "",
    });
    setShowCreateModal(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("Tem certeza que deseja excluir esta noticia?")) {
      deleteMutation.mutate({ id });
    }
  };

  const getTypeIcon = (type: AnnouncementType) => {
    switch (type) {
      case "info": return <Info className="h-4 w-4" />;
      case "warning": return <AlertCircle className="h-4 w-4" />;
      case "success": return <CheckCircle className="h-4 w-4" />;
      case "error": return <XCircle className="h-4 w-4" />;
    }
  };

  const getTypeBadgeStyle = (type: AnnouncementType) => {
    const styles = {
      info: "bg-blue-100 text-blue-800 border-blue-300",
      warning: "bg-yellow-100 text-yellow-800 border-yellow-300",
      success: "bg-green-100 text-green-800 border-green-300",
      error: "bg-red-100 text-red-800 border-red-300",
    };
    return styles[type];
  };

  const getTypeLabel = (type: AnnouncementType) => {
    const labels = { info: "Informacao", warning: "Aviso", success: "Sucesso", error: "Urgente" };
    return labels[type];
  };

  return (
    <SubmodulePage
      title="Comunicados"
      subtitle="Gerencie os avisos exibidos na pagina inicial"
      icon={<Newspaper size={20} />}
      iconGradient="from-blue-500 to-blue-600"
      backPath="/admin"
      backLabel="Administração"
      headerActions={
        <Button size="sm" onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          <span className="hidden sm:inline">Nova Notícia</span>
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Summary */}
        <div className="flex items-center justify-between">
          <Badge variant="secondary">{announcements.length} comunicado(s)</Badge>
        </div>

        {/* Announcements List */}
        {announcements.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Newspaper className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="font-medium text-foreground">Nenhum comunicado cadastrado</p>
              <p className="text-sm text-muted-foreground mt-1">Crie o primeiro comunicado para exibir na página inicial</p>
              <Button onClick={() => setShowCreateModal(true)} className="mt-4" size="sm">
                <Plus className="h-4 w-4 mr-1.5" />
                Criar Primeiro Comunicado
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {announcements.map((announcement: any) => (
              <Card key={announcement.id} className="hover:bg-muted/20 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={`p-2 rounded-lg shrink-0 ${getTypeBadgeStyle(announcement.type)}`}>
                        {getTypeIcon(announcement.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <CardTitle className="text-base">{announcement.title}</CardTitle>
                          <Badge variant="outline" className="text-xs">
                            {getTypeLabel(announcement.type)}
                          </Badge>
                        </div>
                        {announcement.content && (
                          <p className="text-sm text-muted-foreground break-words">{announcement.content}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                          <span>
                            Criado em {format(new Date(announcement.createdAt), "dd/MM/yyyy 'as' HH:mm", { locale: ptBR })}
                          </span>
                          {announcement.expiresAt && (
                            <>
                              <span className="hidden sm:inline">|</span>
                              <span>
                                Expira em {format(new Date(announcement.expiresAt), "dd/MM/yyyy 'as' HH:mm", { locale: ptBR })}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(announcement)}
                        className="h-8 w-8 p-0"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(announcement.id)}
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}

        {/* Create/Edit Modal */}
        <Dialog open={showCreateModal} onOpenChange={(open) => !open && resetForm()}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar Comunicado" : "Novo Comunicado"}</DialogTitle>
              <DialogDescription>
                Preencha as informações do comunicado que será exibido na página inicial
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Título *</label>
                <Input
                  placeholder="Digite o titulo do comunicado"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Conteúdo</label>
                <Textarea
                  placeholder="Digite o conteudo do comunicado (opcional)"
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  rows={4}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Tipo</label>
                <Select value={formData.type} onValueChange={(value: AnnouncementType) => setFormData({ ...formData, type: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="info">Informação</SelectItem>
                    <SelectItem value="warning">Aviso</SelectItem>
                    <SelectItem value="success">Sucesso</SelectItem>
                    <SelectItem value="error">Erro/Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Data de Expiração (opcional)</label>
                <Input
                  type="datetime-local"
                  value={formData.expiresAt}
                  onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Deixe em branco para que o comunicado não expire
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={resetForm}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleSubmit}
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {editingId ? "Salvar Alterações" : "Criar Comunicado"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </SubmodulePage>
  );
}
