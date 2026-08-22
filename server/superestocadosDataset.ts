export type RegionKey = "SC" | "RS";

/**
 * Modo de visualização do dashboard: uma região específica ou as duas
 * justapostas. "UNIFICADO" concatena SC + RS (cada produto mantém sua
 * RegionKey real em `DashboardProduct.region`).
 */
export type RegionView = RegionKey | "UNIFICADO";
export type TipoProduto = "medicamento" | "nao_medicamento";

export type VendaUploadRow = {
  codigo: number;
  nomeProduto: string;
  dataVenda: string;
  quantidade: number;
};

export type RegionStatus = {
  totalProdutos: number;
  ultimaAtualizacaoMs: number | null;
  ultimoUploadVendasMs: number | null;
};

export type LoteInfo = {
  codLote: string;
  vencimentoLote: string | null;
  estoqueLote: number;
  qtdVendida: number;
};

export type LoteUploadRow = {
  codEstabe: string;
  codProduto: number;
  codLote: string;
  vencimentoLote: string | null;
  qtdVendida: number;
  estoqueLote: number;
};

export type StatusCampanha = "nao_participa" | "em_campanha";

export type DashboardProduct = {
  id: number;
  codigo: number;
  /** Região real do produto (CD físico). Relevante na visão UNIFICADO. */
  region: RegionKey;
  tipoProduto: TipoProduto;
  nomeProduto: string;
  fornecedor: string;
  /** Comprador responsável pela marca (via Compradores — lente marca→comprador). null = não atribuído. */
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
  /** Lote com vencimento mais recente (mais próximo) */
  lote: LoteInfo | null;
  /** Dias consecutivos sem venda (baseado no histórico recente) */
  diasSemVenda: number;
  /** Status de campanha do produto */
  statusCampanha: StatusCampanha;
  /** Estoque ideal congelado quando marcado como em_campanha */
  estoqueIdealCongelado: number | null;
  /** Dias de estoque fixados na entrada no painel (snapshot). */
  diasEstoqueEntrada: number | null;
  /** Excesso (R$) fixado na entrada no painel (snapshot) — base da % de redução. */
  excessoEntradaReais: number | null;
  /** Descrição da campanha atual */
  campanhaDescricao: string | null;
  /** Data de início da campanha (YYYY-MM-DD) */
  campanhaInicio: string | null;
  /** Data de fim da campanha (YYYY-MM-DD) */
  campanhaFim: string | null;
  /** Data da última transferência (YYYY-MM-DD) */
  dataUltimaTransferencia: string | null;
  /** Quantidade vendida no mês anterior */
  qtdVendaMesAnterior: number;
  /** Quantidade vendida 2 meses atrás */
  qtdVenda2MesesAnterior: number;
  /** Quantidade projetada para o mês atual */
  qtdProjetadoMesAtual: number;
  /** Preço política (preço mínimo de venda) */
  precoPolitica: number | null;
  /** Quantidade vendida no mês atual */
  qtdVendaMesAtual: number;
};

export type RegionDashboardData = {
  region: RegionView;
  recentDates: string[];
  products: DashboardProduct[];
  /** Compradores presentes no conjunto (para o dropdown de filtro). Ordenado. */
  compradores: string[];
  /** Há itens sem comprador atribuído (habilita a opção "Não atribuído"). */
  temNaoAtribuido: boolean;
  summary: {
    totalProdutos: number;
    valorTotalCusto: number;
    estoqueAtualTotal: number;
    estoqueInicialTotal: number;
    ultimaAtualizacaoMs: number | null;
    ultimoUploadVendasMs: number | null;
  };
  regionStatus: Record<RegionKey, RegionStatus>;
};

export type ProductPanoramaData = {
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
    dataUltimaTransferencia: string | null;
    qtdVendaMesAnterior: number;
    qtdVenda2MesesAnterior: number;
    qtdProjetadoMesAtual: number;
    precoPolitica: number | null;
  };
  lotes: LoteInfo[];
  salesSeries: Array<{
    date: string;
    label: string;
    quantidade: number;
  }>;
};

const brasiliaDateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const brasiliaDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
});

export function formatBrasiliaDateTime(date: Date) {
  return brasiliaDateTimeFormatter.format(date);
}

export function formatBrasiliaDayMonth(date: Date) {
  return brasiliaDateFormatter.format(date);
}

export function normalizeIsoDateString(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const isoCandidate = trimmed.includes("T") ? trimmed.slice(0, 10) : trimmed;
    if (/^\d{4}-\d{2}-\d{2}$/.test(isoCandidate)) {
      return isoCandidate;
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  return null;
}

export function toUtcTimestampMs(value: Date | string | number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.getTime();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

export function formatDayMonthLabelFromIso(isoDate: string) {
  return formatBrasiliaDayMonth(new Date(`${isoDate}T12:00:00.000Z`));
}
