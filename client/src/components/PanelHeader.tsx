import type { LucideIcon } from "lucide-react";
import { type ReactNode, isValidElement } from "react";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import SegmentedTabs, { type SegmentedTabOption } from "@/components/SegmentedTabs";
import { cn } from "@/lib/utils";

/**
 * PanelHeader — cabeçalho PADRÃO dos painéis (mobile-first).
 *
 * Voltar (outline) + ícone em quadrado gradiente + título/subtítulo, com um slot opcional de
 * `actions` à direita (botões, kebab, PanelHeaderActions, etc.). Extraído do markup que já se
 * repetia em Associativismo / Pedidos por Layout — use SEMPRE este componente em painel novo
 * em vez de recriar o cabeçalho.
 *
 * Cor do quadrado do ícone: `color` (paleta pré-definida; default indigo) — cada painel escolhe
 * a sua. Para um gradiente fora da paleta, use `iconBoxClassName` (escape hatch).
 */
export type PanelHeaderColor =
  | "indigo"
  | "blue"
  | "blue2"
  | "emerald"
  | "teal"
  | "cyan"
  | "amber"
  | "orange"
  | "red"
  | "violet"
  | "slate"
  | "sky"
  | "sky2";

/**
 * Gradientes por cor — strings LITERAIS (não montar dinamicamente: o JIT do Tailwind só inclui
 * classes que aparecem por extenso no código-fonte).
 */
const COLOR_GRADIENTS: Record<PanelHeaderColor, string> = {
  indigo: "from-indigo-500 to-indigo-600",
  blue: "from-blue-500 to-cyan-600",
  blue2: "from-blue-500 to-blue-600",
  emerald: "from-emerald-500 to-emerald-600",
  teal: "from-teal-500 to-teal-600",
  cyan: "from-cyan-500 to-cyan-600",
  amber: "from-amber-500 to-amber-600",
  orange: "from-orange-500 to-orange-600",
  red: "from-red-500 to-red-600",
  violet: "from-violet-500 to-violet-600",
  slate: "from-slate-500 to-slate-600",
  sky: "from-sky-500 to-sky-600",
  sky2: "from-sky-600 to-sky-700"
};

export interface PanelHeaderProps {
  /** Handler do botão Voltar (ex.: () => setLocation("/comercial")). */
  onBack: () => void;
  /** Ícone no quadrado gradiente: componente lucide (ex.: `Activity`) OU elemento pronto (ex.: `<Activity size={20} />`). */
  icon: LucideIcon | ReactNode;
  title: string;
  subtitle?: string;
  /** Cor do quadrado do ícone (paleta pré-definida). Default: indigo. */
  color?: PanelHeaderColor;
  /** Conteúdo à direita (ações do painel). */
  actions?: ReactNode;
  backLabel?: string;
  /** Escape hatch: sobrescreve por completo as classes do quadrado do ícone (ganha de `color`). */
  iconBoxClassName?: string;
  /**
   * Abas de sub-navegação OPCIONAIS — renderizadas numa SEGUNDA linha abaixo do cabeçalho, usando o
   * `SegmentedTabs` padrão (o mesmo das abas de região). Passe as três juntas (`tabs` + `activeTab`
   * + `onTabChange`) para ativar. É o padrão para painéis-workspace com sub-navegação (ex.: Suporte,
   * Projetos, Usuários): escala melhor e é mais responsivo que abas "no meio" do cabeçalho.
   */
  tabs?: SegmentedTabOption[];
  activeTab?: string;
  onTabChange?: (value: string) => void;
  /** Classe extra do trilho de abas (ex.: `sm:max-w-xl` para 3–4 abas). */
  tabsClassName?: string;
}

export default function PanelHeader({
  onBack,
  icon,
  title,
  subtitle,
  color = "indigo",
  actions,
  backLabel = "Voltar",
  iconBoxClassName,
  tabs,
  activeTab,
  onTabChange,
  tabsClassName,
}: PanelHeaderProps) {
  // `icon` pode ser um componente lucide OU um elemento já pronto. IconComp só é usado no 1º caso.
  const IconComp = icon as LucideIcon;
  const mainRow = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={onBack}>
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
          {backLabel}
        </Button>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br shadow-sm",
              iconBoxClassName ?? COLOR_GRADIENTS[color],
            )}
          >
            {isValidElement(icon) ? (
              <span className="text-white [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
            ) : (
              <IconComp className="h-4 w-4 text-white" />
            )}
          </span>
          <div className="min-w-0">
            <h1 className="text-base font-bold tracking-tight text-foreground">{title}</h1>
            {subtitle && <p className="hidden text-xs text-muted-foreground sm:block">{subtitle}</p>}
          </div>
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );

  // Sem abas → comportamento original (uma linha). Com abas → segunda linha via SegmentedTabs.
  if (!tabs || tabs.length === 0 || activeTab == null || !onTabChange) return mainRow;

  return (
    <div className="space-y-3">
      {mainRow}
      <SegmentedTabs value={activeTab} onValueChange={onTabChange} options={tabs} className={tabsClassName} />
    </div>
  );
}
