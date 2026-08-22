/**
 * Validades Curtas — tipos e constantes compartilhados (frontend + backend).
 *
 * Monitora itens que vão vencer com estoque parado, classificando-os em 5 bandas
 * de urgência para ação preventiva antes da perda.
 */

// ─── Bandas (níveis de urgência) ────────────────────────────────────────────

export type BandaId = 'descarte' | 'bonificavel' | 'alto_risco' | 'alerta' | 'atencao';

export interface BandaConfig {
  id: BandaId;
  label: string;
  /** Limite superior (inclusive) em dias até vencer. */
  maxDias: number;
  /** Cor do badge/chip (Tailwind token). */
  color: string;
  /** Cor de fundo suave para highlight. */
  bgColor: string;
  /** Ícone ou emoji para referência rápida. */
  descricao: string;
}

/** Ordem das bandas: da mais urgente para a menos urgente. */
export const BANDAS_ORDER: BandaId[] = ['descarte', 'bonificavel', 'alto_risco', 'alerta', 'atencao'];

/** Configuração visual padrão das bandas (limites default, editáveis via Parâmetros). */
export const BANDAS_CONFIG: Record<BandaId, Omit<BandaConfig, 'maxDias'>> = {
  descarte: {
    id: 'descarte',
    label: 'Descarte',
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    descricao: 'Fim de linha; descartar',
  },
  bonificavel: {
    id: 'bonificavel',
    label: 'Bonificável',
    color: 'text-orange-700',
    bgColor: 'bg-orange-50',
    descricao: 'Janela curta; encaminhar para bonificação',
  },
  alto_risco: {
    id: 'alto_risco',
    label: 'Alto Risco',
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    descricao: 'Cruzou os 180 dias; risco real de perda',
  },
  alerta: {
    id: 'alerta',
    label: 'Alerta',
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-50',
    descricao: 'Ainda >180 dias; agir para escoar (promo/transferência)',
  },
  atencao: {
    id: 'atencao',
    label: 'Atenção',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    descricao: 'Teto de entrada; só radar',
  },
};

// ─── Parâmetros (defaults — valores reais vêm do banco) ─────────────────────

export const VC_DEFAULTS = {
  DESCARTE_ATE: 90,
  BONIFICAVEL_ATE: 120,
  ALTO_RISCO_ATE: 180,
  ALERTA_ATE: 270,
  ATENCAO_ATE: 360,       // = teto de entrada
  JANELA_RISCO_DIAS: 180,
} as const;

// ─── Filtros ────────────────────────────────────────────────────────────────

export type TipoFiltroVC =
  | 'todos'
  | 'medicamento'
  | 'medicamento_venda_zerada'
  | 'nao_medicamento'
  | 'nao_medicamento_venda_zerada';

export const TIPO_FILTRO_OPTIONS: { value: TipoFiltroVC; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'medicamento', label: 'Medicamentos' },
  { value: 'medicamento_venda_zerada', label: 'Medicamentos (Venda Zerada)' },
  { value: 'nao_medicamento', label: 'Não Medicamentos' },
  { value: 'nao_medicamento_venda_zerada', label: 'Não Medicamentos (Venda Zerada)' },
];

export type RegionView = 'SC' | 'RS' | 'UNIFICADO';

/** Valor especial do filtro de comprador para "sem comprador atribuído". */
export const VC_COMPRADOR_NAO_ATRIBUIDO = '__nao_atribuido__';

// ─── Tipos de dados do painel ───────────────────────────────────────────────

export interface ItemValidadeCurta {
  codigo: number;
  nomeProduto: string;
  fornecedor: string;
  tipoProduto: 'medicamento' | 'nao_medicamento';
  estoqueAtual: number;
  vendaMedia: number;
  valorEstoqueCusto: number | null;
  /** Comprador responsável pela marca (via Compradores). null = não atribuído. */
  comprador: string | null;
  vencimentoLote: string | null;
  /** Dias até vencer (MtV). */
  diasAteVencer: number;
  /** Dias para vender todo o estoque (DpV). Infinity se venda zerada. */
  diasParaVender: number;
  /** Banda classificada. */
  banda: BandaId;
  /** Valor em risco (estoque × custo). */
  valorEmRisco: number;
  /** Região de origem. */
  region: 'SC' | 'RS';
}

export interface VCKpis {
  totalItens: number;
  estoqueTotal: number;
  valorEmRiscoTotal: number;
  contagemPorBanda: Record<BandaId, number>;
  /** Itens já VENCIDOS (diasAteVencer < 0). */
  totalVencidos: number;
  /** Menor prazo entre os itens AINDA não vencidos (diasAteVencer ≥ 0). null se não há. */
  menorDiasNaoVencido: number | null;
}

export interface VCDashboardData {
  region: RegionView;
  itens: ItemValidadeCurta[];
  kpis: VCKpis;
  /** KPIs globais (sem filtro de tipo/banda) para contagem total de bandas no header. */
  kpisGlobais?: VCKpis;
  /** Compradores presentes no conjunto (para o dropdown de filtro). Ordenado. */
  compradores: string[];
  /** Há itens sem comprador atribuído (para a opção "Não atribuído"). */
  temNaoAtribuido: boolean;
  ultimaAtualizacaoMs: number | null;
}
