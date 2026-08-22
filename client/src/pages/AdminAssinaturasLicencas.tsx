import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import {
  CreditCard, Plus, RefreshCw, Shield, Brain, Server, Package, MoreHorizontal,
  DollarSign, AlertTriangle, CheckCircle, XCircle, Clock, Edit, Trash2,
  Filter, X, FileText, Upload, Download, Eye
} from "lucide-react";
import SubmodulePage from "@/components/templates/SubmodulePage";
import KpiCard from "@/components/templates/KpiCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

type Category = "Segurança" | "IA/LLM" | "Infraestrutura" | "Software" | "Outro";
type RenewalType = "Mensal" | "Anual" | "Personalizado";
type Currency = "BRL" | "USD";
type Status = "Ativo" | "Próximo do vencimento" | "Vencido" | "Cancelado";

interface FormData {
  serviceName: string;
  category: Category;
  renewalType: RenewalType;
  renewalDays: string;
  startDate: string;
  expirationDate: string;
  value: string;
  currency: Currency;
  notes: string;
  responsibleUserId: number;
  responsibleUserName: string;
  alertDaysBefore: number;
  alertEnabled: boolean;
  groupId: number;
}

const emptyForm: FormData = {
  serviceName: "",
  category: "Software",
  renewalType: "Mensal",
  renewalDays: "",
  startDate: "",
  expirationDate: "",
  value: "",
  currency: "BRL",
  notes: "",
  responsibleUserId: 0,
  responsibleUserName: "",
  alertDaysBefore: 30,
  alertEnabled: true,
  groupId: 1,
};

const categoryIcons: Record<Category, React.ReactNode> = {
  "Segurança": <Shield size={16} />,
  "IA/LLM": <Brain size={16} />,
  "Infraestrutura": <Server size={16} />,
  "Software": <Package size={16} />,
  "Outro": <MoreHorizontal size={16} />,
};

const categoryColors: Record<Category, string> = {
  "Segurança": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  "IA/LLM": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  "Infraestrutura": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "Software": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  "Outro": "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
};

const statusColors: Record<Status, string> = {
  "Ativo": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  "Próximo do vencimento": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "Vencido": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  "Cancelado": "bg-gray-100 text-gray-500 dark:bg-gray-900/30 dark:text-gray-400",
};

const statusIcons: Record<Status, React.ReactNode> = {
  "Ativo": <CheckCircle size={14} />,
  "Próximo do vencimento": <AlertTriangle size={14} />,
  "Vencido": <XCircle size={14} />,
  "Cancelado": <Clock size={14} />,
};

function formatCurrency(value: string | number, currency: Currency): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: currency === "BRL" ? "BRL" : "USD",
  }).format(num);
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("pt-BR");
}

function daysUntil(timestamp: number): number {
  return Math.ceil((timestamp - Date.now()) / (1000 * 60 * 60 * 24));
}

function dateToTimestamp(dateStr: string): number {
  return new Date(dateStr + "T12:00:00").getTime();
}

function timestampToDate(ts: number): string {
  const d = new Date(ts);
  return d.toISOString().split("T")[0];
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AdminAssinaturasLicencas() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  // State
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [filterCategory, setFilterCategory] = useState<Category | "all">("all");
  const [filterStatus, setFilterStatus] = useState<Status | "all">("all");
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [attachmentsDialogId, setAttachmentsDialogId] = useState<number | null>(null);
  const [attachmentsDialogName, setAttachmentsDialogName] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Queries
  const { data: subscriptions, isLoading } = trpc.subscriptions.list.useQuery(
    {
      ...(filterCategory !== "all" ? { category: filterCategory } : {}),
      ...(filterStatus !== "all" ? { status: filterStatus } : {}),
    },
    { refetchInterval: 60000 }
  );
  const { data: summary, isLoading: summaryLoading } = trpc.subscriptions.getSummary.useQuery(undefined, {
    refetchInterval: 60000,
  });

  // Attachments query (only when dialog is open)
  const { data: attachments, isLoading: attachmentsLoading } = trpc.subscriptions.listAttachments.useQuery(
    { subscriptionId: attachmentsDialogId! },
    { enabled: attachmentsDialogId !== null }
  );

  // Mutations
  const createMutation = trpc.subscriptions.create.useMutation({
    onSuccess: () => {
      toast.success("Assinatura criada com sucesso");
      utils.subscriptions.list.invalidate();
      utils.subscriptions.getSummary.invalidate();
      closeForm();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.subscriptions.update.useMutation({
    onSuccess: () => {
      toast.success("Assinatura atualizada com sucesso");
      utils.subscriptions.list.invalidate();
      utils.subscriptions.getSummary.invalidate();
      closeForm();
    },
    onError: (err) => toast.error(err.message),
  });

  const cancelMutation = trpc.subscriptions.cancel.useMutation({
    onSuccess: () => {
      toast.success("Assinatura cancelada");
      utils.subscriptions.list.invalidate();
      utils.subscriptions.getSummary.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.subscriptions.delete.useMutation({
    onSuccess: () => {
      toast.success("Assinatura excluída");
      utils.subscriptions.list.invalidate();
      utils.subscriptions.getSummary.invalidate();
      setDeleteConfirm(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const uploadMutation = trpc.subscriptions.uploadAttachment.useMutation({
    onSuccess: () => {
      toast.success("PDF enviado com sucesso");
      utils.subscriptions.listAttachments.invalidate({ subscriptionId: attachmentsDialogId! });
      setUploading(false);
    },
    onError: (err) => {
      toast.error(err.message);
      setUploading(false);
    },
  });

  const deleteAttachmentMutation = trpc.subscriptions.deleteAttachment.useMutation({
    onSuccess: () => {
      toast.success("Anexo removido");
      utils.subscriptions.listAttachments.invalidate({ subscriptionId: attachmentsDialogId! });
    },
    onError: (err) => toast.error(err.message),
  });

  // Handlers
  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setFormData(emptyForm);
  }

  function openCreate() {
    setFormData({
      ...emptyForm,
      responsibleUserId: user?.id || 0,
      responsibleUserName: user?.name || "",
    });
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(sub: any) {
    setFormData({
      serviceName: sub.serviceName,
      category: sub.category,
      renewalType: sub.renewalType,
      renewalDays: sub.renewalDays?.toString() || "",
      startDate: timestampToDate(sub.startDate),
      expirationDate: timestampToDate(sub.expirationDate),
      value: sub.value,
      currency: sub.currency,
      notes: sub.notes || "",
      responsibleUserId: sub.responsibleUserId,
      responsibleUserName: sub.responsibleUserName,
      alertDaysBefore: sub.alertDaysBefore,
      alertEnabled: sub.alertEnabled,
      groupId: sub.groupId,
    });
    setEditingId(sub.id);
    setShowForm(true);
  }

  function openAttachments(sub: any) {
    setAttachmentsDialogId(sub.id);
    setAttachmentsDialogName(sub.serviceName);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tipo
    if (file.type !== "application/pdf") {
      toast.error("Apenas arquivos PDF são permitidos");
      return;
    }

    // Validar tamanho (16MB)
    if (file.size > 16 * 1024 * 1024) {
      toast.error("Arquivo excede o limite de 16MB");
      return;
    }

    setUploading(true);

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadMutation.mutate({
        subscriptionId: attachmentsDialogId!,
        fileName: file.name,
        fileBase64: base64,
        fileSize: file.size,
        mimeType: file.type,
      });
    };
    reader.onerror = () => {
      toast.error("Erro ao ler o arquivo");
      setUploading(false);
    };
    reader.readAsDataURL(file);

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleSubmit() {
    if (!formData.serviceName || !formData.startDate || !formData.expirationDate || !formData.value) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    const payload = {
      serviceName: formData.serviceName,
      category: formData.category,
      renewalType: formData.renewalType,
      renewalDays: formData.renewalType === "Personalizado" ? parseInt(formData.renewalDays) || null : null,
      startDate: dateToTimestamp(formData.startDate),
      expirationDate: dateToTimestamp(formData.expirationDate),
      value: formData.value,
      currency: formData.currency,
      notes: formData.notes || null,
      responsibleUserId: formData.responsibleUserId || user?.id || 1,
      responsibleUserName: formData.responsibleUserName || user?.name || "Admin",
      alertDaysBefore: formData.alertDaysBefore,
      alertEnabled: formData.alertEnabled,
      groupId: formData.groupId,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const hasActiveFilters = filterCategory !== "all" || filterStatus !== "all";

  return (
    <SubmodulePage
      title="Assinaturas e Licenças"
      subtitle="Gerenciamento de contratos, renovações e custos"
      icon={<CreditCard size={20} />}
      iconGradient="from-indigo-500 to-indigo-600"
      backPath="/admin"
      backLabel="Administração"
      headerActions={
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => {
            utils.subscriptions.list.invalidate();
            utils.subscriptions.getSummary.invalidate();
          }}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={openCreate} className="gap-1.5">
            <Plus size={16} />
            <span className="hidden sm:inline">Nova Assinatura</span>
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* ═══ KPIs Dashboard ═══ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Ativas"
            value={summary?.active ?? 0}
            icon={<CheckCircle size={20} />}
            iconColor="text-emerald-500"
            tooltip="Assinaturas com status ativo e dentro da validade"
            sublabel={`${summary?.total ?? 0} total cadastradas`}
            loading={summaryLoading}
          />
          <KpiCard
            title="Próximas do Vencimento"
            value={summary?.expiringSoon ?? 0}
            icon={<AlertTriangle size={20} />}
            iconColor="text-amber-500"
            tooltip="Assinaturas que vencem dentro do período de alerta configurado"
            sublabel={summary?.expiringSoon ? "Requer atenção" : "Nenhuma pendência"}
            sublabelColor={summary?.expiringSoon ? "text-amber-600" : "text-muted-foreground"}
            loading={summaryLoading}
          />
          <KpiCard
            title="Custo Mensal (R$)"
            value={summary?.totalMonthlyBRL ? `R$ ${summary.totalMonthlyBRL.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "R$ 0,00"}
            icon={<DollarSign size={20} />}
            iconColor="text-blue-500"
            tooltip="Soma dos custos mensais de todas as assinaturas ativas em BRL"
            sublabel={summary?.totalMonthlyUSD ? `+ US$ ${summary.totalMonthlyUSD.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} em USD` : undefined}
            loading={summaryLoading}
          />
          <KpiCard
            title="Vencidas"
            value={summary?.expired ?? 0}
            icon={<XCircle size={20} />}
            iconColor="text-red-500"
            tooltip="Assinaturas com data de expiração ultrapassada que precisam de renovação ou cancelamento"
            sublabel={summary?.cancelled ? `${summary.cancelled} canceladas` : undefined}
            loading={summaryLoading}
          />
        </div>

        {/* ═══ Próximos Vencimentos ═══ */}
        {summary?.upcomingExpirations && summary.upcomingExpirations.length > 0 && (
          <Card className="border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-900/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <AlertTriangle size={16} />
                Próximos Vencimentos (60 dias)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {summary.upcomingExpirations.map((sub: any) => (
                  <div key={sub.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/60 dark:bg-card/60 border border-border/50">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`p-1 rounded ${categoryColors[sub.category as Category]}`}>
                        {categoryIcons[sub.category as Category]}
                      </span>
                      <span className="text-sm font-medium truncate">{sub.serviceName}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {formatDate(sub.expirationDate)}
                      </span>
                      <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                        {daysUntil(sub.expirationDate)} dias
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ═══ Filtros ═══ */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-muted-foreground" />
            <Select value={filterCategory} onValueChange={(v) => setFilterCategory(v as any)}>
              <SelectTrigger className="w-[160px] h-9">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Categorias</SelectItem>
                <SelectItem value="Segurança">Segurança</SelectItem>
                <SelectItem value="IA/LLM">IA/LLM</SelectItem>
                <SelectItem value="Infraestrutura">Infraestrutura</SelectItem>
                <SelectItem value="Software">Software</SelectItem>
                <SelectItem value="Outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Status</SelectItem>
              <SelectItem value="Ativo">Ativo</SelectItem>
              <SelectItem value="Próximo do vencimento">Próximo do vencimento</SelectItem>
              <SelectItem value="Vencido">Vencido</SelectItem>
              <SelectItem value="Cancelado">Cancelado</SelectItem>
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={() => { setFilterCategory("all"); setFilterStatus("all"); }} className="gap-1 text-muted-foreground">
              <X size={14} /> Limpar
            </Button>
          )}
        </div>

        {/* ═══ Tabela de Assinaturas ═══ */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Carregando...</div>
            ) : !subscriptions || subscriptions.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <CreditCard size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">Nenhuma assinatura encontrada</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={openCreate}>
                  <Plus size={14} className="mr-1" /> Adicionar primeira assinatura
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left p-3 font-medium text-muted-foreground">Serviço</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Categoria</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Renovação</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Valor</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Vencimento</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Responsável</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subscriptions.map((sub) => {
                      const days = daysUntil(sub.expirationDate);
                      return (
                        <tr key={sub.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                          <td className="p-3 font-medium">{sub.serviceName}</td>
                          <td className="p-3">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium ${categoryColors[sub.category as Category]}`}>
                              {categoryIcons[sub.category as Category]}
                              {sub.category}
                            </span>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {sub.renewalType}
                            {sub.renewalType === "Personalizado" && sub.renewalDays && (
                              <span className="text-xs ml-1">({sub.renewalDays}d)</span>
                            )}
                          </td>
                          <td className="p-3 font-medium">
                            {formatCurrency(sub.value, sub.currency as Currency)}
                          </td>
                          <td className="p-3">
                            <div className="flex flex-col">
                              <span className="text-foreground">{formatDate(sub.expirationDate)}</span>
                              {sub.status !== "Cancelado" && (
                                <span className={`text-xs ${days <= 0 ? "text-red-500" : days <= 30 ? "text-amber-500" : "text-muted-foreground"}`}>
                                  {days <= 0 ? `Vencido há ${Math.abs(days)} dias` : `em ${days} dias`}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${statusColors[sub.status as Status]}`}>
                              {statusIcons[sub.status as Status]}
                              {sub.status}
                            </span>
                          </td>
                          <td className="p-3 text-muted-foreground text-xs">{sub.responsibleUserName}</td>
                          <td className="p-3">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-indigo-500 hover:text-indigo-600"
                                onClick={() => openAttachments(sub)}
                                title="Anexos PDF"
                              >
                                <FileText size={14} />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(sub)}>
                                <Edit size={14} />
                              </Button>
                              {sub.status !== "Cancelado" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-amber-500 hover:text-amber-600"
                                  onClick={() => cancelMutation.mutate({ id: sub.id })}
                                >
                                  <XCircle size={14} />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                                onClick={() => setDeleteConfirm(sub.id)}
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ═══ Dialog de Criação/Edição ═══ */}
      <Dialog open={showForm} onOpenChange={(open) => !open && closeForm()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Assinatura" : "Nova Assinatura"}</DialogTitle>
            <DialogDescription>
              {editingId ? "Atualize os dados da assinatura" : "Cadastre uma nova assinatura ou licença"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Nome do Serviço */}
            <div className="space-y-1.5">
              <Label htmlFor="serviceName">Nome do Serviço *</Label>
              <Input
                id="serviceName"
                value={formData.serviceName}
                onChange={(e) => setFormData({ ...formData, serviceName: e.target.value })}
                placeholder="Ex: Microsoft 365, AWS, Cloudflare..."
              />
            </div>

            {/* Categoria + Renovação */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Categoria *</Label>
                <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v as Category })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Segurança">Segurança</SelectItem>
                    <SelectItem value="IA/LLM">IA/LLM</SelectItem>
                    <SelectItem value="Infraestrutura">Infraestrutura</SelectItem>
                    <SelectItem value="Software">Software</SelectItem>
                    <SelectItem value="Outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de Renovação *</Label>
                <Select value={formData.renewalType} onValueChange={(v) => setFormData({ ...formData, renewalType: v as RenewalType })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Mensal">Mensal</SelectItem>
                    <SelectItem value="Anual">Anual</SelectItem>
                    <SelectItem value="Personalizado">Personalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Dias personalizados */}
            {formData.renewalType === "Personalizado" && (
              <div className="space-y-1.5">
                <Label htmlFor="renewalDays">Período de Renovação (dias)</Label>
                <Input
                  id="renewalDays"
                  type="number"
                  value={formData.renewalDays}
                  onChange={(e) => setFormData({ ...formData, renewalDays: e.target.value })}
                  placeholder="Ex: 90"
                />
              </div>
            )}

            {/* Datas */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="startDate">Data de Início *</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="expirationDate">Data de Vencimento *</Label>
                <Input
                  id="expirationDate"
                  type="date"
                  value={formData.expirationDate}
                  onChange={(e) => setFormData({ ...formData, expirationDate: e.target.value })}
                />
              </div>
            </div>

            {/* Valor + Moeda */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="value">Valor *</Label>
                <Input
                  id="value"
                  type="text"
                  inputMode="decimal"
                  value={formData.value}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9.]/g, "");
                    setFormData({ ...formData, value: val });
                  }}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Moeda</Label>
                <Select value={formData.currency} onValueChange={(v) => setFormData({ ...formData, currency: v as Currency })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BRL">R$ (BRL)</SelectItem>
                    <SelectItem value="USD">US$ (USD)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Responsável */}
            <div className="space-y-1.5">
              <Label htmlFor="responsibleUserName">Responsável</Label>
              <Input
                id="responsibleUserName"
                value={formData.responsibleUserName}
                onChange={(e) => setFormData({ ...formData, responsibleUserName: e.target.value })}
                placeholder="Nome do responsável"
              />
            </div>

            {/* Alerta */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Alerta de Vencimento</Label>
                <p className="text-xs text-muted-foreground">Notificar antes do vencimento</p>
              </div>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  className="w-16 h-8 text-center text-sm"
                  value={formData.alertDaysBefore}
                  onChange={(e) => setFormData({ ...formData, alertDaysBefore: parseInt(e.target.value) || 30 })}
                  min={1}
                  max={365}
                />
                <span className="text-xs text-muted-foreground">dias</span>
                <Switch
                  checked={formData.alertEnabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, alertEnabled: checked })}
                />
              </div>
            </div>

            {/* Observações */}
            <div className="space-y-1.5">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Informações adicionais sobre a assinatura..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeForm}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? "Salvando..." : editingId ? "Atualizar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Dialog de Confirmação de Exclusão ═══ */}
      <Dialog open={deleteConfirm !== null} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Esta ação é irreversível. A assinatura será permanentemente removida do sistema.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && deleteMutation.mutate({ id: deleteConfirm })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Dialog de Anexos PDF ═══ */}
      <Dialog open={attachmentsDialogId !== null} onOpenChange={(open) => !open && setAttachmentsDialogId(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText size={18} className="text-indigo-500" />
              Documentos PDF
            </DialogTitle>
            <DialogDescription>
              Arquivos anexados à assinatura: <strong>{attachmentsDialogName}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Upload area */}
            <div className="border-2 border-dashed border-border/60 rounded-lg p-4 text-center hover:border-indigo-300 transition-colors">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                onChange={handleFileUpload}
                className="hidden"
                id="pdf-upload"
              />
              <label htmlFor="pdf-upload" className="cursor-pointer flex flex-col items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center">
                  <Upload size={20} className="text-indigo-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {uploading ? "Enviando..." : "Clique para enviar PDF"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Apenas arquivos .pdf (máx. 16MB)
                  </p>
                </div>
              </label>
            </div>

            {/* Lista de anexos */}
            {attachmentsLoading ? (
              <div className="text-center py-4 text-muted-foreground text-sm">Carregando anexos...</div>
            ) : !attachments || attachments.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <FileText size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhum documento anexado</p>
              </div>
            ) : (
              <div className="space-y-2">
                {attachments.map((att: any) => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/10 hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded bg-red-50 dark:bg-red-900/20 flex items-center justify-center shrink-0">
                        <FileText size={16} className="text-red-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{att.fileName}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(att.fileSize)} • {formatDate(att.createdAt)} • {att.uploadedByName}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-blue-500 hover:text-blue-600"
                        onClick={() => window.open(att.fileUrl, "_blank")}
                        title="Visualizar"
                      >
                        <Eye size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-green-500 hover:text-green-600"
                        onClick={() => {
                          const link = document.createElement("a");
                          link.href = att.fileUrl;
                          link.download = att.fileName;
                          link.target = "_blank";
                          link.click();
                        }}
                        title="Download"
                      >
                        <Download size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                        onClick={() => deleteAttachmentMutation.mutate({ id: att.id })}
                        title="Excluir"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </SubmodulePage>
  );
}
