import { useState } from "react";
import { trpc } from "@/lib/trpc";
import SubmodulePage from "@/components/templates/SubmodulePage";
import { Bug, CheckCircle2, AlertTriangle, Info, Filter, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function AdminErrorLogs() {
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [resolvedFilter, setResolvedFilter] = useState<string>("pending");
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [selectedErrorId, setSelectedErrorId] = useState<number | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const { data: errors = [], isLoading, refetch } = trpc.admin.listErrors.useQuery({
    module: moduleFilter !== "all" ? moduleFilter : undefined,
    severity: severityFilter !== "all" ? (severityFilter as "error" | "warning" | "info") : undefined,
    resolved: resolvedFilter === "all" ? undefined : resolvedFilter === "resolved",
    limit: 200,
  });

  const { data: unresolvedCounts = [] } = trpc.admin.countUnresolvedErrors.useQuery();

  const resolveMutation = trpc.admin.resolveError.useMutation({
    onSuccess: () => {
      toast.success("Erro marcado como resolvido");
      utils.admin.listErrors.invalidate();
      utils.admin.countUnresolvedErrors.invalidate();
      setResolveDialogOpen(false);
      setResolutionNotes("");
    },
    onError: (err) => toast.error(err.message),
  });

  const totalUnresolved = unresolvedCounts.reduce((sum, m) => sum + Number(m.count), 0);

  const severityIcon = (severity: string) => {
    switch (severity) {
      case "error": return <AlertTriangle size={14} className="text-red-500" />;
      case "warning": return <AlertTriangle size={14} className="text-amber-500" />;
      case "info": return <Info size={14} className="text-blue-500" />;
      default: return null;
    }
  };

  const severityBadge = (severity: string) => {
    switch (severity) {
      case "error": return <Badge variant="destructive" className="text-xs">Erro</Badge>;
      case "warning": return <Badge className="text-xs bg-amber-100 text-amber-800 hover:bg-amber-100">Aviso</Badge>;
      case "info": return <Badge className="text-xs bg-blue-100 text-blue-800 hover:bg-blue-100">Info</Badge>;
      default: return null;
    }
  };

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <SubmodulePage
      title="Logs de Erros"
      subtitle="Erros registrados pelo sistema para analise da equipe de TI"
      icon={<Bug size={20} />}
      iconGradient="from-red-500 to-red-600"
      backPath="/admin"
      backLabel="Administração"
    >
      {/* Summary */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
          <AlertTriangle size={16} className="text-red-500" />
          <span className="text-sm font-medium text-red-700">
            {totalUnresolved} erro{totalUnresolved !== 1 ? "s" : ""} pendente{totalUnresolved !== 1 ? "s" : ""}
          </span>
        </div>
        {unresolvedCounts.map((m) => (
          <div key={m.module} className="text-xs text-muted-foreground">
            <span className="font-medium">{m.module}:</span> {m.count}
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={() => refetch()} className="ml-auto">
          <RefreshCw size={14} className="mr-1" /> Atualizar
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap items-center">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Filtros:</span>
        </div>
        <Select value={moduleFilter} onValueChange={setModuleFilter}>
          <SelectTrigger className="w-[150px] h-8 text-xs">
            <SelectValue placeholder="Modulo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos modulos</SelectItem>
            <SelectItem value="repasses">Repasses</SelectItem>
            <SelectItem value="chamados">Chamados</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="comercial">Comercial</SelectItem>
            <SelectItem value="projetos">Projetos</SelectItem>
          </SelectContent>
        </Select>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-[130px] h-8 text-xs">
            <SelectValue placeholder="Severidade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="error">Erro</SelectItem>
            <SelectItem value="warning">Aviso</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>
        <Select value={resolvedFilter} onValueChange={setResolvedFilter}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pendentes</SelectItem>
            <SelectItem value="resolved">Resolvidos</SelectItem>
            <SelectItem value="all">Todos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Error List */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Carregando...</div>
      ) : errors.length === 0 ? (
        <div className="text-center py-12">
          <CheckCircle2 size={48} className="mx-auto text-emerald-400 mb-3" />
          <p className="text-muted-foreground text-sm">Nenhum erro encontrado com os filtros atuais.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {errors.map((error: any) => (
            <div
              key={error.id}
              className={`border rounded-xl p-4 transition-colors ${
                error.resolved ? "bg-muted/30 border-border/50" : "bg-card border-border hover:border-red-200"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {severityIcon(error.severity)}
                    <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {error.module}.{error.operation}
                    </span>
                    {severityBadge(error.severity)}
                    {error.resolved ? (
                      <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-200">
                        Resolvido
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-sm font-medium text-foreground mt-1 break-words">
                    {error.errorMessage}
                  </p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span>{formatDate(Number(error.createdAt))}</span>
                    {error.userName && <span>por {error.userName}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setExpandedId(expandedId === error.id ? null : error.id)}
                  >
                    {expandedId === error.id ? "Ocultar" : "Detalhes"}
                  </Button>
                  {!error.resolved && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                      onClick={() => {
                        setSelectedErrorId(error.id);
                        setResolveDialogOpen(true);
                      }}
                    >
                      <CheckCircle2 size={12} className="mr-1" /> Resolver
                    </Button>
                  )}
                </div>
              </div>

              {/* Expanded details */}
              {expandedId === error.id && (
                <div className="mt-3 pt-3 border-t border-border/60 space-y-2">
                  {error.stackTrace && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Stack Trace:</p>
                      <pre className="text-xs bg-muted/50 p-2 rounded overflow-x-auto max-h-40 whitespace-pre-wrap break-words">
                        {error.stackTrace}
                      </pre>
                    </div>
                  )}
                  {error.context && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Contexto:</p>
                      <pre className="text-xs bg-muted/50 p-2 rounded overflow-x-auto max-h-40 whitespace-pre-wrap break-words">
                        {typeof error.context === "string"
                          ? error.context
                          : JSON.stringify(error.context, null, 2)}
                      </pre>
                    </div>
                  )}
                  {error.resolutionNotes && (
                    <div>
                      <p className="text-xs font-medium text-emerald-600 mb-1">Notas de resolucao:</p>
                      <p className="text-xs text-muted-foreground">{error.resolutionNotes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Resolve Dialog */}
      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar erro como resolvido</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Adicione notas sobre como o erro foi resolvido (opcional):
            </p>
            <Textarea
              placeholder="Ex: Corrigido validacao de data no backend, deploy em 26/05..."
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResolveDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (selectedErrorId) {
                  resolveMutation.mutate({ id: selectedErrorId, notes: resolutionNotes || undefined });
                }
              }}
              disabled={resolveMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <CheckCircle2 size={14} className="mr-1" />
              {resolveMutation.isPending ? "Salvando..." : "Confirmar resolucao"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SubmodulePage>
  );
}
