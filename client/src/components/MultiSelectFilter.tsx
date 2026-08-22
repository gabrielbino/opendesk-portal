import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown } from "lucide-react";

/**
 * Filtro multi-seleção PADRÃO do projeto (Popover + Command com busca + Checkbox).
 *
 * Unifica o padrão que já aparecia inline em Superestocados, Validades Curtas e Pescador
 * (Comprador/Fornecedor). Use em qualquer painel que precise filtrar por uma lista de
 * rótulos com busca e opção "não atribuído". Mantém o estado FORA (controlado): o consumidor
 * guarda o `Set<string>` de selecionados e passa `onToggle`/`onClear`.
 *
 * Ex.:
 *   <MultiSelectFilter icon={<Users …/>} label="Comprador"
 *     pluralize={(n) => `${n} comprador${n>1?'es':''}`} options={compradores}
 *     selected={sel} onToggle={t} onClear={() => setSel(new Set())}
 *     naoAtribuido={{ value: SENTINELA, label: 'Não atribuído' }} />
 */
export interface MultiSelectFilterProps {
  /** Ícone à esquerda do rótulo no botão (opcional). */
  icon?: ReactNode;
  /** Rótulo quando nada está selecionado (ex.: "Comprador"). */
  label: string;
  /** Rótulo quando há N selecionados (ex.: n => `${n} compradores`). */
  pluralize: (n: number) => string;
  /** Opções (rótulos) a listar. */
  options: string[];
  /** Conjunto atualmente selecionado (controlado pelo consumidor). */
  selected: Set<string>;
  /** Alterna uma opção. */
  onToggle: (value: string) => void;
  /** Limpa toda a seleção. */
  onClear: () => void;
  /** Opção especial "não atribuído" no topo (valor sentinela + rótulo), quando aplicável. */
  naoAtribuido?: { value: string; label: string };
  searchPlaceholder?: string;
  emptyLabel?: string;
  /** Alinhamento do popover em relação ao gatilho (default "end"). */
  align?: "start" | "center" | "end";
  /** Classe de largura/estilo do gatilho (default "w-full sm:w-[180px]" — 100% no mobile). */
  triggerClassName?: string;
  /** Largura do popover (default w-64). */
  contentClassName?: string;
}

export default function MultiSelectFilter({
  icon,
  label,
  pluralize,
  options,
  selected,
  onToggle,
  onClear,
  naoAtribuido,
  searchPlaceholder = "Buscar…",
  emptyLabel = "Nenhum item.",
  align = "end",
  triggerClassName = "w-full sm:w-[180px]",
  contentClassName = "w-64",
}: MultiSelectFilterProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className={`h-8 justify-between gap-1.5 text-xs ${triggerClassName}`}>
          <span className="inline-flex items-center gap-1.5 truncate">
            {icon}
            {selected.size === 0 ? label : pluralize(selected.size)}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={`${contentClassName} p-0`} align={align}>
        <Command>
          <CommandInput placeholder={searchPlaceholder} className="text-xs" />
          <CommandList>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            <CommandGroup>
              {naoAtribuido && (
                <CommandItem
                  value={naoAtribuido.label}
                  onSelect={() => onToggle(naoAtribuido.value)}
                  className="cursor-pointer data-[selected=true]:bg-slate-100 data-[selected=true]:text-foreground"
                >
                  <Checkbox checked={selected.has(naoAtribuido.value)} className="pointer-events-none mr-2" />
                  <span className="flex-1 truncate text-slate-500">{naoAtribuido.label}</span>
                </CommandItem>
              )}
              {options.map((opt) => (
                <CommandItem
                  key={opt}
                  value={opt}
                  onSelect={() => onToggle(opt)}
                  className="cursor-pointer data-[selected=true]:bg-slate-100 data-[selected=true]:text-foreground"
                >
                  <Checkbox checked={selected.has(opt)} className="pointer-events-none mr-2" />
                  <span className="flex-1 truncate">{opt}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        {selected.size > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="w-full border-t border-slate-100 px-3 py-2 text-left text-[11px] text-slate-500 hover:text-slate-700"
          >
            Limpar ({selected.size})
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
