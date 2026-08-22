/**
 * Lógica PURA do backup de pedidos (retenção + arquivamento + poda). Sem dependência de banco/fs,
 * então é a fonte ÚNICA da regra, compartilhada pelo servidor (control plane calcula o corte) e
 * testável isolada. Ver docs/monitor-arquivos-backup.md.
 *
 * MODELO: manter na pasta só os ÚLTIMOS N dias (úteis ou corridos); tudo com `mtime` MAIS ANTIGO
 * que o corte é compactado (agrupado por mês do arquivo) e removido; zips/pastas-mês mais velhos
 * que `retencaoMeses` são podados.
 *
 * Fuso fixo SC/SP: o Brasil não tem horário de verão desde 2019, então o offset é -03:00 constante.
 */

import { partesSP } from "./agenda";

export type ManterUnidade = "uteis" | "corridos";

const BRT = "-03:00";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Instante absoluto da meia-noite (00:00) de uma data, no fuso SC/SP. */
export function spInicioDoDia(ano: number, mes: number, dia: number): Date {
  return new Date(`${ano}-${pad(mes)}-${pad(dia)}T00:00:00${BRT}`);
}

/** 'AAAA-MM-DD' de um instante, no fuso SP. */
export function dataSP(d: Date): string {
  const p = partesSP(d);
  return `${p.ano}-${pad(p.mes)}-${pad(p.dia)}`;
}

/** { ano, mes } (strings) do mês de um instante, no fuso SP. Ex.: { ano: "2026", mes: "07" }. */
export function anoMesSP(d: Date): { ano: string; mes: string } {
  const p = partesSP(d);
  return { ano: String(p.ano), mes: pad(p.mes) };
}

/**
 * Instante de CORTE da retenção: arquivos com `mtime < corte` são arquivados; os últimos N dias
 * ficam na pasta.
 *  - 'corridos': mantém os últimos N dias corridos (incl. hoje) → corte = início de hoje − (N−1) dias.
 *  - 'uteis': mantém os últimos N dias ÚTEIS (seg–sex, incl. hoje se for útil) → corte = início do
 *    N-ésimo dia útil mais recente. Feriado não é considerado (dia útil = seg–sex).
 */
export function calcularCorte(agora: Date, manterDias: number, unidade: ManterUnidade): Date {
  const n = Math.max(1, Math.trunc(manterDias));
  const p = partesSP(agora);
  const hoje = spInicioDoDia(p.ano, p.mes, p.dia);
  if (unidade === "corridos") {
    return new Date(hoje.getTime() - (n - 1) * 86400000);
  }
  const dias: number[] = [];
  let cursor = hoje.getTime();
  for (let i = 0; i < 400 && dias.length < n; i++) {
    const wd = partesSP(new Date(cursor)).diaSemana; // 0=dom … 6=sáb
    if (wd !== 0 && wd !== 6) dias.push(cursor);
    cursor -= 86400000;
  }
  return new Date(Math.min(...dias));
}

/**
 * Um mês <ano>/<mes> (mes 1-12) está mais velho que `retencaoMeses` em relação a `agora` (SP)?
 * Ex.: retencaoMeses=12 → mantém os últimos 12 meses + o corrente; poda o que for anterior.
 */
export function mesEhAntigo(ano: number, mes: number, agora: Date, retencaoMeses: number): boolean {
  const p = partesSP(agora);
  const atual = p.ano * 12 + (p.mes - 1);
  const alvo = ano * 12 + (mes - 1);
  return alvo < atual - Math.max(0, Math.trunc(retencaoMeses));
}

/** Descrição legível do corte para logs/UI. Ex.: "arquiva pedidos anteriores a 28/07/2026". */
export function descreverCorte(corte: Date): string {
  const p = partesSP(corte);
  return `anteriores a ${pad(p.dia)}/${pad(p.mes)}/${p.ano}`;
}
