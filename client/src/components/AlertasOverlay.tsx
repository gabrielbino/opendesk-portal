import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, PackageX, X } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useTabAlert, type FaviconColor } from "@/hooks/useTabAlert";
import { useAlertSound } from "@/hooks/useAlertSound";
import { useDismissableAlert } from "@/hooks/useDismissableAlert";
import { cn } from "@/lib/utils";

/**
 * Overlay GLOBAL de alertas do portal (montado 1x no App). Concentra os alertas "bate o olho" que
 * podem aparecer em qualquer tela, sem duplicar lógica:
 *  - CFV (âmbar): layout de Pedidos por Layout sem pedidos por X min (indicadores.getAlertaCfvStatus).
 *  - Pedidos travados (vermelho): integração do Monitor com pedido que caiu e não foi lido pelo
 *    ERP dentro do SLA (monitorArquivos.getAlertaTravadosStatus). SÓ pedidos — listas ficam de fora.
 *
 * Cada alerta tem tom/ícone/título/aba/som próprios (diferenciação visual) e é dispensável de forma
 * independente. Quando há mais de um, eles EMPILHAM sobre um único backdrop. A aba/som seguem o
 * alerta MAIS severo em tela (vermelho > âmbar).
 */

type Tone = "amber" | "red";

interface ToneStyle {
  card: string;
  iconWrap: string;
  icon: string;
  title: string;
  desc: string;
  hint: string;
  close: string;
  button: string;
  favicon: FaviconColor;
  frequency: number;
  tabLabel: string;
}

const TONE: Record<Tone, ToneStyle> = {
  amber: {
    card: "border-amber-400 bg-amber-50 shadow-amber-200/50 dark:border-amber-600 dark:bg-amber-950/90 dark:shadow-amber-900/30",
    iconWrap: "bg-amber-200/80 dark:bg-amber-800/50",
    icon: "text-amber-700 dark:text-amber-300",
    title: "text-amber-900 dark:text-amber-100",
    desc: "text-amber-800 dark:text-amber-200",
    hint: "text-amber-600 dark:text-amber-400",
    close: "text-amber-700 hover:bg-amber-200 hover:text-amber-900 dark:text-amber-300 dark:hover:bg-amber-800/60 dark:hover:text-amber-100",
    button:
      "border-amber-400 bg-white text-amber-800 hover:border-amber-500 hover:bg-amber-100 hover:text-amber-900 dark:border-amber-600 dark:bg-amber-900/40 dark:text-amber-200 dark:hover:bg-amber-800/60 dark:hover:text-amber-100",
    favicon: { fill: "#f59e0b", stroke: "#b45309" },
    frequency: 880,
    tabLabel: "🟡 Alerta de pedidos",
  },
  red: {
    card: "border-red-500 bg-red-50 shadow-red-200/50 dark:border-red-600 dark:bg-red-950/90 dark:shadow-red-900/30",
    iconWrap: "bg-red-200/80 dark:bg-red-800/50",
    icon: "text-red-700 dark:text-red-300",
    title: "text-red-900 dark:text-red-100",
    desc: "text-red-800 dark:text-red-200",
    hint: "text-red-600 dark:text-red-400",
    close: "text-red-700 hover:bg-red-200 hover:text-red-900 dark:text-red-300 dark:hover:bg-red-800/60 dark:hover:text-red-100",
    button:
      "border-red-500 bg-white text-red-800 hover:border-red-600 hover:bg-red-100 hover:text-red-900 dark:border-red-600 dark:bg-red-900/40 dark:text-red-200 dark:hover:bg-red-800/60 dark:hover:text-red-100",
    favicon: { fill: "#dc2626", stroke: "#7f1d1d" },
    frequency: 620,
    tabLabel: "🔴 Pedido travado",
  },
};

interface AlertaCardData {
  key: string;
  tone: Tone;
  title: string;
  message: string;
  hint: string;
  icon: ReactNode;
  onDismiss: () => void;
}

/** Card de UM alerta em tela (visual dirigido por `tone`). Reutilizável — sem cor hardcoded fora do TONE. */
function AlertaCard({ tone, title, message, hint, icon, onDismiss }: Omit<AlertaCardData, "key">) {
  const t = TONE[tone];
  return (
    <div
      className={cn(
        "animate-pulse-slow relative mx-4 w-full max-w-md rounded-2xl border-2 p-6 shadow-2xl",
        t.card,
      )}
      role="alertdialog"
      aria-modal="true"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label="Fechar alerta"
        className={cn(
          "absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full transition-colors active:scale-95",
          t.close,
        )}
        onClick={onDismiss}
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex flex-col items-center gap-4 text-center">
        <div className={cn("flex h-14 w-14 items-center justify-center rounded-full", t.iconWrap)}>
          <span className={cn("[&>svg]:h-7 [&>svg]:w-7", t.icon)}>{icon}</span>
        </div>
        <div>
          <h3 className={cn("text-lg font-bold", t.title)}>{title}</h3>
          <p className={cn("mt-1.5 text-sm", t.desc)}>{message}</p>
          <p className={cn("mt-3 text-xs", t.hint)}>{hint}</p>
        </div>
        <button
          type="button"
          className={cn(
            "mt-2 inline-flex items-center justify-center rounded-lg border-2 px-5 py-2 text-sm font-semibold shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-95",
            t.button,
          )}
          onClick={onDismiss}
        >
          Entendi
        </button>
      </div>
    </div>
  );
}

export default function AlertasOverlay() {
  const { isAuthenticated } = useAuth();

  /* ─── CFV (âmbar) — Pedidos por Layout sem pedidos ─────────────────────────── */
  const [testeCfv, setTesteCfv] = useState<string | null>(null);
  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail?.mensagem) setTesteCfv(detail.mensagem);
    }
    window.addEventListener("cfv-alert-test", handler);
    return () => window.removeEventListener("cfv-alert-test", handler);
  }, []);

  const cfvQuery = trpc.indicadores.getAlertaCfvStatus.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
    retry: false,
  });
  const cfvAtivo = testeCfv !== null || cfvQuery.data?.alerta === true;
  const cfv = useDismissableAlert(cfvAtivo, "cfv_alert_dismissed", cfvQuery.isFetched);

  /* ─── Pedidos travados (vermelho) — Monitor de Integrações ─────────────────── */
  const [testeTrav, setTesteTrav] = useState<string | null>(null);
  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail?.mensagem) setTesteTrav(detail.mensagem);
    }
    window.addEventListener("monitor-travados-test", handler);
    return () => window.removeEventListener("monitor-travados-test", handler);
  }, []);

  const travQuery = trpc.monitorArquivos.getAlertaTravadosStatus.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
    retry: false,
  });
  const travAtivo = testeTrav !== null || travQuery.data?.alerta === true;
  const trav = useDismissableAlert(travAtivo, "monitor_travados_dismissed", travQuery.isFetched);

  /* ─── Monta a pilha de cards visíveis (mais severo no topo: vermelho > âmbar) ─── */
  const cards: AlertaCardData[] = [];
  if (trav.visivel) {
    cards.push({
      key: "travados",
      tone: "red",
      title: "Pedido travado no ERP",
      message: testeTrav ?? travQuery.data?.mensagem ?? "Há pedido(s) travado(s) em uma integração.",
      hint: "O pedido caiu na pasta e não foi lido pelo ERP dentro do prazo. Acione o TI para verificar a integração.",
      icon: <PackageX />,
      onDismiss: () => {
        setTesteTrav(null);
        trav.dispensar();
      },
    });
  }
  if (cfv.visivel) {
    cards.push({
      key: "cfv",
      tone: "amber",
      title: "Alerta de Pedidos",
      message: testeCfv ?? cfvQuery.data?.mensagem ?? "Layout sem pedidos.",
      hint: "Comunique ao TI para verificar se está tudo ok ou se há pedidos travados.",
      icon: <AlertTriangle />,
      onDismiss: () => {
        setTesteCfv(null);
        cfv.dispensar();
      },
    });
  }

  const algum = cards.length > 0;
  // Aba/som seguem o alerta mais severo em tela (o vermelho fica no topo da pilha quando presente).
  const toneTopo = cards[0]?.tone ?? "amber";
  const estilo = TONE[toneTopo];
  useTabAlert(algum, estilo.tabLabel, estilo.favicon);
  useAlertSound(algum, 3000, estilo.frequency);

  if (!algum) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-3 overflow-y-auto bg-black/40 py-6 backdrop-blur-sm"
      style={{ pointerEvents: "all" }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {cards.map((c) => (
        <AlertaCard
          key={c.key}
          tone={c.tone}
          title={c.title}
          message={c.message}
          hint={c.hint}
          icon={c.icon}
          onDismiss={c.onDismiss}
        />
      ))}
    </div>
  );
}
