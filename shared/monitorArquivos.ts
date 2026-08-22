/**
 * Lógica PURA do submódulo "Monitor de Integrações" (Indicadores) — sem dependência de banco,
 * então é a fonte ÚNICA de regra de negócio compartilhada entre:
 *  - o CÉREBRO no servidor (server/monitorArquivosControlPlane.ts) — reconciliação, SLA, alertas;
 *  - o CLIENTE (painel + modal de config) — status "bate o olho", contadores, prévia de mensagem.
 *
 * Regra de negócio (ver docs/monitor-arquivos-handoff.md):
 *  - Pedido "cai" na pasta com uma extensão PENDENTE (.txt/.ped/.PNN…) = ainda não lido pelo ERP.
 *  - Quando o arquivo vira a extensão LIDA (._RM), foi lido pelo ERP. Para PEDIDOS só a extensão
 *    muda (mesmo nome-base), então o par pendente↔lido é pelo nome-base.
 *  - 🔴 vermelho: pedido caiu e não virou lido dentro de `slaLeituraMin` → alerta WhatsApp +
 *    re-alerta a cada `realertaMin`; ao ler, manda "resolvido".
 *  - 🟢 verde: pedido caiu dentro de `gapSemPedidoMin` (recente — "na última hora").
 *  - 🔵 azul: já saiu do verde (parou), MAS passou pedido HOJE (ao menos uma vez). Só visual.
 *  - 🟡 amarelo (só visual): saiu do verde e NÃO passou pedido hoje (sem pedido no dia).
 *  - ⚫ inativo: fora da janela/dias da agenda, ou coletor offline (nunca "verde falso").
 */

import { type Agenda, AGENDA_TZ, diaMarcado, estaAtivoAgora, formatarHoraMinuto, instanteSP, partesSP } from "./agenda";

export type TipoMonitoramento = "pedidos" | "geracao";
export type EstadoEvento = "pendente" | "atrasado" | "lido";
/** Estado diário de UMA lista no modo 'geracao' (dirigido por snapshot; reseta a cada dia SP). */
export type EstadoDiaGeracao = "aguardando" | "gerado" | "atrasado";
export type StatusCor = "verde" | "azul" | "amarelo" | "vermelho" | "inativo";
export type CategoriaAlerta = "alerta" | "realerta" | "resolvido";

export const EXTENSAO_LIDA_PADRAO = "._RM";

/** Normaliza uma extensão: minúscula + garante ponto inicial. Ex.: 'PED' → '.ped', '._RM' → '._rm'. */
export function normalizarExtensao(ext: string): string {
  const e = ext.trim().toLowerCase();
  if (!e) return "";
  return e.startsWith(".") ? e : "." + e;
}

/**
 * Quebra um nome de arquivo em base + extensão pelo ÚLTIMO ponto (extensão já em minúsculas).
 * 'PEDIDO123.ped' → { base:'PEDIDO123', ext:'.ped' }; 'PEDIDO123._RM' → { base:'PEDIDO123', ext:'._rm' }.
 * Sem ponto (ou só ponto inicial) → extensão vazia.
 */
export function parseArquivo(nome: string): { base: string; ext: string } {
  const i = nome.lastIndexOf(".");
  if (i <= 0) return { base: nome, ext: "" };
  return { base: nome.slice(0, i), ext: nome.slice(i).toLowerCase() };
}

/** Classifica uma extensão como pendente | lida | outra, segundo a config (comparação normalizada). */
export function classificarExtensao(
  ext: string,
  extensoesPendente: string[],
  extensaoLida: string,
): "pendente" | "lida" | "outra" {
  const e = normalizarExtensao(ext);
  if (e && e === normalizarExtensao(extensaoLida)) return "lida";
  if (extensoesPendente.some((p) => normalizarExtensao(p) === e && e !== "")) return "pendente";
  return "outra";
}

/* ─── Formatação (fuso SP, pt-BR) ─────────────────────────────────────────── */

/** "14:03" no fuso de São Paulo. */
export function formatarHoraSP(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: AGENDA_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/**
 * Duração legível a partir de minutos, com escala progressiva para não ficar ilegível em
 * horas altas: 22 → "22min"; 67 → "1h07"; 120 → "2h"; 25h → "1d 1h"; 48h → "2d"; 116h25 → "4d 20h".
 * A partir de 24h passa a mostrar em DIAS (+ horas), que é a leitura natural para pedidos parados.
 */
export function formatarDuracaoMin(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m}min`;
  const totalH = Math.floor(m / 60);
  if (totalH < 24) {
    const r = m % 60;
    return r === 0 ? `${totalH}h` : `${totalH}h${String(r).padStart(2, "0")}`;
  }
  const d = Math.floor(totalH / 24);
  const h = totalH % 24;
  return h === 0 ? `${d}d` : `${d}d ${h}h`;
}

/* ─── Avaliação de prazo (time-driven; testável isolada) ──────────────────── */

/**
 * Decide, para UM evento e o instante `agora`, se ele deve virar "atrasado" (estourou o SLA)
 * ou re-alertar (já atrasado e passou o intervalo de re-alerta). Não decide "resolvido" — isso
 * é dirigido pela transição de arquivo (virou a extensão lida), não pelo tempo.
 */
export function avaliarPrazo(
  ev: { estado: EstadoEvento; caiuEm: Date; ultimoAlertaEm: Date | null },
  cfg: { slaLeituraMin: number; realertaMin: number },
  agora: Date,
): { virarAtrasado: boolean; reAlertar: boolean } {
  if (ev.estado === "lido") return { virarAtrasado: false, reAlertar: false };
  const minDesdeCaiu = (agora.getTime() - ev.caiuEm.getTime()) / 60000;
  if (ev.estado === "pendente") {
    return { virarAtrasado: minDesdeCaiu >= cfg.slaLeituraMin, reAlertar: false };
  }
  // atrasado → re-alerta se passou realertaMin desde o último alerta (ou desde que caiu).
  const ultimo = ev.ultimoAlertaEm ?? ev.caiuEm;
  const minDesdeAlerta = (agora.getTime() - ultimo.getTime()) / 60000;
  return { virarAtrasado: false, reAlertar: minDesdeAlerta >= Math.max(1, cfg.realertaMin) };
}

/* ─── Status do painel ("bate o olho") ────────────────────────────────────── */

/** Resumo agregado dos eventos de UM caminho (o servidor calcula via SQL). */
export interface ResumoConfig {
  /** Evento atrasado mais antigo (o pior) — dispara o vermelho. ISO em `caiuEm`. */
  atrasadoMaisAntigo: { nomeBase: string; caiuEm: string } | null;
  qtdPendentes: number;
  qtdAtrasados: number;
  /** Máx. caiuEm entre todos os eventos (último pedido que caiu). ISO ou null. */
  ultimaCaiuEm: string | null;
  /** Máx. lidoEm (último pedido lido pelo ERP). ISO ou null. */
  ultimaLidaEm: string | null;
}

export interface StatusPainel {
  cor: StatusCor;
  /** Frase curta pronta para o card. */
  detalhe: string;
  /** Instante-âncora (ISO) para o cliente recalcular o tempo decorrido AO VIVO (vermelho/amarelo). */
  ancoraEm: string | null;
  /** Rótulo do prefixo do contador vivo (ex.: "sem leitura", "sem pedidos"), quando aplicável. */
  ancoraLabel: string | null;
}

/** Dois instantes caem no MESMO dia do calendário no fuso de São Paulo? */
function mesmoDiaSP(a: Date, b: Date): boolean {
  const pa = partesSP(a);
  const pb = partesSP(b);
  return pa.ano === pb.ano && pa.mes === pb.mes && pa.dia === pb.dia;
}

/**
 * Deriva a cor + frase do card de um caminho. Prioridade: inativo → vermelho → (verde recente) →
 * azul (aguardando novos pedidos) → amarelo (sem pedido hoje). `coletorOnline` e a agenda (dias/horário)
 * gateiam o "inativo" para nunca mostrar verde falso.
 */
export function calcularStatusPainel(params: {
  agenda: Agenda;
  gapSemPedidoMin: number;
  resumo: ResumoConfig;
  coletorOnline: boolean;
  agora?: Date;
}): StatusPainel {
  const { agenda, gapSemPedidoMin, resumo, coletorOnline } = params;
  const agora = params.agora ?? new Date();

  if (!coletorOnline) {
    return { cor: "inativo", detalhe: "Coletor offline", ancoraEm: null, ancoraLabel: null };
  }
  if (!estaAtivoAgora(agenda, agora)) {
    return {
      cor: "inativo",
      detalhe: "Fora da janela de acompanhamento",
      ancoraEm: null,
      ancoraLabel: null,
    };
  }

  if (resumo.atrasadoMaisAntigo) {
    const caiu = new Date(resumo.atrasadoMaisAntigo.caiuEm);
    const min = (agora.getTime() - caiu.getTime()) / 60000;
    const extra = resumo.qtdAtrasados > 1 ? ` (+${resumo.qtdAtrasados - 1})` : "";
    return {
      cor: "vermelho",
      detalhe: `Pedido caiu ${formatarHoraSP(caiu)} · ${formatarDuracaoMin(min)} sem leitura${extra}`,
      ancoraEm: resumo.atrasadoMaisAntigo.caiuEm,
      ancoraLabel: "sem leitura",
    };
  }

  if (!resumo.ultimaCaiuEm) {
    return { cor: "amarelo", detalhe: "Sem pedidos hoje", ancoraEm: null, ancoraLabel: null };
  }

  const ultima = new Date(resumo.ultimaCaiuEm);
  const gapMin = (agora.getTime() - ultima.getTime()) / 60000;
  if (gapMin > gapSemPedidoMin) {
    // Saiu do verde. Se passou pedido HOJE → azul (parou, mas já passou); senão → amarelo (sem pedido hoje).
    if (mesmoDiaSP(ultima, agora)) {
      return {
        cor: "azul",
        detalhe: `Passou às ${formatarHoraSP(ultima)} · parado há ${formatarDuracaoMin(gapMin)}`,
        ancoraEm: resumo.ultimaCaiuEm,
        ancoraLabel: "sem novos",
      };
    }
    return {
      cor: "amarelo",
      detalhe: `Sem pedidos hoje · último há ${formatarDuracaoMin(gapMin)}`,
      ancoraEm: resumo.ultimaCaiuEm,
      ancoraLabel: "sem pedidos",
    };
  }

  const detalhe = resumo.ultimaLidaEm
    ? `Último lido às ${formatarHoraSP(new Date(resumo.ultimaLidaEm))}`
    : `Último pedido às ${formatarHoraSP(ultima)}`;
  return { cor: "verde", detalhe, ancoraEm: resumo.ultimaLidaEm ?? resumo.ultimaCaiuEm, ancoraLabel: null };
}

/* ─── Modo 'geracao' (listas de preço/estoque/rota…) ──────────────────────────
 *
 * Diferente da máquina de estados dos pedidos: aqui NÃO há par pendente→lido. Cada LISTA tem um
 * horário limite (deadline) por dia; "gerada" = existe arquivo da extensão com mtime de HOJE (SP).
 * A GERAÇÃO é o sucesso (não há etapa pós). Cores: ⚫ inativo · 🔵 aguardando (dentro do prazo) ·
 * 🟢 gerada hoje · 🔴 atrasada (passou do alvo e não gerou → WhatsApp + re-alerta). Ver handoff.
 */

/** Data 'AAAA-MM-DD' no fuso de São Paulo (chave de dia para a régua da geração). */
function dataRefSP(d: Date): string {
  const p = partesSP(d);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${p.ano}-${z(p.mes)}-${z(p.dia)}`;
}

/** Descrição de UMA lista para casar arquivos (subset relevante à identificação). */
export interface ListaMatch {
  modoIdentificacao: string; // 'extensao' | 'nome'
  nomeArquivo: string | null;
  extensoes: string[];
}

/**
 * Um arquivo pertence a esta lista? No modo 'nome', casa o nome EXATO (case-insensitive). No modo
 * 'extensao', casa qualquer arquivo cuja extensão esteja na lista. É a regra de contagem/detecção.
 */
export function arquivoCasaLista(nome: string, lista: ListaMatch): boolean {
  if (lista.modoIdentificacao === "nome") {
    const alvo = (lista.nomeArquivo ?? "").trim().toLowerCase();
    return alvo !== "" && nome.trim().toLowerCase() === alvo;
  }
  const { ext } = parseArquivo(nome);
  return ext !== "" && lista.extensoes.some((e) => normalizarExtensao(e) === ext);
}

/**
 * Deriva a cor + frase do card de UMA lista, PROJETANDO o estado do dia (`estadoDia`) que o cérebro
 * mantém (fonte da verdade — embute a janela até o limite, a elegibilidade do cadastro tardio e o
 * "vermelho persiste até resolver"). Regras de cor:
 *  - 🔴 atrasado: persiste até gerar (mesmo virando o dia / fora do dia de acompanhamento).
 *  - 🟢 gerado: a contagem de HOJE atingiu a esperada.
 *  - 🔵 aguardando: dentro da janela do dia (00:00→limite) sem gerar; ou "próximo ciclo" (cadastro
 *    tardio) enquanto o cérebro não julga.
 *  - ⚫ inativo: coletor offline, ou dia não marcado (e não está travada).
 */
export function calcularStatusGeracao(params: {
  agenda: Agenda;
  horaAlvo: number;
  minutoAlvo: number;
  estadoDia: EstadoDiaGeracao;
  diaRef: string | null;
  qtdGeradaHoje: number;
  qtdEsperada: number;
  ultimaGeracaoEm: Date | null;
  alertadoEm: Date | null;
  coletorOnline: boolean;
  agora?: Date;
}): StatusPainel {
  const agora = params.agora ?? new Date();
  const hoje = dataRefSP(agora);
  const alvoTxt = formatarHoraMinuto(params.horaAlvo, params.minutoAlvo);
  const esperada = Math.max(1, params.qtdEsperada);
  const geradas = params.diaRef === hoje ? params.qtdGeradaHoje : 0;
  const parcial = esperada > 1 ? ` (${Math.min(geradas, esperada)}/${esperada})` : "";
  // Vira o dia: o que não é 'atrasado' (que persiste) volta a 'aguardando' até o cérebro reavaliar.
  const estado = params.diaRef === hoje ? params.estadoDia : params.estadoDia === "atrasado" ? "atrasado" : "aguardando";

  if (!params.coletorOnline) {
    return { cor: "inativo", detalhe: "Coletor offline", ancoraEm: null, ancoraLabel: null };
  }
  if (estado === "atrasado") {
    const alvo = instanteSP(agora, params.horaAlvo, params.minutoAlvo);
    const ancora = params.alertadoEm ?? alvo;
    const min = (agora.getTime() - ancora.getTime()) / 60000;
    return {
      cor: "vermelho",
      detalhe: `Não gerada — travada há ${formatarDuracaoMin(Math.max(0, min))}${parcial}`,
      ancoraEm: ancora.toISOString(),
      ancoraLabel: "sem geração",
    };
  }
  if (estado === "gerado" && geradas >= esperada) {
    const quando = params.ultimaGeracaoEm && mesmoDiaSP(params.ultimaGeracaoEm, agora) ? params.ultimaGeracaoEm : null;
    return {
      cor: "verde",
      detalhe: quando ? `Gerada às ${formatarHoraSP(quando)}${parcial}` : `Gerada hoje${parcial}`,
      ancoraEm: quando ? quando.toISOString() : null,
      ancoraLabel: null,
    };
  }
  if (!diaMarcado(params.agenda, agora)) {
    return { cor: "inativo", detalhe: "Fora do dia de acompanhamento", ancoraEm: null, ancoraLabel: null };
  }
  const alvo = instanteSP(agora, params.horaAlvo, params.minutoAlvo);
  if (agora.getTime() < alvo.getTime()) {
    return { cor: "azul", detalhe: `Aguardando geração até ${alvoTxt}${parcial}`, ancoraEm: alvo.toISOString(), ancoraLabel: null };
  }
  // Passou do limite mas o cérebro não marcou como atrasada (cadastro tardio) → próximo ciclo.
  return { cor: "azul", detalhe: `Aguardando próximo ciclo (limite ${alvoTxt})${parcial}`, ancoraEm: null, ancoraLabel: null };
}

/**
 * Decide, para UMA lista no instante `agora`, a transição do estado do dia + o que alertar. O
 * vermelho PERSISTE até gerar (a lista só "resolve" quando `geradoHoje`). Cadastro tardio (após o
 * limite de hoje, `elegivelHoje=false`) não vira vermelho hoje — espera o próximo ciclo. Fora do
 * dia de acompanhamento (`diaMonitorado=false`) não emite alertas, mas mantém o vermelho.
 */
export function avaliarGeracao(
  lista: { estado: EstadoDiaGeracao; ultimoAlertaEm: Date | null },
  ctx: {
    geradoHoje: boolean;
    agora: Date;
    deadline: Date;
    elegivelHoje: boolean;
    diaMonitorado: boolean;
    realertaMin: number;
  },
): { novoEstado: EstadoDiaGeracao; alertar: boolean; reAlertar: boolean; resolver: boolean } {
  if (ctx.geradoHoje) {
    return { novoEstado: "gerado", alertar: false, reAlertar: false, resolver: lista.estado === "atrasado" };
  }
  if (!ctx.diaMonitorado) {
    // Dia não marcado: sem alertas, mas o vermelho não some.
    return { novoEstado: lista.estado === "atrasado" ? "atrasado" : "aguardando", alertar: false, reAlertar: false, resolver: false };
  }
  if (lista.estado === "atrasado") {
    const ultimo = lista.ultimoAlertaEm ?? ctx.deadline;
    const reAlertar = (ctx.agora.getTime() - ultimo.getTime()) / 60000 >= Math.max(1, ctx.realertaMin);
    return { novoEstado: "atrasado", alertar: false, reAlertar, resolver: false };
  }
  if (ctx.agora.getTime() < ctx.deadline.getTime()) {
    return { novoEstado: "aguardando", alertar: false, reAlertar: false, resolver: false };
  }
  // Passou do limite e não gerou. Cadastro tardio (não elegível hoje) espera o próximo ciclo.
  if (!ctx.elegivelHoje) {
    return { novoEstado: "aguardando", alertar: false, reAlertar: false, resolver: false };
  }
  return { novoEstado: "atrasado", alertar: true, reAlertar: false, resolver: false };
}

/* ─── Alerta AGREGADO por integração ───────────────────────────────────────────
 *
 * Para não floodar o WhatsApp (risco de bloqueio), o alerta é por INTEGRAÇÃO, não por arquivo:
 * 1 mensagem quando passa a haver travado(s), re-alerta a cada `realertaMin`, e 1 "resolvido"
 * quando zera. O estado do ciclo vive em `monarq_config` (alerta*Em/alerta*UltimoEm).
 */

export type AcaoAlerta = "alerta" | "realerta" | "resolvido" | null;

/**
 * Máquina do alerta agregado (pura). `podeAlertar` gateia iniciar/re-alertar (janela/dia); o
 * "resolvido" dispara sempre que zera (mesmo fora da janela), fechando o ciclo.
 */
export function avaliarAlertaAgregado(
  estado: { alertandoDesde: Date | null; ultimoEnvioEm: Date | null },
  ctx: { qtdTravado: number; realertaMin: number; podeAlertar: boolean; agora: Date },
): { enviar: AcaoAlerta; alertandoDesde: Date | null; ultimoEnvioEm: Date | null } {
  const jaAlertando = estado.alertandoDesde != null;
  if (ctx.qtdTravado > 0) {
    if (!jaAlertando) {
      if (!ctx.podeAlertar) return { enviar: null, alertandoDesde: null, ultimoEnvioEm: null };
      return { enviar: "alerta", alertandoDesde: ctx.agora, ultimoEnvioEm: ctx.agora };
    }
    const ultimo = estado.ultimoEnvioEm ?? estado.alertandoDesde!;
    if (ctx.podeAlertar && (ctx.agora.getTime() - ultimo.getTime()) / 60000 >= Math.max(1, ctx.realertaMin)) {
      return { enviar: "realerta", alertandoDesde: estado.alertandoDesde, ultimoEnvioEm: ctx.agora };
    }
    return { enviar: null, alertandoDesde: estado.alertandoDesde, ultimoEnvioEm: estado.ultimoEnvioEm };
  }
  if (jaAlertando) return { enviar: "resolvido", alertandoDesde: null, ultimoEnvioEm: null };
  return { enviar: null, alertandoDesde: null, ultimoEnvioEm: null };
}

/* ─── Mensagens de WhatsApp (agregadas, genéricas — sem nome de arquivo) ───────── */

/** Alerta/re-alerta/resolvido de PEDIDOS travados de uma integração (contagem, sem nomes). */
export function msgAgregadoPedidos(
  configNome: string,
  qtd: number,
  maisAntigoCaiuEm: Date | null,
  agora: Date,
  categoria: CategoriaAlerta,
): string {
  if (categoria === "resolvido") {
    return `✅ *${configNome}* — pedidos lidos\nTodos os pedidos travados foram lidos pelo ERP.`;
  }
  const s = qtd > 1 ? "s" : "";
  const emoji = categoria === "alerta" ? "🚨" : "⏰";
  const ainda = categoria === "realerta" ? "ainda " : "";
  const linha = maisAntigoCaiuEm
    ? `\nO mais antigo caiu às ${formatarHoraSP(maisAntigoCaiuEm)} · há ${formatarDuracaoMin((agora.getTime() - maisAntigoCaiuEm.getTime()) / 60000)} sem leitura.`
    : "";
  return `${emoji} *${configNome}* — ${qtd} pedido${s} ${ainda}travado${s} no ERP${linha}`;
}

/** Alerta/re-alerta/resolvido de LISTAS não geradas de uma integração (com os rótulos). */
export function msgAgregadoListas(
  configNome: string,
  qtd: number,
  rotulos: string[],
  categoria: CategoriaAlerta,
): string {
  if (categoria === "resolvido") {
    return `✅ *${configNome}* — listas geradas\nTodas as listas pendentes foram geradas.`;
  }
  const s = qtd > 1 ? "s" : "";
  const emoji = categoria === "alerta" ? "🚨" : "⏰";
  const ainda = categoria === "realerta" ? "ainda " : "";
  const nomes = rotulos.length ? `\nListas: ${rotulos.join(", ")}.` : "";
  return `${emoji} *${configNome}* — ${qtd} lista${s} ${ainda}não gerada${s}${nomes}`;
}
