/**
 * Regra PURA do RESUMO DIÁRIO por imagem (submódulo "Monitor de Integrações").
 *
 * Monta o payload que descreve o "cenário de integrações" (pedidos + listas) que a VM
 * transforma numa imagem (Pillow) e envia no WhatsApp no fim da última janela. É pura (sem
 * banco/IO) para ser testável e servir de fonte única do formato — o control plane só coleta
 * os dados (getPainel) e o gateway na VM só desenha o que vier aqui.
 *
 * Contrato do payload (versão `v`): o renderer Python (connector/monitor-wa-gateway/
 * gerar_imagem_monitor.py) consome exatamente estes campos. Ao mudar o formato, suba `v` e
 * ajuste o renderer junto.
 */

import type { StatusCor } from "./monitorArquivos";

/** Uma linha do cenário (uma integração/lista): nome + cor do status + frase curta pronta. */
export type ResumoItem = { nome: string; cor: StatusCor; detalhe: string };

/** Contagem por cor (KPIs de uma seção). */
export type ResumoKpis = Record<StatusCor, number>;

/** Uma seção da imagem (Pedidos ou Listas). */
export type ResumoSecao = {
  /** Se a seção deve ser desenhada (respeita incluirPedidos/incluirListas + ter itens). */
  mostrar: boolean;
  kpis: ResumoKpis;
  itens: ResumoItem[];
};

/** Payload completo enviado à VM (serializado em monarq_wa_outbox.mensagem quando categoria='resumo'). */
export type ResumoImagemPayload = {
  v: 1;
  geradoEm: string;
  titulo: string;
  pedidos: ResumoSecao;
  listas: ResumoSecao;
  /** Texto curto que acompanha a imagem (caption do WhatsApp). */
  caption: string;
};

/** Ordem "pior primeiro" para ordenar os itens e ler o cenário de relance. */
const ORDEM_COR: Record<StatusCor, number> = {
  vermelho: 0,
  amarelo: 1,
  azul: 2,
  verde: 3,
  inativo: 4,
};

const ZERO_KPIS = (): ResumoKpis => ({ vermelho: 0, amarelo: 0, azul: 0, verde: 0, inativo: 0 });

function contarPorCor(itens: ResumoItem[]): ResumoKpis {
  const k = ZERO_KPIS();
  for (const i of itens) k[i.cor]++;
  return k;
}

function ordenarPiorPrimeiro(itens: ResumoItem[]): ResumoItem[] {
  return [...itens].sort((a, b) => {
    const d = ORDEM_COR[a.cor] - ORDEM_COR[b.cor];
    return d !== 0 ? d : a.nome.localeCompare(b.nome, "pt-BR");
  });
}

/** "🔴1 🟡0 🔵2 🟢9 ⚫0" — resumo compacto por cor (omite as cores zeradas, exceto vermelho). */
function chipsKpi(k: ResumoKpis): string {
  const partes: string[] = [];
  const push = (emoji: string, cor: StatusCor, sempre = false) => {
    if (sempre || k[cor] > 0) partes.push(`${emoji}${k[cor]}`);
  };
  push("🔴", "vermelho", true);
  push("🟡", "amarelo");
  push("🔵", "azul");
  push("🟢", "verde");
  push("⚫", "inativo");
  return partes.join(" ");
}

export type MontarResumoInput = {
  geradoEm: string;
  /** Integrações da visão "Pedidos" (uma linha por integração). */
  pedidosItens: ResumoItem[];
  /** Integrações da visão "Listas" (card agregado por integração). */
  listasItens: ResumoItem[];
  /** KPIs das LISTAS individuais (granularidade por lista, calculada no cérebro). */
  listasKpis: ResumoKpis;
};

export type MontarResumoOpts = {
  incluirPedidos: boolean;
  incluirListas: boolean;
  titulo?: string;
};

/**
 * Monta o payload da imagem do resumo. Os KPIs de Pedidos são contados aqui (por cor das
 * integrações); os de Listas vêm prontos do cérebro (contam LISTAS, não integrações). Itens
 * ordenados "pior primeiro". Uma seção só é `mostrar` se incluída E tiver itens.
 */
export function montarResumoImagem(input: MontarResumoInput, opts: MontarResumoOpts): ResumoImagemPayload {
  const titulo = opts.titulo?.trim() || "Cenário de Integrações";

  const pedidos: ResumoSecao = {
    mostrar: opts.incluirPedidos && input.pedidosItens.length > 0,
    kpis: contarPorCor(input.pedidosItens),
    itens: ordenarPiorPrimeiro(input.pedidosItens),
  };
  const listas: ResumoSecao = {
    mostrar: opts.incluirListas && input.listasItens.length > 0,
    kpis: input.listasKpis,
    itens: ordenarPiorPrimeiro(input.listasItens),
  };

  const linhasCaption: string[] = [titulo];
  if (pedidos.mostrar) linhasCaption.push(`Pedidos: ${chipsKpi(pedidos.kpis)}`);
  if (listas.mostrar) linhasCaption.push(`Listas: ${chipsKpi(listas.kpis)}`);

  return {
    v: 1,
    geradoEm: input.geradoEm,
    titulo,
    pedidos,
    listas,
    caption: linhasCaption.join("\n"),
  };
}
