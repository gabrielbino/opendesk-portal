import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  CheckSquare,
  Clock,
  DollarSign,
  Download,
  Loader2,
  Package,
  Search,
  Timer,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import MultiSelectFilter from "@/components/MultiSelectFilter";
import PanelHeaderActions from "@/components/PanelHeaderActions";
import PanelHeader from "@/components/PanelHeader";
import SortableHeader from "@/components/SortableHeader";
import { DATA_TABLE_SHELL, DATA_TABLE_EL, DATA_TABLE_HEAD_ROW } from "@/components/dataTable";
import KpiCard from "@/components/templates/KpiCard";
import KpiGrid from "@/components/KpiGrid";
import SegmentedTabs from "@/components/SegmentedTabs";
import ValidadesCurtasRulesModal from "./ValidadesCurtasRulesModal";
import { DataTablePagination } from "@/components/DataTablePagination";
import { useRangeSelection } from "@/hooks/useRangeSelection";
import { VencimentoTag } from "@/components/VencimentoTag";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useAuth } from "@/_core/hooks/useAuth";
import { ACTIONS, MODULES, hasPermission } from "@shared/permissions";
import {
  BANDAS_ORDER,
  BANDAS_CONFIG,
  TIPO_FILTRO_OPTIONS,
  VC_COMPRADOR_NAO_ATRIBUIDO,
  type BandaId,
  type TipoFiltroVC,
  type RegionView,
  type ItemValidadeCurta,
} from "@shared/validadesCurtas";

// ─── Formatters ──────────────────────────────────────────────────────────────
const intFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const currFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

function formatDias(dias: number): string {
  if (!isFinite(dias)) return "∞";
  return dias.toFixed(0);
}

// ─── Sort helpers ────────────────────────────────────────────────────────────
type SortKey = "codigo" | "nomeProduto" | "fornecedor" | "comprador" | "estoqueAtual" | "vendaMedia" | "diasAteVencer" | "diasParaVender" | "valorEmRisco" | "banda";
type SortDir = "asc" | "desc";

const BANDA_ORDER_MAP: Record<BandaId, number> = {
  descarte: 0,
  bonificavel: 1,
  alto_risco: 2,
  alerta: 3,
  atencao: 4,
};

function sortItems(items: ItemValidadeCurta[], key: SortKey, dir: SortDir): ItemValidadeCurta[] {
  return [...items].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "codigo": cmp = a.codigo - b.codigo; break;
      case "nomeProduto": cmp = a.nomeProduto.localeCompare(b.nomeProduto); break;
      case "fornecedor": cmp = a.fornecedor.localeCompare(b.fornecedor); break;
      case "comprador": cmp = (a.comprador ?? "~").localeCompare(b.comprador ?? "~"); break;
      case "estoqueAtual": cmp = a.estoqueAtual - b.estoqueAtual; break;
      case "vendaMedia": cmp = a.vendaMedia - b.vendaMedia; break;
      case "diasAteVencer": cmp = a.diasAteVencer - b.diasAteVencer; break;
      case "diasParaVender": {
        const av = isFinite(a.diasParaVender) ? a.diasParaVender : 999999;
        const bv = isFinite(b.diasParaVender) ? b.diasParaVender : 999999;
        cmp = av - bv;
        break;
      }
      case "valorEmRisco": cmp = a.valorEmRisco - b.valorEmRisco; break;
      case "banda": cmp = BANDA_ORDER_MAP[a.banda] - BANDA_ORDER_MAP[b.banda]; break;
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function ValidadesCurtasDashboard() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const podeEditar = hasPermission(user, MODULES.VALIDADES_CURTAS, ACTIONS.UPDATE);

  // State
  const [activeRegion, setActiveRegion] = useState<RegionView>("UNIFICADO");
  // Multi-seleção de tipos (Set vazio = "todos")
  const [tiposSel, setTiposSel] = useState<Set<TipoFiltroVC>>(new Set());
  // Multi-seleção de bandas (Set vazio = todas)
  const [bandasSel, setBandasSel] = useState<Set<BandaId>>(new Set());
  const [busca, setBusca] = useState("");
  // Filtro por comprador (multi-seleção; Set vazio = todos).
  const [compradoresSel, setCompradoresSel] = useState<Set<string>>(new Set());
  // Chip "Vencidos" como filtro (só itens já vencidos).
  const [soVencidos, setSoVencidos] = useState(false);
  // Drill do KPI "Mais Urgente": foca no(s) item(ns) com o menor prazo (não vencidos).
  const [focoMaisUrgente, setFocoMaisUrgente] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("diasAteVencer");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 50;

  // Reset page on filter change
  useEffect(() => {
    setPage(1);
  }, [activeRegion, tiposSel, bandasSel, compradoresSel, soVencidos, focoMaisUrgente, busca, sortKey, sortDir]);

  // Build query params
  const tipoFiltrosParam = useMemo(() => {
    const arr = Array.from(tiposSel);
    return arr.length === 0 ? ["todos"] as TipoFiltroVC[] : arr;
  }, [tiposSel]);

  const bandaFiltrosParam = useMemo(() => Array.from(bandasSel), [bandasSel]);

  // Params compartilhados (query + export) — filtros de servidor.
  const filtrosServidor = {
    region: activeRegion,
    tipoFiltros: tipoFiltrosParam,
    bandaFiltros: bandaFiltrosParam,
    compradorFiltros: compradoresSel.size ? Array.from(compradoresSel) : undefined,
    soVencidos: soVencidos || undefined,
  };

  // Query
  const dashboardQuery = trpc.validadesCurtas.getDashboard.useQuery(filtrosServidor);
  const data = dashboardQuery.data;

  const refreshMutation = trpc.validadesCurtas.refreshDados.useMutation({
    onSuccess: () => dashboardQuery.refetch(),
  });

  const exportMutation = trpc.validadesCurtas.exportXlsx.useMutation();

  // Filter by search term (client-side on top of server filters)
  const filteredItems = useMemo(() => {
    if (!data) return [];
    const termo = busca.trim().toLowerCase();
    if (!termo) return data.itens;
    return data.itens.filter(
      (item) =>
        item.nomeProduto.toLowerCase().includes(termo) ||
        item.fornecedor.toLowerCase().includes(termo) ||
        String(item.codigo).includes(termo)
    );
  }, [data, busca]);

  // Drill "Mais Urgente": foca no(s) item(ns) com o menor prazo entre os NÃO vencidos.
  // Usa o MESMO valor exibido no card (`menorDiasNaoVencido`, do servidor) para bater com o KPI.
  const minUrgente = data?.kpis.menorDiasNaoVencido ?? null;
  const focoItems = useMemo(() => {
    if (!focoMaisUrgente || minUrgente === null) return filteredItems;
    return filteredItems.filter((i) => i.diasAteVencer === minUrgente);
  }, [filteredItems, focoMaisUrgente, minUrgente]);

  // Sort
  const sortedItems = useMemo(() => sortItems(focoItems, sortKey, sortDir), [focoItems, sortKey, sortDir]);

  // Pagination
  const totalItems = sortedItems.length;
  const paginatedItems = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return sortedItems.slice(start, start + ITEMS_PER_PAGE);
  }, [sortedItems, page]);

  // Selection
  const selecao = useRangeSelection(paginatedItems.map((p) => p.codigo));

  // Selected KPIs
  const selectedMetrics = useMemo(() => {
    if (selecao.selectedCount === 0) return null;
    const selected = sortedItems.filter((i) => selecao.isSelected(i.codigo));
    return {
      count: selected.length,
      estoqueTotal: selected.reduce((s, i) => s + i.estoqueAtual, 0),
      valorEmRisco: selected.reduce((s, i) => s + i.valorEmRisco, 0),
    };
  }, [selecao, sortedItems]);

  // Export XLSX (mesmo padrão do Superestocados: gera no servidor, baixa no cliente).
  async function handleExport() {
    const selecionados =
      selecao.selectedCount > 0
        ? sortedItems.filter((i) => selecao.isSelected(i.codigo)).map((i) => i.codigo)
        : undefined;
    setIsExporting(true);
    try {
      const result = await exportMutation.mutateAsync({ ...filtrosServidor, codigos: selecionados });
      const bytes = atob(result.base64);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      const blob = new Blob([arr], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export falhou", err);
    } finally {
      setIsExporting(false);
    }
  }

  // Toggle handlers (multi-select)
  const toggleTipo = (tipo: TipoFiltroVC) => {
    if (tipo === "todos") {
      setTiposSel(new Set());
      return;
    }
    setTiposSel((prev) => {
      const next = new Set(prev);
      if (next.has(tipo)) next.delete(tipo);
      else next.add(tipo);
      return next;
    });
  };

  const toggleBanda = (banda: BandaId) => {
    setBandasSel((prev) => {
      const next = new Set(prev);
      if (next.has(banda)) next.delete(banda);
      else next.add(banda);
      return next;
    });
  };

  const clearBandas = () => setBandasSel(new Set());

  const toggleComprador = (nome: string) => {
    setCompradoresSel((prev) => {
      const next = new Set(prev);
      if (next.has(nome)) next.delete(nome);
      else next.add(nome);
      return next;
    });
  };

  // Sort handler
  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const renderSortableHeader = (label: string, key: SortKey, align: "left" | "center" | "right" = "left") => (
    <SortableHeader
      label={label}
      active={sortKey === key}
      direction={sortDir}
      onSort={() => handleSort(key)}
      align={align}
    />
  );

  // Vencimento status for VencimentoTag
  const getVencimentoStatus = (diasAteVencer: number) => {
    if (diasAteVencer <= 0) return "vencido" as const;
    if (diasAteVencer <= 120) return "proximo" as const;
    return "ok" as const;
  };

  // Use kpisGlobais for banda counts in the header (unaffected by tipo/banda filters)
  const globalBandaCounts = data?.kpisGlobais?.contagemPorBanda ?? data?.kpis.contagemPorBanda;
  const globalTotal = data?.kpisGlobais?.totalItens ?? data?.kpis.totalItens ?? 0;
  const globalVencidos = data?.kpisGlobais?.totalVencidos ?? data?.kpis.totalVencidos ?? 0;

  // Título da tabela no padrão Superestocados: "{tipo} — {região}" + contagem (sublinha).
  const tituloTipos =
    tiposSel.size === 0
      ? "Todos"
      : tiposSel.size === 1
        ? TIPO_FILTRO_OPTIONS.find((o) => o.value === Array.from(tiposSel)[0])?.label ?? "Todos"
        : `${tiposSel.size} tipos`;
  const regionLabel = activeRegion === "UNIFICADO" ? "Unificado" : activeRegion;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl 2xl:max-w-[1600px] space-y-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        {/* Header */}
        <PanelHeader
          onBack={() => setLocation("/negocios/estoque")}
          icon={Timer}
          title="Validades Curtas"
          subtitle="Itens com vencimento próximo e estoque parado"
          color="amber"
          actions={
            <PanelHeaderActions
              ultimaAtualizacaoMs={data?.ultimaAtualizacaoMs}
              onAtualizar={podeEditar ? () => refreshMutation.mutate({ region: activeRegion }) : undefined}
              atualizando={refreshMutation.isPending}
              modoTv={{ disabled: true }}
              onRegras={() => setRulesOpen(true)}
            />
          }
        />

        <ValidadesCurtasRulesModal open={rulesOpen} onOpenChange={setRulesOpen} />

        {/* Region Tabs */}
        <SegmentedTabs
          value={activeRegion}
          onValueChange={(v) => setActiveRegion(v as RegionView)}
          options={[
            { value: "SC", label: "SC" },
            { value: "RS", label: "RS" },
            { value: "UNIFICADO", label: "Unificado" },
          ]}
        />

        {/* Filtros (bandas + tipo) ACIMA dos KPIs — padrão Superestocados */}
        {/* Banda chips (multi-seleção) */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={clearBandas}
            aria-pressed={bandasSel.size === 0}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition",
              bandasSel.size === 0
                ? "border-slate-700 bg-slate-700 text-white shadow-sm"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
            )}
          >
            Todas
            <span className={cn(
              "inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1 py-0.5 text-[10px] font-bold",
              bandasSel.size === 0 ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
            )}>
              {globalTotal}
            </span>
          </button>
          {BANDAS_ORDER.map((bandaId) => {
            const cfg = BANDAS_CONFIG[bandaId];
            const count = globalBandaCounts?.[bandaId] ?? 0;
            const isActive = bandasSel.has(bandaId);
            return (
              <button
                key={bandaId}
                type="button"
                onClick={() => toggleBanda(bandaId)}
                aria-pressed={isActive}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                  isActive
                    ? `border-current ${cfg.bgColor} ${cfg.color} shadow-sm ring-1 ring-current/20`
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                )}
              >
                <span className="hidden sm:inline">{cfg.label}</span>
                <span className="sm:hidden">{cfg.label.slice(0, 4)}</span>
                <span className={cn(
                  "inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1 py-0.5 text-[10px] font-bold",
                  isActive ? "bg-current/10 text-current" : "bg-slate-100 text-slate-500"
                )}>
                  {count}
                </span>
              </button>
            );
          })}
          {/* Filtro "Vencidos" (itens com lote já vencido — contam na banda Descarte). */}
          {globalVencidos > 0 && (
            <button
              type="button"
              onClick={() => setSoVencidos((v) => { if (!v) setFocoMaisUrgente(false); return !v; })}
              aria-pressed={soVencidos}
              title="Filtrar só itens com lote já vencido"
              className={cn(
                "ml-1 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                soVencidos
                  ? "border-red-600 bg-red-600 text-white shadow-sm"
                  : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
              )}
            >
              Vencidos
              <span
                className={cn(
                  "inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1 py-0.5 text-[10px] font-bold",
                  soVencidos ? "bg-white/20 text-white" : "bg-red-100 text-red-700"
                )}
              >
                {globalVencidos}
              </span>
            </button>
          )}
        </div>

        {/* Tipo filtro (multi-seleção) */}
        <div className="flex flex-wrap gap-1.5">
          {TIPO_FILTRO_OPTIONS.map((opt) => {
            const isUnificado = opt.value === "todos";
            const isActive = isUnificado ? tiposSel.size === 0 : tiposSel.has(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleTipo(opt.value)}
                aria-pressed={isActive}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-[11px] font-medium transition",
                  isActive
                    ? "border-teal-600 bg-teal-600 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* KPIs (seguem os filtros ativos) */}
        <KpiGrid cols={4}>
          <KpiCard
            title="Itens em Risco"
            value={data ? intFmt.format(data.kpis.totalItens) : "—"}
            sublabel="vão vencer com estoque parado"
            loading={!data}
            icon={<AlertTriangle className="h-4 w-4" />}
            iconColor="text-amber-500"
            tooltip="Total de itens que entraram na regra de validade curta (com filtros aplicados)"
            valueClassName="tabular-nums text-slate-700"
          />
          <KpiCard
            title="Estoque Total"
            value={data ? intFmt.format(data.kpis.estoqueTotal) : "—"}
            sublabel="unidades paradas"
            loading={!data}
            icon={<Package className="h-4 w-4" />}
            iconColor="text-blue-500"
            tooltip="Soma do estoque de todos os itens em risco (com filtros aplicados)"
            valueClassName="tabular-nums text-slate-700"
          />
          <KpiCard
            title="Valor em Risco"
            value={data ? currFmt.format(data.kpis.valorEmRiscoTotal) : "—"}
            sublabel="custo exposto à perda"
            loading={!data}
            icon={<DollarSign className="h-4 w-4" />}
            iconColor="text-red-500"
            tooltip="Valor total a custo dos itens em risco de perda (com filtros aplicados)"
            valueClassName="tabular-nums text-red-700"
          />
          <KpiCard
            title="Mais Urgente"
            value={
              data
                ? data.kpis.menorDiasNaoVencido !== null
                  ? `${data.kpis.menorDiasNaoVencido} dias`
                  : "—"
                : "—"
            }
            loading={!data}
            icon={<Clock className="h-4 w-4" />}
            iconColor="text-purple-500"
            tooltip="Menor prazo até vencer entre os itens ainda NÃO vencidos (com filtros aplicados). Clique para ver só o(s) item(ns) mais urgente(s). Vencidos aparecem no chip 'Vencidos'."
            sublabel={data && data.kpis.totalVencidos > 0 ? `${intFmt.format(data.kpis.totalVencidos)} já vencidos` : undefined}
            sublabelColor="text-red-500"
            valueClassName="tabular-nums text-purple-700"
            onClick={minUrgente != null ? () => setFocoMaisUrgente((v) => !v) : undefined}
            active={focoMaisUrgente && minUrgente !== null}
          />
        </KpiGrid>

        {/* Selection KPIs */}
        {selectedMetrics && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-teal-600" />
              <p className="text-xs font-semibold text-teal-700 uppercase tracking-wider">
                Seleção ({selectedMetrics.count} {selectedMetrics.count === 1 ? "item" : "itens"})
              </p>
              <Button type="button" variant="ghost" size="sm" className="h-5 px-1.5 text-[10px]" onClick={selecao.clear}>
                Limpar
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-3 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-600">Estoque Seleção</p>
                <p className="text-xl font-bold tracking-tight text-teal-900 tabular-nums">
                  {intFmt.format(selectedMetrics.estoqueTotal)} unidades
                </p>
              </div>
              <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-3 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-600">Valor em Risco (Seleção)</p>
                <p className="text-xl font-bold tracking-tight text-teal-900 tabular-nums">
                  {currFmt.format(selectedMetrics.valorEmRisco)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-2 px-4 sm:px-6">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-0.5">
                <CardTitle className="text-base text-slate-900">
                  {tituloTipos} — {regionLabel}
                </CardTitle>
                <CardDescription className="text-xs">
                  {intFmt.format(totalItems)} {totalItems === 1 ? "item" : "itens"}
                </CardDescription>
              </div>
              {/* Busca + filtro de comprador + exportar (padrão Superestocados) */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative w-full sm:w-56">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar produto, código ou fornecedor..."
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    className="h-8 pl-8 text-xs"
                  />
                  {busca && (
                    <button
                      type="button"
                      onClick={() => setBusca("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {/* Filtro por comprador — componente compartilhado (Popover + Command + Checkbox) */}
                <MultiSelectFilter
                  icon={<Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                  label="Comprador"
                  pluralize={(n) => `${n} comprador${n > 1 ? "es" : ""}`}
                  options={data?.compradores ?? []}
                  selected={compradoresSel}
                  onToggle={toggleComprador}
                  onClear={() => setCompradoresSel(new Set())}
                  naoAtribuido={data?.temNaoAtribuido ? { value: VC_COMPRADOR_NAO_ATRIBUIDO, label: "Não atribuído" } : undefined}
                  searchPlaceholder="Buscar comprador…"
                  emptyLabel="Nenhum comprador."
                  triggerClassName="w-full sm:w-[200px]"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 gap-1.5 text-xs"
                  onClick={handleExport}
                  disabled={isExporting || totalItems === 0}
                  title="Exportar itens (respeita os filtros; ou os selecionados) em XLSX"
                >
                  {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  {selecao.selectedCount > 0 ? `Exportar (${selecao.selectedCount})` : "Exportar"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {dashboardQuery.isLoading ? (
              <div className="flex min-h-[240px] items-center justify-center gap-2 text-slate-500 px-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Carregando dados...</span>
              </div>
            ) : dashboardQuery.error ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 mx-4">
                {dashboardQuery.error.message}
              </div>
            ) : sortedItems.length === 0 ? (
              <div className="flex min-h-[240px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 text-center mx-4">
                <Timer className="h-8 w-8 text-slate-400" />
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-slate-700">Nenhum item encontrado</p>
                  <p className="text-xs text-slate-500">
                    {busca ? "Refine a busca ou altere os filtros." : "Nenhum item se enquadra nos critérios atuais."}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className={cn(DATA_TABLE_SHELL, "max-h-[65vh]")}>
                  <table className={DATA_TABLE_EL}>
                    <thead>
                      <tr className={DATA_TABLE_HEAD_ROW}>
                        <th className="sticky top-0 z-30 bg-slate-900 px-2 py-2 text-center" style={{ width: 40 }}>
                          <input
                            type="checkbox"
                            ref={(el) => { if (el) el.indeterminate = selecao.algumaSelecionada; }}
                            checked={selecao.todasSelecionadas}
                            onChange={selecao.toggleAll}
                            className="h-3.5 w-3.5 cursor-pointer rounded border-white/40 accent-teal-500"
                            title="Selecionar todos"
                          />
                        </th>
                        <th className="sticky top-0 z-30 bg-slate-900 px-2 py-2 text-left">
                          {renderSortableHeader("Código", "codigo")}
                        </th>
                        <th className="sticky top-0 z-30 bg-slate-900 px-2 py-2 text-left">
                          {renderSortableHeader("Produto", "nomeProduto")}
                        </th>
                        <th className="sticky top-0 z-30 bg-slate-900 px-2 py-2 text-left">
                          {renderSortableHeader("Fornecedor", "fornecedor")}
                        </th>
                        <th className="sticky top-0 z-30 bg-slate-900 px-2 py-2 text-left">
                          {renderSortableHeader("Comprador", "comprador")}
                        </th>
                        <th className="sticky top-0 z-30 bg-slate-900 px-2 py-2 text-right">
                          {renderSortableHeader("Est. Total", "estoqueAtual", "right")}
                        </th>
                        <th className="sticky top-0 z-30 bg-slate-900 px-2 py-2 text-right">
                          {renderSortableHeader("Vda. Média", "vendaMedia", "right")}
                        </th>
                        <th className="sticky top-0 z-30 bg-slate-900 px-2 py-2 text-center">
                          {renderSortableHeader("Vencimento", "diasAteVencer", "center")}
                        </th>
                        <th className="sticky top-0 z-30 bg-slate-900 px-2 py-2 text-right">
                          {renderSortableHeader("Dias p/ Vender", "diasParaVender", "right")}
                        </th>
                        <th className="sticky top-0 z-30 bg-slate-900 px-2 py-2 text-right">
                          {renderSortableHeader("Vlr. Risco", "valorEmRisco", "right")}
                        </th>
                        <th className="sticky top-0 z-30 bg-slate-900 px-2 py-2 text-center">
                          {renderSortableHeader("Banda", "banda", "center")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedItems.map((item, idx) => {
                        const isSelected = selecao.isSelected(item.codigo);
                        const bandaCfg = BANDAS_CONFIG[item.banda];
                        return (
                          <tr
                            key={`${item.codigo}-${item.vencimentoLote}-${item.region}`}
                            className={cn(
                              "border-b border-slate-100 transition-colors",
                              isSelected ? "bg-teal-50" : idx % 2 === 0 ? "bg-white" : "bg-slate-50/50",
                              "hover:bg-teal-50/50"
                            )}
                          >
                            <td className="px-2 py-1.5 text-center">
                              <button
                                type="button"
                                onClick={(e) => selecao.toggle(item.codigo, e.shiftKey)}
                                className="inline-flex items-center justify-center"
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  readOnly
                                  className="h-3.5 w-3.5 cursor-pointer rounded border-slate-300 accent-teal-500 pointer-events-none"
                                />
                              </button>
                            </td>
                            <td className="px-2 py-1.5 font-mono text-slate-600">{item.codigo}</td>
                            <td className="px-2 py-1.5 max-w-[200px] truncate font-medium text-slate-800" title={item.nomeProduto}>
                              {item.nomeProduto}
                            </td>
                            <td className="px-2 py-1.5 max-w-[150px] truncate text-slate-600" title={item.fornecedor}>
                              {item.fornecedor}
                            </td>
                            <td className="px-2 py-1.5 max-w-[140px] truncate text-slate-600" title={item.comprador ?? "Não atribuído"}>
                              {item.comprador ?? <span className="text-slate-400">—</span>}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">
                              {intFmt.format(item.estoqueAtual)}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">
                              {item.vendaMedia > 0 ? intFmt.format(item.vendaMedia) : <span className="text-rose-500 font-semibold">0</span>}
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              <VencimentoTag
                                isoDate={item.vencimentoLote}
                                status={getVencimentoStatus(item.diasAteVencer)}
                              />
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              {item.diasParaVender < 99999 ? (
                                <span className={item.diasParaVender > item.diasAteVencer ? "text-rose-600 font-semibold" : "text-slate-600"}>
                                  {formatDias(item.diasParaVender)}d
                                </span>
                              ) : (
                                <span className="text-rose-500 font-semibold" title="Venda zerada — o estoque não escoa (∞)">∞</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums font-medium text-slate-800">
                              {currFmt.format(item.valorEmRisco)}
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] font-semibold border-current/20",
                                  bandaCfg.color, bandaCfg.bgColor
                                )}
                              >
                                {bandaCfg.label}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {/* Pagination */}
                <div className="pt-3">
                  <DataTablePagination
                    page={page}
                    total={totalItems}
                    pageSize={ITEMS_PER_PAGE}
                    onPageChange={setPage}
                    itemLabel="itens"
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
