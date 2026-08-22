import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  Calendar,
  CheckSquare,
  Clock,
  DollarSign,
  Download,
  History,
  Loader2,
  MapPinned,
  Megaphone,
  Package,
  Pencil,
  Search,
  StickyNote,
  Target,
  TrendingDown,
  Users,
  X,
} from "lucide-react";
import { useLocation } from "wouter";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import MultiSelectFilter from "@/components/MultiSelectFilter";
import PanelHeaderActions from "@/components/PanelHeaderActions";
import PanelHeader from "@/components/PanelHeader";
import SortableHeader from "@/components/SortableHeader";
import { DATA_TABLE_SHELL, DATA_TABLE_EL, DATA_TABLE_HEAD_ROW } from "@/components/dataTable";
import SegmentedTabs from "@/components/SegmentedTabs";
import SuperestocadosValorTrend from "./SuperestocadosValorTrend";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { VencimentoTag } from "@/components/VencimentoTag";
import { DataTablePagination } from "@/components/DataTablePagination";
import { useRangeSelection } from "@/hooks/useRangeSelection";
import { estoqueIdealSuperestocado, excessoReaisSuperestocado, reducaoExcessoPct } from "@shared/superestocados";
import SuperestocadosRulesModal from "./SuperestocadosRulesModal";
import SuperestocadosAIChat from "./SuperestocadosAIChat";
import {
  buildStickyColumnLayout,
  formatQuantityTooltipValue,
  getFrozenColumnKeys,
  SELECTION_COLUMN_WIDTH,
  type StickyColumnKey,
} from "./superestocadosTableHelpers";

/* ─── Types ─── */

type RegionKey = "SC" | "RS";
/** Modo de visualização: região específica ou as duas justapostas. */
type RegionView = RegionKey | "UNIFICADO";
type TipoProduto = "medicamento" | "nao_medicamento";
type FilterView = "unificado" | "medicamento" | "medicamento_zerado" | "nao_medicamento" | "nao_medicamento_zerado";

type LoteInfo = {
  codLote: string;
  vencimentoLote: string | null;
  estoqueLote: number;
  qtdVendida: number;
};

type StatusCampanha = "nao_participa" | "em_campanha";

type DashboardProduct = {
  id: number;
  codigo: number;
  region: RegionKey;
  tipoProduto: TipoProduto;
  nomeProduto: string;
  fornecedor: string;
  /** Comprador responsável pela marca (via Compradores). null = não atribuído. */
  comprador: string | null;
  ultimaCompra: number | null;
  dataUltimaCompra: string | null;
  diasEstoque: number;
  estoqueInicial: number;
  estoqueAtual: number;
  valorCusto: number | null;
  vendaMedia: number;
  ultimaAtualizacaoMs: number;
  vendasRecentes: Record<string, number>;
  lote: LoteInfo | null;
  diasSemVenda: number;
  statusCampanha: StatusCampanha;
  estoqueIdealCongelado: number | null;
  diasEstoqueEntrada: number | null;
  excessoEntradaReais: number | null;
  campanhaDescricao: string | null;
  campanhaInicio: string | null;
  campanhaFim: string | null;
  dataUltimaTransferencia: string | null;
  qtdVendaMesAnterior: number;
  qtdVenda2MesesAnterior: number;
  qtdProjetadoMesAtual: number;
  precoPolitica: number | null;
  qtdVendaMesAtual: number;
};

type RegionStatus = Record<
  RegionKey,
  {
    totalProdutos: number;
    ultimaAtualizacaoMs: number | null;
    ultimoUploadVendasMs: number | null;
  }
>;

type RegionDashboard = {
  region: RegionView;
  recentDates: string[];
  products: DashboardProduct[];
  /** Compradores presentes no conjunto (para o dropdown de filtro). Ordenado. */
  compradores: string[];
  /** Há itens sem comprador atribuído (para a opção "Não atribuído"). */
  temNaoAtribuido: boolean;
  summary: {
    totalProdutos: number;
    valorTotalCusto: number;
    estoqueAtualTotal: number;
    estoqueInicialTotal: number;
    ultimaAtualizacaoMs: number | null;
    ultimoUploadVendasMs: number | null;
  };
  regionStatus: RegionStatus;
};

type ProductPanorama = {
  product: {
    id: number;
    region: RegionKey;
    tipoProduto: TipoProduto;
    codigo: number;
    nomeProduto: string;
    fornecedor: string;
    ultimaCompra: number | null;
    dataUltimaCompra: string | null;
    diasEstoque: number;
    estoqueInicial: number;
    estoqueAtual: number;
    valorCusto: number | null;
    vendaMedia: number;
    ultimaAtualizacaoMs: number;
    statusCampanha: StatusCampanha;
    estoqueIdealCongelado: number | null;
    campanhaDescricao: string | null;
    campanhaInicio: string | null;
    campanhaFim: string | null;
    campanhaObservacao: string | null;
  };
  lotes: LoteInfo[];
  salesSeries: Array<{
    date: string;
    label: string;
    quantidade: number;
  }>;
};

type SortKey =
  | "codigo"
  | "nomeProduto"
  | "fornecedor"
  | "comprador"
  | "diasEstoque"
  | "estoqueAtual"
  | "estoqueIdeal"
  | "estoqueLote"
  | "vencimento"
  | "vendaMedia"
  | "qtdVendaMesAtual"
  | "qtdVendaMesAnterior"
  | "qtdVenda2MesesAnterior"
  | "qtdProjetadoMesAtual"
  | "valorCusto"
  | "precoPolitica"
  | "dataUltimaCompra"
  | "dataUltimaTransferencia"
  | "excessoReais"
  | "reducaoExcesso"
  | "diasSemVenda";

type SortDirection = "asc" | "desc";

/* ─── Constants ─── */

const FILTER_VIEW_LABELS: Record<FilterView, string> = {
  unificado: "Unificado",
  medicamento: "Medicamentos",
  medicamento_zerado: "Medicamentos (Venda Zerada)",
  nao_medicamento: "Não Medicamentos",
  nao_medicamento_zerado: "Não Medicamentos (Venda Zerada)",
};

const FILTER_VIEW_SHORT_LABELS: Record<FilterView, string> = {
  unificado: "Unificado",
  medicamento: "Medicamentos",
  medicamento_zerado: "Med. Zerado",
  nao_medicamento: "Não Med.",
  nao_medicamento_zerado: "Não Med. Zerado",
};

/** Tipos específicos (sem o "unificado", que representa "todos"). */
type TipoFiltro = Exclude<FilterView, "unificado">;

/** Ordem canônica dos tipos (para rótulo estável na multi-seleção). */
const TIPOS_FILTRO: TipoFiltro[] = ["medicamento", "medicamento_zerado", "nao_medicamento", "nao_medicamento_zerado"];

/**
 * Predicados dos filtros específicos. São DISJUNTOS e, juntos, equivalem ao "Unificado".
 * Na multi-seleção o painel aplica a UNIÃO (OR) dos tipos marcados.
 */
const FILTER_PREDICATES: Record<TipoFiltro, (p: DashboardProduct) => boolean> = {
  medicamento: (p) => p.tipoProduto === "medicamento" && p.vendaMedia >= 1,
  medicamento_zerado: (p) => p.tipoProduto === "medicamento" && p.vendaMedia < 1,
  nao_medicamento: (p) => p.tipoProduto === "nao_medicamento" && p.vendaMedia >= 1,
  nao_medicamento_zerado: (p) => p.tipoProduto === "nao_medicamento" && p.vendaMedia < 1,
};

/** Valor especial do filtro de comprador para "sem comprador atribuído". */
const COMPRADOR_NAO_ATRIBUIDO = "__nao_atribuido__";

/** Dias sem venda para acionar alerta visual */
const DIAS_SEM_VENDA_ALERTA = 3;

/** Meses para considerar vencimento próximo (9 meses) */
const VENCIMENTO_PROXIMO_MESES = 9;

const panoramaChartConfig = {
  quantidade: {
    label: "Quantidade vendida",
    color: "#0f766e",
  },
} satisfies ChartConfig;

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2,
});

const integerFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 0,
});

const decimalFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function formatDateTime(timestamp: number | null) {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleString("pt-BR");
}

function formatShortDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) return isoDate;
  return `${day}/${month}`;
}

function formatDateBR(isoDate: string | null) {
  if (!isoDate) return "—";
  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) return isoDate;
  return `${day}/${month}/${year}`;
}

/**
 * Verifica se uma data de vencimento está dentro do limiar de alerta (9 meses a partir de hoje).
 * Retorna: "vencido" | "proximo" | "ok" | null
 */
function getVencimentoStatus(isoDate: string | null): "vencido" | "proximo" | "ok" | null {
  if (!isoDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const vencimento = new Date(isoDate + "T00:00:00");
  if (isNaN(vencimento.getTime())) return null;

  if (vencimento < today) return "vencido";

  const limiar = new Date(today);
  limiar.setMonth(limiar.getMonth() + VENCIMENTO_PROXIMO_MESES);

  if (vencimento <= limiar) return "proximo";
  return "ok";
}

/* ─── Sem Venda Badge ─── */

function SemVendaBadge({ diasSemVenda }: { diasSemVenda: number }) {
  if (diasSemVenda < DIAS_SEM_VENDA_ALERTA) return null;

  return (
    <span
      className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-800 animate-pulse"
      title={`${diasSemVenda} dias consecutivos sem venda`}
    >
      <AlertTriangle className="h-2.5 w-2.5" />
      {diasSemVenda}d
    </span>
  );
}

/* ─── Vencimento Badge ─── */

function VencimentoBadge({ isoDate }: { isoDate: string | null }) {
  // Visual padronizado no componente compartilhado; aqui fica só a regra (proximidade por data).
  return <VencimentoTag isoDate={isoDate} status={getVencimentoStatus(isoDate)} />;
}

/* ─── Campanha Badge (tabela) ─── */

/**
 * Retorna status visual da campanha baseado na data de fim:
 * - "ativa" → verde (mais de 3 dias restantes)
 * - "urgente" → vermelho pulsante (≤ 3 dias restantes)
 * - "vencida" → vermelho sólido (data já passou)
 * - "sem_prazo" → campanha sem data de fim definida
 */
function getCampanhaStatus(campanhaFim: string | null): "ativa" | "urgente" | "vencida" | "sem_prazo" {
  if (!campanhaFim) return "sem_prazo";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const fim = new Date(campanhaFim + "T00:00:00");
  if (isNaN(fim.getTime())) return "sem_prazo";

  const diffMs = fim.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "vencida";
  if (diffDays <= 3) return "urgente";
  return "ativa";
}

function getCampanhaRemainingDays(campanhaFim: string | null): number | null {
  if (!campanhaFim) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const fim = new Date(campanhaFim + "T00:00:00");
  if (isNaN(fim.getTime())) return null;
  return Math.ceil((fim.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function CampanhaBadge({ campanhaFim }: { campanhaFim: string | null }) {
  const status = getCampanhaStatus(campanhaFim);
  const remaining = getCampanhaRemainingDays(campanhaFim);

  if (status === "vencida") {
    return (
      <span
        className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-700 align-middle animate-pulse"
        title="Campanha vencida — ação necessária"
      >
        <AlertTriangle className="h-2.5 w-2.5" />
        Vencida
      </span>
    );
  }

  if (status === "urgente") {
    return (
      <span
        className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-700 align-middle animate-pulse"
        title={`Campanha encerra em ${remaining} dia${remaining !== 1 ? "s" : ""}`}
      >
        <Megaphone className="h-2.5 w-2.5" />
        {remaining}d
      </span>
    );
  }

  if (status === "ativa") {
    return (
      <span
        className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-700 align-middle"
        title={`Campanha ativa — ${remaining} dias restantes`}
      >
        <Megaphone className="h-2.5 w-2.5" />
        {remaining}d
      </span>
    );
  }

  // sem_prazo: campanha sem data definida
  return (
    <span
      className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-orange-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-orange-700 align-middle"
      title="Em campanha (sem prazo definido)"
    >
      <Megaphone className="h-2.5 w-2.5" />
      Campanha
    </span>
  );
}

/* ─── Main Dashboard ─── */

export default function SuperestocadosDashboard() {
  const [, setLocation] = useLocation();

  const [activeRegion, setActiveRegion] = useState<RegionView>("SC");
  // Filtros de tipo em MULTI-SELEÇÃO (união). Set vazio = "Unificado" (todos).
  const [tiposSel, setTiposSel] = useState<Set<TipoFiltro>>(new Set());
  // Filtro por comprador (multi-seleção; Set vazio = todos). Lente compartilhada Compradores.
  const [compradoresSel, setCompradoresSel] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("diasEstoque");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const tableViewportRef = useRef<HTMLDivElement | null>(null);
  const [tableViewportWidth, setTableViewportWidth] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [rulesModalOpen, setRulesModalOpen] = useState(false);
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 50;

  const dashboardQuery = trpc.superestocados.getRegionDashboard.useQuery({ region: activeRegion });
  const panoramaQuery = trpc.superestocados.getProductPanorama.useQuery(
    { productId: selectedProductId ?? 0 },
    { enabled: selectedProductId !== null },
  );
  const setStatusCampanhaMutation = trpc.superestocados.setStatusCampanha.useMutation({
    onSuccess: () => {
      dashboardQuery.refetch();
      if (selectedProductId) panoramaQuery.refetch();
    },
  });
  const startCampaignMutation = trpc.superestocados.startCampaign.useMutation({
    onSuccess: () => {
      dashboardQuery.refetch();
      if (selectedProductId) panoramaQuery.refetch();
      setCampaignFormOpen(false);
      setConfirmChangeOpen(false);
    },
  });
  const removeCampaignMutation = trpc.superestocados.removeCampaign.useMutation({
    onSuccess: () => {
      dashboardQuery.refetch();
      if (selectedProductId) panoramaQuery.refetch();
    },
  });
  const updateObservationMutation = trpc.superestocados.updateCampaignObservation.useMutation({
    onSuccess: () => {
      if (selectedProductId) panoramaQuery.refetch();
    },
  });
  const campaignHistoryQuery = trpc.superestocados.getCampaignHistory.useQuery(
    { productId: selectedProductId ?? 0 },
    { enabled: selectedProductId !== null },
  );
  const permanenciaQuery = trpc.superestocados.getProdutoPermanencia.useQuery(
    {
      codigo: panoramaQuery.data?.product.codigo ?? 0,
      region: (panoramaQuery.data?.product.region ?? "SC") as "SC" | "RS",
      tipoProduto: (panoramaQuery.data?.product.tipoProduto ?? "medicamento") as "medicamento" | "nao_medicamento",
    },
    { enabled: selectedProductId !== null && !!panoramaQuery.data },
  );
  const exportXlsxMutation = trpc.superestocados.exportXlsx.useMutation();
  const refreshMutation = trpc.superestocados.refreshDados.useMutation({
    onSuccess: () => {
      dashboardQuery.refetch();
      if (selectedProductId) panoramaQuery.refetch();
    },
  });

  // Campaign form state
  const [campaignFormOpen, setCampaignFormOpen] = useState(false);
  const [campaignDesc, setCampaignDesc] = useState("");
  const [campaignStart, setCampaignStart] = useState("");
  const [campaignEnd, setCampaignEnd] = useState("");
  const [campaignObs, setCampaignObs] = useState("");
  const [confirmChangeOpen, setConfirmChangeOpen] = useState(false);
  const [keepObsOnChange, setKeepObsOnChange] = useState(true);
  const [isEditingCampaign, setIsEditingCampaign] = useState(false);

  async function handleExportXlsx() {
    const idsToExport = selectedIds.size > 0
      ? Array.from(selectedIds)
      : filteredProducts.map((p) => p.id);

    if (!idsToExport.length) return;

    setIsExporting(true);
    try {
      const result = await exportXlsxMutation.mutateAsync({
        region: activeRegion,
        productIds: idsToExport,
        recentDates: dashboard?.recentDates ?? [],
      });

      // Download the file
      const byteCharacters = atob(result.base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed", err);
    } finally {
      setIsExporting(false);
    }
  }

  const dashboard = dashboardQuery.data as RegionDashboard | undefined;
  const panorama = panoramaQuery.data as ProductPanorama | undefined;
  // Produto selecionado (linha da tabela) — tem os snapshots de entrada que o panorama não traz.
  const produtoSelecionado = (dashboard?.products ?? []).find((p) => p.id === selectedProductId);

  /* Viewport resize observer */
  useEffect(() => {
    const viewport = tableViewportRef.current;
    if (!viewport) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setTableViewportWidth(entry.contentRect.width);
      }
    });

    observer.observe(viewport);
    setTableViewportWidth(viewport.clientWidth);

    return () => observer.disconnect();
  }, [dashboardQuery.data]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [activeRegion, tiposSel, compradoresSel, searchTerm, sortKey, sortDirection]);

  function calcularMetricasProduto(product: DashboardProduct) {
    const estoqueIdeal = estoqueIdealSuperestocado(product.vendaMedia);
    const excessoReais = excessoReaisSuperestocado(product.estoqueAtual, product.vendaMedia, product.valorCusto);
    // % de redução do excesso desde a entrada (null = sem snapshot de entrada).
    const reducaoExcesso = reducaoExcessoPct(product.excessoEntradaReais, excessoReais);
    return { estoqueIdeal, excessoReais, reducaoExcesso };
  }

  /* Filter products by type and venda zerada */
  const filterCounts = useMemo(() => {
    const products = dashboard?.products ?? [];
    return {
      unificado: products.length,
      medicamento: products.filter((p) => p.tipoProduto === "medicamento" && p.vendaMedia >= 1).length,
      medicamento_zerado: products.filter((p) => p.tipoProduto === "medicamento" && p.vendaMedia < 1).length,
      nao_medicamento: products.filter((p) => p.tipoProduto === "nao_medicamento" && p.vendaMedia >= 1).length,
      nao_medicamento_zerado: products.filter((p) => p.tipoProduto === "nao_medicamento" && p.vendaMedia < 1).length,
    };
  }, [dashboard?.products]);

  const filteredProducts = useMemo(() => {
    const products = dashboard?.products ?? [];

    // Multi-seleção (união): nenhum tipo marcado = Unificado (todos); senão, OR dos tipos.
    const tipos = Array.from(tiposSel);
    let filtered: DashboardProduct[] =
      tipos.length === 0 ? products : products.filter((p) => tipos.some((k) => FILTER_PREDICATES[k](p)));

    // Filtro por comprador (multi-seleção; união). Vazio = todos. Sentinela = não atribuído.
    if (compradoresSel.size > 0) {
      filtered = filtered.filter((p) => compradoresSel.has(p.comprador ?? COMPRADOR_NAO_ATRIBUIDO));
    }

    if (searchTerm.trim()) {
      const normalizedSearch = searchTerm.trim().toLowerCase();
      filtered = filtered.filter(
        (p) =>
          String(p.codigo).includes(normalizedSearch) ||
          p.nomeProduto.toLowerCase().includes(normalizedSearch) ||
          p.fornecedor.toLowerCase().includes(normalizedSearch) ||
          (p.lote?.codLote?.toLowerCase().includes(normalizedSearch) ?? false),
      );
    }

    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;
      switch (sortKey) {
        case "codigo":
          comparison = a.codigo - b.codigo;
          break;
        case "nomeProduto":
          comparison = a.nomeProduto.localeCompare(b.nomeProduto, "pt-BR");
          break;
        case "fornecedor":
          comparison = a.fornecedor.localeCompare(b.fornecedor, "pt-BR");
          break;
        case "comprador":
          comparison = (a.comprador ?? "~").localeCompare(b.comprador ?? "~", "pt-BR");
          break;
        case "diasEstoque":
          comparison = a.diasEstoque - b.diasEstoque;
          break;
        case "estoqueAtual":
          comparison = a.estoqueAtual - b.estoqueAtual;
          break;
        case "estoqueLote":
          comparison = (a.lote?.estoqueLote ?? 0) - (b.lote?.estoqueLote ?? 0);
          break;
        case "vencimento": {
          const aDate = a.lote?.vencimentoLote ?? "9999-12-31";
          const bDate = b.lote?.vencimentoLote ?? "9999-12-31";
          comparison = aDate.localeCompare(bDate);
          break;
        }
        case "vendaMedia":
          comparison = a.vendaMedia - b.vendaMedia;
          break;
        case "valorCusto":
          comparison = (a.valorCusto ?? 0) - (b.valorCusto ?? 0);
          break;
        case "qtdVendaMesAtual":
          comparison = a.qtdVendaMesAtual - b.qtdVendaMesAtual;
          break;
        case "qtdVendaMesAnterior":
          comparison = a.qtdVendaMesAnterior - b.qtdVendaMesAnterior;
          break;
        case "qtdVenda2MesesAnterior":
          comparison = a.qtdVenda2MesesAnterior - b.qtdVenda2MesesAnterior;
          break;
        case "qtdProjetadoMesAtual":
          comparison = a.qtdProjetadoMesAtual - b.qtdProjetadoMesAtual;
          break;
        case "precoPolitica":
          comparison = (a.precoPolitica ?? 0) - (b.precoPolitica ?? 0);
          break;
        case "dataUltimaCompra": {
          const aDate = a.dataUltimaCompra ?? "0000-00-00";
          const bDate = b.dataUltimaCompra ?? "0000-00-00";
          comparison = aDate.localeCompare(bDate);
          break;
        }
        case "dataUltimaTransferencia": {
          const aDate = a.dataUltimaTransferencia ?? "0000-00-00";
          const bDate = b.dataUltimaTransferencia ?? "0000-00-00";
          comparison = aDate.localeCompare(bDate);
          break;
        }
        case "diasSemVenda":
          comparison = a.diasSemVenda - b.diasSemVenda;
          break;
        case "estoqueIdeal": {
          const aIdeal = Math.ceil(a.vendaMedia * 2);
          const bIdeal = Math.ceil(b.vendaMedia * 2);
          comparison = aIdeal - bIdeal;
          break;
        }
        case "excessoReais": {
          comparison =
            excessoReaisSuperestocado(a.estoqueAtual, a.vendaMedia, a.valorCusto) -
            excessoReaisSuperestocado(b.estoqueAtual, b.vendaMedia, b.valorCusto);
          break;
        }
        case "reducaoExcesso": {
          const ra = reducaoExcessoPct(a.excessoEntradaReais, excessoReaisSuperestocado(a.estoqueAtual, a.vendaMedia, a.valorCusto)) ?? -Infinity;
          const rb = reducaoExcessoPct(b.excessoEntradaReais, excessoReaisSuperestocado(b.estoqueAtual, b.vendaMedia, b.valorCusto)) ?? -Infinity;
          comparison = ra - rb;
          break;
        }
        default:
          comparison = 0;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });

    return sorted;
  }, [dashboard?.products, tiposSel, compradoresSel, searchTerm, sortKey, sortDirection]);

  // Seleção em lote (+ Shift para intervalos) — hook padrão do projeto. Seleciona sobre
  // todos os produtos filtrados (na ordem exibida), então o range do Shift respeita a tela.
  const selecao = useRangeSelection(filteredProducts.map((p) => p.id));
  const selectedIds = selecao.selecionados;

  const totalFiltered = useMemo(() => {
    const base = filteredProducts.reduce(
      (acc, product) => {
        const { estoqueIdeal, excessoReais } = calcularMetricasProduto(product);

        acc.estoqueAtual += product.estoqueAtual;
        acc.estoqueIdeal += estoqueIdeal;
        acc.valorCusto += (product.valorCusto ?? 0);
        acc.excessoReais += excessoReais;
        acc.vendaMediaTotal += product.vendaMedia;
        return acc;
      },
      { estoqueAtual: 0, estoqueIdeal: 0, valorCusto: 0, excessoReais: 0, vendaMediaTotal: 0 },
    );

    // Cobertura estimada em dias
    // vendaMedia é "Qtd Venda Média Mês" (média mensal dos últimos 60 dias)
    // Para obter dias: estoqueAtual / (vendaMediaMensal / 30)
    const coberturaDias = base.vendaMediaTotal > 0
      ? Math.round((base.estoqueAtual / base.vendaMediaTotal) * 30)
      : null;

    // Excesso percentual
    const excessoPercentual = base.estoqueIdeal > 0
      ? Math.round(((base.estoqueAtual - base.estoqueIdeal) / base.estoqueIdeal) * 100)
      : 0;

    return { ...base, coberturaDias, excessoPercentual };
  }, [filteredProducts]);

  /* KPIs dinâmicos baseados na seleção */
  const selectedMetrics = useMemo(() => {
    if (selectedIds.size === 0) return null;

    const selectedProducts = filteredProducts.filter((p) => selectedIds.has(p.id));
    const base = selectedProducts.reduce(
      (acc, product) => {
        const { estoqueIdeal } = calcularMetricasProduto(product);
        acc.estoqueAtual += product.estoqueAtual;
        acc.estoqueIdeal += estoqueIdeal;
        acc.valorCusto += (product.valorCusto ?? 0);
        acc.vendaMediaTotal += product.vendaMedia;
        return acc;
      },
      { estoqueAtual: 0, estoqueIdeal: 0, valorCusto: 0, vendaMediaTotal: 0 },
    );

    const coberturaDias = base.vendaMediaTotal > 0
      ? Math.round((base.estoqueAtual / base.vendaMediaTotal) * 30)
      : null;

    return { ...base, coberturaDias, count: selectedProducts.length };
  }, [selectedIds, filteredProducts]);

  function handleSortChange(nextSortKey: SortKey) {
    if (sortKey === nextSortKey) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(nextSortKey);
      setSortDirection("desc");
    }
  }

  function toggleComprador(nome: string) {
    setCompradoresSel((prev) => {
      const next = new Set(prev);
      if (next.has(nome)) next.delete(nome);
      else next.add(nome);
      return next;
    });
  }

  /* Panorama averages */
  // Venda Média Mensal: usa diretamente o campo vendaMedia do produto (já é média mensal dos últimos 60 dias)
  const panoramaVendaMediaMensal = useMemo(() => {
    if (!panorama) return 0;
    return panorama.product.vendaMedia;
  }, [panorama]);

  // Cobertura estimada em dias: estoque / (vendaMediaMensal / 30)
  // Consistente com o cálculo do painel principal
  const projectedCoverage = useMemo(() => {
    if (!panorama || panoramaVendaMediaMensal <= 0) return null;
    return Math.round((panorama.product.estoqueAtual / panoramaVendaMediaMensal) * 30);
  }, [panorama, panoramaVendaMediaMensal]);

  const stickyColumns = useMemo(
    () => buildStickyColumnLayout(getFrozenColumnKeys(tableViewportWidth)),
    [tableViewportWidth],
  );

  function getColumnStyle(columnKey: StickyColumnKey, backgroundColor?: string): CSSProperties {
    const column = stickyColumns[columnKey];

    return {
      minWidth: column.width,
      width: column.width,
      maxWidth: column.sticky ? column.width : undefined,
      left: column.sticky ? column.left : undefined,
      backgroundColor,
      boxShadow: column.sticky
        ? "1px 0 0 rgba(226,232,240,0.95), 10px 0 24px -18px rgba(15,23,42,0.28)"
        : undefined,
      willChange: column.sticky ? "transform" : undefined,
      backfaceVisibility: column.sticky ? "hidden" : undefined,
      transform: column.sticky ? "translateZ(0)" : undefined,
    };
  }

  function renderSortableHeader(
    label: string,
    nextSortKey: SortKey,
    align: "left" | "right" = "left",
  ) {
    return (
      <SortableHeader
        label={label}
        active={sortKey === nextSortKey}
        direction={sortDirection}
        onSort={() => handleSortChange(nextSortKey)}
        align={align}
      />
    );
  }

  /* ─── Render ─── */

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl 2xl:max-w-[1600px] min-[1920px]:max-w-[1800px] min-[2560px]:max-w-[2200px] space-y-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        {/* Header */}
        <PanelHeader
          onBack={() => setLocation("/negocios/estoque")}
          icon={TrendingDown}
          title="Superestocados"
          subtitle="Controle regional de estoque e queima"
          color="orange"
          actions={
            <PanelHeaderActions
              onAtualizar={() => refreshMutation.mutate({ region: activeRegion })}
              atualizando={refreshMutation.isPending}
              modoTv={{ onClick: () => setLocation("/superestocados/painel") }}
              onRegras={() => setRulesModalOpen(true)}
            />
          }
        />

        <SuperestocadosRulesModal open={rulesModalOpen} onOpenChange={setRulesModalOpen} />

        {/* Region Tabs (SegmentedTabs padrão do projeto) */}
        <SegmentedTabs
          value={activeRegion}
          onValueChange={(value) => setActiveRegion(value as RegionView)}
          options={[
            { value: "SC", label: "SC" },
            { value: "RS", label: "RS" },
            { value: "UNIFICADO", label: "Unificado" },
          ]}
        />

        {/* Filtros de tipo (multi-seleção — somam por união; "Unificado" mostra todos) */}
        <div className="flex flex-wrap items-center gap-2">
          {(["unificado", "medicamento", "medicamento_zerado", "nao_medicamento", "nao_medicamento_zerado"] as FilterView[]).map(
            (filterKey) => {
              const isUnificado = filterKey === "unificado";
              const isActive = isUnificado ? tiposSel.size === 0 : tiposSel.has(filterKey as TipoFiltro);
              const count = filterCounts[filterKey];
              const toggle = () => {
                if (isUnificado) {
                  setTiposSel(new Set()); // volta pra "todos"
                  return;
                }
                setTiposSel((prev) => {
                  const next = new Set(prev);
                  const k = filterKey as TipoFiltro;
                  if (next.has(k)) next.delete(k);
                  else next.add(k);
                  return next;
                });
              };
              return (
                <button
                  key={filterKey}
                  type="button"
                  onClick={toggle}
                  aria-pressed={isActive}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                    isActive
                      ? "border-teal-600 bg-teal-600 text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
                  )}
                >
                  <span className="hidden sm:inline">{FILTER_VIEW_LABELS[filterKey]}</span>
                  <span className="sm:hidden">{FILTER_VIEW_SHORT_LABELS[filterKey]}</span>
                  <span
                    className={cn(
                      "inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1 py-0.5 text-[10px] font-bold",
                      isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500",
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            },
          )}
        </div>

        {/* Faixa "Valor imobilizado — últimas 4 semanas" (reage aos filtros de tipo). */}
        <SuperestocadosValorTrend region={activeRegion} tipos={Array.from(tiposSel)} />

        {/* KPIs */}
        {filteredProducts.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Estoque Total */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Estoque Total</p>
                  <p className="text-2xl font-bold tracking-tight text-slate-900">
                    {integerFormatter.format(totalFiltered.estoqueAtual)}
                  </p>
                  <p className="text-xs text-slate-500">unidades em estoque</p>
                </div>
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 ring-1 ring-inset ring-teal-100">
                  <Package className="h-5 w-5 text-teal-600" />
                </span>
              </div>
            </div>

            {/* Estoque Ideal + Badge Excesso */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Estoque Ideal</p>
                  <p className="text-2xl font-bold tracking-tight text-slate-900">
                    {integerFormatter.format(totalFiltered.estoqueIdeal)}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs text-slate-500">unidades necessárias</p>
                    {totalFiltered.excessoPercentual > 0 && (
                      <span className="inline-flex items-center rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                        +{totalFiltered.excessoPercentual}% acima
                      </span>
                    )}
                  </div>
                </div>
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 ring-1 ring-inset ring-blue-100">
                  <Target className="h-5 w-5 text-blue-600" />
                </span>
              </div>
            </div>

            {/* Valor Imobilizado */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Valor Imobilizado</p>
                  <p className="text-2xl font-bold tracking-tight text-slate-900">
                    {currencyFormatter.format(totalFiltered.valorCusto)}
                  </p>
                  <p className="text-xs text-slate-500">capital retido em estoque</p>
                </div>
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 ring-1 ring-inset ring-amber-100">
                  <DollarSign className="h-5 w-5 text-amber-600" />
                </span>
              </div>
            </div>

            {/* Cobertura Estimada */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md cursor-help">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Cobertura Estimada</p>
                      <p className="text-2xl font-bold tracking-tight text-slate-900">
                        {totalFiltered.coberturaDias !== null
                          ? `${totalFiltered.coberturaDias} dias`
                          : "∞"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {totalFiltered.coberturaDias !== null
                          ? `~${Math.round(totalFiltered.coberturaDias / 30)} meses`
                          : "sem venda registrada"}
                      </p>
                    </div>
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 ring-1 ring-inset ring-purple-100">
                      <Clock className="h-5 w-5 text-purple-600" />
                    </span>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                <p className="font-medium">Baseado na venda média mensal dos últimos 60 dias.</p>
                <p className="mt-1 text-muted-foreground">Fórmula: Estoque Total ÷ Venda Média Mensal</p>
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* Dynamic KPIs - based on selection */}
        {selectedMetrics && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-teal-600" />
              <p className="text-xs font-semibold text-teal-700 uppercase tracking-wider">
                Seleção ({selectedMetrics.count} {selectedMetrics.count === 1 ? "item" : "itens"})
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {/* Estoque Total - Seleção */}
              <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-600">Estoque Total</p>
                    <p className="text-2xl font-bold tracking-tight text-teal-900">
                      {integerFormatter.format(selectedMetrics.estoqueAtual)}
                    </p>
                    <p className="text-xs text-teal-600">unidades selecionadas</p>
                  </div>
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 ring-1 ring-inset ring-teal-200">
                    <Package className="h-5 w-5 text-teal-700" />
                  </span>
                </div>
              </div>

              {/* Estoque Ideal - Seleção */}
              <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-600">Estoque Ideal</p>
                    <p className="text-2xl font-bold tracking-tight text-teal-900">
                      {integerFormatter.format(selectedMetrics.estoqueIdeal)}
                    </p>
                    <p className="text-xs text-teal-600">unidades necessárias</p>
                  </div>
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 ring-1 ring-inset ring-teal-200">
                    <Target className="h-5 w-5 text-teal-700" />
                  </span>
                </div>
              </div>

              {/* Valor Imobilizado - Seleção */}
              <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-600">Valor Imobilizado</p>
                    <p className="text-2xl font-bold tracking-tight text-teal-900">
                      {currencyFormatter.format(selectedMetrics.valorCusto)}
                    </p>
                    <p className="text-xs text-teal-600">capital nos itens selecionados</p>
                  </div>
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 ring-1 ring-inset ring-teal-200">
                    <DollarSign className="h-5 w-5 text-teal-700" />
                  </span>
                </div>
              </div>

              {/* Cobertura Estimada - Seleção */}
              <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-600">Cobertura Estimada</p>
                    <p className="text-2xl font-bold tracking-tight text-teal-900">
                      {selectedMetrics.coberturaDias !== null 
                        ? `${selectedMetrics.coberturaDias} dias` 
                        : "∞"}
                    </p>
                    <p className="text-xs text-teal-600">
                      {selectedMetrics.coberturaDias !== null 
                        ? `~${Math.round(selectedMetrics.coberturaDias / 30)} meses` 
                        : "sem venda registrada"}
                    </p>
                  </div>
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 ring-1 ring-inset ring-teal-200">
                    <Clock className="h-5 w-5 text-teal-700" />
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Table Section */}
        <Card className="border border-slate-200 bg-white shadow-sm">
          <CardHeader className="flex flex-col gap-3 pb-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-0.5">
              <CardTitle className="text-base text-slate-900">
                {(tiposSel.size === 0 || tiposSel.size === TIPOS_FILTRO.length
                  ? "Unificado"
                  : TIPOS_FILTRO.filter((k) => tiposSel.has(k)).map((k) => FILTER_VIEW_LABELS[k]).join(" + "))}{" "}
                — {activeRegion}
              </CardTitle>
              <CardDescription className="text-xs">
                {integerFormatter.format(filteredProducts.length)} produtos
                {dashboard?.recentDates.length ? ` · ${dashboard.recentDates.length} dias de venda` : ""}
              </CardDescription>
            </div>
            <div className="flex w-full max-w-2xl flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="h-8 rounded-lg border-slate-200 bg-slate-50 pl-8 text-xs"
                  placeholder="Filtrar por código, produto, fornecedor ou lote"
                />
              </div>
              {/* Filtro por comprador — componente compartilhado (Popover + Command + Checkbox) */}
              <MultiSelectFilter
                icon={<Users className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                label="Comprador"
                pluralize={(n) => `${n} comprador${n > 1 ? "es" : ""}`}
                options={dashboard?.compradores ?? []}
                selected={compradoresSel}
                onToggle={toggleComprador}
                onClear={() => setCompradoresSel(new Set())}
                naoAtribuido={dashboard?.temNaoAtribuido ? { value: COMPRADOR_NAO_ATRIBUIDO, label: "Não atribuído" } : undefined}
                searchPlaceholder="Buscar comprador…"
                emptyLabel="Nenhum comprador."
                triggerClassName="w-full sm:w-[190px]"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportXlsx}
                disabled={isExporting || filteredProducts.length === 0}
                className="h-8 gap-1.5 text-xs whitespace-nowrap"
              >
                {isExporting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {selectedIds.size > 0 ? `Exportar (${selectedIds.size})` : "Exportar"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {dashboardQuery.isLoading ? (
              <div className="flex min-h-[240px] items-center justify-center gap-2 text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Carregando...</span>
              </div>
            ) : dashboardQuery.error ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                {dashboardQuery.error.message}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex min-h-[240px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 text-center">
                <MapPinned className="h-8 w-8 text-slate-400" />
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-slate-700">Nenhum produto encontrado</p>
                  <p className="text-xs text-slate-500">
                    {searchTerm
                      ? "Refine a busca ou altere o filtro."
                      : "Importe a planilha correspondente para visualizar os dados."}
                  </p>
                </div>
              </div>
            ) : (
              <>
              <div
                ref={tableViewportRef}
                className={cn(DATA_TABLE_SHELL, "max-h-[70vh] isolate")}
              >
                <table className={DATA_TABLE_EL}>
                  <thead>
                    <tr className={DATA_TABLE_HEAD_ROW}>
                      <th
                        className="sticky top-0 left-0 z-[60] bg-slate-900 px-1.5 py-2 text-center"
                        style={{ width: SELECTION_COLUMN_WIDTH, minWidth: SELECTION_COLUMN_WIDTH, boxShadow: "1px 0 0 rgba(226,232,240,0.3)", willChange: "transform", backfaceVisibility: "hidden", transform: "translateZ(0)" }}
                      >
                        <input
                          type="checkbox"
                          ref={(el) => { if (el) el.indeterminate = selecao.algumaSelecionada; }}
                          checked={selecao.todasSelecionadas}
                          onChange={selecao.toggleAll}
                          className="h-3.5 w-3.5 cursor-pointer rounded border-white/40 accent-teal-500"
                          title="Selecionar todos"
                        />
                      </th>
                      <th
                        className={cn("sticky top-0 px-2 py-2 text-left text-white", stickyColumns.codigo.sticky ? "z-[50]" : "z-30")}
                        style={getColumnStyle("codigo", "#0f172a")}
                      >
                        {renderSortableHeader("Código", "codigo")}
                      </th>
                      <th
                        className={cn("sticky top-0 px-2 py-2 text-left text-white", stickyColumns.produto.sticky ? "z-[50]" : "z-30")}
                        style={getColumnStyle("produto", "#0f172a")}
                      >
                        {renderSortableHeader("Produto", "nomeProduto")}
                      </th>
                      <th
                        className={cn("sticky top-0 px-2 py-2 text-left text-white", stickyColumns.fornecedor.sticky ? "z-[50]" : "z-30")}
                        style={getColumnStyle("fornecedor", "#0f172a")}
                      >
                        {renderSortableHeader("Fornecedor", "fornecedor")}
                      </th>
                      <th
                        className={cn("sticky top-0 px-2 py-2 text-left text-white", stickyColumns.comprador?.sticky ? "z-[50]" : "z-30")}
                        style={getColumnStyle("comprador", "#0f172a")}
                      >
                        {renderSortableHeader("Comprador", "comprador")}
                      </th>
                      <th
                        className={cn("sticky top-0 px-2 py-2 text-left text-white", stickyColumns.ultCompra?.sticky ? "z-[50]" : "z-30")}
                        style={getColumnStyle("ultCompra", "#0f172a")}
                      >
                        {renderSortableHeader("Últ. Compra", "dataUltimaCompra")}
                      </th>
                      <th
                        className={cn("sticky top-0 px-2 py-2 text-left text-white", stickyColumns.ultTransf?.sticky ? "z-[50]" : "z-30")}
                        style={getColumnStyle("ultTransf", "#0f172a")}
                      >
                        {renderSortableHeader("Últ. Transf.", "dataUltimaTransferencia")}
                      </th>
                      <th
                        className={cn("sticky top-0 px-2 py-2 text-right text-white", stickyColumns.diasEstoque.sticky ? "z-[50]" : "z-30")}
                        style={getColumnStyle("diasEstoque", "#0f172a")}
                      >
                        {renderSortableHeader("Dias Est.", "diasEstoque", "right")}
                      </th>
                      <th className="sticky top-0 z-30 min-w-[70px] bg-slate-900 px-2 py-2 text-right text-white">
                        <span className="text-xs font-semibold">Est. Inicial</span>
                      </th>
                      <th
                        className={cn("sticky top-0 px-2 py-2 text-right text-white", stickyColumns.estoqueTotal.sticky ? "z-[50]" : "z-30")}
                        style={getColumnStyle("estoqueTotal", "#0f172a")}
                      >
                        {renderSortableHeader("Est. Total", "estoqueAtual", "right")}
                      </th>
                      <th
                        className={cn("sticky top-0 px-2 py-2 text-right text-white", stickyColumns.estoqueIdeal?.sticky ? "z-[50]" : "z-30")}
                        style={getColumnStyle("estoqueIdeal", "#0f172a")}
                      >
                        {renderSortableHeader("Est. Ideal", "estoqueIdeal", "right")}
                      </th>
                      <th
                        className={cn("sticky top-0 px-2 py-2 text-right text-white", stickyColumns.estoqueLote?.sticky ? "z-[50]" : "z-30")}
                        style={getColumnStyle("estoqueLote", "#0f172a")}
                      >
                        {renderSortableHeader("Est. Lote", "estoqueLote", "right")}
                      </th>
                      <th
                        className={cn("sticky top-0 px-2 py-2 text-left text-white", stickyColumns.codLote.sticky ? "z-[50]" : "z-30")}
                        style={getColumnStyle("codLote", "#0f172a")}
                      >
                        Cód. Lote
                      </th>
                      <th
                        className={cn("sticky top-0 px-2 py-2 text-left text-white", stickyColumns.vencimento.sticky ? "z-[50]" : "z-30")}
                        style={getColumnStyle("vencimento", "#0f172a")}
                      >
                        {renderSortableHeader("Vencimento", "vencimento")}
                      </th>
                      <th
                        className={cn("sticky top-0 px-2 py-2 text-right text-white", stickyColumns.vendaMedia.sticky ? "z-[50]" : "z-30")}
                        style={getColumnStyle("vendaMedia", "#0f172a")}
                      >
                        {renderSortableHeader("Vda. Média", "vendaMedia", "right")}
                      </th>
                      <th
                        className={cn("sticky top-0 px-2 py-2 text-right text-white", stickyColumns.projMes?.sticky ? "z-[50]" : "z-30")}
                        style={getColumnStyle("projMes", "#0f172a")}
                      >
                        {renderSortableHeader("Proj. Mês", "qtdProjetadoMesAtual", "right")}
                      </th>
                      <th
                        className={cn("sticky top-0 px-2 py-2 text-right text-white", stickyColumns.vdaM0?.sticky ? "z-[50]" : "z-30")}
                        style={getColumnStyle("vdaM0", "#0f172a")}
                      >
                        {renderSortableHeader("Vda. M-0", "qtdVendaMesAtual", "right")}
                      </th>
                      <th
                        className={cn("sticky top-0 px-2 py-2 text-right text-white", stickyColumns.vdaM1?.sticky ? "z-[50]" : "z-30")}
                        style={getColumnStyle("vdaM1", "#0f172a")}
                      >
                        {renderSortableHeader("Vda. M-1", "qtdVendaMesAnterior", "right")}
                      </th>
                      <th
                        className={cn("sticky top-0 px-2 py-2 text-right text-white", stickyColumns.vdaM2?.sticky ? "z-[50]" : "z-30")}
                        style={getColumnStyle("vdaM2", "#0f172a")}
                      >
                        {renderSortableHeader("Vda. M-2", "qtdVenda2MesesAnterior", "right")}
                      </th>
                      <th
                        className={cn("sticky top-0 px-2 py-2 text-right text-white", stickyColumns.valorCusto.sticky ? "z-[50]" : "z-30")}
                        style={getColumnStyle("valorCusto", "#0f172a")}
                      >
                        {renderSortableHeader("Vlr. Custo", "valorCusto", "right")}
                      </th>
                      <th
                        className={cn("sticky top-0 px-2 py-2 text-right text-white", stickyColumns.precoMin?.sticky ? "z-[50]" : "z-30")}
                        style={getColumnStyle("precoMin", "#0f172a")}
                      >
                        {renderSortableHeader("Preço Mín.", "precoPolitica", "right")}
                      </th>
                      <th
                        className={cn("sticky top-0 px-2 py-2 text-right text-rose-300", stickyColumns.excessoReais?.sticky ? "z-[50]" : "z-30")}
                        style={getColumnStyle("excessoReais", "#0f172a")}
                      >
                        {renderSortableHeader("Excesso", "excessoReais", "right")}
                      </th>
                      <th
                        className={cn("sticky top-0 px-2 py-2 text-right text-emerald-300", stickyColumns.reducaoExcesso?.sticky ? "z-[50]" : "z-30")}
                        style={getColumnStyle("reducaoExcesso", "#0f172a")}
                        title="Quanto o excesso (R$) reduziu desde que o produto entrou no painel"
                      >
                        {renderSortableHeader("↓ Excesso", "reducaoExcesso", "right")}
                      </th>

                      {[...(dashboard?.recentDates ?? [])].reverse().map((date) => (
                        <th
                          key={date}
                          className="sticky top-0 z-20 min-w-[72px] border-l border-white/10 bg-slate-900 px-2 py-2 text-center text-[10px] font-medium uppercase tracking-wider text-slate-300"
                        >
                          {formatShortDate(date)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const totalPaginas = Math.max(1, Math.ceil(filteredProducts.length / ITEMS_PER_PAGE));
                      const pageClamped = Math.min(page, totalPaginas);
                      const sliceStart = (pageClamped - 1) * ITEMS_PER_PAGE;
                      return filteredProducts.slice(sliceStart, sliceStart + ITEMS_PER_PAGE);
                    })().map((product, index) => {
                      const rowBackground = index % 2 === 0 ? "#ffffff" : "#f8fafc";
                      const hasAlert = product.diasSemVenda >= DIAS_SEM_VENDA_ALERTA;
                      const vencStatus = getVencimentoStatus(product.lote?.vencimentoLote ?? null);
                      const rowHighlight = hasAlert || vencStatus === "vencido"
                        ? index % 2 === 0 ? "#fef9ee" : "#fef3cd"
                        : rowBackground;

                      const { estoqueIdeal, excessoReais, reducaoExcesso } = calcularMetricasProduto(product);

                      return (
                        <tr
                          key={product.id}
                          className={cn(
                            "border-b border-slate-100 transition-colors hover:bg-slate-50",
                            !hasAlert && !vencStatus?.startsWith("venc") && (index % 2 === 0 ? "bg-white" : "bg-slate-50/50"),
                          )}
                        >
                          <td
                            className="sticky left-0 z-[25] border-b border-slate-100 px-1.5 py-2 text-center"
                            style={{ backgroundColor: rowHighlight, width: SELECTION_COLUMN_WIDTH, minWidth: SELECTION_COLUMN_WIDTH, boxShadow: "1px 0 0 rgba(226,232,240,0.95)", willChange: "transform", backfaceVisibility: "hidden", transform: "translateZ(0)" }}
                          >
                            <input
                              type="checkbox"
                              checked={selecao.isSelected(product.id)}
                              onChange={() => {}}
                              onClick={(e) => selecao.toggle(product.id, e.shiftKey)}
                              className="h-3.5 w-3.5 cursor-pointer rounded accent-teal-500"
                              title="Shift+clique seleciona o intervalo"
                            />
                          </td>
                          <td
                            className={cn(
                              "border-b border-slate-100 px-2 py-2 font-medium text-slate-900",
                              stickyColumns.codigo.sticky && "sticky z-[20]",
                            )}
                            style={getColumnStyle("codigo", rowHighlight)}
                          >
                            <div className="flex items-center">
                              {product.codigo}
                              <SemVendaBadge diasSemVenda={product.diasSemVenda} />
                            </div>
                          </td>
                          <td
                            className={cn(
                              "border-b border-slate-100 px-2 py-2 cursor-pointer hover:bg-blue-50 transition-colors",
                              stickyColumns.produto.sticky && "sticky z-[20]",
                            )}
                            style={getColumnStyle("produto", rowHighlight)}
                            onClick={() => setSelectedProductId(product.id)}
                          >
                            <div className="flex items-center gap-1" style={{ maxWidth: stickyColumns.produto.width }}>
                              <span
                                className="min-w-0 truncate font-medium text-blue-700 leading-tight hover:underline"
                                title={product.nomeProduto}
                              >
                                {product.nomeProduto}
                              </span>
                              {product.statusCampanha === "em_campanha" && (
                                <span className="shrink-0">
                                  <CampanhaBadge campanhaFim={product.campanhaFim} />
                                </span>
                              )}
                            </div>
                          </td>
                          <td
                            className={cn(
                              "border-b border-slate-100 px-2 py-2 text-slate-600",
                              stickyColumns.fornecedor.sticky && "sticky z-[20]",
                            )}
                            style={getColumnStyle("fornecedor", rowHighlight)}
                          >
                            <span
                              className="block truncate"
                              style={{ maxWidth: stickyColumns.fornecedor.width }}
                              title={product.fornecedor}
                            >
                              {product.fornecedor}
                            </span>
                          </td>
                          <td
                            className={cn(
                              "border-b border-slate-100 px-2 py-2 text-slate-600",
                              stickyColumns.comprador?.sticky && "sticky z-[20]",
                            )}
                            style={getColumnStyle("comprador", rowHighlight)}
                          >
                            <span
                              className="block truncate"
                              style={{ maxWidth: stickyColumns.comprador.width }}
                              title={product.comprador ?? "Não atribuído"}
                            >
                              {product.comprador ?? <span className="text-slate-400">—</span>}
                            </span>
                          </td>
                          <td
                            className={cn(
                              "border-b border-slate-100 px-2.5 py-2 text-left text-slate-600",
                              stickyColumns.ultCompra?.sticky && "sticky z-20",
                            )}
                            style={getColumnStyle("ultCompra", rowHighlight)}
                          >
                            {product.dataUltimaCompra ? formatDateBR(product.dataUltimaCompra) : "—"}
                          </td>
                          <td
                            className={cn(
                              "border-b border-slate-100 px-2.5 py-2 text-left text-slate-600",
                              stickyColumns.ultTransf?.sticky && "sticky z-20",
                            )}
                            style={getColumnStyle("ultTransf", rowHighlight)}
                          >
                            {product.dataUltimaTransferencia ? formatDateBR(product.dataUltimaTransferencia) : "—"}
                          </td>
                          <td
                            className={cn(
                              "border-b border-slate-100 px-2 py-2 text-right font-semibold text-slate-900",
                              stickyColumns.diasEstoque.sticky && "sticky z-[20]",
                            )}
                            style={getColumnStyle("diasEstoque", rowHighlight)}
                          >
                            {integerFormatter.format(product.diasEstoque)}
                          </td>
                          <td className="border-b border-slate-100 px-2.5 py-2 text-right text-slate-500" style={{ backgroundColor: rowHighlight }}>
                            {integerFormatter.format(product.estoqueInicial)}
                          </td>
                          <td
                            className={cn(
                              "border-b border-slate-100 px-2.5 py-2 text-right text-slate-600",
                              stickyColumns.estoqueTotal.sticky && "sticky z-20",
                            )}
                            style={getColumnStyle("estoqueTotal", rowHighlight)}
                          >
                            {integerFormatter.format(product.estoqueAtual)}
                          </td>
                          <td
                            className={cn("border-b border-slate-100 px-2.5 py-2 text-right text-slate-700", stickyColumns.estoqueIdeal?.sticky && "sticky z-20")}
                            style={getColumnStyle("estoqueIdeal", rowHighlight)}
                          >
                            {integerFormatter.format(product.statusCampanha === "em_campanha" && product.estoqueIdealCongelado != null ? product.estoqueIdealCongelado : estoqueIdeal)}
                          </td>
                          <td
                            className={cn(
                              "border-b border-slate-100 px-2.5 py-2 text-right text-slate-600",
                              stickyColumns.estoqueLote.sticky && "sticky z-20",
                            )}
                            style={getColumnStyle("estoqueLote", rowHighlight)}
                          >
                            {product.lote ? integerFormatter.format(product.lote.estoqueLote) : "—"}
                          </td>
                          <td
                            className={cn(
                              "border-b border-slate-100 px-2.5 py-2 text-slate-600",
                              stickyColumns.codLote.sticky && "sticky z-20",
                            )}
                            style={getColumnStyle("codLote", rowHighlight)}
                          >
                            <span
                              className="block truncate font-mono text-[10px]"
                              style={{ maxWidth: stickyColumns.codLote.width }}
                              title={product.lote?.codLote ?? undefined}
                            >
                              {product.lote?.codLote ?? "—"}
                            </span>
                          </td>
                          <td
                            className={cn(
                              "border-b border-slate-100 px-2.5 py-2",
                              stickyColumns.vencimento.sticky && "sticky z-20",
                            )}
                            style={getColumnStyle("vencimento", rowHighlight)}
                          >
                            <VencimentoBadge isoDate={product.lote?.vencimentoLote ?? null} />
                          </td>
                          <td
                            className={cn(
                              "border-b border-slate-100 px-2.5 py-2 text-right text-slate-600",
                              stickyColumns.vendaMedia.sticky && "sticky z-20",
                            )}
                            style={getColumnStyle("vendaMedia", rowHighlight)}
                          >
                            {decimalFormatter.format(product.vendaMedia)}
                          </td>
                          <td
                            className={cn(
                              "border-b border-slate-100 px-2.5 py-2 text-right text-slate-600",
                              stickyColumns.projMes?.sticky && "sticky z-20",
                            )}
                            style={getColumnStyle("projMes", rowHighlight)}
                          >
                            {integerFormatter.format(product.qtdProjetadoMesAtual)}
                          </td>
                          <td
                            className={cn(
                              "border-b border-slate-100 px-2.5 py-2 text-right text-slate-600",
                              stickyColumns.vdaM0?.sticky && "sticky z-20",
                            )}
                            style={getColumnStyle("vdaM0", rowHighlight)}
                          >
                            {integerFormatter.format(product.qtdVendaMesAtual)}
                          </td>
                          <td
                            className={cn(
                              "border-b border-slate-100 px-2.5 py-2 text-right text-slate-600",
                              stickyColumns.vdaM1?.sticky && "sticky z-20",
                            )}
                            style={getColumnStyle("vdaM1", rowHighlight)}
                          >
                            {integerFormatter.format(product.qtdVendaMesAnterior)}
                          </td>
                          <td
                            className={cn(
                              "border-b border-slate-100 px-2.5 py-2 text-right text-slate-600",
                              stickyColumns.vdaM2?.sticky && "sticky z-20",
                            )}
                            style={getColumnStyle("vdaM2", rowHighlight)}
                          >
                            {integerFormatter.format(product.qtdVenda2MesesAnterior)}
                          </td>
                          <td
                            className={cn(
                              "border-b border-slate-100 px-2.5 py-2 text-right text-slate-600",
                              stickyColumns.valorCusto.sticky && "sticky z-20",
                            )}
                            style={getColumnStyle("valorCusto", rowHighlight)}
                          >
                            {product.valorCusto === null ? "—" : currencyFormatter.format(product.valorCusto)}
                          </td>
                          <td
                            className={cn(
                              "border-b border-slate-100 px-2.5 py-2 text-right text-slate-600",
                              stickyColumns.precoMin?.sticky && "sticky z-20",
                            )}
                            style={getColumnStyle("precoMin", rowHighlight)}
                          >
                            {product.precoPolitica === null ? "—" : currencyFormatter.format(product.precoPolitica)}
                          </td>
                          <td
                            className={cn("border-b border-slate-100 px-2.5 py-2 text-right text-rose-700 font-bold", stickyColumns.excessoReais?.sticky && "sticky z-20")}
                            style={getColumnStyle("excessoReais", rowHighlight)}
                          >
                            {excessoReais > 0 ? currencyFormatter.format(excessoReais) : "—"}
                          </td>
                          <td
                            className={cn(
                              "border-b border-slate-100 px-2.5 py-2 text-right font-semibold tabular-nums",
                              stickyColumns.reducaoExcesso?.sticky && "sticky z-20",
                              reducaoExcesso == null ? "text-slate-400" : reducaoExcesso >= 0 ? "text-emerald-600" : "text-rose-600",
                            )}
                            style={getColumnStyle("reducaoExcesso", rowHighlight)}
                            title={product.excessoEntradaReais != null ? `Entrou com ${currencyFormatter.format(product.excessoEntradaReais)} de excesso${product.diasEstoqueEntrada != null ? ` e ${product.diasEstoqueEntrada} dias de estoque` : ""}` : "Sem snapshot de entrada (entra no próximo ciclo)"}
                          >
                            {reducaoExcesso == null ? "—" : reducaoExcesso >= 0 ? `↓ ${reducaoExcesso.toFixed(0)}%` : `${reducaoExcesso.toFixed(0)}%`}
                          </td>

                          {[...(dashboard?.recentDates ?? [])].reverse().map((date) => {
                            const quantity = product.vendasRecentes[date] ?? 0;
                            return (
                              <td key={`${product.id}-${date}`} className="border-b border-l border-slate-100 px-2 py-2 text-center">
                                <span
                                  className={cn(
                                    "inline-flex min-w-[2.5rem] items-center justify-center rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                                    quantity > 0 ? "bg-teal-50 text-teal-700" : "bg-slate-50 text-slate-400",
                                  )}
                                >
                                  {integerFormatter.format(quantity)}
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Paginação (padrão do projeto) */}
              {filteredProducts.length > 0 && (
                <DataTablePagination
                  page={page}
                  pageSize={ITEMS_PER_PAGE}
                  total={filteredProducts.length}
                  onPageChange={setPage}
                  itemLabel="produtos"
                />
              )}
            </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Product Panorama Dialog */}
      <Dialog open={selectedProductId !== null} onOpenChange={(open) => {
        if (!open) {
          setSelectedProductId(null);
          setCampaignFormOpen(false);
          setConfirmChangeOpen(false);
          setIsEditingCampaign(false);
        }
      }}>
        <DialogContent
          showCloseButton={false}
          className="max-h-[90vh] flex flex-col border-0 bg-slate-950 text-white sm:max-w-4xl p-0 gap-0 rounded-xl overflow-hidden"
        >
          {/* Sticky Header */}
          <div className="sticky top-0 z-50 bg-slate-950 border-b border-white/10 px-6 py-4 flex-shrink-0">
            <DialogHeader>
              <DialogTitle className="text-xl tracking-tight font-semibold text-slate-50 pr-10">
                {panorama?.product.nomeProduto ?? "Panorama do produto"}
              </DialogTitle>
              <DialogDescription className="text-slate-400">
                Queima diária e leitura de cobertura — {panorama?.product.region}
              </DialogDescription>
            </DialogHeader>
            <DialogClose
              className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/50"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </DialogClose>
          </div>

          {/* Scrollable Content */}
          <div className="overflow-y-auto flex-1 px-6 pb-6 pt-4">

          {panoramaQuery.isLoading ? (
            <div className="flex min-h-[200px] items-center justify-center gap-2 text-slate-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Carregando...</span>
            </div>
          ) : panoramaQuery.error ? (
            <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-200">
              {panoramaQuery.error.message}
            </div>
          ) : panorama ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
                  <p className="text-[10px] uppercase tracking-wider text-slate-400">Estoque Total</p>
                  <p className="mt-1 text-lg font-semibold">{integerFormatter.format(panorama.product.estoqueAtual)}</p>
                </div>
                <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
                  <p className="text-[10px] uppercase tracking-wider text-slate-400">Venda Média Mensal</p>
                  <p className="mt-1 text-lg font-semibold">{decimalFormatter.format(panoramaVendaMediaMensal)}</p>
                </div>
                <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
                  <p className="text-[10px] uppercase tracking-wider text-slate-400">Cobertura Estimada</p>
                  <p className="mt-1 text-lg font-semibold">
                    {projectedCoverage === null
                      ? "\u2014"
                      : `${projectedCoverage} dias`}
                  </p>
                  {projectedCoverage !== null && (
                    <p className="text-[10px] text-slate-400">
                      ~{Math.round(projectedCoverage / 30)} meses
                    </p>
                  )}
                </div>
                <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
                  <p className="text-[10px] uppercase tracking-wider text-slate-400">Ticket Médio</p>
                  <p className="mt-1 text-lg font-semibold">
                    {panorama.product.estoqueAtual > 0 && panorama.product.valorCusto != null
                      ? currencyFormatter.format(panorama.product.valorCusto / panorama.product.estoqueAtual)
                      : "—"}
                  </p>
                  <p className="text-[10px] text-slate-400">custo unitário</p>
                </div>
                <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
                  <p className="text-[10px] uppercase tracking-wider text-slate-400">Valor Custo</p>
                  <p className="mt-1 text-lg font-semibold">
                    {panorama.product.valorCusto === null ? "—" : currencyFormatter.format(panorama.product.valorCusto)}
                  </p>
                </div>
              </div>

              {produtoSelecionado?.excessoEntradaReais != null && (() => {
                const excessoAtual = excessoReaisSuperestocado(
                  produtoSelecionado.estoqueAtual, produtoSelecionado.vendaMedia, produtoSelecionado.valorCusto,
                );
                const red = reducaoExcessoPct(produtoSelecionado.excessoEntradaReais, excessoAtual);
                return (
                  <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
                    <p className="text-[10px] uppercase tracking-wider text-slate-400">Evolução desde a entrada no painel</p>
                    <p className="mt-1 text-sm text-slate-200">
                      Entrou com <b>{produtoSelecionado.diasEstoqueEntrada ?? "—"}</b> dias ·{" "}
                      <b>{currencyFormatter.format(produtoSelecionado.excessoEntradaReais)}</b> de excesso
                      {" → hoje "}
                      <b>{produtoSelecionado.diasEstoque}</b> dias · <b>{currencyFormatter.format(excessoAtual)}</b>
                      {red != null && (
                        <span className={cn("ml-2 font-semibold", red >= 0 ? "text-emerald-400" : "text-rose-400")}>
                          {red >= 0 ? `↓ ${red.toFixed(0)}%` : `${red.toFixed(0)}%`}
                        </span>
                      )}
                    </p>
                  </div>
                );
              })()}

              {/* Permanência no painel */}
              {permanenciaQuery.data && (() => {
                const d = permanenciaQuery.data;
                const atual = d.atual;
                const fmt = (v: string | number | Date | null | undefined) =>
                  v ? new Date(v).toLocaleDateString("pt-BR") : "—";
                const fechadas = d.passagens.filter((p) => p.saiuEm);
                return (
                  <div className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10 space-y-3">
                    <div className="flex items-center gap-2">
                      <History className="h-4 w-4 text-slate-400" />
                      <p className="text-[10px] uppercase tracking-wider text-slate-400">Permanência no painel</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-4">
                      <div>
                        <p className="text-[10px] text-slate-400">Entrou em</p>
                        <p className="text-sm font-medium">{fmt(atual?.entrouEm)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400">Tempo no painel</p>
                        <p className="text-sm font-medium">{atual?.diasNoPainel != null ? `${atual.diasNoPainel} dia(s)` : "—"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400">Transf. recebida</p>
                        <p className="text-sm font-medium text-emerald-300">+{integerFormatter.format(atual?.transfRecebida ?? 0)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400">Transf. enviada</p>
                        <p className="text-sm font-medium text-rose-300">−{integerFormatter.format(atual?.transfEnviada ?? 0)}</p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-300">
                      {d.totalPassagens <= 1
                        ? "1ª vez no painel."
                        : `${d.totalPassagens}ª passagem — já esteve no painel ${fechadas.length} vez(es) antes.`}
                    </p>
                    {fechadas.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] uppercase tracking-wider text-slate-400">Passagens anteriores</p>
                        {fechadas.map((p) => (
                          <div key={p.id} className="flex items-center justify-between text-xs text-slate-300 border-t border-white/5 pt-1">
                            <span>{fmt(p.entrouEm)} → {fmt(p.saiuEm)} ({p.diasPermanencia ?? "?"}d)</span>
                            <span className="text-slate-400">+{p.transfRecebida} / −{p.transfEnviada}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Status Campanha - Expandido */}
              <div className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10 space-y-4">
                {/* Header da seção */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Megaphone className="h-4 w-4 text-slate-400" />
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-400">Campanha</p>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">
                          {panorama.product.statusCampanha === "em_campanha" ? (
                            <span className="text-emerald-400">Em Campanha</span>
                          ) : (
                            <span className="text-slate-300">Sem Campanha</span>
                          )}
                        </p>
                        {panorama.product.statusCampanha === "em_campanha" && panorama.product.campanhaFim && (
                          (() => {
                            const status = getCampanhaStatus(panorama.product.campanhaFim);
                            const remaining = getCampanhaRemainingDays(panorama.product.campanhaFim);
                            return (
                              <span className={cn(
                                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold",
                                status === "ativa" && "bg-emerald-500/20 text-emerald-300",
                                status === "urgente" && "bg-red-500/20 text-red-300 animate-pulse",
                                status === "vencida" && "bg-red-500/20 text-red-300 animate-pulse",
                              )}>
                                {status === "vencida" ? "Vencida" : `${remaining}d restantes`}
                              </span>
                            );
                          })()
                        )}
                      </div>
                      {panorama.product.statusCampanha === "em_campanha" && panorama.product.estoqueIdealCongelado != null && (
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Est. ideal congelado: {integerFormatter.format(panorama.product.estoqueIdealCongelado)} un.
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {panorama.product.statusCampanha === "em_campanha" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setIsEditingCampaign(true);
                          setCampaignDesc(panorama.product.campanhaDescricao ?? "");
                          setCampaignStart(panorama.product.campanhaInicio ?? "");
                          setCampaignEnd(panorama.product.campanhaFim ?? "");
                          setCampaignObs(panorama.product.campanhaObservacao ?? "");
                          setCampaignFormOpen(true);
                        }}
                        className="text-xs gap-1 border-blue-400/30 text-blue-300 hover:bg-blue-500/10"
                      >
                        <Pencil className="h-3 w-3" />
                        Alterar
                      </Button>
                    )}
                    {panorama.product.statusCampanha === "em_campanha" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={removeCampaignMutation.isPending}
                        onClick={() => {
                          if (!selectedProductId) return;
                          removeCampaignMutation.mutate({ productId: selectedProductId });
                        }}
                        className="text-xs gap-1.5 border-rose-400/30 text-rose-300 hover:bg-rose-500/10"
                      >
                        {removeCampaignMutation.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <>Remover</>  
                        )}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setIsEditingCampaign(false);
                          setCampaignDesc("");
                          setCampaignStart("");
                          setCampaignEnd("");
                          setCampaignObs("");
                          setCampaignFormOpen(true);
                        }}
                        className="text-xs gap-1.5 border-emerald-400/30 text-emerald-300 hover:bg-emerald-500/10"
                      >
                        Iniciar Campanha
                      </Button>
                    )}
                  </div>
                </div>

                {/* Descrição e duração da campanha ativa */}
                {panorama.product.statusCampanha === "em_campanha" && panorama.product.campanhaDescricao && !campaignFormOpen && (
                  <div className="rounded-lg bg-white/5 p-3 space-y-2">
                    <p className="text-xs text-slate-200 whitespace-pre-wrap break-words">{panorama.product.campanhaDescricao}</p>
                    {(panorama.product.campanhaInicio || panorama.product.campanhaFim) && (
                      <div className="flex items-center gap-2 text-[10px] text-slate-400">
                        <Calendar className="h-3 w-3" />
                        <span>
                          {panorama.product.campanhaInicio ? formatDateBR(panorama.product.campanhaInicio) : "Início n/d"}
                          {" → "}
                          {panorama.product.campanhaFim ? formatDateBR(panorama.product.campanhaFim) : "Sem prazo"}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Formulário de campanha (criar ou alterar) */}
                {campaignFormOpen && (
                  <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-3">
                    <p className="text-xs font-medium text-slate-200">
                      {isEditingCampaign ? "Alterar Campanha" : "Nova Campanha"}
                    </p>
                    <div className="space-y-2">
                      <Label className="text-[10px] uppercase tracking-wider text-slate-400">Descrição *</Label>
                      <Textarea
                        value={campaignDesc}
                        onChange={(e) => setCampaignDesc(e.target.value)}
                        placeholder="Descreva a campanha (ex: Redução de 30%, combo com produto X...)"
                        className="bg-white/5 border-white/10 text-white text-xs placeholder:text-slate-500 min-h-[60px] resize-y"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[10px] uppercase tracking-wider text-slate-400">Início (opcional)</Label>
                        <Input
                          type="date"
                          value={campaignStart}
                          onChange={(e) => setCampaignStart(e.target.value)}
                          className="bg-white/5 border-white/10 text-white text-xs [color-scheme:dark]"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] uppercase tracking-wider text-slate-400">Fim (opcional)</Label>
                        <Input
                          type="date"
                          value={campaignEnd}
                          onChange={(e) => setCampaignEnd(e.target.value)}
                          className="bg-white/5 border-white/10 text-white text-xs [color-scheme:dark]"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase tracking-wider text-slate-400">
                        <StickyNote className="h-3 w-3 inline mr-1" />
                        Observação
                      </Label>
                      <Textarea
                        value={campaignObs}
                        onChange={(e) => setCampaignObs(e.target.value)}
                        placeholder="Anotações de preço, condições especiais..."
                        className="bg-white/5 border-white/10 text-white text-xs placeholder:text-slate-500 min-h-[40px] resize-y"
                      />
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCampaignFormOpen(false)}
                        className="text-xs border-white/10 text-slate-300 hover:bg-white/5"
                      >
                        Cancelar
                      </Button>
                      <Button
                        size="sm"
                        disabled={!campaignDesc.trim() || startCampaignMutation.isPending}
                        onClick={() => {
                          if (!selectedProductId) return;
                          // Se está editando e já tem observação, mostra confirmação
                          if (isEditingCampaign && panorama.product.campanhaObservacao) {
                            setConfirmChangeOpen(true);
                            return;
                          }
                          startCampaignMutation.mutate({
                            productId: selectedProductId,
                            descricao: campaignDesc.trim(),
                            dataInicio: campaignStart || null,
                            dataFim: campaignEnd || null,
                            observacao: campaignObs || null,
                            keepObservation: false,
                          });
                        }}
                        className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        {startCampaignMutation.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : isEditingCampaign ? (
                          "Salvar Alteração"
                        ) : (
                          "Iniciar Campanha"
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Modal de confirmação ao alterar campanha com observação existente */}
                {confirmChangeOpen && (
                  <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-400" />
                      <p className="text-xs font-medium text-amber-200">Confirmar alteração de campanha</p>
                    </div>
                    <p className="text-[11px] text-slate-300">
                      Este produto possui uma observação registrada. Deseja manter ou apagar a observação ao alterar a campanha?
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (!selectedProductId) return;
                          startCampaignMutation.mutate({
                            productId: selectedProductId,
                            descricao: campaignDesc.trim(),
                            dataInicio: campaignStart || null,
                            dataFim: campaignEnd || null,
                            observacao: campaignObs || null,
                            keepObservation: true,
                          });
                        }}
                        disabled={startCampaignMutation.isPending}
                        className="text-xs border-emerald-400/30 text-emerald-300 hover:bg-emerald-500/10"
                      >
                        {startCampaignMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Manter observação"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (!selectedProductId) return;
                          startCampaignMutation.mutate({
                            productId: selectedProductId,
                            descricao: campaignDesc.trim(),
                            dataInicio: campaignStart || null,
                            dataFim: campaignEnd || null,
                            observacao: null,
                            keepObservation: false,
                          });
                        }}
                        disabled={startCampaignMutation.isPending}
                        className="text-xs border-rose-400/30 text-rose-300 hover:bg-rose-500/10"
                      >
                        Apagar observação
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmChangeOpen(false)}
                        className="text-xs border-white/10 text-slate-300 hover:bg-white/5"
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}

                {/* Observação (bloco de notas) - visível quando em campanha e não está editando */}
                {panorama.product.statusCampanha === "em_campanha" && !campaignFormOpen && (
                  <div className="rounded-lg bg-white/5 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <StickyNote className="h-3 w-3 text-slate-400" />
                        <p className="text-[10px] uppercase tracking-wider text-slate-400">Observação</p>
                      </div>
                      {panorama.product.campanhaObservacao && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (!selectedProductId) return;
                            updateObservationMutation.mutate({ productId: selectedProductId, observacao: null });
                          }}
                          disabled={updateObservationMutation.isPending}
                          className="text-[10px] text-slate-400 hover:text-rose-300 h-5 px-1"
                        >
                          Limpar
                        </Button>
                      )}
                    </div>
                    {panorama.product.campanhaObservacao ? (
                      <p className="text-xs text-slate-300 whitespace-pre-wrap break-words">{panorama.product.campanhaObservacao}</p>
                    ) : (
                      <p className="text-[10px] text-slate-500 italic">Nenhuma observação registrada</p>
                    )}
                  </div>
                )}

                {/* Histórico de Campanhas (Accordion) */}
                {campaignHistoryQuery.data && campaignHistoryQuery.data.length > 0 && (
                  <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="history" className="border-white/10">
                      <AccordionTrigger className="text-xs text-slate-300 hover:text-white py-2 hover:no-underline">
                        <div className="flex items-center gap-1.5">
                          <History className="h-3 w-3" />
                          Histórico de Campanhas ({campaignHistoryQuery.data.length})
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2 pt-1">
                          {campaignHistoryQuery.data.map((hist) => (
                            <div key={hist.id} className="rounded-md bg-white/5 p-2.5 space-y-1">
                              <p className="text-xs text-slate-200 break-words">{hist.descricao}</p>
                              <div className="flex items-center gap-3 text-[10px] text-slate-400">
                                {(hist.dataInicio || hist.dataFim) && (
                                  <span className="flex items-center gap-1">
                                    <Calendar className="h-2.5 w-2.5" />
                                    {hist.dataInicio ? formatDateBR(hist.dataInicio) : "?"}
                                    {" → "}
                                    {hist.dataFim ? formatDateBR(hist.dataFim) : "?"}
                                  </span>
                                )}
                                {hist.finalizadoEm && (
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-2.5 w-2.5" />
                                    Finalizada em {new Date(hist.finalizadoEm).toLocaleDateString("pt-BR")}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                )}
              </div>

              {/* Lotes do produto */}
              {panorama.lotes.length > 0 && (
                <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
                  <p className="mb-2 text-[10px] uppercase tracking-wider text-slate-400">Lotes do Produto</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-white/10 text-left text-[10px] uppercase tracking-wider text-slate-400">
                          <th className="px-2 py-1.5">Cód. Lote</th>
                          <th className="px-2 py-1.5 text-right">Est. Lote</th>
                          <th className="px-2 py-1.5 text-right">Qtd. Vendida</th>
                          <th className="px-2 py-1.5">Vencimento</th>
                        </tr>
                      </thead>
                      <tbody>
                        {panorama.lotes.map((lote) => {
                          const vencStatus = getVencimentoStatus(lote.vencimentoLote);
                          return (
                            <tr key={lote.codLote} className="border-b border-white/5">
                              <td className="px-2 py-1.5 font-mono text-white">{lote.codLote}</td>
                              <td className="px-2 py-1.5 text-right text-white">{integerFormatter.format(lote.estoqueLote)}</td>
                              <td className="px-2 py-1.5 text-right text-white">{integerFormatter.format(lote.qtdVendida)}</td>
                              <td className="px-2 py-1.5">
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                                    vencStatus === "vencido" && "bg-red-500/20 text-red-300 animate-pulse",
                                    vencStatus === "proximo" && "bg-amber-500/20 text-amber-300",
                                    (vencStatus === "ok" || !vencStatus) && "text-white",
                                  )}
                                >
                                  {(vencStatus === "vencido" || vencStatus === "proximo") && (
                                    <AlertTriangle className="h-3 w-3" />
                                  )}
                                  {formatDateBR(lote.vencimentoLote)}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <Card className="border-0 bg-white text-slate-950 shadow-none">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Curva de queima</CardTitle>
                  <CardDescription className="text-xs">
                    Série diária — Código {panorama.product.codigo}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {panorama.salesSeries.length ? (
                    <ChartContainer config={panoramaChartConfig} className="h-[280px] w-full">
                      <BarChart data={panorama.salesSeries} margin={{ left: 4, right: 4, top: 4, bottom: 4 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={14} fontSize={10} />
                        <YAxis tickLine={false} axisLine={false} fontSize={10} />
                        <ChartTooltip
                          content={
                            <ChartTooltipContent
                              formatter={(value) => (
                                <div className="flex items-center gap-1">
                                  <span>{formatQuantityTooltipValue(value)}</span>
                                </div>
                              )}
                            />
                          }
                        />
                        <Bar dataKey="quantidade" fill="var(--color-quantidade)" radius={[6, 6, 0, 0]} />
                        <Line dataKey="quantidade" stroke="var(--color-quantidade)" strokeWidth={2} dot={false} />
                      </BarChart>
                    </ChartContainer>
                  ) : (
                    <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 text-center">
                      <Activity className="h-6 w-6 text-slate-400" />
                      <p className="text-xs text-slate-500">Sem série de vendas disponível.</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="grid gap-3 text-xs text-slate-300 sm:grid-cols-2">
                <div className="space-y-2 rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
                  <p className="text-[10px] uppercase tracking-wider text-slate-400">Informações do Produto</p>
                  <div className="flex justify-between border-b border-white/10 pb-1.5">
                    <span>Código</span>
                    <strong className="text-white">{panorama.product.codigo}</strong>
                  </div>
                  <div className="flex justify-between border-b border-white/10 pb-1.5">
                    <span>Fornecedor</span>
                    <strong className="text-right text-white">{panorama.product.fornecedor}</strong>
                  </div>
                  <div className="flex justify-between border-b border-white/10 pb-1.5">
                    <span>Dias de Estoque</span>
                    <strong className="text-white">{integerFormatter.format(panorama.product.diasEstoque)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Estoque Inicial</span>
                    <strong className="text-white">{integerFormatter.format(panorama.product.estoqueInicial)}</strong>
                  </div>
                </div>
                <div className="space-y-2 rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
                  <p className="text-[10px] uppercase tracking-wider text-slate-400">Dados Complementares</p>
                  <div className="flex justify-between border-b border-white/10 pb-1.5">
                    <span>Tipo</span>
                    <strong className="text-white">
                      {panorama.product.tipoProduto === "medicamento" ? "Medicamento" : "Não Medicamento"}
                    </strong>
                  </div>
                  <div className="flex justify-between border-b border-white/10 pb-1.5">
                    <span>Região</span>
                    <strong className="text-white">{panorama.product.region}</strong>
                  </div>
                  <div className="flex justify-between border-b border-white/10 pb-1.5">
                    <span>Última Compra</span>
                    <strong className="text-white">
                      {panorama.product.dataUltimaCompra ?? "—"}
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Última Atualização</span>
                    <strong className="text-right text-white">{formatDateTime(panorama.product.ultimaAtualizacaoMs)}</strong>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          </div>
        </DialogContent>
      </Dialog>
      {/* O chat de IA consulta dados de UMA região; oculto na visão unificada
          para não responder sobre uma região enquanto a tela mostra as duas. */}
      {activeRegion !== "UNIFICADO" && <SuperestocadosAIChat region={activeRegion} />}
    </div>
  );
}
