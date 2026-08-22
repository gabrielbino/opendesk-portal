/**
 * Helpers compartilhados da faixa "Valor imobilizado — últimas 4 semanas".
 * Usados pelo cabeçalho do Modo TV (tema escuro) e pela faixa do painel (tema claro).
 */

export type DirecaoResumo = "up" | "down" | "flat" | null;

/**
 * BRL compacto: R$ 2,681 mi · R$ 950 mil · R$ 320.
 * Milhões com 3 casas (pedido da diretoria — distingue variações finas semana a semana).
 */
export function brlCompacto(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) {
    return `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} mi`;
  }
  if (abs >= 1_000) return `R$ ${Math.round(v / 1_000).toLocaleString("pt-BR")} mil`;
  return `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
}

/** "YYYY-MM-DD" → "dd/mm". */
export function labelDataResumo(iso: string): string {
  const [, m, d] = iso.split("-");
  return d && m ? `${d}/${m}` : iso;
}
