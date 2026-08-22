import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Clock,
  CalendarClock,
  Check,
  ChevronDown,
  Download,
  Fish,
  HelpCircle,
  History,
  Loader2,
  Package,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  ShoppingCart,
  Tag,
  TrendingDown as TrendingDownIcon,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import SegmentedTabs from "@/components/SegmentedTabs";
import PanelHeader from "@/components/PanelHeader";
import KpiGrid from "@/components/KpiGrid";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import MultiSelectFilter from "@/components/MultiSelectFilter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { VencimentoTag } from "@/components/VencimentoTag";
import { DataTablePagination } from "@/components/DataTablePagination";
import { useRangeSelection } from "@/hooks/useRangeSelection";
import {
  buildPescadorStickyLayout,
  getPescadorFrozenKeys,
  PESCADOR_SELECTION_WIDTH,
  type PescadorStickyKey,
} from "./pescadorTableHelpers";
import PescadorPedidosTab from "./pescadorPedidosTab";
import PescadorRulesModal from "./PescadorRulesModal";

/* ─── Types ─────────────────────────────────────────────────────────────── */

/** Status de venda que a API pode emitir (`Caiu/ Subiu venda`), na ordem de exibição do filtro. */
const STATUS_CONHECIDOS = ["Subiu", "Caiu", "Estável", "Sem venda", "Sem movimento"] as const;

/** Opções do filtro Estoque (value → rótulo). "__todas__" = sem filtro. */
const ESTOQUE_OPCOES: Array<{ value: string; label: string }> = [
  { value: "__todas__", label: "Todos" },
  { value: "0", label: "Ruptura (0)" },
  { value: "1-50", label: "Baixo (1–50)" },
  { value: "51-500", label: "Médio (51–500)" },
  { value: "500+", label: "Alto (500+)" },
];

type TabKey = "triagem" | "pedidos" | "historico";
type KpiKey = "caiu" | "sem_giro" | "vencendo_30" | "em_promocao";
type SortDir = "asc" | "desc";

type SortableKey =
  | "codInterno"
  | "ean"
  | "descricao"
  | "fornecedor"
  | "estoqueSc"
  | "curvaAbc"
  | "acompanhamento"
  | "politica"
  | "precoUnitario"
  | "percMc"
  | "giroMes"
  | "giroEstoque"
  | "markup"
  | "custoCom"
  | "custoGer"
  | "descontoPerc"
  | "qtdVendidaMes"
  | "qtdVendidaMesAnterior"
  | "loteEstoque"
  | "loteVencimento";

/* ─── Larguras de coluna ─────────────────────────────────────────────────
 * As colunas candidatas a congelamento (Cód., EAN, Descrição, Fabricante,
 * Estoque) vivem em `pescadorTableHelpers.ts` com o mecanismo de frozen
 * progressivo por viewport — mesma estrutura do Superestocados.
 * Abaixo, apenas as larguras das colunas que nunca congelam. */
const COL_WIDTHS = {
  abc: 56,
  acomp: 80,
  vdDia: 56,        // Vd D5-D1 e placeholders D6-D15
  pcUltVenda: 88,
  pcUn: 104,
  margem: 76,
  giroMes: 76,
  codLote: 90,
  vencim: 88,
  politica: 160,
  custoMed: 92,
  markup: 76,
  descPerc: 72,
  vdMes: 72,
  vdMesAnt: 88,
  estoqLote: 78,
  embalagem: 96,
} as const;

/* ─── Formatters ────────────────────────────────────────────────────────── */

const brl = (n: number | null | undefined) =>
  n == null || Number.isNaN(Number(n))
    ? "—"
    : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });

const intFmt = (n: number | null | undefined) =>
  n == null || Number.isNaN(Number(n)) ? "—" : Number(n).toLocaleString("pt-BR");

const dec = (n: number | null | undefined, digits = 2) =>
  n == null || Number.isNaN(Number(n))
    ? "—"
    : Number(n).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/* Markup a partir do preço (Pç un.) e do custo (última compra c/ IPI) — espelha a consulta
 * da API. Usado na simulação inline (recalcular ao editar o Pç un.). */
function calcMarkup(preco: number | null | undefined, custo: number | null | undefined): number | null {
  if (preco == null || preco <= 0 || custo == null || custo <= 0) return null;
  return (preco / custo - 1) * 100;
}
const pct = (n: number | null) => (n == null ? "—" : `${dec(n, 1)}%`);

/* ─── MC (Margem de Contribuição) ────────────────────────────────────────────
 * Fórmula (validada com a API/simulador): MC = preço × (1 − Σperc/100) − custoMédio.
 * Os percentuais efetivos (ICMS, PIS, COFINS, comissão, frete, invest., assoc.,
 * perdas, contratos) já vêm da consulta como % do preço líquido; o custo médio é
 * um valor fixo em R$. Assim, ao editar o Pç un. tudo escala com o preço, menos o
 * custo médio — permitindo recalcular ao vivo. Repasse é informativo (não entra). */
type PremissaKey = "frete" | "perdasVencidos" | "contratos" | "investEmp" | "associativismo";
const PREMISSA_KEYS: PremissaKey[] = ["frete", "perdasVencidos", "contratos", "investEmp", "associativismo"];
type PremissaOverrides = Partial<Record<PremissaKey, number>>;

/** Campos de percentual/custo que a linha da Triagem carrega para o cálculo da MC. */
type McInputs = {
  percIcms?: number | null; percPis?: number | null; percCofins?: number | null; percComissao?: number | null;
  percFrete?: number | null; percInvestEmp?: number | null; percAssociativismo?: number | null;
  percPerdasVencidos?: number | null; percContratos?: number | null; vlrCustoMedio?: number | null;
};

const nz = (v: number | null | undefined) => (v == null ? 0 : v);

/** Soma dos percentuais de despesa (em %), com premissas globais eventualmente sobrescritas. */
function somaPercMc(row: McInputs, ov: PremissaOverrides): number {
  return (
    nz(row.percIcms) + nz(row.percPis) + nz(row.percCofins) + nz(row.percComissao) +
    (ov.frete ?? nz(row.percFrete)) +
    (ov.investEmp ?? nz(row.percInvestEmp)) +
    (ov.associativismo ?? nz(row.percAssociativismo)) +
    (ov.perdasVencidos ?? nz(row.percPerdasVencidos)) +
    (ov.contratos ?? nz(row.percContratos))
  );
}

/** MC em R$ e % para um preço, aplicando overrides de premissa. */
function calcMc(preco: number | null | undefined, row: McInputs, ov: PremissaOverrides): { valor: number | null; perc: number | null } {
  if (preco == null || preco <= 0) return { valor: null, perc: null };
  const valor = preco * (1 - somaPercMc(row, ov) / 100) - nz(row.vlrCustoMedio);
  return { valor, perc: (valor / preco) * 100 };
}

/** Cor contextual da MC% (limites definidos pela área): <10% vermelho, 10–12,5% âmbar, >12,5% verde. */
function corMc(perc: number | null): string {
  if (perc == null) return "";
  if (perc < 10) return "text-rose-600 font-semibold";
  if (perc <= 12.5) return "text-amber-600";
  return "text-emerald-700";
}

function fdate(iso: string | null | undefined) {
  if (!iso) return "—";
  const parts = String(iso).slice(0, 10).split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : iso;
}

function fdateCurta(iso: string | null | undefined) {
  if (!iso) return null;
  const parts = String(iso).slice(0, 10).split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : iso;
}

function daysTo(iso: string | null | undefined): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(String(iso).slice(0, 10) + "T00:00:00");
  if (Number.isNaN(target.getTime())) return Number.POSITIVE_INFINITY;
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/* ─── Component ─────────────────────────────────────────────────────────── */

export default function Pescador() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<TabKey>("triagem");

  /* Global filters */
  const [politica, setPolitica] = useState<string>("__todas__");

  /* Triagem filters */
  const [activeKpi, setActiveKpi] = useState<KpiKey | "">("");
  const [busca, setBusca] = useState("");
  const [curvasAbcSelecionadas, setCurvasAbcSelecionadas] = useState<Set<string>>(new Set());
  const [fornecedoresSelecionados, setFornecedoresSelecionados] = useState<Set<string>>(new Set());
  const [acompanhamento, setAcompanhamento] = useState<string>("__todos__");
  const [faixaEstoque, setFaixaEstoque] = useState<string>("__todas__");
  /* Abertura dos popovers single-select (Dinâmica/Estoque) — fecham ao escolher. */
  const [dinamicaOpen, setDinamicaOpen] = useState(false);
  const [estoqueOpen, setEstoqueOpen] = useState(false);

  /* Drill-down do comparativo 7×7: filtra a tabela por um conjunto de códigos, sem perder
   * os filtros já aplicados; limpável de forma independente. */
  const [drill, setDrill] = useState<{ categoria: string; label: string; codInternos: string[] } | null>(null);

  /* Ordenação e paginação */
  const [sortBy, setSortBy] = useState<SortableKey>("codInterno");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  /* Modo expandido (colunas extras) */
  const [verMaisColunas, setVerMaisColunas] = useState(false);

  /* Modal de regras do painel */
  const [rulesOpen, setRulesOpen] = useState(false);

  /* Simulação de preço (what-if local): rascunho do Pç un. por linha (id → texto digitado).
   * Margem/Markup recalculam na hora; nada é persistido. */
  const [precoDraft, setPrecoDraft] = useState<Record<number, string>>({});
  const resetPreco = (id: number) =>
    setPrecoDraft((p) => {
      const { [id]: _omit, ...rest } = p;
      return rest;
    });
  /** Preço atual considerado (rascunho editado ou o original da API). */
  const precoAtual = (id: number, original: number | null): number | null => {
    const d = precoDraft[id];
    if (d === undefined) return original;
    const n = Number(d.replace(",", "."));
    return d.trim() !== "" && Number.isFinite(n) ? n : null;
  };

  /* Premissas da MC (what-if GLOBAL): rascunho por chave (texto digitado no popover ⚙).
   * Só as chaves que o operador mexeu entram como override; o resto usa o valor da linha. */
  const [premissasDraft, setPremissasDraft] = useState<Partial<Record<PremissaKey, string>>>({});
  const resetPremissas = () => setPremissasDraft({});


  /* Drill-down */
  const [selectedProduto, setSelectedProduto] = useState<
    { codInterno: string; politica?: string; precoSimulado?: number | null; premissas?: PremissaOverrides } | null
  >(null);

  /* Frozen progressivo por viewport (mesma mecânica do Superestocados) */
  const tableViewportRef = useRef<HTMLDivElement | null>(null);
  const [tableViewportWidth, setTableViewportWidth] = useState(0);

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
  }, [activeTab]);

  const stickyColumns = useMemo(
    () => buildPescadorStickyLayout(getPescadorFrozenKeys(tableViewportWidth)),
    [tableViewportWidth],
  );

  function getColumnStyle(columnKey: PescadorStickyKey, backgroundColor?: string): CSSProperties {
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

  /* Queries */
  const utils = trpc.useUtils();
  const metaQuery = trpc.pescador.getMeta.useQuery(undefined, { refetchOnWindowFocus: false });
  const facetsQuery = trpc.pescador.getTriagemFacets.useQuery(undefined, { refetchOnWindowFocus: false });
  const kpisQuery = trpc.pescador.getKpis.useQuery({
    politica: politica !== "__todas__" ? politica : undefined,
  });

  /* Filtros comuns (Triagem + comparativo). O drill-down (codInternosIn) só afeta a Triagem. */
  const filtrosComuns = useMemo(() => ({
    politica: politica !== "__todas__" ? politica : undefined,
    kpi: activeKpi || undefined,
    curvaAbc: curvasAbcSelecionadas.size > 0 ? Array.from(curvasAbcSelecionadas) : undefined,
    fornecedores: fornecedoresSelecionados.size > 0 ? Array.from(fornecedoresSelecionados) : undefined,
    acompanhamento: acompanhamento !== "__todos__" && acompanhamento !== "__com_movimento__" ? acompanhamento : undefined,
    comMovimento: acompanhamento === "__com_movimento__" || undefined,
    estoque: faixaEstoque !== "__todas__" ? (faixaEstoque as "0" | "1-50" | "51-500" | "500+") : undefined,
    busca: busca.trim() || undefined,
  }), [politica, activeKpi, curvasAbcSelecionadas, fornecedoresSelecionados, acompanhamento, faixaEstoque, busca]);

  /** Há algum filtro ativo? (o comparativo aparece só então). Drill-down não conta. */
  const temFiltroAtivo = useMemo(
    () => Object.values(filtrosComuns).some((v) => v !== undefined),
    [filtrosComuns],
  );

  const triagemQuery = trpc.pescador.getTriagem.useQuery({
    ...filtrosComuns,
    codInternosIn: drill?.codInternos,
    sortBy,
    sortDir,
    page,
    pageSize,
  });

  const comparativoQuery = trpc.pescador.getComparativo7x7.useQuery(filtrosComuns, { enabled: temFiltroAtivo });

  const meta = metaQuery.data;
  const kpis = kpisQuery.data;
  const facets = facetsQuery.data;
  const triagemData = triagemQuery.data;

  /* Atualização sob demanda (mesma rotina do sync agendado). */
  const syncMutation = trpc.pescador.sync.useMutation({
    onSuccess: async (r) => {
      await Promise.all([
        utils.pescador.getMeta.invalidate(),
        utils.pescador.getKpis.invalidate(),
        utils.pescador.getTriagem.invalidate(),
        utils.pescador.getTriagemFacets.invalidate(),
      ]);
      toast.success(`Triagem atualizada: ${r.resultados?.[0]?.triagem?.gravadas ?? 0} itens.`);
    },
    onError: (e) => toast.error(`Falha ao atualizar: ${e.message}`),
  });

  /* Premissas da MC — valores de base (o que a carga usou, do meta) e overrides do what-if. */
  const premissaDefaults = useMemo<Record<PremissaKey, number>>(() => {
    const p = (v: number | null | undefined) => +(nz(v) * 100).toFixed(6);
    return {
      frete: p(meta?.mcVarFrete),
      perdasVencidos: p(meta?.mcVarPerdasVencidos),
      contratos: p(meta?.mcVarContratos),
      investEmp: p(meta?.mcVarInvestEmp),
      associativismo: p(meta?.mcVarAssociativismo),
    };
  }, [meta]);

  const premissaLabels: Record<PremissaKey, string> = {
    frete: "Frete", perdasVencidos: "Perdas/vencidos", contratos: "Contratos",
    investEmp: "Investimento empresa", associativismo: "Associativismo",
  };

  const premissaOverrides = useMemo<PremissaOverrides>(() => {
    const ov: PremissaOverrides = {};
    for (const k of PREMISSA_KEYS) {
      const d = premissasDraft[k];
      if (d === undefined) continue;
      const n = Number(d.replace(",", "."));
      if (d.trim() !== "" && Number.isFinite(n)) ov[k] = n;
    }
    return ov;
  }, [premissasDraft]);
  const premissasEditadas = Object.keys(premissaOverrides).length > 0;

  /* Seleção em lote (+ Shift) — hook padrão do projeto, sobre as linhas visíveis da página. */
  const linhasVisiveis = triagemData?.rows ?? [];
  const selecao = useRangeSelection(linhasVisiveis.map((r) => r.id));
  const linhasSelecionadas = selecao.selecionados; // alias para os usos existentes (.size/.has/filter)

  // Mudou um filtro base → volta pra página 1 e descarta o drill-down (ficou obsoleto).
  useEffect(() => {
    setPage(1);
    setDrill(null);
  }, [filtrosComuns]);

  // Ordenação ou drill-down → volta pra página 1.
  useEffect(() => {
    setPage(1);
  }, [sortBy, sortDir, drill]);

  // Limpa a seleção ao trocar de página/filtro/drill (evita confusão).
  useEffect(() => {
    selecao.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filtrosComuns, drill]);

  const totalPaginas = useMemo(() => {
    if (!triagemData) return 1;
    return Math.max(1, Math.ceil(triagemData.total / triagemData.pageSize));
  }, [triagemData]);

  /* Datas dinâmicas D5→D1 (vindas da primeira linha) */
  const datasJanela = useMemo(() => {
    const primeira = triagemData?.rows?.[0] as Record<string, string | null> | undefined;
    const m: Record<number, string | null> = {};
    for (let d = 1; d <= 15; d++) m[d] = primeira?.[`dataD${d}`] ?? null;
    return m;
  }, [triagemData]);

  /* Janela completa de 15 dias úteis: mais recente (D1) → mais antiga (D15), esquerda → direita. */
  const DIAS_JANELA = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const;

  const filtrosAtivos = useMemo(() => {
    const ativos: Array<{ label: string; onClear: () => void }> = [];
    if (politica !== "__todas__") ativos.push({ label: `Política: ${politica}`, onClear: () => setPolitica("__todas__") });
    if (activeKpi) {
      const labels: Record<KpiKey, string> = {
        caiu: "Com queda",
        sem_giro: "Sem giro",
        vencendo_30: "Vencendo ≤30d",
        em_promocao: "Em promoção",
      };
      ativos.push({ label: labels[activeKpi], onClear: () => setActiveKpi("") });
    }
    curvasAbcSelecionadas.forEach((c) => {
      ativos.push({
        label: `Curva ${c}`,
        onClear: () => {
          const next = new Set(curvasAbcSelecionadas);
          next.delete(c);
          setCurvasAbcSelecionadas(next);
        },
      });
    });
    if (fornecedoresSelecionados.size > 0) {
      ativos.push({
        label: `Fornecedores: ${fornecedoresSelecionados.size}`,
        onClear: () => setFornecedoresSelecionados(new Set()),
      });
    }
    if (acompanhamento === "__com_movimento__") ativos.push({ label: "Dinâmica: Com movimento", onClear: () => setAcompanhamento("__todos__") });
    else if (acompanhamento !== "__todos__") ativos.push({ label: `Dinâmica: ${acompanhamento}`, onClear: () => setAcompanhamento("__todos__") });
    if (faixaEstoque !== "__todas__") ativos.push({ label: `Estoque: ${faixaEstoque}`, onClear: () => setFaixaEstoque("__todas__") });
    if (busca.trim()) ativos.push({ label: `Busca: "${busca.trim()}"`, onClear: () => setBusca("") });
    return ativos;
  }, [politica, activeKpi, curvasAbcSelecionadas, fornecedoresSelecionados, acompanhamento, faixaEstoque, busca]);

  function limparTudo() {
    setPolitica("__todas__");
    setActiveKpi("");
    setCurvasAbcSelecionadas(new Set());
    setFornecedoresSelecionados(new Set());
    setAcompanhamento("__todos__");
    setFaixaEstoque("__todas__");
    setBusca("");
  }

  /* ─── Ordenação ─── */
  function toggleSort(key: SortableKey) {
    if (sortBy === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortBy(key); setSortDir("asc"); }
  }

  function SortHeader({
    label, sortKey, align = "left",
  }: { label: string; sortKey: SortableKey; align?: "left" | "right" | "center"; }) {
    const isActive = sortBy === sortKey;
    const Icon = !isActive ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
    return (
      <button
        type="button"
        onClick={() => toggleSort(sortKey)}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-lg px-1 py-0.5 text-xs font-semibold text-white transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/40",
          align === "right" && "justify-end text-right",
          align === "center" && "justify-center",
          align === "left" && "justify-start text-left",
        )}
        aria-label={`Ordenar por ${label}`}
      >
        <span>{label}</span>
        <Icon className={cn("h-3 w-3 shrink-0 opacity-70", isActive && "text-teal-200 opacity-100")} />
      </button>
    );
  }

  /* ─── Export CSV ─── */
  function exportarCsv() {
    if (!triagemData || triagemData.rows.length === 0) return;
    const fonte =
      linhasSelecionadas.size > 0
        ? triagemData.rows.filter((r) => linhasSelecionadas.has(r.id))
        : triagemData.rows;
    if (fonte.length === 0) return;

    const headersBase = [
      "Cód.", "EAN", "Descrição", "Fornecedor", "Estoque", "ABC", "Acomp.",
      ...DIAS_JANELA.map((d) => `Vd ${fdateCurta(datasJanela[d]) ?? `D${d}`}`),
      "Pç últ. venda", "Pç un.", "MC %", "Markup", "Giro", "Cód. Lote", "Vencim.", "Política",
    ];
    const headersExtra = verMaisColunas
      ? ["Custo méd.", "Desc %", "Vd mês", "Vd mês ant.", "Estoq. lote", "Embalagem"]
      : [];
    const headers = [...headersBase, ...headersExtra];

    const rows = fonte.map((r) => {
      // Reflete a simulação (Pç un. e/ou premissas) no export, para sair o que está na tela.
      const edit = precoDraft[r.id] !== undefined;
      const sim = edit || premissasEditadas;
      const precoR = precoAtual(r.id, r.precoUnitario);
      const percMcR = sim ? calcMc(precoR, r, premissaOverrides).perc : r.percMc;
      const markupR = calcMarkup(precoR, r.vlrCustoMedio);
      const base = [
        r.codInterno, r.ean, r.descricao, r.fornecedor ?? "", r.estoqueSc, r.curvaAbc ?? "",
        r.acompanhamento ?? "",
        ...DIAS_JANELA.map((d) => (r as unknown as Record<string, number | null>)[`vendaD${d}`] ?? 0),
        r.precoPraticado ?? "", precoR ?? "", percMcR ?? "", markupR ?? "", r.giroEstoque ?? r.giroMes ?? "",
        r.codLote ?? "", r.loteVencimento ?? "", r.politica,
      ];
      if (verMaisColunas) {
        base.push(
          r.vlrCustoMedio ?? "",
          r.descontoPerc ?? "", r.qtdVendidaMes ?? 0, r.qtdVendidaMesAnterior ?? 0,
          r.loteEstoque ?? 0, r.embalagem ?? "",
        );
      }
      return base;
    });

    const csv = "﻿" + [headers, ...rows]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pescador_triagem_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* ─── KPI Cards ─── */
  const kpiCards: Array<{
    key: KpiKey; label: string; value: number | undefined;
    icon: typeof AlertTriangle; bg: string; text: string; activeBg: string; sub: string;
    /** Slot reservado (sem métrica definida ainda) — não clicável. */
    placeholder?: boolean;
  }> = [
    { key: "caiu", label: "Produtos com queda", value: kpis?.caiu, icon: TrendingDownIcon,
      bg: "bg-rose-50 border-rose-200", text: "text-rose-700", activeBg: "bg-rose-100 ring-2 ring-rose-400",
      sub: "sem venda nos últimos dias úteis" },
    { key: "sem_giro", label: "Sem giro no mês", value: kpis?.semGiro, icon: AlertTriangle,
      bg: "bg-amber-50 border-amber-200", text: "text-amber-700", activeBg: "bg-amber-100 ring-2 ring-amber-400",
      sub: "0 unidade vendida no mês" },
    { key: "vencendo_30", label: "Lotes vencendo ≤30d", value: kpis?.vencendo30, icon: CalendarClock,
      bg: "bg-orange-50 border-orange-200", text: "text-orange-700", activeBg: "bg-orange-100 ring-2 ring-orange-400",
      sub: "priorizar escoamento" },
    { key: "em_promocao", label: "À definir", value: undefined, icon: Tag,
      bg: "bg-slate-50 border-slate-200 border-dashed", text: "text-slate-400", activeBg: "",
      sub: "métrica a definir com a gestão", placeholder: true },
  ];

  const totalColunas = useMemo(() => {
    const baseCount = 1 + 6 + 1 + 1 + DIAS_JANELA.length + 5 + 2 + 1;
    // ↑ checkbox + 6 sticky + ABC + Acomp + 15 Vd + Pç últ. + Pç un. + Margem + Markup + Giro/mês + Lote + Vencim. + Política
    const extras = verMaisColunas ? 6 : 0;
    return baseCount + extras;
  }, [verMaisColunas]);

  /* ─── Render ─────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl 2xl:max-w-[1600px] min-[1920px]:max-w-[1800px] min-[2560px]:max-w-[2200px] space-y-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        {/* Header */}
        <PanelHeader
          onBack={() => setLocation("/negocios")}
          icon={Fish}
          title="Pescador"
          subtitle={meta ? `${meta.cliente} · ${meta.estabelecimento} · ${meta.janela ?? "—"}` : "Painel comercial"}
          color="blue"
          actions={
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {meta?.geradoEm && (
                <span className="hidden md:inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  atualizado {new Date(meta.geradoEm).toLocaleString("pt-BR")}
                </span>
              )}
              <Button
                type="button" variant="ghost" size="sm" className="h-8 rounded-lg text-xs text-muted-foreground hover:text-foreground"
                disabled={syncMutation.isPending}
                onClick={() => syncMutation.mutate()}
                title="Puxar os dados mais recentes da API agora"
              >
                <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", syncMutation.isPending && "animate-spin")} />
                {syncMutation.isPending ? "Atualizando…" : "Atualizar"}
              </Button>
              <Button
                type="button" variant="ghost" size="sm" className="h-8 rounded-lg text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setRulesOpen(true)}
                title="Regras do painel"
              >
                <HelpCircle className="mr-1 h-4 w-4" />
                <span className="hidden sm:inline">Regras</span>
              </Button>
            </div>
          }
        />

        {/* Tabs (SegmentedTabs padrão do projeto) */}
        <SegmentedTabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as TabKey)}
          options={[
            { value: "triagem", label: "Triagem", icon: <Package /> },
            { value: "pedidos", label: "Pedidos", icon: <ShoppingCart /> },
            { value: "historico", label: "Histórico", icon: <History /> },
          ]}
        />

        {/* Política global */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Política</span>
          <Select value={politica} onValueChange={setPolitica}>
            <SelectTrigger className="h-8 w-auto min-w-[200px] rounded-lg text-xs">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__todas__">Todas as políticas</SelectItem>
              {facets?.politicas.map((p) => (<SelectItem key={p} value={p}>{p}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>

        {/* TAB: TRIAGEM */}
        {activeTab === "triagem" && (
          <>
            {/* KPIs (KpiGrid padrão — 1 coluna no mobile, 4 no desktop; cards mantêm o toggle-filtro) */}
            <KpiGrid cols={4}>
              {kpiCards.map((card) => {
                const isActive = activeKpi === card.key;
                const Icon = card.icon;
                if (card.placeholder) {
                  return (
                    <div key={card.key} aria-disabled
                      className={cn("flex flex-col rounded-xl border p-4 text-left", card.bg)}
                      title="Slot reservado — métrica a definir com a gestão">
                      <div className="flex items-center justify-between">
                        <span className={cn("text-xs font-semibold uppercase tracking-wide", card.text)}>{card.label}</span>
                        <Icon className={cn("h-4 w-4", card.text)} />
                      </div>
                      <span className={cn("mt-2 font-bold tabular-nums text-2xl", card.text)}>—</span>
                      <span className="mt-1 text-[11px] text-muted-foreground">{card.sub}</span>
                    </div>
                  );
                }
                return (
                  <button key={card.key} type="button"
                    onClick={() => setActiveKpi(isActive ? "" : card.key)}
                    className={cn("flex flex-col rounded-xl border p-4 text-left transition hover:shadow-md",
                      isActive ? card.activeBg : card.bg)}
                  >
                    <div className="flex items-center justify-between">
                      <span className={cn("text-xs font-semibold uppercase tracking-wide", card.text)}>{card.label}</span>
                      <Icon className={cn("h-4 w-4", card.text)} />
                    </div>
                    <span className={cn("mt-2 font-bold tabular-nums text-2xl", card.text)}>
                      {kpisQuery.isLoading ? <Skeleton className="h-8 w-16" /> : intFmt(card.value)}
                    </span>
                    <span className="mt-1 text-[11px] text-muted-foreground">{card.sub}</span>
                  </button>
                );
              })}
            </KpiGrid>

            {/* Filter bar */}
            <Card className="border border-slate-200">
              <CardContent className="flex flex-wrap items-center gap-2 p-3">
                <div className="relative min-w-[240px] flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <Input value={busca} onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar código, EAN, descrição, fornecedor…"
                    className="h-8 rounded-lg border-slate-200 bg-slate-50 pl-8 text-xs" />
                </div>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg text-xs min-w-[120px] justify-between">
                      <span>
                        Curva
                        {curvasAbcSelecionadas.size > 0 && (
                          <span className="ml-1.5 inline-flex items-center justify-center rounded bg-slate-900 px-1.5 text-[10px] font-bold text-white">
                            {curvasAbcSelecionadas.size}
                          </span>
                        )}
                      </span>
                      <ChevronDown className="h-3 w-3 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-2" align="start">
                    <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
                      {facets?.curvas.length === 0 && (
                        <p className="text-xs text-muted-foreground p-2">Nenhuma curva disponível.</p>
                      )}
                      {facets?.curvas.map((c) => {
                        const checked = curvasAbcSelecionadas.has(c);
                        return (
                          <label key={c} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-slate-100">
                            <Checkbox checked={checked} onCheckedChange={(v) => {
                              const next = new Set(curvasAbcSelecionadas);
                              if (v) next.add(c); else next.delete(c);
                              setCurvasAbcSelecionadas(next);
                            }} />
                            <span>Curva {c}</span>
                          </label>
                        );
                      })}
                      {curvasAbcSelecionadas.size > 0 && (
                        <button type="button" onClick={() => setCurvasAbcSelecionadas(new Set())}
                          className="mt-1 border-t border-slate-100 px-2 py-1.5 text-left text-[11px] text-slate-500 hover:text-slate-700">
                          Limpar curvas
                        </button>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>

                {/* Fornecedor — componente compartilhado (multi-select com busca) */}
                <MultiSelectFilter
                  label="Fornecedor"
                  pluralize={(n) => `${n} fornecedor${n > 1 ? "es" : ""}`}
                  options={facets?.fornecedores ?? []}
                  selected={fornecedoresSelecionados}
                  onToggle={(f) => {
                    const next = new Set(fornecedoresSelecionados);
                    if (next.has(f)) next.delete(f); else next.add(f);
                    setFornecedoresSelecionados(next);
                  }}
                  onClear={() => setFornecedoresSelecionados(new Set())}
                  searchPlaceholder="Buscar fornecedor…"
                  emptyLabel={facetsQuery.isLoading ? "Carregando…" : "Nenhum fornecedor."}
                  align="start"
                  triggerClassName="min-w-[130px] rounded-lg"
                  contentClassName="w-72"
                />

                {/* Dinâmica — single-select no mesmo padrão do Curva/Fornecedor */}
                <Popover open={dinamicaOpen} onOpenChange={setDinamicaOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg text-xs min-w-[120px] justify-between">
                      <span className="truncate">
                        {acompanhamento === "__todos__" ? "Dinâmica"
                          : acompanhamento === "__com_movimento__" ? "Com movimento"
                          : acompanhamento}
                      </span>
                      <ChevronDown className="h-3 w-3 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-52 p-1" align="start">
                    <div className="flex flex-col">
                      {[
                        { value: "__todos__", label: "Todos", disabled: false },
                        { value: "__com_movimento__", label: "Com movimento", disabled: false },
                        ...STATUS_CONHECIDOS.map((s) => ({
                          value: s,
                          label: (facets?.acompanhamentos?.includes(s) ?? false) ? s : `${s} (sem itens)`,
                          disabled: !(facets?.acompanhamentos?.includes(s) ?? false),
                        })),
                      ].map((opt) => (
                        <button key={opt.value} type="button" disabled={opt.disabled}
                          onClick={() => { setAcompanhamento(opt.value); setDinamicaOpen(false); }}
                          className={cn("flex items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40",
                            acompanhamento === opt.value && "bg-slate-100 font-medium")}>
                          <span>{opt.label}</span>
                          {acompanhamento === opt.value && <Check className="h-3 w-3 text-slate-500" />}
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>

                {/* Estoque — single-select no mesmo padrão */}
                <Popover open={estoqueOpen} onOpenChange={setEstoqueOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg text-xs min-w-[120px] justify-between">
                      <span className="truncate">
                        {ESTOQUE_OPCOES.find((o) => o.value === faixaEstoque && o.value !== "__todas__")?.label ?? "Estoque"}
                      </span>
                      <ChevronDown className="h-3 w-3 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-44 p-1" align="start">
                    <div className="flex flex-col">
                      {ESTOQUE_OPCOES.map((opt) => (
                        <button key={opt.value} type="button"
                          onClick={() => { setFaixaEstoque(opt.value); setEstoqueOpen(false); }}
                          className={cn("flex items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-slate-100",
                            faixaEstoque === opt.value && "bg-slate-100 font-medium")}>
                          <span>{opt.label}</span>
                          {faixaEstoque === opt.value && <Check className="h-3 w-3 text-slate-500" />}
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>


                <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button type="button" variant={premissasEditadas ? "default" : "outline"} size="sm"
                        className={cn("h-8 rounded-lg text-xs", premissasEditadas && "bg-blue-600 hover:bg-blue-700")}
                        title="Premissas da MC (what-if)">
                        <Settings2 className="mr-1 h-3.5 w-3.5" />
                        Premissas MC
                        {premissasEditadas && <span className="ml-1 rounded-full bg-white/25 px-1.5 text-[10px]">simulando</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-3" align="end">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-semibold text-slate-700">Premissas da MC</p>
                        {premissasEditadas && (
                          <button type="button" onClick={resetPremissas}
                            className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700">
                            <RotateCcw className="h-3 w-3" /> restaurar
                          </button>
                        )}
                      </div>
                      <p className="mb-3 text-[11px] leading-tight text-muted-foreground">
                        Percentuais aplicados sobre o preço líquido. Editar simula a MC em toda a tabela
                        (não salva; o próximo sync restaura).
                      </p>
                      <div className="space-y-2">
                        {PREMISSA_KEYS.map((k) => {
                          const editado = premissasDraft[k] !== undefined;
                          return (
                            <label key={k} className="flex items-center justify-between gap-2 text-xs">
                              <span className="text-slate-600">{premissaLabels[k]}</span>
                              <span className="relative inline-flex items-center">
                                <input
                                  type="number" inputMode="decimal" step="0.01"
                                  value={premissasDraft[k] ?? String(premissaDefaults[k])}
                                  onChange={(e) => setPremissasDraft((p) => ({ ...p, [k]: e.target.value }))}
                                  className={cn(
                                    "w-24 rounded border px-2 py-1 text-right text-xs tabular-nums outline-none focus:ring-1 focus:ring-blue-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none",
                                    editado ? "border-blue-400 font-semibold text-blue-700" : "border-slate-200",
                                  )}
                                />
                                <span className="ml-1 text-slate-400">%</span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      <div className="mt-3 space-y-1 border-t border-slate-100 pt-2 text-[11px] text-muted-foreground">
                        <div className="flex items-center justify-between">
                          <span>Região tributária</span>
                          <span className="font-medium text-slate-600">{meta?.mcRegiaoTributaria ?? "—"}</span>
                        </div>
                        <p className="leading-tight">
                          ICMS, PIS, COFINS e comissão são por produto (vêm da consulta) — não editáveis aqui.
                        </p>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Button type="button" variant={verMaisColunas ? "default" : "outline"} size="sm"
                    className="h-8 rounded-lg text-xs" onClick={() => setVerMaisColunas(!verMaisColunas)}>
                    {verMaisColunas ? "Ocultar colunas extras" : "Ver mais colunas"}
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg text-xs"
                    onClick={exportarCsv} disabled={!triagemData || triagemData.rows.length === 0}>
                    <Download className="mr-1 h-3 w-3" />
                    {linhasSelecionadas.size > 0 ? `Exportar ${linhasSelecionadas.size} selecionados` : "Exportar CSV"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Chips dos filtros ativos (+ chip do drill-down do comparativo) */}
            {(filtrosAtivos.length > 0 || drill) && (
              <div className="flex flex-wrap items-center gap-2">
                {filtrosAtivos.map((f) => (
                  <button key={f.label} type="button" onClick={f.onClear}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100">
                    {f.label}<X className="h-3 w-3" />
                  </button>
                ))}
                {drill && (
                  <button type="button" onClick={() => setDrill(null)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100">
                    Comparativo: {drill.label} ({drill.codInternos.length})<X className="h-3 w-3" />
                  </button>
                )}
                {filtrosAtivos.length > 0 && (
                  <button type="button" onClick={limparTudo}
                    className="text-xs font-medium text-slate-500 underline-offset-2 hover:underline">
                    limpar todos
                  </button>
                )}
              </div>
            )}

            {/* Comparativo 7×7 (aparece quando há filtro ativo) */}
            {temFiltroAtivo && (
              <ComparativoPanel
                data={comparativoQuery.data}
                loading={comparativoQuery.isLoading}
                drillCategoria={drill?.categoria ?? null}
                onDrill={(categoria, label, codInternos) => {
                  if (drill?.categoria === categoria) setDrill(null); // toggle
                  else if (codInternos.length > 0) setDrill({ categoria, label, codInternos });
                }}
              />
            )}

            {/* Tabela */}
            <Card className="border border-slate-200">
              <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
                <CardTitle className="text-sm font-semibold">
                  {triagemQuery.isLoading ? "Carregando..." : `${intFmt(triagemData?.total ?? 0)} produtos`}
                  {linhasSelecionadas.size > 0 && (
                    <span className="ml-2 text-xs font-medium text-blue-600">
                      ({linhasSelecionadas.size} selecionados · use Shift+clique para selecionar intervalos)
                    </span>
                  )}
                </CardTitle>
                <CardDescription className="text-xs">
                  Página {page} de {totalPaginas}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div
                  ref={tableViewportRef}
                  className="overflow-x-auto overflow-y-auto max-h-[70vh] overscroll-x-contain isolate"
                >
                  <table className="w-max min-w-full text-xs border-separate border-spacing-0">
                    <thead>
                      <tr className="bg-slate-900 text-white">
                        {/* Seleção — sempre fixa à esquerda */}
                        <th
                          className="sticky top-0 left-0 z-[60] bg-slate-900 px-1.5 py-2 text-center"
                          style={{ width: PESCADOR_SELECTION_WIDTH, minWidth: PESCADOR_SELECTION_WIDTH, boxShadow: "1px 0 0 rgba(226,232,240,0.3)", willChange: "transform", backfaceVisibility: "hidden", transform: "translateZ(0)" }}
                        >
                          <span className="flex items-center justify-center">
                            <Checkbox
                              checked={selecao.todasSelecionadas}
                              data-state={selecao.algumaSelecionada ? "indeterminate" : selecao.todasSelecionadas ? "checked" : "unchecked"}
                              onCheckedChange={selecao.toggleAll}
                              aria-label="Selecionar todos os visíveis"
                              className="size-4 shrink-0 rounded-[4px] border-white/40 data-[state=checked]:border-teal-500 data-[state=checked]:bg-teal-500"
                            />
                          </span>
                        </th>
                        {/* Colunas candidatas a congelamento (frozen progressivo) */}
                        <th className={cn("sticky top-0 px-2 py-2 text-left text-white", stickyColumns.codInterno.sticky ? "z-[50]" : "z-30")}
                            style={getColumnStyle("codInterno", "#0f172a")}>
                          <SortHeader label="Cód." sortKey="codInterno" />
                        </th>
                        <th className={cn("sticky top-0 px-2 py-2 text-left text-white", stickyColumns.ean.sticky ? "z-[50]" : "z-30")}
                            style={getColumnStyle("ean", "#0f172a")}>
                          <SortHeader label="EAN" sortKey="ean" />
                        </th>
                        <th className={cn("sticky top-0 px-2 py-2 text-left text-white", stickyColumns.descricao.sticky ? "z-[50]" : "z-30")}
                            style={getColumnStyle("descricao", "#0f172a")}>
                          <SortHeader label="Descrição" sortKey="descricao" />
                        </th>
                        <th className={cn("sticky top-0 px-2 py-2 text-left text-white", stickyColumns.fabricante.sticky ? "z-[50]" : "z-30")}
                            style={getColumnStyle("fabricante", "#0f172a")}>
                          <SortHeader label="Fornecedor" sortKey="fornecedor" />
                        </th>
                        <th className={cn("sticky top-0 px-2 py-2 text-right text-white", stickyColumns.estoqueSc.sticky ? "z-[50]" : "z-30")}
                            style={getColumnStyle("estoqueSc", "#0f172a")}>
                          <SortHeader label="Estoque" sortKey="estoqueSc" align="right" />
                        </th>

                        {/* Colunas que rolam (sticky-top apenas) */}
                        <th className="sticky top-0 z-30 bg-slate-900 px-2 py-2 text-center"
                            style={{ minWidth: COL_WIDTHS.abc, width: COL_WIDTHS.abc }}>
                          <SortHeader label="ABC" sortKey="curvaAbc" align="center" />
                        </th>
                        <th className="sticky top-0 z-30 bg-slate-900 px-2 py-2 text-center"
                            style={{ minWidth: COL_WIDTHS.acomp, width: COL_WIDTHS.acomp }}>
                          <SortHeader label="Acomp." sortKey="acompanhamento" align="center" />
                        </th>

                        {/* Janela completa de 15 dias úteis (real, vinda da API) */}
                        {DIAS_JANELA.map((d) => (
                          <th key={d} className="sticky top-0 z-30 bg-slate-900 px-2 py-2 text-right text-[10px] font-semibold text-white"
                              style={{ minWidth: COL_WIDTHS.vdDia, width: COL_WIDTHS.vdDia }}
                              title="Janela móvel de 15 dias úteis">
                            Vd {fdateCurta(datasJanela[d]) ?? `D${d}`}
                          </th>
                        ))}

                        <th className="sticky top-0 z-30 bg-slate-900 px-2 py-2 text-right text-[10px] font-semibold text-white"
                            style={{ minWidth: COL_WIDTHS.pcUltVenda, width: COL_WIDTHS.pcUltVenda }}>Pç últ. venda</th>
                        <th className="sticky top-0 z-30 bg-slate-900 px-2 py-2 text-right"
                            style={{ minWidth: COL_WIDTHS.pcUn, width: COL_WIDTHS.pcUn }}>
                          <SortHeader label="Pç un." sortKey="precoUnitario" align="right" />
                        </th>
                        <th className="sticky top-0 z-30 bg-slate-900 px-2 py-2 text-right"
                            style={{ minWidth: COL_WIDTHS.margem, width: COL_WIDTHS.margem }}
                            title="Margem de Contribuição (% do preço líquido)">
                          <SortHeader label="MC %" sortKey="percMc" align="right" />
                        </th>
                        <th className="sticky top-0 z-30 bg-slate-900 px-2 py-2 text-right"
                            style={{ minWidth: COL_WIDTHS.markup, width: COL_WIDTHS.markup }}>
                          <SortHeader label="Markup" sortKey="markup" align="right" />
                        </th>
                        <th className="sticky top-0 z-30 bg-slate-900 px-2 py-2 text-right"
                            style={{ minWidth: COL_WIDTHS.giroMes, width: COL_WIDTHS.giroMes }}>
                          <SortHeader label="Giro" sortKey="giroEstoque" align="right" />
                        </th>
                        <th className="sticky top-0 z-30 bg-slate-900 px-2 py-2 text-left"
                            style={{ minWidth: COL_WIDTHS.codLote, width: COL_WIDTHS.codLote }}>
                          <SortHeader label="Lote" sortKey="loteEstoque" />
                        </th>
                        <th className="sticky top-0 z-30 bg-slate-900 px-2 py-2 text-left"
                            style={{ minWidth: COL_WIDTHS.vencim, width: COL_WIDTHS.vencim }}>
                          <SortHeader label="Vencim." sortKey="loteVencimento" />
                        </th>

                        {/* Colunas extras (modo expandido) */}
                        {verMaisColunas && (
                          <>
                            <th className="sticky top-0 z-30 bg-slate-900 px-2 py-2 text-right text-[10px] font-semibold text-white"
                                style={{ minWidth: COL_WIDTHS.custoMed, width: COL_WIDTHS.custoMed }}
                                title="Custo médio comercial (Vlr_CustoMedio) — base da MC e do Markup">Custo méd.</th>
                            <th className="sticky top-0 z-30 bg-slate-900 px-2 py-2 text-right"
                                style={{ minWidth: COL_WIDTHS.descPerc, width: COL_WIDTHS.descPerc }}>
                              <SortHeader label="Desc %" sortKey="descontoPerc" align="right" />
                            </th>
                            <th className="sticky top-0 z-30 bg-slate-900 px-2 py-2 text-right"
                                style={{ minWidth: COL_WIDTHS.vdMes, width: COL_WIDTHS.vdMes }}>
                              <SortHeader label="Vd mês" sortKey="qtdVendidaMes" align="right" />
                            </th>
                            <th className="sticky top-0 z-30 bg-slate-900 px-2 py-2 text-right"
                                style={{ minWidth: COL_WIDTHS.vdMesAnt, width: COL_WIDTHS.vdMesAnt }}>
                              <SortHeader label="Vd mês ant." sortKey="qtdVendidaMesAnterior" align="right" />
                            </th>
                            <th className="sticky top-0 z-30 bg-slate-900 px-2 py-2 text-right"
                                style={{ minWidth: COL_WIDTHS.estoqLote, width: COL_WIDTHS.estoqLote }}>
                              <SortHeader label="Estoq. lote" sortKey="loteEstoque" align="right" />
                            </th>
                            <th className="sticky top-0 z-30 bg-slate-900 px-2 py-2 text-left text-xs font-semibold text-white"
                                style={{ minWidth: COL_WIDTHS.embalagem, width: COL_WIDTHS.embalagem }}>Embalagem</th>
                          </>
                        )}

                        {/* Política — última coluna do modo base */}
                        <th className="sticky top-0 z-30 bg-slate-900 px-2 py-2 text-left"
                            style={{ minWidth: COL_WIDTHS.politica, width: COL_WIDTHS.politica }}>
                          <SortHeader label="Política" sortKey="politica" />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {triagemQuery.isLoading
                        ? Array.from({ length: 8 }).map((_, i) => (
                            <tr key={i} className="border-t border-slate-100">
                              <td colSpan={totalColunas} className="px-3 py-2">
                                <Skeleton className="h-4 w-full" />
                              </td>
                            </tr>
                          ))
                        : triagemData?.rows.length === 0
                        ? (
                          <tr>
                            <td colSpan={totalColunas} className="px-3 py-10 text-center text-muted-foreground">
                              Nenhum produto encontrado para o filtro atual.
                            </td>
                          </tr>
                        )
                        : triagemData?.rows.map((row, index) => {
                            const venc = daysTo(row.loteVencimento);
                            // Status do lote próximo (API já manda maiúsculo sem acento) para a regra do vencimento.
                            const statusVenc = (row.statusValidadeLote ?? "").toUpperCase().trim();
                            // Simulação (Pç un. e/ou premissas): recalcula MC%/Markup% ao vivo.
                            const precoEditado = precoDraft[row.id] !== undefined;
                            const precoR = precoAtual(row.id, row.precoUnitario);
                            const simativa = precoEditado || premissasEditadas;
                            const percMcR = simativa ? calcMc(precoR, row, premissaOverrides).perc : row.percMc;
                            // Markup pelo custo médio comercial (Vlr_CustoMedio) — recalcula ao editar o preço.
                            const markupR = calcMarkup(precoR, row.vlrCustoMedio);
                            const isSelected = linhasSelecionadas.has(row.id);
                            // Zebra striping; linha selecionada recebe azul claro (sobrepõe zebra).
                            const rowBackground = index % 2 === 0 ? "#ffffff" : "#f8fafc";
                            const rowHighlight = isSelected ? "#eff6ff" : rowBackground;

                            return (
                              <tr
                                key={row.id}
                                className="border-b border-slate-100 transition-colors hover:bg-slate-50"
                                style={{ backgroundColor: rowHighlight }}
                              >
                                {/* Selecionar — sempre fixa à esquerda */}
                                <td
                                  className="sticky left-0 z-[25] border-b border-slate-100 px-1.5 py-1.5 text-center"
                                  style={{ backgroundColor: rowHighlight, width: PESCADOR_SELECTION_WIDTH, minWidth: PESCADOR_SELECTION_WIDTH, boxShadow: "1px 0 0 rgba(226,232,240,0.95)", willChange: "transform", backfaceVisibility: "hidden", transform: "translateZ(0)" }}
                                >
                                  <span className="flex items-center justify-center">
                                    <Checkbox checked={isSelected}
                                      onCheckedChange={() => selecao.toggle(row.id, false)}
                                      onClick={(e: React.MouseEvent) => { if (e.shiftKey) { e.preventDefault(); selecao.toggle(row.id, true); } }}
                                      aria-label={`Selecionar ${row.codInterno}`}
                                      className="size-4 shrink-0 cursor-pointer rounded-[4px]" />
                                  </span>
                                </td>
                                {/* Cód. */}
                                <td className={cn("cursor-pointer border-b border-slate-100 px-2 py-1.5 font-mono text-sky-700",
                                      stickyColumns.codInterno.sticky && "sticky z-[20]")}
                                    style={getColumnStyle("codInterno", rowHighlight)}
                                    onClick={() => setSelectedProduto({ codInterno: row.codInterno, politica: row.politica, precoSimulado: precoR, premissas: premissaOverrides })}>
                                  {row.codInterno}
                                </td>
                                {/* EAN */}
                                <td className={cn("border-b border-slate-100 px-2 py-1.5 font-mono text-[11px] text-slate-500",
                                      stickyColumns.ean.sticky && "sticky z-[20]")}
                                    style={getColumnStyle("ean", rowHighlight)}>
                                  {row.ean}
                                </td>
                                {/* Descrição — quebra linha dentro da largura fixa (padrão Superestocados) */}
                                <td className={cn("cursor-pointer border-b border-slate-100 px-2 py-1.5",
                                      stickyColumns.descricao.sticky && "sticky z-[20]")}
                                    style={getColumnStyle("descricao", rowHighlight)}
                                    onClick={() => setSelectedProduto({ codInterno: row.codInterno, politica: row.politica, precoSimulado: precoR, premissas: premissaOverrides })}>
                                  <p className="whitespace-normal break-words font-medium leading-tight text-blue-700 hover:underline">
                                    {row.descricao}
                                  </p>
                                </td>
                                {/* Fornecedor */}
                                <td className={cn("border-b border-slate-100 px-2 py-1.5 text-slate-600",
                                      stickyColumns.fabricante.sticky && "sticky z-[20]")}
                                    style={getColumnStyle("fabricante", rowHighlight)}>
                                  <span className="whitespace-normal break-words leading-tight">{row.fornecedor ?? "—"}</span>
                                </td>
                                {/* Estoque */}
                                <td className={cn("border-b border-slate-100 px-2 py-1.5 text-right tabular-nums",
                                      stickyColumns.estoqueSc.sticky && "sticky z-[20]",
                                      row.estoqueSc === 0 ? "text-rose-600 font-semibold" : "")}
                                    style={getColumnStyle("estoqueSc", rowHighlight)}>
                                  {intFmt(row.estoqueSc)}
                                </td>

                                {/* ABC */}
                                <td className="border-b border-slate-100 px-3 py-1.5 text-center">
                                  <span className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase">
                                    {row.curvaAbc ?? "—"}
                                  </span>
                                </td>

                                {/* Acomp. */}
                                <td className="border-b border-slate-100 px-3 py-1.5 text-center">
                                  {row.acompanhamento === "Caiu"
                                    ? <span className="inline-flex items-center rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">Caiu</span>
                                    : row.acompanhamento === "Subiu"
                                    ? <span className="inline-flex items-center rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Subiu</span>
                                    : row.acompanhamento
                                    ? <span className="text-[10px] text-slate-500">{row.acompanhamento}</span>
                                    : <span className="text-slate-400">—</span>}
                                </td>

                                {DIAS_JANELA.map((d) => (
                                  <td key={d} className="border-b border-slate-100 px-2 py-1.5 text-right tabular-nums">
                                    {intFmt((row as unknown as Record<string, number | null>)[`vendaD${d}`])}
                                  </td>
                                ))}

                                <td className="border-b border-slate-100 px-3 py-1.5 text-right tabular-nums">{brl(row.precoPraticado)}</td>
                                <td className="border-b border-slate-100 px-2 py-1.5">
                                  <div className="flex items-center justify-end gap-1">
                                    {precoEditado && (
                                      <button
                                        type="button"
                                        onClick={() => resetPreco(row.id)}
                                        title="Restaurar preço original"
                                        className="text-slate-400 hover:text-slate-700"
                                      >
                                        <RotateCcw className="h-3 w-3" />
                                      </button>
                                    )}
                                    <input
                                      type="number"
                                      inputMode="decimal"
                                      step="0.01"
                                      value={precoDraft[row.id] ?? (row.precoUnitario != null ? String(row.precoUnitario) : "")}
                                      onChange={(e) => setPrecoDraft((p) => ({ ...p, [row.id]: e.target.value }))}
                                      title="Edite para simular margem e markup (não salva)"
                                      className={cn(
                                        "w-full rounded border bg-transparent px-1 py-0.5 text-right text-xs tabular-nums outline-none focus:ring-1 focus:ring-blue-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                                        precoEditado ? "border-blue-400 font-semibold text-blue-700" : "border-transparent hover:border-slate-200",
                                      )}
                                    />
                                  </div>
                                </td>
                                <td className={cn("border-b border-slate-100 px-3 py-1.5 text-right tabular-nums", simativa ? "font-semibold text-blue-700" : corMc(percMcR))}>{pct(percMcR)}</td>
                                <td className={cn("border-b border-slate-100 px-3 py-1.5 text-right tabular-nums", precoEditado && "font-semibold text-blue-700")}>{pct(markupR)}</td>
                                <td className="border-b border-slate-100 px-3 py-1.5 text-right tabular-nums">{dec(row.giroEstoque ?? row.giroMes, 2)}</td>
                                <td className="border-b border-slate-100 px-3 py-1.5 font-mono text-[11px] text-slate-500">{row.codLote ?? "—"}</td>
                                <td className="border-b border-slate-100 px-3 py-1.5">
                                  {statusVenc === "NAO ACEITAVEL"
                                    ? <VencimentoTag isoDate={row.loteVencimento} status="vencido" />
                                    : statusVenc === "SEM LOTE"
                                    ? <span className="text-[11px] text-slate-400">Sem estoque</span>
                                    : statusVenc === "SEM REGRA"
                                    ? <span className="text-[11px] text-slate-400">Sem regra</span>
                                    : <VencimentoTag isoDate={row.loteVencimento} status={venc < 0 ? "vencido" : venc <= 30 ? "proximo" : "ok"} />}
                                </td>

                                {/* Colunas extras */}
                                {verMaisColunas && (
                                  <>
                                    <td className="border-b border-slate-100 px-3 py-1.5 text-right tabular-nums">{brl(row.vlrCustoMedio)}</td>
                                    <td className="border-b border-slate-100 px-3 py-1.5 text-right tabular-nums">{dec(row.descontoPerc, 1)}%</td>
                                    <td className="border-b border-slate-100 px-3 py-1.5 text-right tabular-nums">{intFmt(row.qtdVendidaMes)}</td>
                                    <td className="border-b border-slate-100 px-3 py-1.5 text-right tabular-nums">{intFmt(row.qtdVendidaMesAnterior)}</td>
                                    <td className="border-b border-slate-100 px-3 py-1.5 text-right tabular-nums">{intFmt(row.loteEstoque)}</td>
                                    <td className="border-b border-slate-100 px-3 py-1.5 text-slate-600">{row.embalagem ?? "—"}</td>
                                  </>
                                )}

                                {/* Política — última */}
                                <td className="max-w-[200px] truncate border-b border-slate-100 px-3 py-1.5 text-slate-600" title={row.politica}>
                                  {row.politica}
                                </td>
                              </tr>
                            );
                          })}
                    </tbody>
                  </table>
                </div>

                {/* Paginação (padrão do projeto) */}
                {triagemData && (
                  <DataTablePagination
                    page={page}
                    pageSize={pageSize}
                    total={triagemData.total}
                    onPageChange={setPage}
                    itemLabel="produtos"
                  />
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* TAB: PEDIDOS */}
        {activeTab === "pedidos" && (
          <PescadorPedidosTab politica={politica} onOpenProduto={setSelectedProduto} />
        )}

        {/* TAB: HISTÓRICO (placeholder) */}
        {activeTab === "historico" && (
          <Card className="border border-slate-200">
            <CardContent className="flex flex-col items-center justify-center gap-3 p-12 text-center">
              <History className="h-10 w-10 text-slate-300" />
              <div>
                <h3 className="font-semibold text-slate-700">Histórico de preço</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Preço praticado × cadastrado por lote, com gráfico de evolução.
                </p>
                <p className="mt-2 text-xs text-slate-400">Aba em desenvolvimento — disponível na próxima sessão.</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Modal de regras do painel */}
      <PescadorRulesModal open={rulesOpen} onOpenChange={setRulesOpen} />

      {/* Modal central de drill-down */}
      <ProdutoDialog
        produto={selectedProduto}
        open={selectedProduto !== null}
        onOpenChange={(open) => { if (!open) setSelectedProduto(null); }}
      />
    </div>
  );
}

/* ─── Drill-down — Dialog modal central ──────────────────────────────────── */

function ProdutoDialog({
  produto, open, onOpenChange,
}: {
  produto: { codInterno: string; politica?: string; precoSimulado?: number | null; premissas?: PremissaOverrides } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const detalheQuery = trpc.pescador.getProdutoDetalhe.useQuery(
    { codInterno: produto?.codInterno ?? "", politica: produto?.politica },
    { enabled: !!produto },
  );

  const detalhe = detalheQuery.data;
  const triagemRow = detalhe?.triagem?.[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[90vh] flex flex-col border-0 bg-slate-950 text-white sm:max-w-4xl p-0 gap-0 rounded-xl overflow-hidden"
      >
        <div className="sticky top-0 z-50 bg-slate-950 border-b border-white/10 px-6 py-4 flex-shrink-0">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-slate-50 pr-10">
              {triagemRow?.descricao ?? produto?.codInterno ?? "Detalhe do produto"}
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              {triagemRow
                ? `${triagemRow.codInterno} · EAN ${triagemRow.ean} · ${triagemRow.fornecedor ?? triagemRow.fabricante ?? ""}`
                : "Carregando…"}
            </DialogDescription>
          </DialogHeader>
          <DialogClose
            className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </DialogClose>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {detalheQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando detalhes…
            </div>
          ) : detalhe ? (
            <>
              {triagemRow && (
                <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <KpiStat label="Estoque SC" value={intFmt(triagemRow.estoqueSc)} />
                  <KpiStat label="Curva ABC" value={triagemRow.curvaAbc ?? "—"} />
                  <KpiStat label="Preço unit." value={brl(triagemRow.precoUnitario)} />
                  <KpiStat label="MC %" value={pct(triagemRow.percMc)} />
                  <KpiStat label="Giro" value={dec(triagemRow.giroEstoque ?? triagemRow.giroMes, 2)} />
                  <KpiStat label="Vd. mês" value={intFmt(triagemRow.qtdVendidaMes)} />
                  <KpiStat label="Custo médio" value={brl(triagemRow.vlrCustoMedio)} />
                  <KpiStat label="Markup" value={pct(calcMarkup(triagemRow.precoUnitario, triagemRow.vlrCustoMedio))} />
                </section>
              )}

              {triagemRow && (
                <MemoriaMC row={triagemRow} precoSimulado={produto?.precoSimulado} premissas={produto?.premissas} />
              )}

              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Pedidos recentes ({detalhe.pedidos.length})
                </h4>
                {detalhe.pedidos.length === 0 ? (
                  <p className="text-xs text-slate-500">Nenhum pedido encontrado.</p>
                ) : (
                  <div className="overflow-x-auto rounded-md bg-slate-900/50">
                    <table className="w-full text-xs">
                      <thead className="text-slate-400">
                        <tr>
                          <th className="px-2 py-1.5 text-left">Data</th>
                          <th className="px-2 py-1.5 text-left">Pedido</th>
                          <th className="px-2 py-1.5 text-right">Qtd. Sol.</th>
                          <th className="px-2 py-1.5 text-right">Qtd. Fat.</th>
                          <th className="px-2 py-1.5 text-center">Status</th>
                          <th className="px-2 py-1.5 text-left">Motivo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalhe.pedidos.slice(0, 15).map((row, idx) => (
                          <tr key={idx} className="border-t border-white/5">
                            <td className="px-2 py-1.5">{fdate(row.pedido.dataPedido)}</td>
                            <td className="px-2 py-1.5 font-mono">{row.pedido.numeroPedidoVenda}</td>
                            <td className="px-2 py-1.5 text-right">{intFmt(row.item.qtdSolicitada)}</td>
                            <td className="px-2 py-1.5 text-right">{intFmt(row.item.qtdFaturada)}</td>
                            <td className="px-2 py-1.5 text-center">{row.item.statusAtendimento ?? "—"}</td>
                            <td className="px-2 py-1.5 text-slate-400">{row.item.motivoRejeicaoItem ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Histórico de preço ({detalhe.historico.length})
                </h4>
                {detalhe.historico.length === 0 ? (
                  <p className="text-xs text-slate-500">Sem registros de histórico.</p>
                ) : (
                  <div className="overflow-x-auto rounded-md bg-slate-900/50">
                    <table className="w-full text-xs">
                      <thead className="text-slate-400">
                        <tr>
                          <th className="px-2 py-1.5 text-left">Emissão</th>
                          <th className="px-2 py-1.5 text-left">Lote</th>
                          <th className="px-2 py-1.5 text-right">Qtd. Fat.</th>
                          <th className="px-2 py-1.5 text-right">Pç líq.</th>
                          <th className="px-2 py-1.5 text-right">Pç final</th>
                          <th className="px-2 py-1.5 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalhe.historico.slice(0, 30).map((row) => (
                          <tr key={row.id} className="border-t border-white/5">
                            <td className="px-2 py-1.5">{fdate(row.dataEmissao)}</td>
                            <td className="px-2 py-1.5 font-mono">{row.codLote ?? "—"}</td>
                            <td className="px-2 py-1.5 text-right">{intFmt(row.qtdFaturada)}</td>
                            <td className="px-2 py-1.5 text-right">{brl(row.precoLiquido)}</td>
                            <td className="px-2 py-1.5 text-right">{brl(row.precoFinal)}</td>
                            <td className="px-2 py-1.5 text-right">{brl(row.valorTotalItem)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 py-12 text-slate-400">
              <ChevronDown className="h-6 w-6" />
              <p className="text-sm">Selecione um produto na tabela.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Comparativo 7×7 (abaixo dos KPIs, reflete o conjunto filtrado) ───────── */

type ComparativoData = {
  base: number;
  janela: { recente: [number, number]; anterior: [number, number] };
  totais: {
    recente: { itens: number; unidades: number; valor: number; mcGerada: number };
    anterior: { itens: number; unidades: number; valor: number; mcGerada: number };
  };
  categorias: Record<string, { count: number; codInternos: string[] }>;
};

/** Categorias de movimento no drill-down (ordem: maior ação/perda primeiro). */
const COMPARATIVO_CATS: Array<{ key: string; label: string; classe: string; classeAtiva: string }> = [
  { key: "deixou", label: "Deixou de vender", classe: "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100", classeAtiva: "ring-2 ring-rose-400 bg-rose-100" },
  { key: "desaceleraram", label: "Desaceleraram", classe: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100", classeAtiva: "ring-2 ring-amber-400 bg-amber-100" },
  { key: "aceleraram", label: "Aceleraram", classe: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100", classeAtiva: "ring-2 ring-emerald-400 bg-emerald-100" },
  { key: "entraram", label: "Entraram", classe: "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100", classeAtiva: "ring-2 ring-sky-400 bg-sky-100" },
  { key: "mantidos", label: "Mantidos", classe: "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100", classeAtiva: "ring-2 ring-slate-400 bg-slate-100" },
];

function DeltaBadge({ recente, anterior }: { recente: number; anterior: number }) {
  if (anterior === 0 && recente === 0) return <span className="text-[11px] text-slate-400">—</span>;
  if (anterior === 0) return <span className="text-[11px] font-semibold text-emerald-600">novo</span>;
  const delta = ((recente - anterior) / anterior) * 100;
  const up = delta >= 0;
  return (
    <span className={cn("text-[11px] font-semibold", up ? "text-emerald-600" : "text-rose-600")}>
      {up ? "▲" : "▼"} {Math.abs(delta).toFixed(0)}%
    </span>
  );
}

function ComparativoTile({
  label, recente, anterior, fmt, nota,
}: { label: string; recente: number; anterior: number; fmt: (n: number) => string; nota?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        {nota && <span className="text-[9px] uppercase text-slate-400">{nota}</span>}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-lg font-bold tabular-nums text-slate-800">{fmt(recente)}</span>
        <DeltaBadge recente={recente} anterior={anterior} />
      </div>
      <div className="text-[11px] text-slate-400">7 dias anteriores: {fmt(anterior)}</div>
    </div>
  );
}

function ComparativoPanel({
  data, loading, drillCategoria, onDrill,
}: {
  data: ComparativoData | undefined;
  loading: boolean;
  drillCategoria: string | null;
  onDrill: (categoria: string, label: string, codInternos: string[]) => void;
}) {
  return (
    <Card className="border border-slate-200">
      <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <CardTitle className="text-sm font-semibold">
          Comparativo 7×7 <span className="font-normal text-muted-foreground">· 7 dias úteis mais recentes × 7 anteriores</span>
        </CardTitle>
        <CardDescription className="text-[11px]">dia corrente não entra</CardDescription>
      </CardHeader>
      <CardContent className="p-3">
        {loading ? (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : !data || (data.totais.recente.unidades === 0 && data.totais.anterior.unidades === 0) ? (
          <p className="py-4 text-center text-xs text-muted-foreground">Sem venda nos últimos 14 dias úteis para o filtro atual.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <ComparativoTile label="Itens (SKUs)" recente={data.totais.recente.itens} anterior={data.totais.anterior.itens} fmt={(n) => intFmt(n)} />
              <ComparativoTile label="Unidades" recente={data.totais.recente.unidades} anterior={data.totais.anterior.unidades} fmt={(n) => intFmt(n)} />
              <ComparativoTile label="Valor" recente={data.totais.recente.valor} anterior={data.totais.anterior.valor} fmt={(n) => brl(n)} nota="aprox." />
              <ComparativoTile label="MC gerada" recente={data.totais.recente.mcGerada} anterior={data.totais.anterior.mcGerada} fmt={(n) => brl(n)} nota="estimada" />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
              <span className="text-[11px] font-medium text-slate-500">Ver itens:</span>
              {COMPARATIVO_CATS.map((c) => {
                const cat = data.categorias[c.key];
                const count = cat?.count ?? 0;
                const ativo = drillCategoria === c.key;
                return (
                  <button
                    key={c.key} type="button"
                    disabled={count === 0}
                    onClick={() => onDrill(c.key, c.label, cat?.codInternos ?? [])}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition disabled:cursor-not-allowed disabled:opacity-40",
                      c.classe, ativo && c.classeAtiva,
                    )}
                  >
                    {c.label}
                    <span className="rounded-full bg-white/70 px-1.5 text-[10px] font-bold tabular-nums">{count}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[10px] leading-tight text-slate-400">
              Valor = unidades × preço atual (aproximado até a API de pedidos trazer o valor real). MC gerada = unidades × MC por unidade (estimada). Clique numa categoria para ver os itens na tabela; o filtro do comparativo é removível sem perder os demais.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function KpiStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-900/50 p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-semibold text-slate-100">{value}</div>
    </div>
  );
}

/* Memória de cálculo da MC — cada componente (% efetivo e R$ abatido) até chegar na MC.
 * Espelha o simulador da área; usa os percentuais que a consulta já entrega. */
function MemoriaMC({
  row, precoSimulado, premissas,
}: {
  row: McInputs & { precoUnitario: number | null; mc: number | null; percMc: number | null };
  /** Preço simulado vindo do painel (Pç un. editado); se ausente, usa o preço da base. */
  precoSimulado?: number | null;
  /** Overrides das premissas globais (what-if do popover ⚙). */
  premissas?: PremissaOverrides;
}) {
  const ov = premissas ?? {};
  const precoBase = row.precoUnitario ?? 0;
  const preco = precoSimulado != null && precoSimulado > 0 ? precoSimulado : precoBase;
  // Simula quando o preço mudou OU alguma premissa foi sobrescrita.
  const simulado = (precoSimulado != null && precoSimulado !== precoBase) || Object.keys(ov).length > 0;

  const vlrDe = (perc: number | null) => (preco > 0 && perc != null ? (preco * perc) / 100 : null);
  // Frete/invest/assoc/perdas/contratos podem ser sobrescritos pelas premissas; os demais vêm da linha.
  const despesas: Array<{ label: string; perc: number | null }> = [
    { label: "ICMS", perc: row.percIcms ?? null },
    { label: "PIS", perc: row.percPis ?? null },
    { label: "COFINS", perc: row.percCofins ?? null },
    { label: "Comissão", perc: row.percComissao ?? null },
    { label: "Frete", perc: ov.frete ?? row.percFrete ?? null },
    { label: "Investimento empresa", perc: ov.investEmp ?? row.percInvestEmp ?? null },
    { label: "Associativismo", perc: ov.associativismo ?? row.percAssociativismo ?? null },
    { label: "Perdas/vencidos", perc: ov.perdasVencidos ?? row.percPerdasVencidos ?? null },
    { label: "Contratos", perc: ov.contratos ?? row.percContratos ?? null },
  ];
  const custoMedioPerc = preco > 0 && row.vlrCustoMedio != null ? (row.vlrCustoMedio / preco) * 100 : null;
  // MC recalculada no preço/premissas atuais (mesma conta do painel); base = valor da consulta.
  const mcSim = calcMc(preco, { ...row, percFrete: despesas[4].perc, percInvestEmp: despesas[5].perc,
    percAssociativismo: despesas[6].perc, percPerdasVencidos: despesas[7].perc, percContratos: despesas[8].perc }, {});
  const mcValor = simulado ? mcSim.valor : row.mc;
  const mcPerc = simulado ? mcSim.perc : row.percMc;

  return (
    <section>
      <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Memória de cálculo da MC
        {simulado && (
          <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-blue-300">
            simulado {precoSimulado != null && precoSimulado !== precoBase ? `· Pç ${brl(preco)}` : ""}
          </span>
        )}
      </h4>
      <div className="overflow-x-auto rounded-md bg-slate-900/50">
        <table className="w-full text-xs tabular-nums">
          <thead className="text-slate-400">
            <tr>
              <th className="px-3 py-1.5 text-left font-medium">Componente</th>
              <th className="px-3 py-1.5 text-right font-medium">% do preço</th>
              <th className="px-3 py-1.5 text-right font-medium">Valor (R$)</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-white/10 text-slate-100">
              <td className="px-3 py-1.5 font-medium">Preço líquido{simulado && precoSimulado !== precoBase ? " (simulado)" : ""}</td>
              <td className="px-3 py-1.5 text-right">100,0%</td>
              <td className="px-3 py-1.5 text-right">{brl(preco)}</td>
            </tr>
            {despesas.map((d) => (
              <tr key={d.label} className="border-t border-white/5 text-slate-300">
                <td className="px-3 py-1.5">(−) {d.label}</td>
                <td className="px-3 py-1.5 text-right">{d.perc == null ? "—" : pct(d.perc)}</td>
                <td className="px-3 py-1.5 text-right text-rose-300">{vlrDe(d.perc) == null ? "—" : `- ${brl(vlrDe(d.perc))}`}</td>
              </tr>
            ))}
            <tr className="border-t border-white/5 text-slate-300">
              <td className="px-3 py-1.5">(−) Custo médio</td>
              <td className="px-3 py-1.5 text-right">{custoMedioPerc == null ? "—" : pct(custoMedioPerc)}</td>
              <td className="px-3 py-1.5 text-right text-rose-300">{row.vlrCustoMedio == null ? "—" : `- ${brl(row.vlrCustoMedio)}`}</td>
            </tr>
            <tr className="border-t border-white/20 font-semibold text-emerald-300">
              <td className="px-3 py-2">= MC (Margem de Contribuição)</td>
              <td className="px-3 py-2 text-right">{pct(mcPerc)}</td>
              <td className="px-3 py-2 text-right">{brl(mcValor)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[11px] leading-tight text-slate-500">
        Percentuais efetivos sobre o preço líquido; custo médio é valor fixo em R$. Repasse é informativo
        (não abatido direto). {simulado
          ? "Refletindo a simulação feita no painel (Pç un. e/ou premissas)."
          : "Editar o Pç un. na tabela recalcula a MC por esta mesma conta."}
      </p>
    </section>
  );
}
