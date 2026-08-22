import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  Boxes,
  ChevronRight,
  Download,
  Loader2,
  Package,
  PackageX,
  Search,
  Users,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import KpiCard from "@/components/templates/KpiCard";
import KpiGrid from "@/components/KpiGrid";
import SegmentedTabs from "@/components/SegmentedTabs";
import { DataTablePagination } from "@/components/DataTablePagination";
import MultiSelectFilter from "@/components/MultiSelectFilter";
import PanelHeaderActions from "@/components/PanelHeaderActions";
import PanelHeader from "@/components/PanelHeader";
import SortableHeader from "@/components/SortableHeader";
import { DATA_TABLE_SHELL, DATA_TABLE_EL, DATA_TABLE_HEAD_ROW } from "@/components/dataTable";
import RupturasRulesModal from "./RupturasRulesModal";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useAuth } from "@/_core/hooks/useAuth";
import { ACTIONS, MODULES, hasPermission } from "@shared/permissions";
import { emojiRuptura, formatPct, corRiscoRuptura, corFaixa, faixaRuptura, FAIXAS_RUPTURA, type FaixaKey } from "@/lib/rupturas";

type RegionView = "SC" | "RS" | "UNIFICADO";
type MarcaData = inferRouterOutputs<AppRouter>["rupturas"]["getRegionDashboard"]["marcas"][number];
type ItemData = MarcaData["itens"][number];

/** Valor especial do filtro de comprador para "sem comprador atribuído". */
const COMPRADOR_NAO_ATRIBUIDO = "__nao_atribuido__";
const PAGE_SIZE = 50;

// ─── Formatters ──────────────────────────────────────────────────────────────
const intFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
function formatDias(dias: number): string {
  return dias.toFixed(1).replace(".", ",");
}

// ─── Ordenação ───────────────────────────────────────────────────────────────
// Colunas estratégicas (numéricas) abrem em DESC (maior→menor, padrão Superestocados).
type SortKey = "fornecedor" | "comprador" | "totalAtivos" | "qtdRuptura" | "qtdZerados" | "pctRuptura";
type SortDir = "asc" | "desc";
const SORT_NUMERICO = new Set<SortKey>(["totalAtivos", "qtdRuptura", "qtdZerados", "pctRuptura"]);

function prodKey(region: string, codigo: number): string {
  return `${region}-${codigo}`;
}

export default function RupturasDashboard() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const podeEditar = hasPermission(user, MODULES.RUPTURAS, ACTIONS.UPDATE);

  // ─── Estado ────────────────────────────────────────────────────────────────
  const [activeRegion, setActiveRegion] = useState<RegionView>("UNIFICADO");
  const [busca, setBusca] = useState("");
  const [faixasSel, setFaixasSel] = useState<Set<FaixaKey>>(new Set());
  // Drill dos KPIs Zerados/Em Alerta: filtra os PRODUTOS por situação (null = ambos).
  const [situacaoSel, setSituacaoSel] = useState<"zerado" | "alerta" | null>(null);
  const [compradoresSel, setCompradoresSel] = useState<Set<string>>(new Set());
  const [fornecedoresSel, setFornecedoresSel] = useState<Set<string>>(new Set());
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  // Seleção para exportação: conjunto ÚNICO de produtos (chave região-código).
  // O checkbox do fornecedor é um atalho tri-state que marca/desmarca todos os produtos dele.
  const [selectedProdutos, setSelectedProdutos] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("pctRuptura");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const dashboardQuery = trpc.rupturas.getRegionDashboard.useQuery({ region: activeRegion });
  const data = dashboardQuery.data;

  const refreshMutation = trpc.rupturas.refreshDados.useMutation({
    onSuccess: () => dashboardQuery.refetch(),
  });
  const exportMutation = trpc.rupturas.exportXlsx.useMutation();

  // ─── Listas para os filtros (derivadas do dataset completo) ──────────────────
  const compradores = useMemo(
    () =>
      Array.from(new Set((data?.marcas ?? []).map((m) => m.comprador).filter((c): c is string => !!c))).sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      ),
    [data],
  );
  const temNaoAtribuido = useMemo(() => (data?.marcas ?? []).some((m) => m.comprador === null), [data]);
  const fornecedores = useMemo(
    () => (data?.marcas ?? []).map((m) => m.fornecedor).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [data],
  );

  // ─── Pipeline de filtros ─────────────────────────────────────────────────────
  // 1) comprador + fornecedor + busca → marcasBase (sem faixa); 2) faixa → marcasFiltradas.
  const marcasBase = useMemo(() => {
    let marcas = data?.marcas ?? [];
    if (compradoresSel.size > 0) {
      marcas = marcas.filter((m) => compradoresSel.has(m.comprador ?? COMPRADOR_NAO_ATRIBUIDO));
    }
    if (fornecedoresSel.size > 0) {
      marcas = marcas.filter((m) => fornecedoresSel.has(m.fornecedor));
    }
    const termo = busca.trim().toLowerCase();
    if (termo || situacaoSel) {
      marcas = marcas
        .map((m) => {
          let itens = m.itens;
          // Situação (drill dos KPIs): zerado = estoque 0; alerta = em ruptura mas não zerado.
          if (situacaoSel) itens = itens.filter((i) => (situacaoSel === "zerado") === i.zerado);
          // Busca: se a MARCA/comprador casa com o termo, mantém os itens (já filtrados por situação);
          // senão, restringe aos produtos que casam.
          if (termo) {
            const marcaMatch =
              m.fornecedor.toLowerCase().includes(termo) || (m.comprador ?? "").toLowerCase().includes(termo);
            if (!marcaMatch) {
              itens = itens.filter(
                (i) => i.nomeProduto.toLowerCase().includes(termo) || String(i.codigo).includes(termo),
              );
            }
          }
          if (itens.length === 0) return null;
          return itens.length === m.itens.length ? m : { ...m, itens };
        })
        .filter((m): m is MarcaData => m !== null);
    }
    return marcas;
  }, [data, compradoresSel, fornecedoresSel, busca, situacaoSel]);

  // Contagem por faixa (sobre marcasBase — reflete os outros filtros, mas não a própria faixa).
  const faixaCounts = useMemo(() => {
    const c: Record<FaixaKey, number> = { baixa: 0, media: 0, alta: 0, critica: 0 };
    for (const m of marcasBase) c[faixaRuptura(m.pctRuptura)]++;
    return c;
  }, [marcasBase]);

  const marcasFiltradas = useMemo(() => {
    if (faixasSel.size === 0) return marcasBase;
    return marcasBase.filter((m) => faixasSel.has(faixaRuptura(m.pctRuptura)));
  }, [marcasBase, faixasSel]);

  const sortedMarcas = useMemo(() => {
    const arr = [...marcasFiltradas];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "fornecedor": cmp = a.fornecedor.localeCompare(b.fornecedor, "pt-BR"); break;
        case "comprador": cmp = (a.comprador ?? "~").localeCompare(b.comprador ?? "~", "pt-BR"); break;
        case "totalAtivos": cmp = a.totalAtivos - b.totalAtivos; break;
        case "qtdRuptura": cmp = a.qtdRuptura - b.qtdRuptura; break;
        case "qtdZerados": cmp = a.qtdZerados - b.qtdZerados; break;
        case "pctRuptura": cmp = a.pctRuptura - b.pctRuptura; break;
      }
      // Desempate estável por % desc para leitura previsível.
      if (cmp === 0) cmp = a.pctRuptura - b.pctRuptura;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [marcasFiltradas, sortKey, sortDir]);

  // ─── Paginação (por marca) ───────────────────────────────────────────────────
  const totalMarcas = sortedMarcas.length;
  const paginatedMarcas = useMemo(
    () => sortedMarcas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [sortedMarcas, page],
  );

  // ─── KPIs (seguem os filtros; contam os PRODUTOS exibidos) ───────────────────
  // Contar pelos itens (não pelos agregados) faz o drill de situação refletir nos KPIs:
  // com situação=zerado, "Em Alerta" fica 0 e vice-versa. Sem filtro, itens.length == qtdRuptura.
  const kpis = useMemo(() => {
    let itens = 0;
    let zerados = 0;
    for (const m of marcasFiltradas) {
      for (const it of m.itens) {
        itens++;
        if (it.zerado) zerados++;
      }
    }
    return { marcas: marcasFiltradas.length, itens, zerados, emAlerta: itens - zerados };
  }, [marcasFiltradas]);

  // ─── Seleção de produtos (para exportação) ───────────────────────────────────
  // Todos os produtos atualmente filtrados (na ordem exibida) — base do "selecionar tudo" e do export "todos".
  const produtosFiltrados = useMemo(
    () => sortedMarcas.flatMap((m) => m.itens.map((i) => ({ codigo: i.codigo, region: i.region }))),
    [sortedMarcas],
  );

  const isProdSelected = (i: ItemData) => selectedProdutos.has(prodKey(i.region, i.codigo));
  const toggleProduto = (i: ItemData) => {
    setSelectedProdutos((prev) => {
      const next = new Set(prev);
      const k = prodKey(i.region, i.codigo);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  };

  const marcaSelState = (m: MarcaData): "none" | "some" | "all" => {
    const total = m.itens.length;
    if (!total) return "none";
    const sel = m.itens.reduce((n, i) => n + (isProdSelected(i) ? 1 : 0), 0);
    if (sel === 0) return "none";
    return sel === total ? "all" : "some";
  };
  const toggleMarca = (m: MarcaData) => {
    const estado = marcaSelState(m);
    setSelectedProdutos((prev) => {
      const next = new Set(prev);
      for (const i of m.itens) {
        const k = prodKey(i.region, i.codigo);
        if (estado === "all") next.delete(k);
        else next.add(k);
      }
      return next;
    });
  };

  const todosSelecionados = produtosFiltrados.length > 0 && produtosFiltrados.every((p) => selectedProdutos.has(prodKey(p.region, p.codigo)));
  const algumSelecionado = selectedProdutos.size > 0 && !todosSelecionados;
  const toggleTodos = () => {
    setSelectedProdutos((prev) => {
      if (todosSelecionados) return new Set();
      const next = new Set(prev);
      for (const p of produtosFiltrados) next.add(prodKey(p.region, p.codigo));
      return next;
    });
  };
  const limparSelecao = () => setSelectedProdutos(new Set());

  // ─── Handlers ────────────────────────────────────────────────────────────────
  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(SORT_NUMERICO.has(key) ? "desc" : "asc");
    }
  };
  const renderSortableHeader = (label: string, key: SortKey, align: "left" | "right" = "left") => (
    <SortableHeader label={label} active={sortKey === key} direction={sortDir} onSort={() => handleSort(key)} align={align} />
  );

  const toggleFaixa = (f: FaixaKey) =>
    setFaixasSel((prev) => {
      const next = new Set(prev);
      next.has(f) ? next.delete(f) : next.add(f);
      return next;
    });
  const toggleComprador = (nome: string) =>
    setCompradoresSel((prev) => {
      const next = new Set(prev);
      next.has(nome) ? next.delete(nome) : next.add(nome);
      return next;
    });
  const toggleFornecedor = (nome: string) =>
    setFornecedoresSel((prev) => {
      const next = new Set(prev);
      next.has(nome) ? next.delete(nome) : next.add(nome);
      return next;
    });
  const toggleExpandir = (fornecedor: string) =>
    setExpandidas((prev) => {
      const next = new Set(prev);
      next.has(fornecedor) ? next.delete(fornecedor) : next.add(fornecedor);
      return next;
    });

  async function handleExport() {
    const alvo =
      selectedProdutos.size > 0
        ? Array.from(selectedProdutos).map((k) => {
            const idx = k.indexOf("-");
            return { region: k.slice(0, idx) as "SC" | "RS", codigo: Number(k.slice(idx + 1)) };
          })
        : produtosFiltrados;
    if (!alvo.length) return;
    setIsExporting(true);
    try {
      const result = await exportMutation.mutateAsync({ region: activeRegion, produtos: alvo });
      const bytes = atob(result.base64);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      const blob = new Blob([arr], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
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

  // Reset de página quando filtros/ordenção mudam.
  useEffect(() => {
    setPage(1);
  }, [activeRegion, busca, faixasSel, situacaoSel, compradoresSel, fornecedoresSel, sortKey, sortDir]);

  // Ao buscar, abre as marcas que casaram (conveniência); busca vazia recolhe tudo.
  const buscaAtiva = busca.trim().length > 0;
  useEffect(() => {
    setExpandidas(buscaAtiva ? new Set(marcasBase.map((m) => m.fornecedor)) : new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  const mostraUf = activeRegion === "UNIFICADO";
  const regionLabel = activeRegion === "UNIFICADO" ? "Unificado" : activeRegion;
  const NUM_COLS = 7; // checkbox + fornecedor + comprador + ativos + em ruptura + zerados + %

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl 2xl:max-w-[1600px] space-y-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        {/* Header */}
        <PanelHeader
          onBack={() => setLocation("/negocios/estoque")}
          icon={PackageX}
          title="Rupturas"
          subtitle="Itens zerados e abaixo de 7 dias, por marca"
          color="red"
          actions={
            <PanelHeaderActions
              ultimaAtualizacaoMs={data?.summary.ultimaAtualizacaoMs}
              onAtualizar={podeEditar ? () => refreshMutation.mutate({ region: activeRegion }) : undefined}
              atualizando={refreshMutation.isPending}
              modoTv={{ onClick: () => setLocation(`/rupturas/painel?regiao=${activeRegion}&top=10`) }}
              onRegras={() => setRulesOpen(true)}
            />
          }
        />

        <RupturasRulesModal open={rulesOpen} onOpenChange={setRulesOpen} />

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

        {/* Filtros de faixa (emoji) ACIMA dos KPIs — padrão Superestocados/VC */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFaixasSel(new Set())}
            aria-pressed={faixasSel.size === 0}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition",
              faixasSel.size === 0
                ? "border-slate-700 bg-slate-700 text-white shadow-sm"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
            )}
          >
            Todas
            <span
              className={cn(
                "inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1 py-0.5 text-[10px] font-bold",
                faixasSel.size === 0 ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500",
              )}
            >
              {marcasBase.length}
            </span>
          </button>
          {FAIXAS_RUPTURA.map((f) => {
            const isActive = faixasSel.has(f.key);
            const cor = corFaixa(f.key);
            const count = faixaCounts[f.key];
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => toggleFaixa(f.key)}
                aria-pressed={isActive}
                title={`Marcas com ruptura ${f.label}`}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                  isActive
                    ? `border-current ${cor.bg} ${cor.text} shadow-sm ring-1 ring-current/20`
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
                  !count && !isActive && "opacity-40",
                )}
              >
                <span className="text-sm leading-none">{f.emoji}</span>
                <span>{f.label}</span>
                <span
                  className={cn(
                    "inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1 py-0.5 text-[10px] font-bold tabular-nums",
                    isActive ? "bg-current/10 text-current" : "bg-slate-100 text-slate-500",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* KPIs (seguem os filtros ativos) */}
        <KpiGrid cols={4}>
          <KpiCard
            title="Marcas Afetadas"
            value={data ? intFmt.format(kpis.marcas) : "—"}
            sublabel="com item em ruptura"
            loading={!data}
            icon={<Boxes className="h-4 w-4" />}
            iconColor="text-slate-500"
            tooltip="Marcas com pelo menos um item em ruptura (com filtros aplicados)"
            valueClassName="tabular-nums text-slate-700"
          />
          <KpiCard
            title="Itens em Ruptura"
            value={data ? intFmt.format(kpis.itens) : "—"}
            sublabel="zerados + em alerta"
            loading={!data}
            icon={<PackageX className="h-4 w-4" />}
            iconColor="text-red-500"
            tooltip="Produtos zerados + em alerta (< 7 dias), somados nas marcas filtradas"
            valueClassName="tabular-nums text-slate-700"
          />
          <KpiCard
            title="Zerados"
            value={data ? intFmt.format(kpis.zerados) : "—"}
            sublabel="sem estoque"
            loading={!data}
            icon={<AlertTriangle className="h-4 w-4" />}
            iconColor="text-red-500"
            tooltip="Produtos ativos com estoque zerado. Clique para ver só os zerados."
            valueClassName="tabular-nums text-red-600"
            onClick={() => setSituacaoSel((s) => (s === "zerado" ? null : "zerado"))}
            active={situacaoSel === "zerado"}
          />
          <KpiCard
            title="Em Alerta"
            value={data ? intFmt.format(kpis.emAlerta) : "—"}
            sublabel="menos de 7 dias de estoque"
            loading={!data}
            icon={<Package className="h-4 w-4" />}
            iconColor="text-amber-500"
            tooltip="Produtos com estoque para menos de 7 dias (ainda não zerados). Clique para ver só os em alerta."
            valueClassName="tabular-nums text-amber-600"
            onClick={() => setSituacaoSel((s) => (s === "alerta" ? null : "alerta"))}
            active={situacaoSel === "alerta"}
          />
        </KpiGrid>

        {/* Seleção (quando há produtos marcados para exportar) */}
        {selectedProdutos.size > 0 && (
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-teal-600" />
            <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">
              Seleção ({intFmt.format(selectedProdutos.size)} {selectedProdutos.size === 1 ? "produto" : "produtos"})
            </p>
            <Button type="button" variant="ghost" size="sm" className="h-5 px-1.5 text-[10px]" onClick={limparSelecao}>
              Limpar
            </Button>
          </div>
        )}

        {/* Tabela */}
        <Card className="border border-slate-200 bg-white shadow-sm">
          <CardHeader className="flex flex-col gap-3 pb-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-0.5">
              <CardTitle className="text-base text-slate-900">Rupturas por marca — {regionLabel}</CardTitle>
              <CardDescription className="text-xs">
                {intFmt.format(totalMarcas)} {totalMarcas === 1 ? "marca" : "marcas"} · {intFmt.format(kpis.itens)} itens
              </CardDescription>
            </div>
            {/* Busca + comprador + fornecedor + exportar */}
            <div className="flex w-full max-w-3xl flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar marca, comprador ou produto…"
                  className="h-8 rounded-lg border-slate-200 bg-slate-50 pl-8 text-xs"
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
              <MultiSelectFilter
                icon={<Users className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                label="Comprador"
                pluralize={(n) => `${n} comprador${n > 1 ? "es" : ""}`}
                options={compradores}
                selected={compradoresSel}
                onToggle={toggleComprador}
                onClear={() => setCompradoresSel(new Set())}
                naoAtribuido={temNaoAtribuido ? { value: COMPRADOR_NAO_ATRIBUIDO, label: "Não atribuído" } : undefined}
                searchPlaceholder="Buscar comprador…"
                emptyLabel="Nenhum comprador."
              />
              <MultiSelectFilter
                icon={<PackageX className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                label="Fornecedor"
                pluralize={(n) => `${n} fornecedor${n > 1 ? "es" : ""}`}
                options={fornecedores}
                selected={fornecedoresSel}
                onToggle={toggleFornecedor}
                onClear={() => setFornecedoresSel(new Set())}
                searchPlaceholder="Buscar fornecedor…"
                emptyLabel="Nenhum fornecedor."
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 shrink-0 gap-1.5 text-xs whitespace-nowrap"
                onClick={handleExport}
                disabled={isExporting || produtosFiltrados.length === 0}
                title="Exportar em XLSX (por produto). Sem seleção = todos os filtrados; com seleção = só os selecionados."
              >
                {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {selectedProdutos.size > 0 ? `Exportar (${selectedProdutos.size})` : "Exportar"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {dashboardQuery.isLoading ? (
              <div className="flex min-h-[240px] items-center justify-center gap-2 px-4 text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Carregando dados...</span>
              </div>
            ) : dashboardQuery.error ? (
              <div className="mx-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                {dashboardQuery.error.message}
              </div>
            ) : totalMarcas === 0 ? (
              <div className="mx-4 flex min-h-[240px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 text-center">
                <PackageX className="h-8 w-8 text-emerald-500" />
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-slate-700">Nenhum item em ruptura</p>
                  <p className="text-xs text-slate-500">{busca || faixasSel.size || compradoresSel.size || fornecedoresSel.size ? "Refine ou limpe os filtros." : "Nenhuma marca em ruptura nesta região."}</p>
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
                            ref={(el) => { if (el) el.indeterminate = algumSelecionado; }}
                            checked={todosSelecionados}
                            onChange={toggleTodos}
                            className="h-3.5 w-3.5 cursor-pointer rounded border-white/40 accent-teal-500"
                            title="Selecionar todos os produtos filtrados"
                          />
                        </th>
                        <th className="sticky top-0 z-30 bg-slate-900 px-2 py-2 text-left min-w-[220px]">
                          {renderSortableHeader("Fornecedor", "fornecedor")}
                        </th>
                        <th className="sticky top-0 z-30 bg-slate-900 px-2 py-2 text-left min-w-[150px]">
                          {renderSortableHeader("Comprador", "comprador")}
                        </th>
                        <th className="sticky top-0 z-30 bg-slate-900 px-2 py-2 text-right min-w-[80px]">
                          {renderSortableHeader("Ativos", "totalAtivos", "right")}
                        </th>
                        <th className="sticky top-0 z-30 bg-slate-900 px-2 py-2 text-right min-w-[90px]">
                          {renderSortableHeader("Em Ruptura", "qtdRuptura", "right")}
                        </th>
                        <th className="sticky top-0 z-30 bg-slate-900 px-2 py-2 text-right min-w-[80px]">
                          {renderSortableHeader("Zerados", "qtdZerados", "right")}
                        </th>
                        <th className="sticky top-0 z-30 bg-slate-900 px-2 py-2 text-right min-w-[110px]">
                          {renderSortableHeader("% Ruptura", "pctRuptura", "right")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedMarcas.map((marca, idx) => {
                        const aberto = expandidas.has(marca.fornecedor);
                        const selState = marcaSelState(marca);
                        const cor = corRiscoRuptura(marca.pctRuptura);
                        return (
                          <FragmentRow
                            key={marca.fornecedor}
                            marca={marca}
                            idx={idx}
                            aberto={aberto}
                            selState={selState}
                            cor={cor}
                            mostraUf={mostraUf}
                            numCols={NUM_COLS}
                            onToggleExpand={() => toggleExpandir(marca.fornecedor)}
                            onToggleMarca={() => toggleMarca(marca)}
                            isProdSelected={isProdSelected}
                            onToggleProduto={toggleProduto}
                          />
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="pt-3">
                  <DataTablePagination
                    page={page}
                    pageSize={PAGE_SIZE}
                    total={totalMarcas}
                    onPageChange={setPage}
                    itemLabel="marcas"
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

// ─── Linha da marca + expansão inline dos produtos ─────────────────────────────
function FragmentRow({
  marca,
  idx,
  aberto,
  selState,
  cor,
  mostraUf,
  numCols,
  onToggleExpand,
  onToggleMarca,
  isProdSelected,
  onToggleProduto,
}: {
  marca: MarcaData;
  idx: number;
  aberto: boolean;
  selState: "none" | "some" | "all";
  cor: { text: string; bg: string; border: string };
  mostraUf: boolean;
  numCols: number;
  onToggleExpand: () => void;
  onToggleMarca: () => void;
  isProdSelected: (i: ItemData) => boolean;
  onToggleProduto: (i: ItemData) => void;
}) {
  const zebra = idx % 2 === 0 ? "bg-white" : "bg-slate-50/50";
  return (
    <>
      <tr className={cn("border-b border-slate-100 transition-colors hover:bg-teal-50/40", zebra)}>
        <td className="px-2 py-1.5 text-center">
          <input
            type="checkbox"
            ref={(el) => { if (el) el.indeterminate = selState === "some"; }}
            checked={selState === "all"}
            onChange={onToggleMarca}
            onClick={(e) => e.stopPropagation()}
            className="h-3.5 w-3.5 cursor-pointer rounded border-slate-300 accent-teal-500"
            title="Selecionar todos os produtos desta marca"
          />
        </td>
        <td className="px-2 py-1.5">
          <button type="button" onClick={onToggleExpand} className="flex w-full items-center gap-1.5 text-left" aria-expanded={aberto}>
            <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform", aberto && "rotate-90")} />
            <span className="block max-w-[200px] truncate font-medium text-slate-800" title={marca.fornecedor}>
              {marca.fornecedor}
            </span>
          </button>
        </td>
        <td className="px-2 py-1.5 max-w-[150px] truncate text-slate-600" title={marca.comprador ?? "Não atribuído"}>
          {marca.comprador ?? <span className="text-slate-400">—</span>}
        </td>
        <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{marca.totalAtivos}</td>
        <td className="px-2 py-1.5 text-right tabular-nums font-medium text-slate-800">{marca.qtdRuptura}</td>
        <td className={cn("px-2 py-1.5 text-right tabular-nums font-medium", marca.qtdZerados > 0 ? "text-red-600" : "text-slate-400")}>
          {marca.qtdZerados}
        </td>
        <td className="px-2 py-1.5 text-right">
          <span className={cn("inline-flex items-center justify-end gap-1.5 rounded-lg px-2 py-0.5", cor.bg)} title="% de ruptura da marca">
            <span className="text-sm leading-none">{emojiRuptura(marca.pctRuptura)}</span>
            <span className={cn("font-bold tabular-nums", cor.text)}>{formatPct(marca.pctRuptura)}</span>
          </span>
        </td>
      </tr>
      {aberto && (
        <tr>
          <td colSpan={numCols} className="bg-slate-50/70 p-0">
            <div className="overflow-x-auto px-2 py-2 sm:px-8">
              <table className="w-full min-w-[560px] text-[11px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-slate-500">
                    <th className="w-8 px-2 py-1" />
                    <th className="px-2 py-1 text-left font-medium">Código</th>
                    <th className="px-2 py-1 text-left font-medium">Produto</th>
                    {mostraUf && <th className="px-2 py-1 text-left font-medium">UF</th>}
                    <th className="px-2 py-1 text-right font-medium">Dias Est.</th>
                    <th className="px-2 py-1 text-right font-medium">Estoque</th>
                    <th className="px-2 py-1 text-right font-medium">Vda. Média</th>
                  </tr>
                </thead>
                <tbody>
                  {marca.itens.map((item) => {
                    const sel = isProdSelected(item);
                    return (
                      <tr
                        key={`${item.region}-${item.codigo}`}
                        className={cn("border-t border-slate-100", item.zerado ? "bg-red-50/70" : "bg-amber-50/40", sel && "ring-1 ring-inset ring-teal-300")}
                      >
                        <td className="px-2 py-1 text-center">
                          <input
                            type="checkbox"
                            checked={sel}
                            onChange={() => onToggleProduto(item)}
                            className="h-3.5 w-3.5 cursor-pointer rounded border-slate-300 accent-teal-500"
                          />
                        </td>
                        <td className="px-2 py-1 font-mono text-slate-500">{item.codigo}</td>
                        <td className="px-2 py-1">
                          <div className="flex items-center gap-1.5">
                            <span className="max-w-[260px] truncate font-medium text-slate-700" title={item.nomeProduto}>
                              {item.nomeProduto}
                            </span>
                            {item.zerado && (
                              <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none text-red-700">
                                Zerado
                              </span>
                            )}
                          </div>
                        </td>
                        {mostraUf && <td className="px-2 py-1 text-slate-500">{item.region}</td>}
                        <td className={cn("px-2 py-1 text-right tabular-nums font-medium", item.zerado ? "text-red-600" : "text-amber-700")}>
                          {formatDias(item.diasEstoque)}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums text-slate-600">{intFmt.format(item.estoqueAtual)}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-slate-500">{formatDias(item.vendaMedia)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

