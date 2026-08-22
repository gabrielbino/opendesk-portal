/**
 * Helpers de layout da tabela de Triagem do Pescador.
 * Estrutura espelhada de `superestocadosTableHelpers.ts` — mesma mecânica de
 * colunas congeladas progressivas por largura de viewport.
 *
 * Colunas candidatas a congelamento (em ordem, a partir da esquerda):
 * Seleção | Cód. | EAN | Descrição | Fabricante | Estoque
 *
 * Faixas (largura acumulada com seleção de 36px):
 * - < 1200px  : Cód.                                  (116px fixos)
 * - ≥ 1200px  : + EAN                                 (236px)
 * - ≥ 1366px  : + Descrição                           (426px)
 * - ≥ 1536px  : + Fabricante                          (566px)
 * - ≥ 1700px  : + Estoque                             (638px)
 */

/** Largura da coluna de seleção (checkbox) */
export const PESCADOR_SELECTION_WIDTH = 36;

export const PESCADOR_STICKY_COLUMNS = {
  codInterno: { width: 80 },
  ean: { width: 120 },
  descricao: { width: 190 },
  fabricante: { width: 140 },
  estoqueSc: { width: 72 },
} as const;

export type PescadorStickyKey = keyof typeof PESCADOR_STICKY_COLUMNS;

export type PescadorStickyLayout = Record<
  PescadorStickyKey,
  {
    width: number;
    left: number;
    sticky: boolean;
  }
>;

const PESCADOR_STICKY_ORDER: PescadorStickyKey[] = [
  "codInterno",
  "ean",
  "descricao",
  "fabricante",
  "estoqueSc",
];

/**
 * Determina quais colunas ficam congeladas com base na largura do viewport
 * da tabela. Progressivo: telas menores congelam menos colunas para sobrar
 * espaço útil de rolagem.
 */
export function getPescadorFrozenKeys(viewportWidth: number): PescadorStickyKey[] {
  if (viewportWidth >= 1700) {
    return ["codInterno", "ean", "descricao", "fabricante", "estoqueSc"];
  }
  if (viewportWidth >= 1536) {
    return ["codInterno", "ean", "descricao", "fabricante"];
  }
  if (viewportWidth >= 1366) {
    return ["codInterno", "ean", "descricao"];
  }
  if (viewportWidth >= 1200) {
    return ["codInterno", "ean"];
  }
  return ["codInterno"];
}

export function buildPescadorStickyLayout(
  frozenKeys: PescadorStickyKey[],
): PescadorStickyLayout {
  let currentLeft = PESCADOR_SELECTION_WIDTH;

  return PESCADOR_STICKY_ORDER.reduce((layout, columnKey) => {
    const columnWidth = PESCADOR_STICKY_COLUMNS[columnKey].width;
    const sticky = frozenKeys.includes(columnKey);

    layout[columnKey] = {
      width: columnWidth,
      left: sticky ? currentLeft : 0,
      sticky,
    };

    if (sticky) {
      currentLeft += columnWidth;
    }

    return layout;
  }, {} as PescadorStickyLayout);
}
