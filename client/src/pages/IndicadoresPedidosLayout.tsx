import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { ACTIONS, MODULES, hasPermission } from "@shared/permissions";
import AlertaCfvConfigModal from "@/components/AlertaCfvConfigModal";
import {
  RefreshCw,
  ShoppingCart,
  DollarSign,
  Receipt,
  Crown,
  Clock,
  AlertTriangle,
  ChevronRight,
  X,
  Settings,
} from "lucide-react";

import { trpc } from "@/lib/trpc";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import KpiCard from "@/components/templates/KpiCard";
import KpiGrid from "@/components/KpiGrid";
import SegmentedTabs from "@/components/SegmentedTabs";
import PanelHeader from "@/components/PanelHeader";
import FreshnessStamp from "@/components/FreshnessStamp";
import Donut from "@/components/Donut";
import { variacaoPct, type PontoHistorico } from "@shared/indicadoresHistorico";

type RegionView = "SC" | "RS" | "UNIFICADO";
type Ordenacao = "valor" | "eficiencia";

const REAL = (v: number) => `R$ ${formatCurrency(v)}`;
const pctBr = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;

/** Cores do split aceitos×cortados. */
const COR_ACEITO = "#4f46e5"; // indigo-600
const COR_CORTADO = "#e11d48"; // rose-400

/** Brilho 3D das barras (glossy): highlight no topo + sombra embaixo, aplicado sobre a cor base. */
const GLOSS = "linear-gradient(180deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.08) 45%, rgba(0,0,0,0.18) 100%)";

/** Limiar (%) a partir do qual o índice de corte é considerado "alto" (card Atenção). */
const CORTE_ALTO = 20;

/** Taxa de corte = cortados ÷ (aceitos + cortados), em %. Serve p/ qtd OU valor. */
const taxaCorte = (aceito: number, cortado: number): number => {
  const total = aceito + cortado;
  return total > 0 ? (cortado / total) * 100 : 0;
};

/** Cor do anel de corte por faixa: verde (bom) → âmbar (atenção) → vermelho (crítico). */
const corCorte = (pct: number): string => (pct < 10 ? "#059669" : pct < CORTE_ALTO ? "#d97706" : "#e11d48");

/** Formata o carimbo ISO ("2026-07-22T15:53:00") para "15:53". */
function horaCurta(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Delta (últimos 2 pontos) + série, a partir do histórico. */
function tendencia(serie: PontoHistorico[], pick: (p: PontoHistorico) => number): { delta: number | null; spark: number[] } {
  const spark = serie.map(pick);
  const n = spark.length;
  const delta = n >= 2 ? variacaoPct(spark[n - 1]!, spark[n - 2]!) : null;
  return { delta, spark };
}

export default function IndicadoresPedidosLayout() {
  const [, setLocation] = useLocation();
  const [activeRegion, setActiveRegion] = useState<RegionView>("UNIFICADO");
  const [ordenacao, setOrdenacao] = useState<Ordenacao>("valor");
  const [selectedLayout, setSelectedLayout] = useState<string | null>(null);
  const [focoCritico, setFocoCritico] = useState(false);
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const [configAlertaOpen, setConfigAlertaOpen] = useState(false);

  const { user } = useAuth();
  const podeConfigurarAlerta =
    hasPermission(user, MODULES.INDICADORES_PEDIDOS_LAYOUT, ACTIONS.CREATE) &&
    hasPermission(user, MODULES.INDICADORES_PEDIDOS_LAYOUT, ACTIONS.UPDATE) &&
    hasPermission(user, MODULES.INDICADORES_PEDIDOS_LAYOUT, ACTIONS.DELETE);

  // Cadência do auto-refresh do painel (requisição à API). Ajuste SÓ aqui — o rodapé usa o mesmo
  // valor automaticamente. Ex.: 60_000 = 1 min, 5 * 60_000 = 5 min.
  const REFRESH_MS = 5 * 60_000;
  const query = trpc.indicadores.getPedidosPorLayout.useQuery(undefined, {
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: true,
    staleTime: REFRESH_MS,
  });
  // Histórico (14 dias, mesmo-horário) — deltas + sparklines. Nasce vazio e vai acumulando.
  const histQuery = trpc.indicadores.getHistoricoLayout.useQuery(undefined, {
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  const regiao = query.data?.regioes[activeRegion];
  const serieHist = histQuery.data?.[activeRegion] ?? [];

  const dados = useMemo(() => {
    const linhas = regiao?.linhas ?? [];
    const totalPedidos = linhas.reduce((a, l) => a + l.qtdPedidos, 0); // aceitos
    const totalValor = linhas.reduce((a, l) => a + l.valorPedido, 0); // aceitos
    const totalCortQtd = linhas.reduce((a, l) => a + l.qtdCortados, 0);
    const totalCortValor = linhas.reduce((a, l) => a + l.valorCortados, 0);
    const totalDia = linhas.reduce((a, l) => a + l.qtdTotal, 0); // total de pedidos do dia (1018)

    // Cada linha carrega a taxa de corte por QUANTIDADE e por VALOR (ênfase no valor).
    const comCorte = linhas.map((l) => ({
      ...l,
      corte: taxaCorte(l.qtdPedidos, l.qtdCortados), // qtd (secundário)
      corteValor: taxaCorte(l.valorPedido, l.valorCortados), // valor (ênfase)
    }));
    const ordenadas = [...comCorte].sort((a, b) =>
      ordenacao === "valor" ? b.valorPedido - a.valorPedido : a.corteValor - b.corteValor,
    );
    const lider = [...comCorte].sort((a, b) => b.valorPedido - a.valorPedido)[0] ?? null;
    const criticos = comCorte.filter((l) => l.corteValor >= CORTE_ALTO).sort((a, b) => b.corteValor - a.corteValor);

    return { totalPedidos, totalValor, totalCortQtd, totalCortValor, totalDia, ordenadas, lider, criticos };
  }, [regiao, ordenacao]);

  const selecionada = selectedLayout ? dados.ordenadas.find((l) => l.layout === selectedLayout) ?? null : null;
  // "Total de Pedidos" = total do dia (1018); Valor/Ticket = base aceitos.
  const baseTotalQtd = selecionada ? selecionada.qtdTotal : dados.totalDia;
  const baseAceitos = selecionada
    ? { qtd: selecionada.qtdPedidos, valor: selecionada.valorPedido }
    : { qtd: dados.totalPedidos, valor: dados.totalValor };
  const baseCortados = selecionada
    ? { qtd: selecionada.qtdCortados, valor: selecionada.valorCortados }
    : { qtd: dados.totalCortQtd, valor: dados.totalCortValor };
  const ticket = (b: { qtd: number; valor: number }) => (b.qtd > 0 ? b.valor / b.qtd : 0);

  // Tendências (só na visão agregada — o histórico é por região, não por layout).
  const tPedidos = tendencia(serieHist, (p) => p.total); // total do dia
  const tValor = tendencia(serieHist, (p) => p.valor);
  const tTicket = tendencia(serieHist, (p) => (p.qtd > 0 ? p.valor / p.qtd : 0));
  const semSelecao = !selecionada;

  // Dois horários distintos no header: sincronização (quando o servidor buscou na API — freshness do
  // dado) × pedido mais recente (max dtHora). Ver FreshnessStamp.
  const sincronizadoEm = horaCurta(query.data?.buscadoEm ?? null);
  const ultimoPedidoEm = horaCurta(regiao?.atualizadoEm ?? query.data?.atualizadoEm ?? null);

  // Alerta CFV: busca config para saber o gap e aplicar destaque pulsante no campo hora.
  const alertaCfvConfig = trpc.indicadores.getAlertaCfvConfig.useQuery(undefined, {
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  /** Verifica se um layout+região está em alerta (gap excedido) — MESMA regra do overlay/servidor. */
  function layoutEmAlerta(layout: string, dtHora: string | null): boolean {
    const cfg = alertaCfvConfig.data;
    if (!cfg || !cfg.ativo) return false;
    // Verifica se o layout está na lista monitorada
    const match = cfg.layouts.some((l: string) => layout.toUpperCase().includes(l.toUpperCase()));
    if (!match) return false;
    // Verifica se a região ativa está monitorada
    if (activeRegion !== "UNIFICADO" && !cfg.regioes.includes(activeRegion)) return false;
    // Só destaca DENTRO da janela/dias configurados (fuso SP) — igual ao overlay e ao disparo server-side.
    const sp = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    if (!cfg.diasSemana.includes(sp.getDay())) return false;
    const h = sp.getHours();
    if (h < cfg.horaInicio || h >= cfg.horaFim) return false;
    if (!dtHora) return true; // sem pedidos hoje (dentro da janela) = alerta
    const diffMin = (Date.now() - new Date(dtHora).getTime()) / 60000;
    return diffMin >= cfg.gapMinutos;
  }

  const loading = query.isLoading;
  const vazio = !loading && (regiao?.linhas.length ?? 0) === 0;

  const hoje = new Date().toLocaleDateString("pt-BR");
  const desde = histQuery.data?.desde
    ? new Date(histQuery.data.desde + "T12:00:00").toLocaleDateString("pt-BR")
    : null;

  const listaVisivel = useMemo(() => {
    let arr = dados.ordenadas;
    if (focoCritico) arr = arr.filter((l) => l.corteValor >= CORTE_ALTO);
    return mostrarTodos ? arr : arr.slice(0, 5);
  }, [dados.ordenadas, focoCritico, mostrarTodos]);
  const totalLayouts = focoCritico ? dados.criticos.length : dados.ordenadas.length;

  // Distribuição geral POR VALOR (ênfase no valor); a quantidade fica como contexto no centro.
  const distValAceito = dados.totalValor;
  const distValCortado = dados.totalCortValor;
  const distValTotal = distValAceito + distValCortado;
  const pctValAceito = distValTotal > 0 ? (distValAceito / distValTotal) * 100 : 0;
  const qtdGeralPedidos = dados.totalPedidos + dados.totalCortQtd;

  return (
    <>
    <div className="min-h-screen bg-slate-50 dark:bg-background">
      <div className="mx-auto max-w-7xl 2xl:max-w-[1600px] min-[1920px]:max-w-[1800px] min-[2560px]:max-w-[2200px] space-y-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        {/* Header */}
        <PanelHeader
          onBack={() => setLocation("/indicadores")}
          icon={ShoppingCart}
          title="Pedidos por Layout"
          subtitle="Pedidos do dia por layout"
          color="indigo"
          actions={
            <>
              <FreshnessStamp
                primary={sincronizadoEm}
                primaryLabel="Atualizado às"
                primaryTitle="Última sincronização do painel com a API"
                secondary={ultimoPedidoEm}
                secondaryLabel="último pedido"
                secondaryTitle="Horário do pedido mais recente"
                live={!query.isError}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rounded-lg text-muted-foreground hover:text-foreground"
                onClick={() => {
                  query.refetch();
                  histQuery.refetch();
                }}
                disabled={query.isFetching}
                title="Atualizar os dados do painel pela API"
              >
                <RefreshCw className={cn("mr-1 h-4 w-4", query.isFetching && "animate-spin")} />
                <span className="hidden text-xs sm:inline">{query.isFetching ? "Atualizando..." : "Atualizar"}</span>
              </Button>
              {podeConfigurarAlerta && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="rounded-lg text-muted-foreground hover:text-foreground"
                  onClick={() => setConfigAlertaOpen(true)}
                  title="Configurar alerta CFV"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              )}
            </>
          }
        />

        {/* Region Tabs */}
        <SegmentedTabs
          value={activeRegion}
          onValueChange={(v) => {
            setActiveRegion(v as RegionView);
            setSelectedLayout(null);
          }}
          options={[
            { value: "SC", label: "SC" },
            { value: "RS", label: "RS" },
            { value: "UNIFICADO", label: "Unificado" },
          ]}
        />

        {query.isError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-10 text-center text-sm text-red-700">
            Não foi possível carregar os pedidos. Tente Atualizar.
          </div>
        ) : (
          <>
            {/* KPIs */}
            <KpiGrid cols={4}>
              <KpiCard
                title="Total de Pedidos"
                value={loading ? "—" : formatNumber(baseTotalQtd)}
                unit="pedidos"
                icon={<ShoppingCart />}
                iconColor="text-indigo-600"
                loading={loading}
                sublabel={
                  <span className="tabular-nums text-rose-400">
                    {formatNumber(baseCortados.qtd)} cortados · {pctBr(taxaCorte(baseAceitos.qtd, baseCortados.qtd))}
                  </span>
                }
                delta={semSelecao ? tPedidos.delta : undefined}
                sparkline={semSelecao ? tPedidos.spark : undefined}
                deltaLabel="vs. período anterior"
              />
              <KpiCard
                title="Valor Total"
                value={loading ? "—" : REAL(baseAceitos.valor)}
                icon={<DollarSign />}
                iconColor="text-emerald-600"
                loading={loading}
                sublabel={
                  <span className="tabular-nums text-rose-400">
                    {REAL(baseCortados.valor)} cortados · {pctBr(taxaCorte(baseAceitos.valor, baseCortados.valor))}
                  </span>
                }
                delta={semSelecao ? tValor.delta : undefined}
                sparkline={semSelecao ? tValor.spark : undefined}
                deltaLabel="vs. período anterior"
              />
              <KpiCard
                title="Ticket Médio"
                value={loading ? "—" : REAL(ticket(baseAceitos))}
                icon={<Receipt />}
                iconColor="text-sky-600"
                tooltip="Valor total dividido pela quantidade de pedidos aceitos. Em rosa, o ticket médio dos cortados."
                loading={loading}
                sublabel={
                  <span className="tabular-nums text-rose-400">{REAL(ticket(baseCortados))} ticket cortados</span>
                }
                delta={semSelecao ? tTicket.delta : undefined}
                sparkline={semSelecao ? tTicket.spark : undefined}
                deltaLabel="vs. período anterior"
              />
              {selecionada ? (
                <KpiCard
                  title="Layout selecionado"
                  value={selecionada.layout}
                  valueTitle={selecionada.layout}
                  icon={<Crown />}
                  iconColor="text-indigo-600"
                  loading={loading}
                  valueClassName="truncate text-xl"
                  sublabel={
                    <span className="tabular-nums text-rose-400">{pctBr(selecionada.corteValor)} corte (valor)</span>
                  }
                />
              ) : (
                <KpiCard
                  title="Layout destaque"
                  value={loading ? "—" : dados.lider?.layout ?? "—"}
                  valueTitle={dados.lider?.layout}
                  icon={<Crown />}
                  iconColor="text-amber-500"
                  loading={loading}
                  valueClassName="truncate text-xl"
                  sublabel={
                    dados.lider ? (
                      <>
                        <span className="block tabular-nums text-slate-600 dark:text-slate-300">
                          {formatNumber(dados.lider.qtdTotal)} pedidos · {REAL(dados.lider.valorPedido)}
                        </span>
                        <span className="block tabular-nums text-rose-400">{pctBr(dados.lider.corteValor)} corte (valor)</span>
                      </>
                    ) : undefined
                  }
                />
              )}
            </KpiGrid>

            {/* Corpo: ranking + sidebar */}
            <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
              {/* Ranking */}
              <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-foreground">Ranking por layout</h2>
                    {selectedLayout && (
                      <button
                        type="button"
                        onClick={() => setSelectedLayout(null)}
                        className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300"
                      >
                        <X className="h-3 w-3" />
                        Limpar seleção
                      </button>
                    )}
                    {focoCritico && (
                      <button
                        type="button"
                        onClick={() => setFocoCritico(false)}
                        className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
                      >
                        <X className="h-3 w-3" />
                        Só corte alto
                      </button>
                    )}
                  </div>
                  {/* Ordenação */}
                  <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
                    {(["valor", "eficiencia"] as Ordenacao[]).map((o) => (
                      <button
                        key={o}
                        type="button"
                        onClick={() => setOrdenacao(o)}
                        className={cn(
                          "rounded-md px-3 py-1 text-xs font-medium transition",
                          ordenacao === o
                            ? "bg-white text-indigo-700 shadow-sm dark:bg-slate-700 dark:text-indigo-300"
                            : "text-slate-500 hover:text-slate-700 dark:text-slate-400",
                        )}
                      >
                        {o === "valor" ? "Por valor" : "Por eficiência"}
                      </button>
                    ))}
                  </div>
                </div>

                {loading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="h-16 animate-pulse rounded-lg border bg-muted" />
                    ))}
                  </div>
                ) : vazio ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Sem pedidos registrados{sincronizadoEm ? ` até as ${sincronizadoEm}` : ""}.
                  </p>
                ) : (
                  <>
                    {/* Cabeçalho de colunas (só em telas maiores). */}
                    <div className="hidden items-center gap-3 border-b border-border px-2 pb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:flex">
                      <span className="w-7 shrink-0 text-center">#</span>
                      <span className="min-w-0 flex-1">Layout</span>
                      <span className="hidden w-16 shrink-0 text-right md:block">Pedidos</span>
                      <span className="hidden w-28 shrink-0 text-right md:block">Valor (R$)</span>
                      <span className="w-28 shrink-0 text-center">Índice de corte</span>
                      <span className="w-4 shrink-0" />
                    </div>

                    <div className="divide-y divide-border">
                      {listaVisivel.map((l) => {
                        const pctCortadoValor = l.corteValor; // ênfase no valor (cilindro e anel batem)
                        const pctAceitoValor = 100 - pctCortadoValor;
                        const rank = focoCritico ? dados.criticos.indexOf(l) + 1 : dados.ordenadas.indexOf(l) + 1;
                        const sel = selectedLayout === l.layout;
                        const hora = horaCurta(l.dtHora);
                        return (
                          <div key={l.layout}>
                            <button
                              type="button"
                              onClick={() => setSelectedLayout((cur) => (cur === l.layout ? null : l.layout))}
                              aria-pressed={sel}
                              className={cn(
                                "flex w-full items-center gap-3 px-2 py-3 text-left transition-colors",
                                sel ? "bg-indigo-50/60 dark:bg-indigo-950/30" : "hover:bg-accent/40",
                              )}
                            >
                              {/* # */}
                              <span className="flex w-7 shrink-0 justify-center">
                                <span
                                  className={cn(
                                    "flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold tabular-nums",
                                    rank === 1
                                      ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                                      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
                                  )}
                                >
                                  {rank}
                                </span>
                              </span>

                              {/* Layout: nome + HORA centralizada sobre o cilindro + cilindro (por valor) + %s */}
                              <div className="min-w-0 flex-1">
                                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1">
                                  <span className="truncate text-sm font-semibold text-foreground" title={l.layout}>
                                    {l.layout}
                                  </span>
                                  {hora ? (
                                    <span className={cn(
                                      "inline-flex items-center gap-1 justify-self-center whitespace-nowrap text-[11px]",
                                      layoutEmAlerta(l.layout, l.dtHora)
                                        ? "animate-pulse rounded-md bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                                        : "text-muted-foreground",
                                    )}>
                                      <Clock className="h-3 w-3" />
                                      {hora}
                                    </span>
                                  ) : (
                                    <span />
                                  )}
                                  <span />
                                </div>
                                <div className="mt-1.5 flex h-4 w-full overflow-hidden rounded-full bg-slate-100 shadow-inner ring-1 ring-black/5 dark:bg-slate-800 dark:ring-white/10">
                                  <div style={{ width: `${pctAceitoValor}%`, backgroundColor: COR_ACEITO, backgroundImage: GLOSS }} />
                                  <div style={{ width: `${pctCortadoValor}%`, backgroundColor: COR_CORTADO, backgroundImage: GLOSS }} />
                                </div>
                                <div className="mt-1 flex justify-between text-[11px] tabular-nums">
                                  <span style={{ color: COR_ACEITO }}>{pctBr(pctAceitoValor)} aceitos</span>
                                  <span className="text-rose-500">{pctBr(pctCortadoValor)} cortados</span>
                                </div>
                                {/* No mobile, Pedidos/Valor não têm coluna própria — mostram aqui. */}
                                <div className="mt-1 text-[11px] tabular-nums text-muted-foreground md:hidden">
                                  {formatNumber(l.qtdTotal)} pedidos · {REAL(l.valorPedido)}
                                </div>
                              </div>

                              {/* Pedidos (total do dia) */}
                              <span className="hidden w-16 shrink-0 text-right text-sm font-semibold tabular-nums text-foreground md:block">
                                {formatNumber(l.qtdTotal)}
                              </span>
                              {/* Valor */}
                              <span className="hidden w-28 shrink-0 text-right text-sm font-semibold tabular-nums text-foreground md:block">
                                {REAL(l.valorPedido)}
                              </span>

                              {/* Índice de corte (POR VALOR): anel + número ao lado */}
                              <span className="flex w-28 shrink-0 items-center justify-center gap-2">
                                <Donut
                                  size={40}
                                  thickness={6}
                                  total={100}
                                  glossy
                                  segments={[{ value: l.corteValor, color: corCorte(l.corteValor) }]}
                                />
                                <span className="leading-tight">
                                  <span className="block text-sm font-bold tabular-nums" style={{ color: corCorte(l.corteValor) }}>
                                    {pctBr(l.corteValor)}
                                  </span>
                                  <span className="block text-[10px] text-muted-foreground">corte</span>
                                </span>
                              </span>

                              <ChevronRight
                                className={cn(
                                  "h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform",
                                  sel && "rotate-90 text-indigo-500",
                                )}
                              />
                            </button>

                            {/* Foco no layout: detalhe inline (mantém a linha, as colunas e o cilindro). */}
                            {sel && (
                              <div className="border-t border-indigo-200/60 bg-indigo-50/40 px-3 py-2.5 dark:border-indigo-900/50 dark:bg-indigo-950/20">
                                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
                                  <div>
                                    <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                                      Aceitos
                                    </span>
                                    <span className="tabular-nums" style={{ color: COR_ACEITO }}>
                                      {formatNumber(l.qtdPedidos)} ped · {REAL(l.valorPedido)}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                                      Cortados
                                    </span>
                                    <span className="tabular-nums text-rose-500">
                                      {formatNumber(l.qtdCortados)} ped · {REAL(l.valorCortados)}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                                      Índice de corte
                                    </span>
                                    <span className="tabular-nums text-foreground">
                                      {pctBr(l.corteValor)} <span className="text-muted-foreground">valor</span> ·{" "}
                                      {pctBr(l.corte)} <span className="text-muted-foreground">qtd</span>
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {totalLayouts > 5 && (
                      <div className="mt-3 text-center">
                        <Button variant="outline" size="sm" onClick={() => setMostrarTodos((v) => !v)}>
                          {mostrarTodos ? "Ver menos" : `Ver todos os layouts (${totalLayouts})`}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Sidebar */}
              <div className="space-y-4">
                {/* Atenção */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-rose-500" />
                    <h3 style={{ color: COR_CORTADO }} className="text-sm font-semibold text-foreground">Atenção</h3>
                  </div>
                  {dados.criticos.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Nenhum layout com corte (valor) acima de {CORTE_ALTO}%
                    </p>
                  ) : (
                    <>
                      <p className="mb-2 text-xs text-muted-foreground">
                        {dados.criticos.length} layout(s) com corte (valor) acima de {CORTE_ALTO}%
                      </p>
                      <ul className="space-y-1.5">
                        {dados.criticos.slice(0, 5).map((l) => (
                          <li key={l.layout}>
                            <button
                              type="button"
                              onClick={() => setSelectedLayout((cur) => (cur === l.layout ? null : l.layout))}
                              aria-pressed={selectedLayout === l.layout}
                              className={cn(
                                "flex w-full items-center justify-between gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-accent/40",
                                selectedLayout === l.layout && "bg-indigo-50 dark:bg-indigo-950/40",
                              )}
                            >
                              <span className="truncate text-xs font-medium text-foreground" title={l.layout}>
                                {l.layout}
                              </span>
                              <span className="flex shrink-0 items-center gap-1 text-xs font-semibold tabular-nums text-rose-600">
                                {pctBr(l.corteValor)}
                                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "mt-3 w-full border-rose-300 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/40",
                          focoCritico &&
                            "border-rose-600 bg-rose-600 text-white hover:bg-rose-700 hover:text-white dark:border-rose-600 dark:bg-rose-600 dark:text-white",
                        )}
                        aria-pressed={focoCritico}
                        onClick={() =>
                          setFocoCritico((v) => {
                            const next = !v;
                            setMostrarTodos(next);
                            return next;
                          })
                        }
                      >
                        {focoCritico ? "Remover filtro" : "Ver detalhes"}
                      </Button>
                    </>
                  )}
                </div>

                {/* Distribuição geral (POR VALOR) */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="mb-3 text-sm font-semibold text-foreground">Distribuição geral</h3>
                  {distValTotal === 0 ? (
                    <p className="text-xs text-muted-foreground">Sem dados no período.</p>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <Donut
                        size={132}
                        thickness={14}
                        glossy
                        segments={[
                          { value: distValAceito, color: COR_ACEITO },
                          { value: distValCortado, color: COR_CORTADO },
                        ]}
                        centerLabel={<span className="text-[13px]">{REAL(distValTotal)}</span>}
                        centerSub={`${formatNumber(qtdGeralPedidos)} ped`}
                      />
                      <div className="grid w-full grid-cols-2 gap-2 text-center text-xs">
                        <div>
                          <span className="inline-flex items-center gap-1 font-medium" style={{ color: COR_ACEITO }}>
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COR_ACEITO }} /> Aceitos
                          </span>
                          <p style={{ color: COR_ACEITO }} className="tabular-nums font-semibold text-foreground">{REAL(distValAceito)}</p>
                          <p style={{ color: COR_ACEITO }} className="tabular-nums font-semibold text-[10px] text-muted-foreground">{pctBr(pctValAceito)}</p>
                        </div>
                        <div>
                          <span className="inline-flex items-center gap-1 font-medium text-rose-500">
                            <span className="h-2 w-2 rounded-full bg-rose-400" /> Cortados
                          </span>
                          <p style={{ color: COR_CORTADO }} className="tabular-nums font-semibold text-foreground">{REAL(distValCortado)}</p>
                          <p style={{ color: COR_CORTADO }} className="tabular-nums font-semibold text-[10px] text-muted-foreground">{pctBr(100 - pctValAceito)}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Período */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="mb-1 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-muted-foreground">Período analisado</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">Hoje · {hoje}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {desde ? `Histórico desde ${desde} (comparações e tendência).` : "Histórico começa a acumular hoje."}
                  </p>
                </div>
              </div>
            </div>

            <p className="text-center text-[11px] text-muted-foreground">
              Os dados do dia são atualizados automaticamente a cada {Math.round(REFRESH_MS / 60_000)} min. Tendência baseada em fotos de 30 min (08:00–22:00).
            </p>
          </>
        )}
      </div>
    </div>

    {/* Modal de configuração do alerta CFV */}
    {podeConfigurarAlerta && (
      <AlertaCfvConfigModal open={configAlertaOpen} onClose={() => setConfigAlertaOpen(false)} />
    )}
    </>
  );
}
