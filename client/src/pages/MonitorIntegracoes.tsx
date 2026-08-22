import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  Archive,
  BellRing,
  CheckCircle2,
  Clock,
  FolderClock,
  FolderCog,
  HelpCircle,
  Image as ImageIcon,
  ListChecks,
  QrCode,
  MoreVertical,
  PackageCheck,
  RadioTower,
  RefreshCw,
  Search,
} from "lucide-react";
import type { ReactNode } from "react";

import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useAuth } from "@/_core/hooks/useAuth";
import { ACTIONS, MODULES, hasPermission } from "@shared/permissions";
import type { StatusCor } from "@shared/monitorArquivos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import KpiGrid from "@/components/KpiGrid";
import KpiCard from "@/components/templates/KpiCard";
import SegmentedTabs from "@/components/SegmentedTabs";
import PanelHeader from "@/components/PanelHeader";
import ConfigModal from "@/components/monitor-arquivos/ConfigModal";
import BackupModal from "@/components/monitor-arquivos/BackupModal";
import WhatsAppModal from "@/components/monitor-arquivos/WhatsAppModal";
import ResumoModal from "@/components/monitor-arquivos/ResumoModal";
import AlertaTelaModal from "@/components/monitor-arquivos/AlertaTelaModal";
import CaminhosGrid from "@/components/monitor-arquivos/CaminhosGrid";
import { statusTitulo } from "@/components/monitor-arquivos/statusVisual";
import CaminhoDetalheModal from "@/components/monitor-arquivos/CaminhoDetalheModal";
import MonitorIntegracoesRulesModal from "./MonitorIntegracoesRulesModal";
import type { ConfigRow, PainelItem, VistaMonitor } from "@/components/monitor-arquivos/types";

/** Descritor de um KPI do topo (drill-down por cor). Um conjunto por visão. */
type KpiDesc = { cor: StatusCor; icon: ReactNode; iconColor: string; valueColor: string; sublabel: string; danger?: boolean };

const KPIS_PEDIDOS: KpiDesc[] = [
  { cor: "vermelho", icon: <AlertTriangle />, iconColor: "text-red-600", valueColor: "text-red-600", sublabel: "pedido caiu e não foi lido", danger: true },
  { cor: "amarelo", icon: <FolderClock />, iconColor: "text-amber-600", valueColor: "text-amber-600", sublabel: "sem pedido hoje" },
  { cor: "azul", icon: <PackageCheck />, iconColor: "text-blue-600", valueColor: "text-blue-600", sublabel: "último pedido há mais de 1 hora" },
  { cor: "verde", icon: <CheckCircle2 />, iconColor: "text-emerald-600", valueColor: "text-emerald-600", sublabel: "pedido na última hora" },
];

const KPIS_LISTAS: KpiDesc[] = [
  { cor: "vermelho", icon: <AlertTriangle />, iconColor: "text-red-600", valueColor: "text-red-600", sublabel: "não gerada após o horário limite", danger: true },
  { cor: "azul", icon: <Clock />, iconColor: "text-blue-600", valueColor: "text-blue-600", sublabel: "dentro do prazo" },
  { cor: "verde", icon: <CheckCircle2 />, iconColor: "text-emerald-600", valueColor: "text-emerald-600", sublabel: "gerada hoje" },
];

export default function MonitorIntegracoes() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  // A modal de configuração só aparece para quem tem TODAS as flags de escrita.
  const podeGerenciar =
    hasPermission(user, MODULES.INDICADORES_MONITOR_ARQUIVOS, ACTIONS.CREATE) &&
    hasPermission(user, MODULES.INDICADORES_MONITOR_ARQUIVOS, ACTIONS.UPDATE) &&
    hasPermission(user, MODULES.INDICADORES_MONITOR_ARQUIVOS, ACTIONS.DELETE);

  // Backup de pedidos é uma feature de ADMIN (mais restrita que "gerenciar").
  const isAdmin = user?.role === "admin";

  const [vista, setVista] = useState<VistaMonitor>("pedidos");
  const [configOpen, setConfigOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [resumoOpen, setResumoOpen] = useState(false);
  const [waOpen, setWaOpen] = useState(false);
  const [alertaTelaOpen, setAlertaTelaOpen] = useState(false);
  const [regrasOpen, setRegrasOpen] = useState(false);
  const [filtroCor, setFiltroCor] = useState<StatusCor | null>(null);
  const [detalheId, setDetalheId] = useState<number | null>(null);
  const [busca, setBusca] = useState("");

  const painel = trpc.monitorArquivos.getPainel.useQuery(undefined, {
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  const mapear = (arr: PainelItem[] | undefined): PainelItem[] =>
    (arr ?? []).map((i) => ({ config: i.config as ConfigRow, status: i.status, resumo: i.resumo }));

  const pedidosItens = useMemo(() => mapear(painel.data?.itens as PainelItem[] | undefined), [painel.data]);
  const listasItens = useMemo(() => mapear(painel.data?.listasItens as PainelItem[] | undefined), [painel.data]);

  // Itens da visão ativa.
  const itens = vista === "listas" ? listasItens : pedidosItens;

  const ZERO: Record<StatusCor, number> = { vermelho: 0, amarelo: 0, azul: 0, verde: 0, inativo: 0 };
  const contarCor = (arr: PainelItem[]) => {
    const c = { ...ZERO };
    for (const it of arr) c[it.status.cor]++;
    return c;
  };
  // Pedidos contam INTEGRAÇÕES; listas contam as LISTAS individuais (vindo do servidor).
  const contagemPedidos = useMemo(() => contarCor(pedidosItens), [pedidosItens]);
  const listasContagem = (painel.data?.listasContagem ?? ZERO) as Record<StatusCor, number>;
  const kpiContagem = vista === "listas" ? listasContagem : contagemPedidos;
  const totalListas = Object.values(listasContagem).reduce((a, b) => a + b, 0);

  const coletorOnline = painel.data?.coletorOnline ?? false;
  const atualizadoEm = painel.data?.atualizadoEm ? new Date(painel.data.atualizadoEm) : null;
  const coletorHeartbeat = painel.data?.coletorUltimoHeartbeat ? new Date(painel.data.coletorUltimoHeartbeat) : null;

  // Configs para a modal de configuração = união das duas visões (dedupe por id).
  const configs: ConfigRow[] = useMemo(() => {
    const porId = new Map<number, ConfigRow>();
    for (const i of [...pedidosItens, ...listasItens]) porId.set(i.config.id, i.config);
    return Array.from(porId.values()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [pedidosItens, listasItens]);

  const detalheItem = useMemo(
    () => [...pedidosItens, ...listasItens].find((i) => i.config.id === detalheId) ?? null,
    [pedidosItens, listasItens, detalheId],
  );

  const kpis = vista === "listas" ? KPIS_LISTAS : KPIS_PEDIDOS;
  const titulos = statusTitulo(vista);

  // Selo pulsante de alerta (círculo vermelho + contagem) — na aba que tiver travados/atrasados,
  // pra o operador perceber mesmo estando na outra aba.
  const badgeAlerta = (n: number) =>
    n > 0 ? (
      <span className="relative ml-1.5 inline-flex items-center justify-center" title={`${n} em alerta`}>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500/60" />
        <span className="relative inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold tabular-nums text-white">
          {n}
        </span>
      </span>
    ) : undefined;

  const toggleFiltro = (cor: StatusCor) => setFiltroCor((c) => (c === cor ? null : cor));
  const trocarVista = (v: string) => {
    setVista(v as VistaMonitor);
    setFiltroCor(null);
    setBusca("");
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-background">
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        {/* Header */}
        <PanelHeader
          onBack={() => setLocation("/indicadores")}
          icon={FolderClock}
          title="Monitor de Integrações"
          subtitle="Acompanhamento de pedidos e listas"
          color="emerald"
          actions={
            <>
            {painel.data && (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-medium",
                  coletorOnline
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300",
                )}
                title={
                  coletorHeartbeat
                    ? `Último sinal: ${coletorHeartbeat.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`
                    : "Sem sinal do coletor"
                }
              >
                <span className="relative flex h-1.5 w-1.5 shrink-0">
                  {coletorOnline && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                  )}
                  <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", coletorOnline ? "bg-emerald-500" : "bg-slate-400")} />
                </span>
                <span className="hidden sm:inline">Coletor&nbsp;</span>
                {coletorOnline ? "online" : "offline"}
              </span>
            )}
            {atualizadoEm && (
              <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex">
                <Clock className="h-3.5 w-3.5" />
                atualizado {atualizadoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-lg text-muted-foreground hover:text-foreground"
              onClick={() => painel.refetch()}
              disabled={painel.isFetching}
            >
              <RefreshCw className={cn("mr-1 h-4 w-4", painel.isFetching && "animate-spin")} />
              <span className="hidden text-xs sm:inline">{painel.isFetching ? "Atualizando..." : "Atualizar"}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-lg text-muted-foreground hover:text-foreground"
              onClick={() => setRegrasOpen(true)}
            >
              <HelpCircle className="mr-1 h-4 w-4" />
              <span className="hidden text-xs sm:inline">Regras</span>
            </Button>
            </>
          }
        />

        {/* Coletor offline */}
        {painel.data && !coletorOnline && (
          <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
            <RadioTower className="h-4 w-4 shrink-0" />
            <span>
              <strong>Coletor offline.</strong> Os status abaixo estão em pausa até o agente voltar a reportar as
              pastas — nenhum alerta é disparado enquanto isso.
            </span>
          </div>
        )}

        {/* Alternador de visão (Pedidos ⇄ Listas) — muda os KPIs, cards e a modal. */}
        <SegmentedTabs
          value={vista}
          onValueChange={trocarVista}
          options={[
            { value: "pedidos", label: "Pedidos", icon: <PackageCheck className="mr-1.5 h-4 w-4" />, badge: badgeAlerta(contagemPedidos.vermelho) },
            { value: "listas", label: "Listas", icon: <ListChecks className="mr-1.5 h-4 w-4" />, badge: badgeAlerta(listasContagem.vermelho) },
          ]}
        />

        {/* KPIs por cor (clicáveis = filtro/drill-down na tabela). Clicar de novo no selecionado
            limpa o filtro. O conjunto muda conforme a visão (pedidos × listas). */}
        <KpiGrid cols={vista === "listas" ? 3 : 4}>
          {kpis.map((k) => {
            const valor = kpiContagem[k.cor];
            const alerta = Boolean(k.danger) && valor > 0;
            return (
              <KpiCard
                key={k.cor}
                title={titulos[k.cor]}
                value={painel.isLoading ? "—" : valor}
                icon={k.icon}
                iconColor={k.iconColor}
                valueClassName={valor > 0 ? k.valueColor : undefined}
                sublabel={k.sublabel}
                onClick={() => toggleFiltro(k.cor)}
                active={filtroCor === k.cor}
                tone={alerta ? "danger" : "default"}
                pulse={alerta}
              />
            );
          })}
        </KpiGrid>

        {/* Tabela de caminhos */}
        {painel.isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded-lg border bg-card" />
            ))}
          </div>
        ) : painel.isError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-10 text-center text-sm text-red-700">
            Não foi possível carregar o painel. Tente Atualizar.
          </div>
        ) : (
          <div className="space-y-3 rounded-xl border bg-card p-3 sm:p-4">
            {/* Barra da tabela: busca + ações (padrão do projeto) */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              {itens.length > 0 ? (
                <div className="relative w-full sm:max-w-sm">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar por nome ou caminho…"
                    className="h-9 pl-8"
                  />
                </div>
              ) : (
                <div className="hidden sm:block" />
              )}
              {podeGerenciar && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-8 gap-1.5 whitespace-nowrap"
                    onClick={() => setConfigOpen(true)}
                  >
                    <FolderCog className="mr-1 h-4 w-4" />
                    Configurar
                  </Button>
                  {isAdmin && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" title="Mais ações" aria-label="Mais ações">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel>Mais ações</DropdownMenuLabel>
                        <DropdownMenuItem
                          className="gap-2"
                          onSelect={(e) => {
                            e.preventDefault();
                            setWaOpen(true);
                          }}
                        >
                          <QrCode className="h-4 w-4" /> Conectar WhatsApp
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="gap-2"
                          onSelect={(e) => {
                            e.preventDefault();
                            setBackupOpen(true);
                          }}
                        >
                          <Archive className="h-4 w-4" /> Backup de pedidos
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="gap-2"
                          onSelect={(e) => {
                            e.preventDefault();
                            setResumoOpen(true);
                          }}
                        >
                          <ImageIcon className="h-4 w-4" /> Resumo diário
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="gap-2"
                          onSelect={(e) => {
                            e.preventDefault();
                            setAlertaTelaOpen(true);
                          }}
                        >
                          <BellRing className="h-4 w-4" /> Alerta em tela
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              )}
            </div>

            {itens.length === 0 ? (
              <div className="rounded-xl border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">
                {vista === "listas" ? "Nenhuma integração com listas ainda." : "Nenhuma integração com pedidos ainda."}
                {podeGerenciar && (
                  <>
                    {" "}
                    Clique em <strong>Configurar</strong> para cadastrar
                    {vista === "listas" ? " uma lista." : " a primeira."}
                  </>
                )}
              </div>
            ) : (
              <CaminhosGrid
                itens={itens}
                busca={busca}
                filtroCor={filtroCor}
                modo={vista}
                contagemCustom={
                  vista === "listas"
                    ? { total: totalListas, filtrado: filtroCor ? listasContagem[filtroCor] : null, unidade: "listas" }
                    : undefined
                }
                onCardClick={(c) => setDetalheId(c.id)}
                onLimparFiltro={() => setFiltroCor(null)}
              />
            )}
          </div>
        )}
      </div>

      {podeGerenciar && (
        <ConfigModal open={configOpen} onOpenChange={setConfigOpen} configs={configs} onChanged={() => painel.refetch()} />
      )}

      {isAdmin && <BackupModal open={backupOpen} onOpenChange={setBackupOpen} />}

      {isAdmin && <ResumoModal open={resumoOpen} onOpenChange={setResumoOpen} />}

      {isAdmin && <WhatsAppModal open={waOpen} onOpenChange={setWaOpen} />}

      {isAdmin && <AlertaTelaModal open={alertaTelaOpen} onClose={() => setAlertaTelaOpen(false)} />}

      <CaminhoDetalheModal
        item={detalheItem}
        onClose={() => setDetalheId(null)}
        podeGerenciar={podeGerenciar}
        onChanged={() => painel.refetch()}
      />

      <MonitorIntegracoesRulesModal
        open={regrasOpen}
        onClose={() => setRegrasOpen(false)}
        podeConfigurar={podeGerenciar}
      />
    </div>
  );
}
