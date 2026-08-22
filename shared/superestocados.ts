/**
 * Fórmulas do painel de Superestocados — FONTE ÚNICA (client + server), para o
 * snapshot de entrada (server) e a exibição (client) usarem exatamente o mesmo cálculo.
 */

/** Estoque ideal = cobertura de ~2 meses pela venda média. */
export function estoqueIdealSuperestocado(vendaMedia: number): number {
  return Math.ceil((vendaMedia ?? 0) * 2);
}

/** Excesso em R$ = (estoque acima do ideal) × custo unitário. */
export function excessoReaisSuperestocado(
  estoqueAtual: number,
  vendaMedia: number,
  valorCusto: number | null | undefined,
): number {
  const ideal = estoqueIdealSuperestocado(vendaMedia);
  const excedente = Math.max(0, estoqueAtual - ideal);
  const custoUnitario = estoqueAtual > 0 ? (valorCusto ?? 0) / estoqueAtual : 0;
  return excedente * custoUnitario;
}

/**
 * % de redução do excesso desde a entrada no painel.
 *   > 0  → excesso reduziu (escoou) · < 0 → excesso cresceu · null → sem base de entrada.
 */
export function reducaoExcessoPct(
  excessoEntrada: number | null | undefined,
  excessoAtual: number,
): number | null {
  if (excessoEntrada == null || excessoEntrada <= 0) return null;
  return ((excessoEntrada - excessoAtual) / excessoEntrada) * 100;
}
