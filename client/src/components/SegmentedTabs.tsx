import { ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export interface SegmentedTabOption {
  value: string;
  label: string;
  /** Ícone opcional (ex.: lucide) exibido antes do label. */
  icon?: ReactNode;
  /** Selo opcional exibido após o label (ex.: badge de alerta com contagem). */
  badge?: ReactNode;
}

export interface SegmentedTabsProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SegmentedTabOption[];
  /** Classe extra do TabsList (ex.: ajustar o cap de largura no desktop). */
  className?: string;
}

const COLS: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
};

/**
 * SegmentedTabs — abas segmentadas PADRÃO do projeto (mobile-first).
 *
 * Sobre o `ui/tabs`, com: **full-width no mobile** (toque confortável, `py-2`) e cap
 * `sm:max-w-md` no desktop. Genérico — serve para região (SC/RS/Unificado) e para
 * qualquer eixo (ex.: Triagem/Pedidos/Histórico, com ícones). Use SEMPRE este componente
 * para filtros segmentados, em vez de repetir o markup do TabsList.
 */
export default function SegmentedTabs({ value, onValueChange, options, className }: SegmentedTabsProps) {
  return (
    <Tabs value={value} onValueChange={onValueChange}>
      <TabsList
        className={cn(
          "grid h-auto w-full gap-1 rounded-lg bg-slate-200 p-1 sm:max-w-md",
          COLS[options.length] ?? "grid-cols-3",
          className,
        )}
      >
        {options.map((opt) => (
          <TabsTrigger key={opt.value} value={opt.value} className="rounded-md py-2 text-sm font-medium">
            {opt.icon}
            {opt.label}
            {opt.badge}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
