import type { ResumoConfig, StatusPainel } from "@shared/monitorArquivos";

/**
 * Tipos compartilhados do submódulo "Monitor de Integrações" no cliente (fonte única — evita
 * import circular entre o formulário, a tabela e as modais).
 */

/** Config de um caminho monitorado (subset relevante ao cliente; espelha `monarq_config`). */
export interface ConfigRow {
  id: number;
  nome: string;
  caminho: string;
  tipoMonitoramento: string;
  extensoesPendente: string[];
  extensaoLida: string;
  intervaloVarreduraSeg: number;
  slaLeituraMin: number;
  gapSemPedidoMin: number;
  realertaMin: number;
  diasSemana: number[] | null;
  horaInicio: number;
  horaFim: number;
  waContaId: string;
  ativo: boolean;
}

/** Item do painel: config + status "bate o olho" + resumo agregado (vindo de `getPainel`). */
export interface PainelItem {
  config: ConfigRow;
  status: StatusPainel;
  resumo: ResumoConfig;
}

/** Uma lista no formulário (`id` ausente = linha nova). Espelha `monarq_lista`. */
export interface ListaRow {
  id?: number;
  rotulo: string;
  caminho: string;
  /** 'extensao' (conta arquivos da extensão) | 'nome' (nome exato). */
  modoIdentificacao: string;
  nomeArquivo: string | null;
  extensoes: string[];
  quantidadeEsperada: number;
  horaAlvo: number;
  minutoAlvo: number;
  realertaMin: number;
  ativo: boolean;
}

/** Lista + status "bate o olho" calculado (vindo de `getListas`) — usado na modal de detalhe. */
export interface ListaComStatus extends ListaRow {
  id: number;
  qtdGeradaHoje: number;
  /** Como a geração de hoje foi detectada: 'arquivo' (reconheceu) | 'pasta' (mtime da pasta) | null. */
  deteccao: "arquivo" | "pasta" | null;
  ultimaGeracaoEm: string | null;
  ultimoArquivo: string | null;
  status: StatusPainel;
}

/** Visão do painel: pedidos (máquina .ped→._RM) ou listas (geração por horário limite). */
export type VistaMonitor = "pedidos" | "listas";
