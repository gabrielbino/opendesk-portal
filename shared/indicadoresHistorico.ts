/**
 * Regra PURA do histórico do painel "Pedidos por Layout" (Indicadores).
 *
 * O painel é ao vivo (API "do dia"); para comparar com o passado, gravamos fotos periódicas (a
 * cada 30 min, janela 08:00–22:00 SP). Aqui ficam só os helpers puros (janela, slot, clamp,
 * variação) e os tipos das séries — testáveis sem banco. O acesso ao banco fica em
 * server/indicadoresHistorico.ts. Ver docs/indicadores-handoff.md.
 */

/** Janela de gravação (horário de parede SP). Fora dela o snapshot não roda. */
export const HHMM_INICIO = "08:00";
export const HHMM_FIM = "22:00";
/** Minutos-do-dia da janela (inclusiva nas duas pontas: 08:00 … 22:00). */
export const MIN_INICIO = 8 * 60;
export const MIN_FIM = 22 * 60;

/** `true` se o minuto-do-dia está dentro da janela de gravação (inclusiva). */
export function dentroDaJanela(minutosDoDia: number): boolean {
  return minutosDoDia >= MIN_INICIO && minutosDoDia <= MIN_FIM;
}

/** "HH:MM" de hora:minuto (já em fuso SP), com zero à esquerda. */
export function formatarHHMM(hora: number, minuto: number): string {
  const h = Math.min(23, Math.max(0, Math.trunc(hora)));
  const m = Math.min(59, Math.max(0, Math.trunc(minuto)));
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Slot de 30 min: piso do minuto em :00 ou :30. Ex.: (8,47) → "08:30". */
export function slot30(hora: number, minuto: number): string {
  return formatarHHMM(hora, minuto < 30 ? 0 : 30);
}

/** Limita um "HH:MM" à janela [08:00, 22:00] (usado como alvo da leitura "mesmo horário"). */
export function clampHHMM(hhmm: string): string {
  if (hhmm < HHMM_INICIO) return HHMM_INICIO;
  if (hhmm > HHMM_FIM) return HHMM_FIM;
  return hhmm;
}

/** Variação percentual (atual vs anterior). null se não dá pra comparar (sem base ou base 0). */
export function variacaoPct(atual: number, anterior: number | null | undefined): number | null {
  if (anterior == null || anterior === 0) return null;
  return (atual / anterior - 1) * 100;
}

/** Um ponto da série (um dia, no "mesmo horário" da consulta). */
export type PontoHistorico = {
  dia: string; // 'AAAA-MM-DD' (SP)
  /** Aceitos. */
  qtd: number;
  valor: number;
  qtdCort: number;
  valorCort: number;
  /** Total de pedidos do dia (query 1018 — todos os status). */
  total: number;
};

/** Histórico por região (últimos N dias, mesmo-horário-do-dia). */
export type HistoricoLayout = {
  SC: PontoHistorico[];
  RS: PontoHistorico[];
  UNIFICADO: PontoHistorico[];
  /** Dia mais antigo disponível (para o painel avisar "histórico desde…"). */
  desde: string | null;
  /** Horário-alvo usado na leitura ("mesmo horário de agora"), p/ exibir "até HH:MM". */
  alvo: string;
};
