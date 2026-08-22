/**
 * Helpers do painel de Rupturas — FONTE ÚNICA dos limiares de %/emoji/cor,
 * usados tanto pela visão operacional quanto pelo painel de TV.
 *
 * Emoji por faixa de % de ruptura:
 *   < 5% 😁 · 5–10% 😨 · 10–15% 😢 · > 15% 🤯
 */

/** Limiar de ruptura (dias de estoque). Espelha `DIAS_RUPTURA` de server/db/rupturas.ts. */
export const DIAS_RUPTURA = 7;

export type FaixaKey = "baixa" | "media" | "alta" | "critica";

/** Faixa de risco da % de ruptura (limiares centralizados aqui). */
export function faixaRuptura(pct: number): FaixaKey {
  if (pct > 15) return "critica";
  if (pct > 10) return "alta";
  if (pct > 5) return "media";
  return "baixa";
}

const EMOJI_POR_FAIXA: Record<FaixaKey, string> = {
  baixa: "😁",
  media: "😨",
  alta: "😢",
  critica: "🤯",
};

/** Faixas para legendas/filtros (emoji + rótulo). Mesma ordem da gravidade crescente. */
export const FAIXAS_RUPTURA: { key: FaixaKey; emoji: string; label: string }[] = [
  { key: "baixa", emoji: EMOJI_POR_FAIXA.baixa, label: "< 5%" },
  { key: "media", emoji: EMOJI_POR_FAIXA.media, label: "5–10%" },
  { key: "alta", emoji: EMOJI_POR_FAIXA.alta, label: "10–15%" },
  { key: "critica", emoji: EMOJI_POR_FAIXA.critica, label: "> 15%" },
];

export function emojiRuptura(pct: number): string {
  return EMOJI_POR_FAIXA[faixaRuptura(pct)];
}

/** % de ruptura (0–100). Guarda contra divisão por zero. */
export function pctRuptura(qtdRuptura: number, totalAtivos: number): number {
  if (!totalAtivos || totalAtivos <= 0) return 0;
  return (qtdRuptura / totalAtivos) * 100;
}

export function formatPct(pct: number): string {
  return `${pct.toFixed(1).replace(".", ",")}%`;
}

/** Classes Tailwind por faixa de risco (chips/realces). */
export function corRiscoRuptura(pct: number): { text: string; bg: string; border: string } {
  if (pct > 15) return { text: "text-red-600", bg: "bg-red-50", border: "border-red-300" };
  if (pct > 10) return { text: "text-orange-600", bg: "bg-orange-50", border: "border-orange-300" };
  if (pct > 5) return { text: "text-amber-600", bg: "bg-amber-50", border: "border-amber-300" };
  return { text: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-300" };
}

/** Classes por faixa (chips do filtro de emoji) — deriva de `corRiscoRuptura`. */
const PCT_REPRESENTATIVO: Record<FaixaKey, number> = { baixa: 0, media: 7, alta: 12, critica: 20 };
export function corFaixa(faixa: FaixaKey): { text: string; bg: string; border: string } {
  return corRiscoRuptura(PCT_REPRESENTATIVO[faixa]);
}
