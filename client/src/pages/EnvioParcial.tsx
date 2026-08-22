import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import WhatsAppContasModal from "@/components/WhatsAppContasModal";
import ConfirmDialog from "@/components/ConfirmDialog";
import PanelHeader from "@/components/PanelHeader";
import SegmentedTabs from "@/components/SegmentedTabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Send,
  Play,
  Pause,
  Save,
  Clock,
  UsersRound,
  UserPlus,
  Contact,
  QrCode,
  Image as ImageIcon,
  ScrollText,
  Wifi,
  WifiOff,
  MapPin,
  RotateCcw,
  LogOut,
  Plus,
  Trash2,
  Pencil,
  Filter,
  MoreVertical,
  RefreshCw,
  Check,
  Search,
  Eye,
  EyeOff,
} from "lucide-react";

type RO = inferRouterOutputs<AppRouter>;
type EnvioData = RO["parcial"]["listEnvios"][number];
type Vinculo = RO["parcial"]["listVinculos"][number];
type Contato = RO["parcial"]["listContatos"][number];

type StatusBot = "iniciando" | "rodando" | "pausado" | "aguardando_qr" | "reconectando" | "erro_banco";

const STATUS_META: Record<StatusBot, { label: string; cls: string }> = {
  iniciando: { label: "Iniciando", cls: "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300" },
  rodando: { label: "Rodando", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" },
  pausado: { label: "Pausado", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" },
  aguardando_qr: { label: "Aguardando QR", cls: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400" },
  reconectando: { label: "Reconectando", cls: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400" },
  erro_banco: { label: "Erro de banco", cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400" },
};

const NIVEL_CLS: Record<string, string> = {
  ok: "text-emerald-600",
  info: "text-blue-600",
  warn: "text-amber-600",
  erro: "text-red-600",
};
const NIVEL_ICONE: Record<string, string> = { ok: "✓", info: "ℹ", warn: "⚠", erro: "✘" };

function fmtDateTime(v: unknown): string {
  if (!v) return "—";
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}


/** Horas oferecidas como botões para os horários fixos (06h–22h). */
const HORAS_SELECIONAVEIS = Array.from({ length: 17 }, (_, i) => i + 6);
const fmtHora = (h: number) => `${String(h).padStart(2, "0")}h`;

export default function EnvioParcial() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  // Multi-envio: lista de envios (regiões)
  const enviosQuery = trpc.parcial.listEnvios.useQuery(undefined, { refetchInterval: 4000 });
  const qrQuery = trpc.parcial.getQr.useQuery(undefined, { refetchInterval: 4000 });
  const logsQuery = trpc.parcial.getLogs.useQuery({ limit: 100 }, { refetchInterval: 6000 });

  // Cadastro central de contatos/grupos (reutilizável entre envios) + lista de
  // grupos reais do WhatsApp publicada pelo bot (alimenta o dropdown).
  const contatosQuery = trpc.parcial.listContatos.useQuery(undefined, { refetchInterval: 10000 });
  const gruposWaQuery = trpc.parcial.getGruposWa.useQuery(undefined, { refetchInterval: 10000 });
  const contatos = contatosQuery.data ?? [];
  const gruposWa = gruposWaQuery.data?.grupos ?? [];

  const envios = enviosQuery.data ?? [];
  const [activeTab, setActiveTab] = useState<string>("");
  const [qrAberto, setQrAberto] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);

  // Selecionar a primeira aba quando os envios carregam
  useEffect(() => {
    if (envios.length > 0 && !activeTab) {
      setActiveTab(envios[0].slug);
    }
  }, [envios, activeTab]);

  // Abre o modal de QR automaticamente quando houver QR pendente
  useEffect(() => {
    if (qrQuery.data?.dataUrl) setQrAberto(true);
  }, [qrQuery.data?.dataUrl]);

  // Algum envio online? (usado só no aviso de bot offline)
  const anyBotOnline = envios.some((e) => e.botConectado);

  // Envio da aba ativa (SegmentedTabs) — fallback no primeiro.
  const envioAtivo = envios.find((e) => e.slug === activeTab) ?? envios[0] ?? null;

  // Ação do bot escolhida no menu (abre o modal de confirmação correspondente).
  const [acaoBot, setAcaoBot] = useState<null | "reconectar" | "reiniciar" | "desconectar">(null);

  // Soft-restart: reconecta o WhatsApp (mesmo processo).
  const reiniciarBot = trpc.parcial.reiniciarBot.useMutation({
    onSuccess: (r) => {
      toast.success(r.msg);
      utils.parcial.listEnvios.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // Hard-restart: process.exit → Tarefa Agendada sobe de novo (recarrega o código).
  const reiniciarProcesso = trpc.parcial.reiniciarProcesso.useMutation({
    onSuccess: (r) => {
      toast.success(r.msg);
      utils.parcial.listEnvios.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // Mutation para desconectar a conta do WhatsApp (logout + novo QR)
  const desconectar = trpc.parcial.desconectarWhatsapp.useMutation({
    onSuccess: (r) => {
      toast.success(r.msg);
      utils.parcial.getQr.invalidate();
      utils.parcial.listEnvios.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // Config de cada ação do bot (título, descrição, botão e o que executa).
  const ACOES_BOT = {
    reconectar: {
      titulo: "Reconectar WhatsApp",
      desc: "Reinicia só a conexão do WhatsApp (mantém a sessão, sem novo QR), no mesmo processo — não recarrega o código nem troca a versão. Volta em ~10s. Use quando o WhatsApp travar/cair mas o bot seguir online.",
      acao: "Reconectar",
      onConfirm: () => reiniciarBot.mutate(),
    },
    reiniciar: {
      titulo: "Reiniciar processo",
      desc: "Encerra o processo do bot; a Tarefa Agendada sobe de novo em até ~1 minuto, recarregando o código (versão) atualizado. Use depois de publicar código novo ou para um reset completo.",
      acao: "Reiniciar processo",
      onConfirm: () => reiniciarProcesso.mutate(),
    },
    desconectar: {
      titulo: "Desconectar WhatsApp",
      desc: "Faz logout da conta conectada (o dispositivo some do celular) e o bot para de enviar até parear de novo — um novo QR aparece aqui em ~10s. Use para trocar o número/conta.",
      acao: "Desconectar",
      classe: "bg-rose-600 hover:bg-rose-700",
      onConfirm: () => desconectar.mutate(),
    },
  } as const;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-background">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <PanelHeader
          onBack={() => navigate("/comercial")}
          icon={Send}
          title="Envio de Parcial"
          subtitle="Bot de WhatsApp — Panorama de Pedidos Sem ST"
          color="emerald"
          actions={
            <>
              {/* Cadastro central de contatos & grupos */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setManagerOpen(true)}
                className="gap-1.5 text-xs"
                title="Cadastrar e gerenciar contatos e grupos reutilizáveis"
              >
                <Contact size={14} />
                <span className="hidden sm:inline">Contatos &amp; grupos</span>
                <span className="sm:hidden">Contatos</span>
              </Button>

              {/* Menu de ações do bot (kebab) */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 flex-shrink-0"
                    title="Ações do bot"
                    aria-label="Ações do bot"
                  >
                    <MoreVertical size={16} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuLabel>Ações do bot</DropdownMenuLabel>
                  <DropdownMenuItem
                    disabled={!anyBotOnline}
                    onSelect={(e) => {
                      e.preventDefault();
                      setAcaoBot("reconectar");
                    }}
                    className="gap-2"
                  >
                    <RefreshCw size={14} /> Reconectar WhatsApp
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!anyBotOnline}
                    onSelect={(e) => {
                      e.preventDefault();
                      setAcaoBot("reiniciar");
                    }}
                    className="gap-2"
                  >
                    <RotateCcw size={14} /> Reiniciar processo
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={!anyBotOnline}
                    onSelect={(e) => {
                      e.preventDefault();
                      setAcaoBot("desconectar");
                    }}
                    className="gap-2 text-rose-600 focus:text-rose-700"
                  >
                    <LogOut size={14} /> Desconectar WhatsApp
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          }
        />
        {/* Aviso de bot offline */}
        {envios.length > 0 && !anyBotOnline && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            O bot não está reportando (offline). As ações abaixo são salvas e aplicadas assim que o bot no
            servidor local voltar a se conectar.
          </div>
        )}

        {/* Loading state */}
        {enviosQuery.isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-64 w-full" />
          </div>
        )}

        {/* Abas por região (SegmentedTabs padrão) */}
        {envios.length > 0 && (
          <div className="space-y-4">
            {envios.length > 1 && (
              <SegmentedTabs
                value={activeTab}
                onValueChange={setActiveTab}
                options={envios.map((e) => ({
                  value: e.slug,
                  label: e.nome,
                }))}
              />
            )}
            {envioAtivo && (
              <EnvioPanel
                envio={envioAtivo}
                utils={utils}
                onOpenQr={() => setQrAberto(true)}
                contatos={contatos}
                gruposWa={gruposWa}
                onManageContatos={() => setManagerOpen(true)}
              />
            )}
          </div>
        )}

        {/* Log (compartilhado entre todos os envios) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ScrollText size={18} /> Log de atividades
            </CardTitle>
          </CardHeader>
          <CardContent>
            {logsQuery.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-5 w-full" />
                ))}
              </div>
            ) : (logsQuery.data?.length ?? 0) === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">Sem registros.</div>
            ) : (
              <div className="max-h-80 overflow-y-auto space-y-1.5 font-mono text-xs">
                {logsQuery.data!.map((l) => (
                  <div key={l.id} className="flex gap-2 leading-relaxed">
                    <span className="text-muted-foreground/70 shrink-0">{fmtDateTime(l.ts)}</span>
                    <span className={`shrink-0 ${NIVEL_CLS[l.nivel] ?? ""}`}>
                      {NIVEL_ICONE[l.nivel] ?? "•"}
                    </span>
                    <span className="text-foreground break-words">{l.msg}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Confirmação das ações do bot (kebab) */}
      <ConfirmDialog
        open={acaoBot !== null}
        onOpenChange={(o) => {
          if (!o) setAcaoBot(null);
        }}
        title={acaoBot ? ACOES_BOT[acaoBot].titulo : ""}
        description={acaoBot ? ACOES_BOT[acaoBot].desc : undefined}
        confirmLabel={acaoBot ? ACOES_BOT[acaoBot].acao : "Confirmar"}
        destructive={acaoBot === "desconectar"}
        onConfirm={() => {
          if (acaoBot) ACOES_BOT[acaoBot].onConfirm();
        }}
      />

      {/* Modal de cadastro central de contatos & grupos */}
      <ContatosManagerDialog
        open={managerOpen}
        onOpenChange={setManagerOpen}
        contatos={contatos}
        gruposWa={gruposWa}
        utils={utils}
        loading={contatosQuery.isLoading}
      />

      {/* Modal QR */}
      <WhatsAppContasModal
        open={qrAberto}
        onOpenChange={setQrAberto}
        titulo="Envio de Parcial — WhatsApp"
        descricao="Conta usada pelo bot para enviar a parcial. Se estiver aguardando pareamento, escaneie o QR com o WhatsApp do número do bot."
        contas={[
          {
            id: "parcial",
            nome: "Conta do bot de Parcial",
            status: qrQuery.data?.dataUrl ? "aguardando_qr" : anyBotOnline ? "conectado" : "desconectado",
            online: anyBotOnline,
            qrDataUrl: qrQuery.data?.dataUrl ?? null,
            grupos: gruposWa,
          },
        ]}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Painel de um envio (região) — componente interno
   ═══════════════════════════════════════════════════════════════════════════════ */

function EnvioPanel({
  envio,
  utils,
  onOpenQr,
  contatos,
  gruposWa,
  onManageContatos,
}: {
  envio: EnvioData;
  utils: ReturnType<typeof trpc.useUtils>;
  onOpenQr: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contatos: any[];
  gruposWa: string[];
  onManageContatos: () => void;
}) {
  const [envioId] = useState(envio.id);

  // Previews por recorte (painel completo + cada área que sai para os contatos)
  const previewsQuery = trpc.parcial.listPreviews.useQuery({ envioId }, { refetchInterval: 15000 });
  const previews = (previewsQuery.data ?? []) as Array<{
    sig: string;
    label: string;
    base64: string | null;
    mimeType: string;
    geradoEm: string | null;
  }>;
  const [previewSig, setPreviewSig] = useState<string>("completo");

  // Form local
  const [horaInicio, setHoraInicio] = useState(envio.horaInicio ?? 7);
  const [horaFim, setHoraFim] = useState(envio.horaFim ?? 19);
  const [horariosPadrao, setHorariosPadrao] = useState<number[]>(
    (envio.horariosPadrao as number[]) ?? [11, 13, 15, 17, 19, 20],
  );
  // Gerências ofertadas = as publicadas pelas médias do bot + as já marcadas como
  // visíveis (para uma visível que ainda não veio nas médias não sumir da lista).
  const gerentesDisponiveis = Array.from(
    new Set([
      ...Object.keys((envio.medias as Record<string, number>) ?? {}),
      ...(((envio.gerentesVisiveis as string[] | null) ?? []) as string[]),
    ]),
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));

  // Allowlist de gerências no painel completo: só as marcadas aparecem. Gerência
  // nova entra DESMARCADA. NULL no backend (legado) = todas visíveis (sem regressão).
  const [gerentesVisiveis, setGerentesVisiveis] = useState<string[]>(
    (envio.gerentesVisiveis as string[] | null) ?? gerentesDisponiveis,
  );
  // Base da Média diária de Venda: true = todos os vendedores da área (padrão),
  // false = só os com pedido no momento da consulta.
  const [mediaBaseTodos, setMediaBaseTodos] = useState<boolean>(
    (envio.mediaBaseTodos as boolean | undefined) ?? true,
  );
  // RCAs ocultos no recorte por área (denylist). Vazio = todos visíveis.
  const [rcasOcultos, setRcasOcultos] = useState<string[]>(
    (envio.rcasOcultos as string[]) ?? [],
  );
  // RCAs por área publicados pelo bot ({gerencia:{rca:media}}) — fonte dos chips.
  const rcasPorGerencia = (envio.mediasGerenteRca as Record<string, Record<string, number>>) ?? {};
  const [rcaBusca, setRcaBusca] = useState("");

  // Reseed quando o envio muda (ex: troca de aba)
  useEffect(() => {
    setHoraInicio(envio.horaInicio ?? 7);
    setHoraFim(envio.horaFim ?? 19);
    setHorariosPadrao((envio.horariosPadrao as number[]) ?? [11, 13, 15, 17, 19, 20]);
    const vis = (envio.gerentesVisiveis as string[] | null) ?? null;
    const disp = Array.from(
      new Set([...Object.keys((envio.medias as Record<string, number>) ?? {}), ...(vis ?? [])]),
    );
    setGerentesVisiveis(vis ?? disp);
    setMediaBaseTodos((envio.mediaBaseTodos as boolean | undefined) ?? true);
    setRcasOcultos((envio.rcasOcultos as string[]) ?? []);
  }, [envio.id, envio.horaInicio, envio.horaFim, envio.horariosPadrao, envio.gerentesVisiveis, envio.medias, envio.mediaBaseTodos, envio.rcasOcultos]);

  function toggleHora(h: number) {
    setHorariosPadrao((prev) =>
      prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h].sort((a, b) => a - b),
    );
  }

  // Liga/desliga uma gerência no painel completo (marca/desmarca da allowlist).
  function toggleGerenteVisivel(g: string) {
    setGerentesVisiveis((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g],
    );
  }

  // Liga/desliga um RCA no recorte por área (marca/desmarca da denylist rcasOcultos).
  function toggleRcaVisivel(rca: string) {
    setRcasOcultos((prev) =>
      prev.includes(rca) ? prev.filter((x) => x !== rca) : [...prev, rca],
    );
  }
  // Mostra/esconde TODOS os RCAs de uma área de uma vez.
  function definirRcasArea(rcas: string[], mostrar: boolean) {
    setRcasOcultos((prev) => {
      const set = new Set(prev);
      for (const rca of rcas) {
        if (mostrar) set.delete(rca);
        else set.add(rca);
      }
      return Array.from(set);
    });
  }

  const comando = trpc.parcial.comando.useMutation({
    onSuccess: (r) => {
      toast.success(r.msg);
      utils.parcial.listEnvios.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const salvar = trpc.parcial.salvarConfig.useMutation({
    onSuccess: (r) => {
      toast.success(r.msg);
      utils.parcial.listEnvios.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleHabilitado = trpc.parcial.toggleHabilitado.useMutation({
    onSuccess: (r) => {
      toast.success(r.msg);
      utils.parcial.listEnvios.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const status = (envio.status ?? "iniciando") as StatusBot;
  const statusMeta = STATUS_META[status] ?? STATUS_META.iniciando;

  const previewSel = previews.find((p) => p.sig === previewSig) ?? previews[0] ?? null;
  const imagemSrc = previewSel?.base64
    ? `data:${previewSel.mimeType ?? "image/png"};base64,${previewSel.base64}`
    : null;

  return (
    <div className="space-y-6">
      {/* Status + Habilitado */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${statusMeta.cls}`}
          >
            {statusMeta.label}
          </span>
          <span
            className={`inline-flex items-center gap-1 text-xs font-medium ${
              envio.botConectado ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {envio.botConectado ? <Wifi size={14} /> : <WifiOff size={14} />}
            {envio.botConectado ? "Online" : "Offline"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Habilitado</span>
          <Switch
            checked={envio.habilitado}
            onCheckedChange={(checked) =>
              toggleHabilitado.mutate({ envioId, habilitado: checked })
            }
            disabled={toggleHabilitado.isPending}
          />
        </div>
      </div>

      {/* Operação */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Play size={18} /> Operação
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <InfoBox icon={<Clock size={16} />} label="Último envio" value={fmtDateTime(envio.ultimoEnvio)} />
            <InfoBox icon={<Clock size={16} />} label="Próximo envio" value={fmtDateTime(envio.proximoEnvio)} />
            <InfoBox
              icon={<Clock size={16} />}
              label="Horários"
              value={
                horariosPadrao.length
                  ? horariosPadrao.map(fmtHora).join(", ")
                  : "—"
              }
              mono
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {envio.pausado ? (
              <Button
                onClick={() => comando.mutate({ envioId, cmd: "start" })}
                disabled={comando.isPending}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <Play size={16} className="mr-2" /> Iniciar
              </Button>
            ) : (
              <Button
                onClick={() => comando.mutate({ envioId, cmd: "pause" })}
                disabled={comando.isPending}
                variant="outline"
              >
                <Pause size={16} className="mr-2" /> Pausar
              </Button>
            )}
            <Button
              onClick={() => comando.mutate({ envioId, cmd: "enviar" })}
              disabled={comando.isPending}
            >
              <Send size={16} className="mr-2" /> Enviar agora
            </Button>
            <Button variant="ghost" onClick={onOpenQr}>
              <QrCode size={16} className="mr-2" /> Conectar WhatsApp
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Configurações */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Save size={18} /> Configurações
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Regra de horários */}
          <div className="rounded-lg border border-border p-3 space-y-4">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-muted-foreground" />
              <p className="text-xs font-semibold text-foreground">Horários de envio · dias úteis (seg–sex)</p>
            </div>

            {/* Demais dias — horários fixos */}
            <div>
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Demais dias do mês — horários fixos
                </label>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setHorariosPadrao([...HORAS_SELECIONAVEIS])}
                    className="rounded px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10"
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setHorariosPadrao([])}
                    className="rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted"
                  >
                    Nenhum
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {HORAS_SELECIONAVEIS.map((h) => {
                  const ativo = horariosPadrao.includes(h);
                  return (
                    <button
                      key={h}
                      type="button"
                      onClick={() => toggleHora(h)}
                      className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                        ativo
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {fmtHora(h)}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                {horariosPadrao.length
                  ? `Envia às ${[...horariosPadrao].sort((a, b) => a - b).map(fmtHora).join(", ")}.`
                  : "Nenhum horário selecionado — não enviará nos dias normais."}
              </p>
            </div>

            {/* Último dia útil do mês — hora em hora */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Último dia útil do mês — de hora em hora
              </label>
              <div className="grid grid-cols-2 gap-3 sm:max-w-xs mt-1.5">
                <div>
                  <span className="text-[11px] text-muted-foreground">Início</span>
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    value={horaInicio}
                    onChange={(e) => setHoraInicio(Number(e.target.value))}
                  />
                </div>
                <div>
                  <span className="text-[11px] text-muted-foreground">Fim</span>
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    value={horaFim}
                    onChange={(e) => setHoraFim(Number(e.target.value))}
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                No último dia útil: envia de hora em hora das {fmtHora(horaInicio)} às {fmtHora(horaFim)}.
              </p>
            </div>
          </div>

          {/* Gerências exibidas no painel completo (allowlist) */}
          {gerentesDisponiveis.length > 0 && (
            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <UsersRound size={14} className="text-muted-foreground" />
                  <p className="text-xs font-semibold text-foreground">Gerências no painel completo</p>
                </div>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {gerentesDisponiveis.filter((g) => gerentesVisiveis.includes(g)).length}/
                  {gerentesDisponiveis.length} visíveis
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Só as marcadas aparecem no painel completo. Gerências novas entram
                <span className="font-semibold"> desmarcadas</span> — marque para exibir.
              </p>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setGerentesVisiveis([...gerentesDisponiveis])}
                  className="rounded px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10"
                >
                  Marcar todas
                </button>
                <button
                  type="button"
                  onClick={() => setGerentesVisiveis([])}
                  className="rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted"
                >
                  Nenhuma
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {gerentesDisponiveis.map((g) => {
                  const visivel = gerentesVisiveis.includes(g);
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => toggleGerenteVisivel(g)}
                      className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                        visivel
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-dashed border-border bg-transparent text-muted-foreground hover:bg-muted"
                      }`}
                      title={visivel ? "Visível — clique para ocultar do painel" : "Oculta — clique para exibir"}
                    >
                      {visivel ? <Check size={12} /> : <EyeOff size={12} />}
                      {g}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Base da Média diária de Venda */}
          <div className="rounded-lg border border-border p-3 space-y-2">
            <p className="text-xs font-semibold text-foreground">Base da Média diária de Venda</p>
            <p className="text-[11px] text-muted-foreground">
              Como somar a Média diária de Venda nas imagens. <span className="font-semibold">Todos
              os vendedores</span> bate com a planilha (o recorte lista todos; sem pedido = "R$ -"/-100%).
            </p>
            <div className="inline-flex overflow-hidden rounded-md border border-border">
              <button
                type="button"
                onClick={() => setMediaBaseTodos(true)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  mediaBaseTodos
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/40 text-muted-foreground hover:bg-muted"
                }`}
              >
                Todos os vendedores
              </button>
              <button
                type="button"
                onClick={() => setMediaBaseTodos(false)}
                className={`border-l border-border px-3 py-1.5 text-xs font-medium transition-colors ${
                  !mediaBaseTodos
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/40 text-muted-foreground hover:bg-muted"
                }`}
              >
                Só com pedido
              </button>
            </div>
          </div>

          {/* RCAs por área (recorte) */}
          <div className="rounded-lg border border-border p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Contact size={14} className="text-muted-foreground" />
                <p className="text-xs font-semibold text-foreground">RCAs por área (recorte)</p>
              </div>
              {rcasOcultos.length > 0 && (
                <button
                  type="button"
                  onClick={() => setRcasOcultos([])}
                  className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10"
                >
                  <Eye size={12} /> Mostrar todos ({rcasOcultos.length})
                </button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Quais RCAs entram no recorte por área (imagem dos contatos). Todos entram visíveis;
              desmarque para esconder. RCA escondido não conta na Média/Total da área.
            </p>
            {Object.keys(rcasPorGerencia).length === 0 ? (
              <p className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-center text-[11px] italic text-muted-foreground">
                Os RCAs aparecem aqui após o primeiro envio do bot atualizado.
              </p>
            ) : (
              <>
                <div className="relative">
                  <Search
                    size={13}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    value={rcaBusca}
                    onChange={(e) => setRcaBusca(e.target.value)}
                    placeholder="Buscar RCA ou área…"
                    className="h-8 pl-8 text-xs"
                  />
                </div>
                <div className="space-y-2">
                  {Object.keys(rcasPorGerencia)
                    .sort((a, b) => a.localeCompare(b, "pt-BR"))
                    .map((area) => {
                      const q = rcaBusca.trim().toLowerCase();
                      const areaMatch = area.toLowerCase().includes(q);
                      const todosRcas = Object.keys(rcasPorGerencia[area] ?? {}).sort((a, b) =>
                        a.localeCompare(b, "pt-BR"),
                      );
                      const rcas =
                        q === "" || areaMatch
                          ? todosRcas
                          : todosRcas.filter((r) => r.toLowerCase().includes(q));
                      if (rcas.length === 0) return null;
                      const visiveis = todosRcas.filter((r) => !rcasOcultos.includes(r)).length;
                      return (
                        <div
                          key={area}
                          className="space-y-1.5 rounded-md border border-border bg-muted/20 p-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold text-foreground">
                              {area}{" "}
                              <span className="font-normal tabular-nums text-muted-foreground">
                                · {visiveis}/{todosRcas.length}
                              </span>
                            </span>
                            <div className="flex shrink-0 gap-1">
                              <button
                                type="button"
                                onClick={() => definirRcasArea(todosRcas, true)}
                                className="rounded px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10"
                              >
                                Todos
                              </button>
                              <button
                                type="button"
                                onClick={() => definirRcasArea(todosRcas, false)}
                                className="rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted"
                              >
                                Nenhum
                              </button>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {rcas.map((rca) => {
                              const visivel = !rcasOcultos.includes(rca);
                              return (
                                <button
                                  key={rca}
                                  type="button"
                                  onClick={() => toggleRcaVisivel(rca)}
                                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                                    visivel
                                      ? "border-primary bg-primary text-primary-foreground"
                                      : "border-dashed border-border bg-transparent text-muted-foreground hover:bg-muted"
                                  }`}
                                  title={
                                    visivel
                                      ? "Visível — clique para esconder do recorte"
                                      : "Escondido — clique para exibir"
                                  }
                                >
                                  {visivel ? <Check size={11} /> : <EyeOff size={11} />}
                                  {rca}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </>
            )}
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() =>
                salvar.mutate({ envioId, horaInicio, horaFim, horariosPadrao, gerentesVisiveis, mediaBaseTodos, rcasOcultos })
              }
              disabled={salvar.isPending}
            >
              <Save size={16} className="mr-2" /> {salvar.isPending ? "Salvando..." : "Salvar configurações"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Destinatários (grupos + contatos particulares com filtro de área) */}
      <DestinatariosCard
        envio={envio}
        contatos={contatos}
        gruposWa={gruposWa}
        utils={utils}
        onManageContatos={onManageContatos}
      />

      {/* Preview por recorte (painel completo + cada área enviada aos contatos) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ImageIcon size={18} /> Preview das imagens
          </CardTitle>
        </CardHeader>
        <CardContent>
          {previewsQuery.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : previews.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              Nenhuma imagem gerada ainda para {envio.nome}. Elas aparecem após o primeiro envio do bot.
            </div>
          ) : (
            <div className="space-y-3">
              {/* Seletor de recorte */}
              {previews.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  {previews.map((p) => {
                    const ativo = (previewSel?.sig ?? "") === p.sig;
                    return (
                      <button
                        key={p.sig}
                        type="button"
                        onClick={() => setPreviewSig(p.sig)}
                        className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors max-w-[220px] truncate ${
                          ativo
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
                        }`}
                        title={p.label}
                      >
                        {p.sig === "completo" ? "Painel completo" : p.label}
                      </button>
                    );
                  })}
                </div>
              )}
              {imagemSrc ? (
                <div className="space-y-2">
                  <img
                    src={imagemSrc}
                    alt={`Pedidos Sem ST — ${envio.nome} — ${previewSel?.label ?? ""}`}
                    className="w-full rounded-lg border border-border"
                  />
                  <p className="text-[11px] text-muted-foreground text-right">
                    Gerada em {fmtDateTime(previewSel?.geradoEm)}
                  </p>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  Recorte sem imagem.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Componente auxiliar InfoBox
   ═══════════════════════════════════════════════════════════════════════════════ */

function InfoBox({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-0.5">
        {icon}
        {label}
      </div>
      <div className={`text-sm font-medium text-foreground break-words ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Destinatários (grupos + contatos particulares com filtro de área)
   ═══════════════════════════════════════════════════════════════════════════════ */

/** "5547999998888" → "+55 (47) 99999-8888" (best effort). */
function fmtNumero(ident: string): string {
  const d = (ident ?? "").replace(/\D/g, "");
  if (d.length < 12) return ident;
  const ddi = d.slice(0, 2);
  const ddd = d.slice(2, 4);
  const resto = d.slice(4);
  const meio =
    resto.length === 9
      ? `${resto.slice(0, 5)}-${resto.slice(5)}`
      : resto.length === 8
        ? `${resto.slice(0, 4)}-${resto.slice(4)}`
        : resto;
  return `+${ddi} (${ddd}) ${meio}`;
}

function resumoFiltro(v: { filtroTipo: string; filtroValores: string[] | null }): string {
  if (v.filtroTipo === "todos") return "Painel completo";
  const valores = v.filtroValores ?? [];
  if (valores.length === 0) return "Sem áreas selecionadas";
  return valores.join(" · ");
}

function DestinatariosCard({
  envio,
  contatos,
  utils,
  onManageContatos,
}: {
  envio: EnvioData;
  contatos: Contato[];
  gruposWa: string[];
  utils: ReturnType<typeof trpc.useUtils>;
  onManageContatos: () => void;
}) {
  const envioId = envio.id;
  const vinculosQuery = trpc.parcial.listVinculos.useQuery({ envioId }, { refetchInterval: 8000 });
  const vinculos = (vinculosQuery.data ?? []) as Vinculo[];

  const [vincularOpen, setVincularOpen] = useState(false);
  const [editing, setEditing] = useState<Vinculo | null>(null);
  const [removerAlvo, setRemoverAlvo] = useState<Vinculo | null>(null);

  const invalidate = () => utils.parcial.listVinculos.invalidate({ envioId });

  const toggle = trpc.parcial.toggleVinculo.useMutation({
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(e.message),
  });
  const remover = trpc.parcial.removerVinculo.useMutation({
    onSuccess: (r) => {
      toast.success(r.msg);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const testar = trpc.parcial.testarVinculo.useMutation({
    onSuccess: (r) => toast.success(r.msg),
    onError: (e) => toast.error(e.message),
  });

  const grupos = vinculos.filter((v) => v.tipo === "grupo");
  const pessoais = vinculos.filter((v) => v.tipo === "contato");

  function abrirNovo() {
    setEditing(null);
    setVincularOpen(true);
  }
  function abrirEdicao(v: Vinculo) {
    setEditing(v);
    setVincularOpen(true);
  }

  const renderRow = (v: Vinculo) => {
    const inativo = !v.contatoAtivo;
    return (
      <div
        key={v.id}
        className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 flex-wrap sm:flex-nowrap"
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span
            className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${
              v.tipo === "grupo"
                ? "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400"
                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
            }`}
          >
            {v.tipo === "grupo" ? <UsersRound size={16} /> : <Contact size={16} />}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-foreground truncate">{v.nome}</span>
              {inativo && (
                <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                  contato inativo
                </Badge>
              )}
            </div>
            <span className="text-[11px] text-muted-foreground break-all">
              {v.tipo === "grupo" ? v.identificador : fmtNumero(v.identificador)}
            </span>
          </div>
        </div>

        <Badge
          variant="secondary"
          className="gap-1 text-[11px] font-normal max-w-[260px] truncate"
          title={resumoFiltro(v)}
        >
          <Filter size={11} className="flex-shrink-0" />
          <span className="truncate">{resumoFiltro(v)}</span>
        </Badge>

        <div className="flex items-center gap-1 flex-shrink-0">
          <Switch
            checked={v.habilitado}
            onCheckedChange={(checked) => toggle.mutate({ id: v.id, habilitado: checked })}
            disabled={toggle.isPending}
            title={v.habilitado ? "Pausar este destino" : "Ativar este destino"}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-blue-600 hover:text-blue-700"
            onClick={() => testar.mutate({ id: v.id })}
            disabled={testar.isPending || !v.habilitado || inativo}
            title={
              !v.habilitado || inativo
                ? "Ative o destino para enviar"
                : "Enviar agora só para este destinatário"
            }
          >
            <Send size={14} />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => abrirEdicao(v)} title="Editar filtro">
            <Pencil size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-rose-600 hover:text-rose-700"
            title="Desvincular"
            onClick={() => setRemoverAlvo(v)}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2 text-base">
            <UsersRound size={18} /> Destinatários
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onManageContatos} className="gap-1.5 text-xs">
              <Contact size={14} /> Cadastro
            </Button>
            <Button size="sm" onClick={abrirNovo} className="gap-1.5">
              <Plus size={15} /> Vincular destinatário
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {vinculosQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : vinculos.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            Nenhum destinatário vinculado a {envio.nome}.{" "}
            <button onClick={abrirNovo} className="text-primary underline underline-offset-2">
              Vincular um grupo ou contato
            </button>
            .
          </div>
        ) : (
          <>
            {grupos.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Grupos ({grupos.length})
                </p>
                {grupos.map(renderRow)}
              </div>
            )}
            {pessoais.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Contatos particulares ({pessoais.length})
                </p>
                {pessoais.map(renderRow)}
              </div>
            )}
          </>
        )}
      </CardContent>

      <VincularDialog
        open={vincularOpen}
        onOpenChange={setVincularOpen}
        envio={envio}
        contatos={contatos}
        vinculos={vinculos}
        editing={editing}
        utils={utils}
        onManageContatos={onManageContatos}
      />

      <ConfirmDialog
        open={removerAlvo !== null}
        onOpenChange={(o) => {
          if (!o) setRemoverAlvo(null);
        }}
        title="Desvincular destinatário"
        description={
          removerAlvo ? (
            <>
              Remover <b>{removerAlvo.nome}</b> deste envio? O contato continua no cadastro e pode ser
              vinculado de novo depois.
            </>
          ) : undefined
        }
        confirmLabel="Desvincular"
        destructive
        onConfirm={async () => {
          if (removerAlvo) await remover.mutateAsync({ id: removerAlvo.id });
        }}
      />
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Modal: vincular um contato/grupo a um envio + definir o filtro de área
   ═══════════════════════════════════════════════════════════════════════════════ */

function VincularDialog({
  open,
  onOpenChange,
  envio,
  contatos,
  vinculos,
  editing,
  utils,
  onManageContatos,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  envio: EnvioData;
  contatos: Contato[];
  vinculos: Vinculo[];
  editing: Vinculo | null;
  utils: ReturnType<typeof trpc.useUtils>;
  onManageContatos: () => void;
}) {
  // Áreas ofertadas = gerências VISÍVEIS no painel (allowlist). Não usa a lista
  // estática (envio.gerentes). Sem allowlist definida (legado, null) cai para todas
  // as das médias. Sem médias, fica vazio e o modal mostra o aviso.
  const visiveisSet =
    (envio.gerentesVisiveis as string[] | null) != null
      ? new Set(envio.gerentesVisiveis as string[])
      : null;
  const gerentes = Object.keys((envio.medias as Record<string, number>) ?? {})
    .filter((g) => (visiveisSet ? visiveisSet.has(g) : true))
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  const [contatoId, setContatoId] = useState<number | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "gerencia">("todos");
  const [areas, setAreas] = useState<string[]>([]);

  // (Re)inicializa o form quando abre — em edição, prefilled.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setContatoId(editing.contatoId);
      setFiltroTipo(editing.filtroTipo === "todos" ? "todos" : "gerencia");
      setAreas(editing.filtroValores ?? []);
    } else {
      setContatoId(null);
      setFiltroTipo("todos");
      setAreas([]);
    }
  }, [open, editing]);

  const salvar = trpc.parcial.salvarVinculo.useMutation({
    onSuccess: (r) => {
      toast.success(r.msg);
      utils.parcial.listVinculos.invalidate({ envioId: envio.id });
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const contatoSel = contatos.find((c) => c.id === contatoId) ?? null;
  // Ids já vinculados (na criação, evita revincular o mesmo contato).
  const idsVinculados = new Set(vinculos.map((v) => v.contatoId));
  const opcoes = editing ? contatos : contatos.filter((c) => c.ativo && !idsVinculados.has(c.id));

  function toggleArea(g: string) {
    setAreas((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  }

  const podeSalvar =
    contatoId != null && (filtroTipo === "todos" || areas.length > 0) && !salvar.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar destinatário" : "Vincular destinatário"}</DialogTitle>
          <DialogDescription>
            Defina quem recebe a parcial de <b>{envio.nome}</b> e qual recorte.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Seleção do contato/grupo */}
          <div className="space-y-1.5">
            <Label className="text-xs">Contato ou grupo</Label>
            {editing ? (
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                {editing.tipo === "grupo" ? <UsersRound size={15} /> : <Contact size={15} />}
                <span className="font-medium">{editing.nome}</span>
                <span className="text-muted-foreground text-xs break-all">
                  {editing.tipo === "grupo" ? editing.identificador : fmtNumero(editing.identificador)}
                </span>
              </div>
            ) : opcoes.length === 0 ? (
              <div className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                Nenhum contato disponível.{" "}
                <button
                  onClick={() => {
                    onOpenChange(false);
                    onManageContatos();
                  }}
                  className="text-primary underline underline-offset-2"
                >
                  Cadastre um contato ou grupo
                </button>{" "}
                primeiro.
              </div>
            ) : (
              <Select
                value={contatoId != null ? String(contatoId) : undefined}
                onValueChange={(v) => setContatoId(Number(v))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione um contato ou grupo" />
                </SelectTrigger>
                <SelectContent className="max-w-[min(28rem,calc(100vw-2rem))]">
                  {opcoes.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      <span className="flex items-center gap-2 min-w-0">
                        {c.tipo === "grupo" ? (
                          <UsersRound size={14} className="flex-shrink-0 text-blue-600" />
                        ) : (
                          <Contact size={14} className="flex-shrink-0 text-emerald-600" />
                        )}
                        <span className="truncate font-medium">{c.nome}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {c.tipo === "grupo" ? c.identificador : fmtNumero(c.identificador)}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Filtro de conteúdo */}
          <div className="space-y-2">
            <Label className="text-xs">Conteúdo enviado</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFiltroTipo("todos")}
                className={`rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                  filtroTipo === "todos"
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                <div className="font-medium">Painel completo</div>
                <div className="text-[11px] text-muted-foreground">Todas as áreas (igual ao grupo)</div>
              </button>
              <button
                type="button"
                onClick={() => setFiltroTipo("gerencia")}
                className={`rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                  filtroTipo === "gerencia"
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                <div className="font-medium">Por área</div>
                <div className="text-[11px] text-muted-foreground">Recorte das gerências escolhidas</div>
              </button>
            </div>
          </div>

          {/* Multi-seleção de áreas (gerências) */}
          {filtroTipo === "gerencia" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Áreas (gerências)</Label>
              {gerentes.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  Ainda não há gerências conhecidas para {envio.nome}. Elas aparecem após o primeiro
                  envio do bot.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {gerentes.map((g) => {
                    const ativo = areas.includes(g);
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => toggleArea(g)}
                        className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                          ativo
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {g}
                      </button>
                    );
                  })}
                </div>
              )}
              {areas.length > 1 && (
                <p className="text-[11px] text-muted-foreground">
                  As {areas.length} áreas vão num único print, empilhadas.
                </p>
              )}
            </div>
          )}

          {contatoSel?.tipo === "grupo" && filtroTipo === "gerencia" && (
            <p className="text-[11px] text-amber-600">
              Atenção: grupos normalmente recebem o painel completo. Recorte por área costuma ser
              para contatos particulares.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!podeSalvar}
            onClick={() =>
              salvar.mutate({
                contatoId: contatoId!,
                envioId: envio.id,
                filtroTipo,
                filtroValores: filtroTipo === "todos" ? [] : areas,
              })
            }
          >
            <Save size={15} className="mr-1.5" />
            {salvar.isPending ? "Salvando..." : editing ? "Salvar" : "Vincular"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Modal: cadastro central de contatos & grupos (reutilizável entre envios)
   ═══════════════════════════════════════════════════════════════════════════════ */

function ContatosManagerDialog({
  open,
  onOpenChange,
  contatos,
  gruposWa,
  utils,
  loading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contatos: Contato[];
  gruposWa: string[];
  utils: ReturnType<typeof trpc.useUtils>;
  loading: boolean;
}) {
  const [tipo, setTipo] = useState<"contato" | "grupo">("contato");
  const [identificador, setIdentificador] = useState("");
  const [nome, setNome] = useState("");
  // Edição inline (nome + identificador) de um contato/grupo já cadastrado.
  const [editId, setEditId] = useState<number | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editIdent, setEditIdent] = useState("");
  const [removerContato, setRemoverContato] = useState<Contato | null>(null);

  const invalidate = () => utils.parcial.listContatos.invalidate();

  const criar = trpc.parcial.criarContato.useMutation({
    onSuccess: (r) => {
      toast.success(r.msg);
      setIdentificador("");
      setNome("");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const atualizar = trpc.parcial.atualizarContato.useMutation({
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(e.message),
  });
  const remover = trpc.parcial.removerContato.useMutation({
    onSuccess: (r) => {
      toast.success(r.msg);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // Grupos do WhatsApp ainda não cadastrados como contato.
  const jaCadastrados = new Set(
    contatos.filter((c) => c.tipo === "grupo").map((c) => c.identificador),
  );
  const gruposDisponiveis = gruposWa.filter((g) => !jaCadastrados.has(g));

  const podeAdicionar = identificador.trim().length > 0 && nome.trim().length > 0 && !criar.isPending;

  function adicionar() {
    criar.mutate({ tipo, identificador: identificador.trim(), nome: nome.trim() });
  }

  function abrirEdicao(c: Contato) {
    setEditId(c.id);
    setEditNome(c.nome);
    setEditIdent(c.identificador);
  }

  /** Salva a edição. Grupo: 1 campo (nome=identificador). Contato: rótulo + número. */
  function salvarEdicao(c: Contato) {
    if (c.tipo === "grupo") {
      const g = editIdent.trim();
      if (!g) return;
      atualizar.mutate({ id: c.id, nome: g, identificador: g });
      setEditId(null);
      return;
    }
    const novoNome = editNome.trim();
    let ident = editIdent.trim().replace(/\D/g, "");
    if (!novoNome || !ident) return;
    if (ident.length < 12) {
      toast.error("Número inválido. Use DDI (55) + DDD + número. Ex.: 5547999998888.");
      return;
    }
    atualizar.mutate({ id: c.id, nome: novoNome, identificador: ident });
    setEditId(null);
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Contact size={18} /> Contatos &amp; grupos
          </DialogTitle>
          <DialogDescription>
            Cadastro central reutilizável. Depois é só vincular cada contato/grupo a um envio.
          </DialogDescription>
        </DialogHeader>

        {/* Formulário de cadastro */}
        <div className="rounded-lg border border-border p-3 sm:p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setTipo("contato");
                setIdentificador("");
              }}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                tipo === "contato" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/50"
              }`}
            >
              <Contact size={15} className="inline mr-1.5" /> Contato
            </button>
            <button
              type="button"
              onClick={() => {
                setTipo("grupo");
                setIdentificador("");
              }}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                tipo === "grupo" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/50"
              }`}
            >
              <UsersRound size={15} className="inline mr-1.5" /> Grupo
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome (rótulo)</Label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder={tipo === "grupo" ? "Ex.: Diretoria Comercial" : "Ex.: Daniel — RS"}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{tipo === "grupo" ? "Grupo do WhatsApp" : "Número (com DDI e DDD)"}</Label>
              {tipo === "grupo" ? (
                gruposDisponiveis.length > 0 ? (
                  <Select value={identificador || undefined} onValueChange={setIdentificador}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione um grupo" />
                    </SelectTrigger>
                    <SelectContent className="max-w-[min(36rem,calc(100vw-2rem))]">
                      {gruposDisponiveis.map((g) => (
                        <SelectItem key={g} value={g}>
                          <span className="truncate">{g}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={identificador}
                    onChange={(e) => setIdentificador(e.target.value)}
                    placeholder="Nome exato do grupo"
                  />
                )
              ) : (
                <Input
                  value={identificador}
                  onChange={(e) => setIdentificador(e.target.value)}
                  placeholder="5547999998888"
                  inputMode="numeric"
                />
              )}
              <p className="text-[11px] text-muted-foreground">
                {tipo === "grupo"
                  ? gruposDisponiveis.length > 0
                    ? "Lista vinda do WhatsApp do bot."
                    : "Bot offline ou sem grupos — digite o nome exato."
                  : "Só dígitos: DDI (55) + DDD + número. Ex.: 5547999998888."}
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={adicionar} disabled={!podeAdicionar} className="gap-1.5">
              <UserPlus size={15} /> Adicionar
            </Button>
          </div>
        </div>

        {/* Lista de cadastrados */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Cadastrados ({contatos.length})
          </p>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : contatos.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground">Nenhum contato cadastrado ainda.</div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {contatos.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 flex-wrap sm:flex-nowrap"
                >
                  <span
                    className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                      c.tipo === "grupo"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400"
                        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                    }`}
                  >
                    {c.tipo === "grupo" ? <UsersRound size={15} /> : <Contact size={15} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    {editId === c.id ? (
                      <div className="flex flex-col gap-1.5">
                        {c.tipo === "grupo" ? (
                          // Grupo: um campo só (nome do grupo = rótulo = identificador).
                          <Input
                            value={editIdent}
                            onChange={(e) => setEditIdent(e.target.value)}
                            className="h-8"
                            placeholder="Nome do grupo"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") salvarEdicao(c);
                              if (e.key === "Escape") setEditId(null);
                            }}
                          />
                        ) : (
                          // Contato: rótulo e número são distintos.
                          <div className="flex flex-col gap-1.5 sm:flex-row">
                            <Input
                              value={editNome}
                              onChange={(e) => setEditNome(e.target.value)}
                              className="h-8"
                              placeholder="Nome (rótulo)"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") salvarEdicao(c);
                                if (e.key === "Escape") setEditId(null);
                              }}
                            />
                            <Input
                              value={editIdent}
                              onChange={(e) => setEditIdent(e.target.value)}
                              className="h-8"
                              placeholder="Número (5547999998888)"
                              inputMode="numeric"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") salvarEdicao(c);
                                if (e.key === "Escape") setEditId(null);
                              }}
                            />
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            className="h-8"
                            disabled={
                              atualizar.isPending ||
                              !editIdent.trim() ||
                              (c.tipo === "contato" && !editNome.trim())
                            }
                            onClick={() => salvarEdicao(c)}
                          >
                            Salvar
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditId(null)}>
                            Cancelar
                          </Button>
                          {c.tipo === "contato" && (
                            <span className="text-[11px] text-muted-foreground">Só dígitos: DDI+DDD+número</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="text-sm font-medium text-foreground truncate">{c.nome}</div>
                        <div className="text-[11px] text-muted-foreground break-all">
                          {c.tipo === "grupo" ? c.identificador : fmtNumero(c.identificador)}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-[11px] text-muted-foreground hidden sm:inline">Ativo</span>
                    <Switch
                      checked={c.ativo}
                      onCheckedChange={(checked) => atualizar.mutate({ id: c.id, ativo: checked })}
                      disabled={atualizar.isPending}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Editar nome e número"
                      onClick={() => abrirEdicao(c)}
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-rose-600 hover:text-rose-700"
                      onClick={() => setRemoverContato(c)}
                      title="Remover contato"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>

    <ConfirmDialog
      open={removerContato !== null}
      onOpenChange={(o) => {
        if (!o) setRemoverContato(null);
      }}
      title="Remover contato"
      description={
        removerContato ? (
          <>
            Remover <b>{removerContato.nome}</b> do cadastro? Ele será desvinculado de todos os envios.
            Esta ação não pode ser desfeita.
          </>
        ) : undefined
      }
      confirmLabel="Remover"
      destructive
      onConfirm={async () => {
        if (removerContato) await remover.mutateAsync({ id: removerContato.id });
      }}
    />
    </>
  );
}
