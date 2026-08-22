/**
 * Camada compartilhada de "agenda" — janela de dias da semana + faixa de horário.
 *
 * Lógica PURA (só usa Intl), então serve tanto o servidor (o "cérebro" decide se deve
 * monitorar/alertar agora) quanto o cliente (o componente AgendaConfig e a descrição
 * legível). É a fonte ÚNICA do cálculo "está ativo agora?", para não duplicar a lógica
 * de fuso/dia-da-semana em cada módulo.
 *
 * Consumidores atuais: submódulo "Monitor de Integrações" (Indicadores) — só monitora nos
 * dias marcados e dentro da janela de horário. Reutilizável por qualquer módulo com a
 * mesma necessidade (o Envio de Parcial pode migrar para cá no futuro).
 *
 * Decisões (ver docs/monitor-arquivos-handoff.md):
 *  - Fuso FIXO America/Sao_Paulo — o portal roda em UTC no Manus, mas a regra de negócio
 *    é sempre hora local de SC/RS.
 *  - SEM feriado: a agenda é só dias-da-semana + horário (combinado com o time).
 *  - `horaFim` é EXCLUSIVO no topo da hora: janela [horaInicio:00, horaFim:00). Ex.: 8→18
 *    = ativo das 08:00 às 17:59:59. Para 24h use horaInicio=0, horaFim=24.
 *
 * O componente de UI equivalente é client/src/components/AgendaConfig.tsx.
 */

export const AGENDA_TZ = "America/Sao_Paulo";

/** Configuração de janela de operação. `diasSemana`: 0=domingo … 6=sábado (padrão JS getDay). */
export type Agenda = {
  diasSemana: number[];
  /** Hora inicial da janela (0–24), inclusiva. */
  horaInicio: number;
  /** Hora final da janela (0–24), exclusiva no topo da hora. */
  horaFim: number;
};

/** Rótulos curtos dos dias, indexados por 0=dom … 6=sáb. */
export const DIAS_SEMANA_LABEL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

/** Nomes por extenso (para a modal de Regras / descrição legível). */
export const DIAS_SEMANA_NOME = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
] as const;

/** Mapeia o weekday "short" en-GB (Mon..Sun) para o índice 0=dom … 6=sáb. */
const WD_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Partes de data/hora no fuso de São Paulo (dia da semana como índice 0–6). */
export function partesSP(date: Date = new Date()) {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: AGENDA_TZ,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .formatToParts(date)
    .reduce((acc, x) => ((acc[x.type] = x.value), acc), {} as Record<string, string>);
  // Intl pode devolver "24" para meia-noite em alguns runtimes; normaliza para 0.
  const hora = Number(p.hour) % 24;
  return {
    ano: Number(p.year),
    mes: Number(p.month),
    dia: Number(p.day),
    hora,
    minuto: Number(p.minute),
    diaSemana: WD_INDEX[p.weekday] ?? 0,
  };
}

/** Normaliza uma agenda vinda do banco (JSON) para valores seguros. */
export function normalizarAgenda(a: Partial<Agenda> | null | undefined): Agenda {
  const dias = Array.isArray(a?.diasSemana)
    ? Array.from(new Set(a!.diasSemana.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))).sort()
    : [];
  const clampHora = (h: unknown, fallback: number) =>
    typeof h === "number" && Number.isFinite(h) ? Math.min(24, Math.max(0, Math.trunc(h))) : fallback;
  return {
    diasSemana: dias,
    horaInicio: clampHora(a?.horaInicio, 0),
    horaFim: clampHora(a?.horaFim, 24),
  };
}

/**
 * A agenda está ativa no instante `quando` (default agora), no fuso de São Paulo?
 * - Dia da semana precisa estar marcado em `diasSemana`.
 * - Minuto do dia precisa estar em [horaInicio:00, horaFim:00).
 * - `diasSemana` vazio ⇒ nunca ativo (nada marcado = não monitora).
 */
export function estaAtivoAgora(agenda: Partial<Agenda> | null | undefined, quando: Date = new Date()): boolean {
  const a = normalizarAgenda(agenda);
  if (a.diasSemana.length === 0) return false;
  const { hora, minuto, diaSemana } = partesSP(quando);
  if (!a.diasSemana.includes(diaSemana)) return false;
  const minutoDoDia = hora * 60 + minuto;
  return minutoDoDia >= a.horaInicio * 60 && minutoDoDia < a.horaFim * 60;
}

/**
 * Offset (ms) entre o horário de parede de São Paulo e o UTC no instante `d`. SP fica ATRÁS do
 * UTC (hoje fixo em -03:00, sem horário de verão desde 2019), então o valor é negativo. Calculado
 * via Intl para não hard-codar o fuso — se o Brasil voltar a ter DST, continua correto.
 */
function offsetSPms(d: Date): number {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: AGENDA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .formatToParts(d)
    .reduce((acc, x) => ((acc[x.type] = x.value), acc), {} as Record<string, string>);
  const asUTC = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second));
  return asUTC - d.getTime();
}

/**
 * Instante (Date UTC) correspondente ao horário de PAREDE de HOJE em São Paulo `hora:minuto`.
 * O "hoje" é o dia do calendário SP do instante `agora`. Usado no modo 'geracao' para materializar
 * o horário limite (deadline) do dia — "a lista deveria estar gerada até tal hora".
 */
export function instanteSP(agora: Date, hora: number, minuto: number): Date {
  const { ano, mes, dia } = partesSP(agora);
  const off = offsetSPms(agora);
  const h = Math.min(23, Math.max(0, Math.trunc(hora)));
  const m = Math.min(59, Math.max(0, Math.trunc(minuto)));
  return new Date(Date.UTC(ano, mes - 1, dia, h, m, 0) - off);
}

/** "HH:MM" de um horário de parede (hora:minuto já em fuso SP). Ex.: (8, 0) → "08:00". */
export function formatarHoraMinuto(hora: number, minuto: number): string {
  const h = Math.min(23, Math.max(0, Math.trunc(hora)));
  const m = Math.min(59, Math.max(0, Math.trunc(minuto)));
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * O dia da semana de `quando` (fuso SP) está marcado na agenda? (Só o DIA, ignora a faixa de
 * horário.) Usado pelo modo 'geracao': a janela de uma lista é 00:00→horário-alvo, então o
 * gate é só por dia — a faixa `horaInicio/horaFim` vale para o modo 'pedidos'.
 */
export function diaMarcado(agenda: Partial<Agenda> | null | undefined, quando: Date = new Date()): boolean {
  const a = normalizarAgenda(agenda);
  if (a.diasSemana.length === 0) return false;
  return a.diasSemana.includes(partesSP(quando).diaSemana);
}

/** Descrição legível da agenda em pt-BR (para Regras / tooltip). Ex.: "Seg, Ter, Qua, Qui, Sex · 08:00–18:00". */
export function descreverAgenda(agenda: Partial<Agenda> | null | undefined): string {
  const a = normalizarAgenda(agenda);
  if (a.diasSemana.length === 0) return "Nenhum dia marcado (inativo)";
  const dias =
    a.diasSemana.length === 7 ? "Todos os dias" : a.diasSemana.map((d) => DIAS_SEMANA_LABEL[d]).join(", ");
  const hh = (h: number) => `${String(h % 24).padStart(2, "0")}:00`;
  const janela = a.horaInicio === 0 && a.horaFim >= 24 ? "24h" : `${hh(a.horaInicio)}–${hh(a.horaFim)}`;
  return `${dias} · ${janela}`;
}
