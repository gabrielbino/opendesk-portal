/**
 * Colunas da tabela de superestocados:
 * Seleção | Código | Produto | Fornecedor | Comprador | Últ. Compra | Últ. Transf. | Dias Est. | Est. Total | Est. Ideal | Est. Lote | Cód. Lote | Vencimento | Vda. Média | Proj. Mês | Vda. M-0 | Vda. M-1 | Vda. M-2 | Vlr. Custo | Preço Mín. | Excesso | Detalhe | Vendas (datas)
 *
 * Larguras otimizadas para maximizar colunas visíveis em cada faixa de monitor:
 * - Notebook 14" (~1366px): Código + Produto + Fornecedor fixos, restante scroll
 * - Monitor 15-17" (~1536px): + Comprador + Últ. Compra + Últ. Transf. fixos
 * - Monitor 17-19" (~1700px): + Dias Estoque + Est. Total + Est. Ideal fixos
 * - Monitor 19-20" (~1920px): + Est. Lote + Cód. Lote + Vencimento + Vda. Média fixos
 * - Monitor 21"+ (~2100px): + Proj. Mês + Vda. M-0 + Vda. M-1 + Vda. M-2 + Vlr. Custo + Preço Mín. + Excesso
 * - Ultrawide/4K (2560px+): Todas as colunas visíveis sem scroll
 */

/** Width of the selection (checkbox) column */
export const SELECTION_COLUMN_WIDTH = 36;

export const STICKY_COLUMNS = {
  codigo: { left: 36, width: 110 },
  produto: { left: 146, width: 190 },
  fornecedor: { left: 336, width: 140 },
  comprador: { left: 476, width: 140 },
  ultCompra: { left: 616, width: 88 },
  ultTransf: { left: 704, width: 88 },
  diasEstoque: { left: 792, width: 72 },
  estoqueTotal: { left: 864, width: 72 },
  estoqueIdeal: { left: 936, width: 72 },
  estoqueLote: { left: 1008, width: 72 },
  codLote: { left: 1080, width: 82 },
  vencimento: { left: 1162, width: 88 },
  vendaMedia: { left: 1250, width: 72 },
  projMes: { left: 1322, width: 72 },
  vdaM0: { left: 1394, width: 68 },
  vdaM1: { left: 1462, width: 68 },
  vdaM2: { left: 1530, width: 68 },
  valorCusto: { left: 1598, width: 90 },
  precoMin: { left: 1688, width: 82 },
  excessoReais: { left: 1770, width: 82 },
  reducaoExcesso: { left: 1852, width: 90 },
  panorama: { left: 1942, width: 60 },
} as const;

export type StickyColumnKey = keyof typeof STICKY_COLUMNS;

export type StickyColumnLayout = Record<
  StickyColumnKey,
  {
    width: number;
    left: number;
    sticky: boolean;
  }
>;

const STICKY_COLUMN_ORDER: StickyColumnKey[] = [
  "codigo",
  "produto",
  "fornecedor",
  "comprador",
  "ultCompra",
  "ultTransf",
  "diasEstoque",
  "estoqueTotal",
  "estoqueIdeal",
  "estoqueLote",
  "codLote",
  "vencimento",
  "vendaMedia",
  "projMes",
  "vdaM0",
  "vdaM1",
  "vdaM2",
  "valorCusto",
  "precoMin",
  "excessoReais",
  "reducaoExcesso",
  "panorama",
];

const integerFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 0,
});

/**
 * Determina quais colunas ficam congeladas (sticky) com base na largura do viewport.
 * Regras progressivas para cada faixa de monitor:
 */
export function getFrozenColumnKeys(viewportWidth: number): StickyColumnKey[] {
  // Ultrawide / 4K (2560px+): todas as colunas congeladas
  if (viewportWidth >= 2560) {
    return STICKY_COLUMN_ORDER;
  }

  // Monitor 21"+ (2100px+): até reducaoExcesso (21 colunas)
  if (viewportWidth >= 2100) {
    return [
      "codigo", "produto", "fornecedor", "comprador", "ultCompra", "ultTransf",
      "diasEstoque", "estoqueTotal", "estoqueIdeal", "estoqueLote",
      "codLote", "vencimento", "vendaMedia",
      "projMes", "vdaM0", "vdaM1", "vdaM2", "valorCusto", "precoMin",
      "excessoReais", "reducaoExcesso",
    ];
  }

  // Monitor 19-20" (1920px+): até vendaMedia (13 colunas)
  if (viewportWidth >= 1920) {
    return [
      "codigo", "produto", "fornecedor", "comprador", "ultCompra", "ultTransf",
      "diasEstoque", "estoqueTotal", "estoqueIdeal", "estoqueLote",
      "codLote", "vencimento", "vendaMedia",
    ];
  }

  // Monitor 17-19" (1700px+): até estoqueIdeal (9 colunas)
  if (viewportWidth >= 1700) {
    return [
      "codigo", "produto", "fornecedor", "comprador", "ultCompra", "ultTransf",
      "diasEstoque", "estoqueTotal", "estoqueIdeal",
    ];
  }

  // Monitor 15-17" (1536px+): até ultTransf (6 colunas)
  if (viewportWidth >= 1536) {
    return ["codigo", "produto", "fornecedor", "comprador", "ultCompra", "ultTransf"];
  }

  // Monitor 14-15" (1366px+): até fornecedor (3 colunas)
  if (viewportWidth >= 1366) {
    return ["codigo", "produto", "fornecedor"];
  }

  // Notebook 13" (1200px+): código + produto
  if (viewportWidth >= 1200) {
    return ["codigo", "produto"];
  }

  // Tablet / tela pequena: apenas código
  return ["codigo"];
}

export function buildStickyColumnLayout(frozenColumnKeys: StickyColumnKey[]): StickyColumnLayout {
  let currentLeft = SELECTION_COLUMN_WIDTH;

  return STICKY_COLUMN_ORDER.reduce((layout, columnKey) => {
    const columnWidth = STICKY_COLUMNS[columnKey].width;
    const sticky = frozenColumnKeys.includes(columnKey);

    layout[columnKey] = {
      width: columnWidth,
      left: sticky ? currentLeft : 0,
      sticky,
    };

    if (sticky) {
      currentLeft += columnWidth;
    }

    return layout;
  }, {} as StickyColumnLayout);
}

export function formatQuantityTooltipValue(
  value: number | string | Array<number | string> | null | undefined,
) {
  const normalizedValue = Array.isArray(value) ? value[0] : value;
  return `Quantidade vendida ${integerFormatter.format(Number(normalizedValue ?? 0))}`;
}
