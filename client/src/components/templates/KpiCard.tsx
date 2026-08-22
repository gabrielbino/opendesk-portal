import { ReactNode, useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react';
import { ChevronDown, ChevronUp, Info, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import Sparkline from '@/components/Sparkline';

export interface KpiCardProps {
  /** Titulo do KPI */
  title: string;
  /** Valor principal exibido em destaque */
  value: string | number;
  /** Unidade ou sufixo (ex: "MB", "%", "tabelas") */
  unit?: string;
  /** Icone do KPI */
  icon?: ReactNode;
  /** Cor do icone (classe Tailwind, ex: "text-emerald-500") */
  iconColor?: string;
  /** Texto de tooltip explicativo */
  tooltip?: string;
  /** Sublabel informativo (string ou nós — ex.: 2 linhas com ênfases distintas). */
  sublabel?: ReactNode;
  /** Cor do sublabel (ex: "text-green-600" para positivo, "text-red-600" para negativo) */
  sublabelColor?: string;
  /** Conteudo de drill-down (expansivel ao clicar) */
  drillDown?: ReactNode;
  /**
   * Ação ao clicar no card (ex.: aplicar/limpar um filtro no painel). Torna o card clicável
   * (botão acessível). Tem prioridade sobre o expand do `drillDown` — use um OU outro.
   */
  onClick?: () => void;
  /** Destaque de "ativo" (ex.: o filtro deste KPI está ligado). Só visual. */
  active?: boolean;
  /** Se o card esta em estado de loading */
  loading?: boolean;
  /** Classe extra do card (ex.: padding responsivo "p-4 sm:p-5"). */
  className?: string;
  /** Classe extra do valor em destaque (ex.: fonte responsiva "text-xl sm:text-2xl"). */
  valueClassName?: string;
  /** `title` (tooltip nativo) do valor — útil quando o valor é truncado (nome longo). */
  valueTitle?: string;
  /**
   * Tom do card (tinta de fundo/borda). Genérico e reutilizável em qualquer painel:
   * `danger` p/ alerta crítico, `warning` p/ atenção, `success` p/ ok. Default: neutro (bg-card).
   */
  tone?: KpiTone;
  /**
   * Pulso de atenção: um anel pulsante ao redor do card (sem apagar o conteúdo). Combine com
   * `tone` (ex.: danger + pulse) para chamar atenção máxima do operador em um KPI crítico.
   */
  pulse?: boolean;
  /**
   * Variação percentual vs. período anterior (ex.: -26.2). `null`/`undefined` = sem base ainda
   * (mostra "sem base"). Renderiza um rodapé com a variação; só aparece quando informado.
   */
  delta?: number | null;
  /** Sobe = bom (verde) por padrão; `true` inverte (ex.: índice de corte, onde subir é ruim). */
  deltaInvert?: boolean;
  /** Rótulo curto ao lado da variação (ex.: "vs. ontem"). */
  deltaLabel?: string;
  /** Série da sparkline (tendência). Precisa de ≥2 pontos para desenhar; senão traço neutro. */
  sparkline?: number[];
}

export type KpiTone = "default" | "danger" | "warning" | "success";

/** Tinta de fundo/borda por tom (usa a paleta contextual do projeto; suporta dark). */
const TONE_BG: Record<KpiTone, string> = {
  default: "border-border bg-card",
  danger: "border-red-300 bg-red-50 dark:border-red-900/60 dark:bg-red-950/30",
  warning: "border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30",
  success: "border-emerald-300 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/30",
};

/** Cor do anel pulsante por tom. */
const TONE_RING: Record<KpiTone, string> = {
  default: "ring-ring/60",
  danger: "ring-red-500/70",
  warning: "ring-amber-500/70",
  success: "ring-emerald-500/70",
};

/**
 * KpiCard — Card de KPI reutilizavel com drill-down e tooltip.
 *
 * Exibe um valor em destaque com icone, tooltip explicativo,
 * e conteudo expansivel (drill-down) ao clicar.
 */
export default function KpiCard({
  title,
  value,
  unit,
  icon,
  iconColor = 'text-primary',
  tooltip,
  sublabel,
  sublabelColor = 'text-muted-foreground',
  drillDown,
  onClick,
  active = false,
  loading = false,
  className,
  valueClassName,
  valueTitle,
  tone = "default",
  pulse = false,
  delta,
  deltaInvert = false,
  deltaLabel,
  sparkline,
}: KpiCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Fechar tooltip ao clicar fora (importante para mobile)
  const handleClickOutside = useCallback((e: MouseEvent | TouchEvent) => {
    if (
      tooltipRef.current &&
      !tooltipRef.current.contains(e.target as Node) &&
      triggerRef.current &&
      !triggerRef.current.contains(e.target as Node)
    ) {
      setShowTooltip(false);
    }
  }, []);

  useEffect(() => {
    if (showTooltip) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('touchstart', handleClickOutside);
      };
    }
  }, [showTooltip, handleClickOutside]);

  if (loading) {
    return (
      <div className={cn('rounded-xl border border-border bg-card p-5 animate-pulse', className)}>
        <div className="h-4 w-24 bg-muted rounded mb-3" />
        <div className="h-8 w-16 bg-muted rounded mb-2" />
        <div className="h-3 w-32 bg-muted rounded" />
      </div>
    );
  }

  // Card clicável: ação externa (onClick) tem prioridade sobre o expand do drillDown.
  const clickable = Boolean(onClick) || Boolean(drillDown);
  const handleActivate = () => {
    if (onClick) onClick();
    else if (drillDown) setExpanded((v) => !v);
  };

  return (
    <div
      className={cn(
        'relative rounded-xl border p-5 transition-all duration-200',
        TONE_BG[tone],
        clickable && 'cursor-pointer hover:border-ring/40 hover:shadow-sm',
        active && 'border-ring ring-1 ring-ring/30 bg-accent/40',
        clickable && 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      {...(clickable
        ? {
            role: 'button' as const,
            tabIndex: 0,
            'aria-pressed': onClick ? active : undefined,
            onKeyDown: (e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleActivate();
              }
            },
          }
        : {})}
      onClick={clickable ? handleActivate : undefined}
    >
      {/* Anel de atenção pulsante (não intercepta cliques nem apaga o conteúdo). */}
      {pulse && (
        <span
          aria-hidden
          className={cn('pointer-events-none absolute inset-0 rounded-xl ring-2 animate-pulse', TONE_RING[tone])}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          {icon && (
            <span className={`${iconColor} [&>svg]:w-5 [&>svg]:h-5 shrink-0`}>
              {icon}
            </span>
          )}
          <span className="text-sm font-medium text-muted-foreground truncate">
            {title}
          </span>
          {tooltip && (
            <div className="relative shrink-0">
              <button
                ref={triggerRef}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowTooltip(!showTooltip);
                }}
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                className="text-muted-foreground/50 hover:text-muted-foreground transition-colors p-0.5"
                aria-label={`Informacao sobre ${title}`}
              >
                <Info size={14} />
              </button>
              <AnimatePresence>
                {showTooltip && (
                  <motion.div
                    ref={tooltipRef}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute z-[100] px-3 py-2 rounded-lg bg-popover border border-border shadow-xl text-xs text-popover-foreground whitespace-normal leading-relaxed
                      w-[200px] sm:w-[220px]
                      bottom-full left-0 sm:left-1/2 sm:-translate-x-1/2 mb-2
                      max-[640px]:left-auto max-[640px]:right-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {tooltip}
                    {/* Seta do tooltip - visivel apenas em telas maiores */}
                    <div className="hidden sm:block absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-popover border-r border-b border-border rotate-45 -mt-1" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {drillDown && (
          <span className="text-muted-foreground/50 shrink-0 ml-2">
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        )}
      </div>

      {/* Value */}
      <div className="flex items-baseline gap-1.5 mb-1 min-w-0">
        <span className={cn('min-w-0 text-2xl font-bold text-foreground tracking-tight', valueClassName)} title={valueTitle}>
          {value}
        </span>
        {unit && (
          <span className="text-sm font-medium text-muted-foreground">
            {unit}
          </span>
        )}
      </div>

      {/* Sublabel (string simples ou nós — ex.: 2 linhas) */}
      {sublabel && (
        <p className={`text-xs ${sublabelColor} break-words`}>
          {sublabel}
        </p>
      )}

      {/* Tendência (variação + sparkline) — só aparece quando `delta`/`sparkline` são informados. */}
      {(delta !== undefined || (sparkline && sparkline.length > 0)) && (() => {
        const bom = delta == null ? null : deltaInvert ? delta < 0 : delta > 0;
        const trendColor =
          delta == null || delta === 0 ? 'text-muted-foreground' : bom ? 'text-emerald-600' : 'text-rose-500';
        return (
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums', trendColor)}>
              {delta == null ? (
                <span className="font-normal text-muted-foreground">sem base ainda</span>
              ) : (
                <>
                  {delta > 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : delta < 0 ? <ArrowDownRight className="h-3.5 w-3.5" /> : null}
                  {Math.abs(delta).toFixed(1).replace('.', ',')}%
                  {deltaLabel && <span className="ml-1 font-normal text-muted-foreground">{deltaLabel}</span>}
                </>
              )}
            </span>
            {sparkline && sparkline.length > 0 && <Sparkline data={sparkline} fill className={cn('shrink-0', trendColor)} />}
          </div>
        );
      })()}

      {/* Drill-down Content */}
      <AnimatePresence>
        {expanded && drillDown && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pt-4 mt-4 border-t border-border">
              {drillDown}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
