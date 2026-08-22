import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { MotivoDetalhesModal } from "@/components/MotivoDetalhesModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatNumber } from "@/lib/utils";
import {
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  BarChart3,
  TrendingDown,
  Package,
  Users,
  MapPin,
  Search,
  Trash2,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  DollarSign,
  ShoppingCart,
  Building2,
  Loader2,
} from "lucide-react";

type TabType = "analise" | "rejeicoes" | "importar";

export default function Commercial() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<TabType>("analise");
  const [selectedUploadId, setSelectedUploadId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<string>("all");
  const [motivoFilter, setMotivoFilter] = useState<string>("all");
  const [fabricanteFilter, setFabricanteFilter] = useState<string>("all");
  const [mesFilter, setMesFilter] = useState<string>("all");
  const [anoFilter, setAnoFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [isUploading, setIsUploading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteUploadId, setDeleteUploadId] = useState<number | null>(null);
  const [selectedMotivo, setSelectedMotivo] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadIdNum = selectedUploadId !== "all" ? Number(selectedUploadId) : undefined;

  // Queries
  const { data: uploads = [] } = trpc.commercial.getUploads.useQuery();
  const { data: analytics } = trpc.commercial.getAnalytics.useQuery(
    uploadIdNum || motivoFilter !== "all" || estadoFilter !== "all" || fabricanteFilter !== "all" || mesFilter !== "all" || anoFilter !== "all"
      ? { 
          uploadId: uploadIdNum,
          motivoRejeicao: motivoFilter !== "all" ? motivoFilter : undefined,
          estado: estadoFilter !== "all" ? estadoFilter : undefined,
          fabricante: fabricanteFilter !== "all" ? fabricanteFilter : undefined,
          mes: mesFilter !== "all" ? Number(mesFilter) : undefined,
          ano: anoFilter !== "all" ? Number(anoFilter) : undefined,
        }
      : undefined
  );
  const { data: filterOptions } = trpc.commercial.getFilterOptions.useQuery(
    uploadIdNum ? { uploadId: uploadIdNum } : undefined
  );
  const { data: rejectionsData } = trpc.commercial.getRejections.useQuery({
    uploadId: uploadIdNum,
    estado: estadoFilter !== "all" ? estadoFilter : undefined,
    motivoRejeicao: motivoFilter !== "all" ? motivoFilter : undefined,
    fabricante: fabricanteFilter !== "all" ? fabricanteFilter : undefined,
    search: searchQuery || undefined,
    page: currentPage,
    limit: 50,
  });

  // Mutations
  const uploadMutation = trpc.commercial.uploadExcel.useMutation({
    onSuccess: (result) => {
      toast.success(`Arquivo importado com sucesso! ${result.totalRecords} registros processados.`);
      setIsUploading(false);
      utils.commercial.getUploads.invalidate();
      utils.commercial.getAnalytics.invalidate();
      utils.commercial.getRejections.invalidate();
      utils.commercial.getFilterOptions.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
      setIsUploading(false);
    },
  });

  const deleteMutation = trpc.commercial.deleteUpload.useMutation({
    onSuccess: () => {
      toast.success("Upload excluído com sucesso!");
      setDeleteDialogOpen(false);
      setDeleteUploadId(null);
      if (selectedUploadId === String(deleteUploadId)) {
        setSelectedUploadId("all");
      }
      utils.commercial.getUploads.invalidate();
      utils.commercial.getAnalytics.invalidate();
      utils.commercial.getRejections.invalidate();
      utils.commercial.getFilterOptions.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const utils = trpc.useUtils();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel.sheet.macroEnabled.12",
    ];
    const validExtensions = [".xls", ".xlsx", ".xlsm"];
    const hasValidExtension = validExtensions.some((ext) => file.name.toLowerCase().endsWith(ext));

    if (!validTypes.includes(file.type) && !hasValidExtension) {
      toast.error("Formato inválido. Envie um arquivo Excel (.xls, .xlsx, .xlsm)");
      return;
    }

    // Check file size (max 50MB)
    if (file.size > 50 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Tamanho máximo: 50MB");
      return;
    }

    setIsUploading(true);

    try {
      // Read file as base64
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        uploadMutation.mutate({
          fileName: file.name,
          originalName: file.name,
          fileData: base64,
        });
      };
      reader.readAsDataURL(file);
    } catch (error) {
      toast.error("Erro ao ler arquivo");
      setIsUploading(false);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat("pt-BR").format(value);
  };

  const tabs = [
    { id: "analise" as TabType, label: "Análise Comercial", icon: BarChart3 },
    { id: "rejeicoes" as TabType, label: "Rejeições PDE", icon: AlertTriangle },
    { id: "importar" as TabType, label: "Importar Dados", icon: Upload },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-[var(--background)]">
      {/* Header */}
      <div className="bg-muted/50 backdrop-blur-sm border-b border-border">
        <div className="container max-w-7xl 2xl:max-w-[1600px] min-[1920px]:max-w-[1800px] py-3 sm:py-4 px-2 sm:px-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-start sm:items-center gap-2 sm:gap-4 flex-1 min-w-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/comercial")}
                className="text-foreground hover:bg-muted/50 flex-shrink-0"
              >
                <ArrowLeft size={20} />
              </Button>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2 sm:gap-3 flex-wrap">
                  <Building2 size={24} className="flex-shrink-0" />
                  <span className="break-words">Comercial</span>
                </h1>
                <p className="text-muted-foreground text-xs sm:text-sm mt-0.5 break-words">
                  Análise de rejeições PDE e dados comerciais
                </p>
              </div>
            </div>

            {/* Upload Filter */}
            <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto flex-shrink-0">
              <Select value={selectedUploadId} onValueChange={setSelectedUploadId}>
                <SelectTrigger className="w-full sm:w-[250px] bg-muted/50 border-border text-foreground text-xs sm:text-sm">
                  <SelectValue placeholder="Todos os uploads" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os uploads</SelectItem>
                  {uploads.map((u: any) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.originalName} ({formatNumber(u.totalRecords || 0)} reg.)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="container max-w-7xl 2xl:max-w-[1600px] min-[1920px]:max-w-[1800px] py-4 sm:py-6 px-2 sm:px-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-4 mb-6">
          <Card className="bg-red-50 border border-red-200 text-foreground hover:border-red-300 transition-all">
            <CardContent className="p-3 sm:p-5 text-center">
              <AlertTriangle className="mx-auto mb-2 sm:mb-3 text-red-600" size={24} />
              <p className="text-xl sm:text-2xl md:text-3xl font-bold text-red-700 mb-1 break-words">
                {formatNumber(analytics?.totalRejeicoes || 0)}
              </p>
              <p className="text-xs text-red-200 font-medium">Total Rejeições</p>
            </CardContent>
          </Card>
          <Card className="bg-yellow-50 border border-yellow-200 text-foreground hover:border-yellow-300 transition-all">
            <CardContent className="p-3 sm:p-5 text-center">
              <DollarSign className="mx-auto mb-2 sm:mb-3 text-amber-700" size={24} />
              <p className="text-lg sm:text-2xl md:text-3xl font-bold text-amber-700 mb-1 break-words">
                {formatCurrency(analytics?.valorTotalRejeitado || 0)}
              </p>
              <p className="text-xs text-yellow-200 font-medium">Valor Rejeitado</p>
            </CardContent>
          </Card>
          <Card className="bg-blue-50 border border-blue-200 text-foreground hover:border-blue-300 transition-all">
            <CardContent className="p-3 sm:p-5 text-center">
              <ShoppingCart className="mx-auto mb-2 sm:mb-3 text-blue-700" size={24} />
              <p className="text-lg sm:text-2xl md:text-3xl font-bold text-blue-700 mb-1 break-words">
                {formatNumber(analytics?.qtdTotalSolicitada || 0)}
              </p>
              <p className="text-xs text-muted-foreground font-medium">Qtd Solicitada</p>
            </CardContent>
          </Card>
          <Card className="bg-green-50 border border-green-200 text-foreground hover:border-green-300 transition-all">
            <CardContent className="p-3 sm:p-5 text-center">
              <Package className="mx-auto mb-2 sm:mb-3 text-green-700" size={24} />
              <p className="text-lg sm:text-2xl md:text-3xl font-bold text-green-700 mb-1 break-words">
                {formatNumber(analytics?.qtdTotalAtendida || 0)}
              </p>
              <p className="text-xs text-green-200 font-medium">Qtd Atendida</p>
            </CardContent>
          </Card>
          <Card className="bg-purple-50 border border-purple-200 text-foreground hover:border-purple-300 transition-all">
            <CardContent className="p-3 sm:p-5 text-center">
              <FileSpreadsheet className="mx-auto mb-2 sm:mb-3 text-purple-700" size={24} />
              <p className="text-lg sm:text-2xl md:text-3xl font-bold text-purple-700 mb-1 break-words">
                {uploads.length}
              </p>
              <p className="text-xs text-purple-200 font-medium">Arquivos Importados</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg font-medium text-xs sm:text-sm transition-all flex-1 sm:flex-none justify-center sm:justify-start ${
                activeTab === tab.id
                  ? "bg-white text-[#003366] shadow-lg"
                  : "bg-muted/50 text-foreground hover:bg-accent"
              }`}
            >
              <tab.icon size={16} />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden text-xs">{tab.label.split(' ')[0]}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "analise" && (
          <AnaliseTab analytics={analytics} formatNumber={formatNumber} formatCurrency={formatCurrency} setSelectedMotivo={setSelectedMotivo} />
        )}

        {activeTab === "rejeicoes" && (
          <RejecoesTab
            rejectionsData={rejectionsData}
            filterOptions={filterOptions}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            estadoFilter={estadoFilter}
            setEstadoFilter={setEstadoFilter}
            motivoFilter={motivoFilter}
            setMotivoFilter={setMotivoFilter}
            fabricanteFilter={fabricanteFilter}
            setFabricanteFilter={setFabricanteFilter}
            mesFilter={mesFilter}
            setMesFilter={setMesFilter}
            anoFilter={anoFilter}
            setAnoFilter={setAnoFilter}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            formatCurrency={formatCurrency}
            formatNumber={formatNumber}
          />
        )}

        {activeTab === "importar" && (
          <ImportarTab
            uploads={uploads}
            isUploading={isUploading}
            fileInputRef={fileInputRef}
            handleFileUpload={handleFileUpload}
            setDeleteUploadId={setDeleteUploadId}
            setDeleteDialogOpen={setDeleteDialogOpen}
            formatNumber={formatNumber}
          />
        )}
      </div>

      {/* Motivo Detalhes Modal */}
      {selectedMotivo && (
        <MotivoDetalhesModal
          isOpen={!!selectedMotivo}
          onClose={() => setSelectedMotivo(null)}
          motivo={selectedMotivo}
          uploadId={uploadIdNum}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Tem certeza que deseja excluir este upload? Todos os dados importados serão removidos permanentemente.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              className="bg-transparent border-blue-300 text-foreground hover:bg-muted/50"
            >
              Cancelar
            </Button>
            <Button
              onClick={() => deleteUploadId && deleteMutation.mutate({ id: deleteUploadId })}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-foreground"
            >
              {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== ANÁLISE TAB ====================

function AnaliseTab({
  analytics,
  formatNumber,
  formatCurrency,
  setSelectedMotivo,
}: {
  analytics: any;
  formatNumber: (v: number) => string;
  formatCurrency: (v: number) => string;
  setSelectedMotivo: (motivo: string) => void;
}) {
  if (!analytics || analytics.totalRejeicoes === 0) {
    return (
      <div className="text-center py-16">
        <BarChart3 size={64} className="mx-auto text-muted-foreground/40 mb-4" />
        <p className="text-muted-foreground text-lg">Nenhum dado para análise</p>
        <p className="text-muted-foreground/70 text-sm mt-2">
          Importe um arquivo Excel na aba "Importar Dados" para visualizar análises
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Rejeições por Motivo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-white/95 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-[#003366] flex items-center gap-2">
              <TrendingDown size={20} />
              Rejeições por Motivo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analytics.byMotivo?.map((item: any, idx: number) => {
                const percentage = ((item.total / analytics.totalRejeicoes) * 100).toFixed(1);
                const colors = ["bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-blue-500", "bg-purple-500"];
                return (
                  <div key={idx} className="cursor-pointer hover:bg-gray-50 p-2 rounded transition-colors" onClick={() => setSelectedMotivo(item.motivoRejeicao)}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700 truncate max-w-[70%]">
                        {item.motivoRejeicao || "Sem motivo"}
                      </span>
                      <span className="font-semibold text-gray-900">
                        {formatNumber(item.total)} ({percentage}%)
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                      <div
                        className={`${colors[idx % colors.length]} h-2.5 rounded-full transition-all`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Rejeições por Estado */}
        <Card className="bg-white/95 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-[#003366] flex items-center gap-2">
              <MapPin size={20} />
              Rejeições por Estado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analytics.byEstado?.map((item: any, idx: number) => {
                const percentage = ((item.total / analytics.totalRejeicoes) * 100).toFixed(1);
                const colors = ["bg-blue-500", "bg-green-500", "bg-purple-500", "bg-pink-500"];
                return (
                  <div key={idx}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700">{item.estado || "N/A"}</span>
                      <span className="font-semibold text-gray-900">
                        {formatNumber(item.total)} ({percentage}%)
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                      <div
                        className={`${colors[idx % colors.length]} h-2.5 rounded-full transition-all`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Fabricantes */}
      <Card className="bg-white/95 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-[#003366] flex items-center gap-2">
            <Building2 size={20} />
            Top 10 Fabricantes com Mais Rejeições
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 text-gray-600">#</th>
                  <th className="text-left py-2 px-3 text-gray-600">Fabricante</th>
                  <th className="text-right py-2 px-3 text-gray-600">Rejeições</th>
                  <th className="text-right py-2 px-3 text-gray-600">%</th>
                </tr>
              </thead>
              <tbody>
                {analytics.byFabricante?.map((item: any, idx: number) => (
                  <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-3 text-muted-foreground">{idx + 1}</td>
                    <td className="py-2 px-3 font-medium text-gray-900">{item.fabricante || "N/A"}</td>
                    <td className="py-2 px-3 text-right font-semibold">{formatNumber(item.total)}</td>
                    <td className="py-2 px-3 text-right text-gray-600">
                      {((item.total / analytics.totalRejeicoes) * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Top Produtos e Top Clientes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-white/95 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-[#003366] flex items-center gap-2">
              <Package size={20} />
              Top 10 Produtos Mais Rejeitados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {analytics.topProdutos?.map((item: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.produto || "N/A"}</p>
                    <p className="text-xs text-muted-foreground">Cód: {item.codProduto}</p>
                  </div>
                  <span className="ml-3 text-sm font-bold text-red-600">{formatNumber(item.total)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/95 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-[#003366] flex items-center gap-2">
              <Users size={20} />
              Top 10 Clientes com Mais Rejeições
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {analytics.topClientes?.map((item: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.razaoSocial || "N/A"}</p>
                    <p className="text-xs text-muted-foreground">CNPJ: {item.cnpj}</p>
                  </div>
                  <span className="ml-3 text-sm font-bold text-orange-600">{formatNumber(item.total)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ==================== REJEIÇÕES TAB ====================

function RejecoesTab({
  rejectionsData,
  filterOptions,
  searchQuery,
  setSearchQuery,
  estadoFilter,
  setEstadoFilter,
  motivoFilter,
  setMotivoFilter,
  fabricanteFilter,
  setFabricanteFilter,
  mesFilter,
  setMesFilter,
  anoFilter,
  setAnoFilter,
  currentPage,
  setCurrentPage,
  formatCurrency,
  formatNumber,
}: any) {
  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="bg-muted/50 backdrop-blur-sm border-border">
        <CardContent className="p-3 sm:p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 sm:gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70" size={16} />
              <Input
                placeholder="Buscar produto, cliente, CNPJ..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-9 bg-muted/50 border-border text-foreground placeholder:text-muted-foreground/70"
              />
            </div>
            <Select value={estadoFilter} onValueChange={(v) => { setEstadoFilter(v); setCurrentPage(1); }}>
              <SelectTrigger className="bg-muted/50 border-border text-foreground">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Estados</SelectItem>
                {filterOptions?.estados?.map((e: string) => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={motivoFilter} onValueChange={(v) => { setMotivoFilter(v); setCurrentPage(1); }}>
              <SelectTrigger className="bg-muted/50 border-border text-foreground">
                <SelectValue placeholder="Motivo Rejeição" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Motivos</SelectItem>
                {filterOptions?.motivos?.map((m: string) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={fabricanteFilter} onValueChange={(v) => { setFabricanteFilter(v); setCurrentPage(1); }}>
              <SelectTrigger className="bg-muted/50 border-border text-foreground">
                <SelectValue placeholder="Fabricante" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Fabricantes</SelectItem>
                {filterOptions?.fabricantes?.map((f: string) => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={anoFilter} onValueChange={(v) => { setAnoFilter(v); setCurrentPage(1); }}>
              <SelectTrigger className="bg-muted/50 border-border text-foreground">
                <SelectValue placeholder="Ano" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Anos</SelectItem>
                <SelectItem value="2025">2025</SelectItem>
                <SelectItem value="2024">2024</SelectItem>
                <SelectItem value="2023">2023</SelectItem>
              </SelectContent>
            </Select>
            <Select value={mesFilter} onValueChange={(v) => { setMesFilter(v); setCurrentPage(1); }}>
              <SelectTrigger className="bg-muted/50 border-border text-foreground">
                <SelectValue placeholder="Mês" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Meses</SelectItem>
                <SelectItem value="1">Janeiro</SelectItem>
                <SelectItem value="2">Fevereiro</SelectItem>
                <SelectItem value="3">Março</SelectItem>
                <SelectItem value="4">Abril</SelectItem>
                <SelectItem value="5">Maio</SelectItem>
                <SelectItem value="6">Junho</SelectItem>
                <SelectItem value="7">Julho</SelectItem>
                <SelectItem value="8">Agosto</SelectItem>
                <SelectItem value="9">Setembro</SelectItem>
                <SelectItem value="10">Outubro</SelectItem>
                <SelectItem value="11">Novembro</SelectItem>
                <SelectItem value="12">Dezembro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card className="bg-white/95 backdrop-blur-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead>
                <tr className="bg-gradient-to-r from-blue-50 to-blue-100 border-b-2 border-blue-200 sticky top-0">
                  <th className="text-left py-3 sm:py-5 px-2 sm:px-5 text-gray-700 font-semibold text-xs sm:text-sm">Data</th>
                  <th className="text-left py-3 sm:py-5 px-2 sm:px-5 text-gray-700 font-semibold text-xs sm:text-sm">UF</th>
                  <th className="text-left py-3 sm:py-5 px-2 sm:px-5 text-gray-700 font-semibold text-xs sm:text-sm">Cliente</th>
                  <th className="text-left py-3 sm:py-5 px-2 sm:px-5 text-gray-700 font-semibold text-xs sm:text-sm">Produto</th>
                   <th className="text-right py-3 sm:py-5 px-2 sm:px-5 text-gray-700 font-semibold text-xs sm:text-sm">Preço Unit. (R$)</th>
                   <th className="text-right py-3 sm:py-5 px-2 sm:px-5 text-gray-700 font-semibold text-xs sm:text-sm">Qtd Sol. (UN)</th>
                   <th className="text-right py-3 sm:py-5 px-2 sm:px-5 text-gray-700 font-semibold text-xs sm:text-sm">Qtd Atend. (UN)</th>
                  <th className="text-left py-3 sm:py-5 px-2 sm:px-5 text-gray-700 font-semibold text-xs sm:text-sm">Fabricante</th>
                  <th className="text-left py-3 sm:py-5 px-2 sm:px-5 text-gray-700 font-semibold text-xs sm:text-sm">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {rejectionsData?.data?.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-muted-foreground">
                      Nenhuma rejeição encontrada
                    </td>
                  </tr>
                )}
                {rejectionsData?.data?.map((r: any, idx: number) => (
                  <tr key={r.id} className={`border-b border-gray-200 hover:bg-blue-50 transition-colors ${
                    idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                  }`}>
                    <td className="py-3 sm:py-5 px-2 sm:px-5 text-gray-900 whitespace-nowrap font-medium text-xs sm:text-sm">{r.dataRegistro || "-"}</td>
                    <td className="py-3 sm:py-5 px-2 sm:px-5">
                      <span className="px-2 sm:px-3 py-0.5 sm:py-1 bg-blue-100 text-blue-800 rounded-md text-xs font-semibold">
                        {r.estado || "-"}
                      </span>
                    </td>
                    <td className="py-3 sm:py-5 px-2 sm:px-5 max-w-[150px] sm:max-w-[200px] break-words text-gray-900 text-xs sm:text-sm" title={r.razaoSocial}>
                      {r.razaoSocial || "-"}
                    </td>
                    <td className="py-3 sm:py-5 px-2 sm:px-5 max-w-[150px] sm:max-w-[200px]" title={r.produto}>
                      <span className="text-xs text-gray-600 font-medium block">{r.codProduto}</span>
                      <span className="text-gray-900 font-medium text-xs sm:text-sm break-words">{r.produto || "-"}</span>
                    </td>
                    <td className="py-3 sm:py-5 px-2 sm:px-5 text-right whitespace-nowrap text-gray-900 font-semibold text-xs sm:text-sm">
                      {r.precoUnitario ? `R$ ${formatCurrency(Number(r.precoUnitario))}` : "-"}
                    </td>
                    <td className="py-3 sm:py-5 px-2 sm:px-5 text-right text-gray-900 font-semibold text-xs sm:text-sm">{r.qtdSolicitado ? `${r.qtdSolicitado} UN` : "-"}</td>
                    <td className="py-3 sm:py-5 px-2 sm:px-5 text-right text-gray-900 font-semibold text-xs sm:text-sm">{r.qtdAtendido ? `${r.qtdAtendido} UN` : "-"}</td>
                    <td className="py-3 sm:py-5 px-2 sm:px-5 max-w-[120px] sm:max-w-[150px] break-words text-gray-900 text-xs sm:text-sm" title={r.fabricante}>
                      {r.fabricante || "-"}
                    </td>
                    <td className="py-3 sm:py-5 px-2 sm:px-5">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium break-words ${
                        r.motivoRejeicao?.includes("Estoque")
                          ? "bg-red-100 text-red-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}>
                        {r.motivoRejeicao || "-"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {rejectionsData && rejectionsData.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <span className="text-sm text-gray-900 font-medium">
                Mostrando {((currentPage - 1) * 50) + 1} - {Math.min(currentPage * 50, rejectionsData.total)} de{" "}
                {formatNumber(rejectionsData.total)} registros
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p: number) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft size={16} />
                </Button>
                <span className="text-sm text-gray-900 font-medium">
                  Página {currentPage} de {rejectionsData.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p: number) => Math.min(rejectionsData.totalPages, p + 1))}
                  disabled={currentPage === rejectionsData.totalPages}
                >
                  <ChevronRight size={16} />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ==================== IMPORTAR TAB ====================

function ImportarTab({
  uploads,
  isUploading,
  fileInputRef,
  handleFileUpload,
  setDeleteUploadId,
  setDeleteDialogOpen,
  formatNumber,
}: any) {
  return (
    <div className="space-y-6">
      {/* Upload Area */}
      <Card className="bg-white/95 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-[#003366] flex items-center gap-2">
            <Upload size={20} />
            Importar Arquivo Excel
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
            {isUploading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 size={48} className="text-blue-500 animate-spin" />
                <p className="text-gray-700 font-medium">Processando arquivo...</p>
                <p className="text-muted-foreground text-sm">
                  Isso pode levar alguns minutos para arquivos grandes
                </p>
              </div>
            ) : (
              <>
                <FileSpreadsheet size={48} className="mx-auto text-muted-foreground mb-4" />
                <p className="text-gray-700 font-medium mb-2">
                  Arraste um arquivo Excel ou clique para selecionar
                </p>
                <p className="text-muted-foreground text-sm mb-4">
                  Formatos aceitos: .xls, .xlsx, .xlsm (máx. 50MB)
                </p>
                <p className="text-muted-foreground text-xs mb-4">
                  O arquivo deve conter as abas "Atualizavel" (rejeições PDE) e/ou "Cadastro Pro" (produtos)
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xls,.xlsx,.xlsm"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="excel-upload"
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-[#003366] hover:bg-[#004080] text-foreground"
                >
                  <Upload size={16} className="mr-2" />
                  Selecionar Arquivo
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Upload History */}
      <Card className="bg-white/95 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-[#003366] flex items-center gap-2">
            <FileSpreadsheet size={20} />
            Histórico de Importações
          </CardTitle>
        </CardHeader>
        <CardContent>
          {uploads.length === 0 ? (
            <div className="text-center py-8">
              <FileSpreadsheet size={48} className="mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">Nenhum arquivo importado ainda</p>
            </div>
          ) : (
            <div className="space-y-3">
              {uploads.map((upload: any) => (
                <div
                  key={upload.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <FileSpreadsheet
                      size={24}
                      className={
                        upload.status === "completed"
                          ? "text-green-600"
                          : upload.status === "error"
                          ? "text-red-600"
                          : "text-yellow-600"
                      }
                    />
                    <div>
                      <p className="font-medium text-gray-900">{upload.originalName}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>
                          {new Date(Number(upload.createdAt)).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <span>{formatNumber(upload.totalRecords || 0)} registros</span>
                        <span>por {upload.uploadedByName}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        upload.status === "completed"
                          ? "bg-green-100 text-green-800"
                          : upload.status === "error"
                          ? "bg-red-100 text-red-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {upload.status === "completed"
                        ? "Concluído"
                        : upload.status === "error"
                        ? "Erro"
                        : "Processando"}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setDeleteUploadId(upload.id);
                        setDeleteDialogOpen(true);
                      }}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
