/**
 * Regra PURA da reconciliação de "associativismo" (submódulo Comercial).
 *
 * Dado um CONJUNTO de grupos alvo (escopo consolidado), a lista de CNPJs de uma planilha e os
 * membros atuais da base (query 1019 `grupo_clientes_cnpj` — cada cliente em exatamente UM grupo),
 * classifica em 3 baldes:
 *   - jaNoGrupo  : CNPJ na planilha e na base JÁ em ALGUM dos grupos selecionados (nenhuma ação).
 *   - aCadastrar : CNPJ na planilha, na base em um grupo FORA do escopo → entra no escopo
 *                  (carrega o `grupoAtual` = de onde ele sai; qual grupo do escopo recebe é decisão
 *                  do operador quando há mais de um selecionado).
 *   - aRemover   : CNPJ na base em ALGUM grupo do escopo, mas fora da planilha → remover.
 * CNPJs da planilha que NÃO estão na base são apenas contados (`ignorados`), sem balde.
 *
 * Pura (sem IO) → testável e reutilizável (o servidor só busca a 1019 e chama isto).
 */

/** Remove tudo que não é dígito (CNPJ/CPF). "" se não sobrar dígito. */
export function normalizarCnpj(v: string | number | null | undefined): string {
  return String(v ?? "").replace(/\D/g, "");
}

/** Uma linha da base (1019): cliente → grupo. */
export type MembroGrupo = { cnpj: string; codGrupo: number; desGrupo: string };

/** Um item classificado: CNPJ + o grupo em que ele está HOJE na base (null se não estiver em nenhum). */
export type ItemReconc = { cnpj: string; grupoAtualCod: number | null; grupoAtualDesc: string | null };

export type Reconciliacao = {
  jaNoGrupo: ItemReconc[];
  aCadastrar: ItemReconc[];
  aRemover: ItemReconc[];
  /** CNPJs da planilha que não existem na base (só contagem, sem balde). */
  ignorados: number;
  /** CNPJs distintos válidos na planilha. */
  totalPlanilha: number;
};

export function reconciliar(input: {
  /** Conjunto de grupos alvo (escopo consolidado). */
  codGrupos: number[];
  cnpjsPlanilha: (string | number)[];
  membros: MembroGrupo[];
}): Reconciliacao {
  const alvo = new Set(input.codGrupos);
  // Mapa cnpj → grupo (1 grupo por cliente; o primeiro registro vence em caso de duplicado).
  const mapa = new Map<string, MembroGrupo>();
  for (const m of input.membros) {
    const cnpj = normalizarCnpj(m.cnpj);
    if (cnpj && !mapa.has(cnpj)) mapa.set(cnpj, { ...m, cnpj });
  }

  // Planilha normalizada + deduplicada.
  const planilha = new Set<string>();
  for (const c of input.cnpjsPlanilha) {
    const n = normalizarCnpj(c);
    if (n) planilha.add(n);
  }

  const jaNoGrupo: ItemReconc[] = [];
  const aCadastrar: ItemReconc[] = [];
  let ignorados = 0;
  for (const cnpj of Array.from(planilha)) {
    const m = mapa.get(cnpj);
    if (!m) {
      ignorados++; // não está na base → ignora
      continue;
    }
    const item: ItemReconc = { cnpj, grupoAtualCod: m.codGrupo, grupoAtualDesc: m.desGrupo };
    if (alvo.has(m.codGrupo)) jaNoGrupo.push(item);
    else aCadastrar.push(item);
  }

  const aRemover: ItemReconc[] = [];
  for (const m of Array.from(mapa.values())) {
    if (alvo.has(m.codGrupo) && !planilha.has(m.cnpj)) {
      aRemover.push({ cnpj: m.cnpj, grupoAtualCod: m.codGrupo, grupoAtualDesc: m.desGrupo });
    }
  }

  const porCnpj = (a: ItemReconc, b: ItemReconc) => a.cnpj.localeCompare(b.cnpj);
  jaNoGrupo.sort(porCnpj);
  aCadastrar.sort(porCnpj);
  aRemover.sort(porCnpj);

  return { jaNoGrupo, aCadastrar, aRemover, ignorados, totalPlanilha: planilha.size };
}
