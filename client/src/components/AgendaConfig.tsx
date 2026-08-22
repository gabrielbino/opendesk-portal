import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type Agenda, DIAS_SEMANA_LABEL, DIAS_SEMANA_NOME, normalizarAgenda } from "@shared/agenda";

/**
 * Configuração de agenda PADRÃO do projeto — dias da semana (chips marcáveis) + faixa de
 * horário (Das … às …). Controlado: o consumidor guarda a `Agenda` e passa `onChange`.
 *
 * Espelha a lógica pura de `@shared/agenda` (mesma fonte usada pelo "cérebro" no servidor
 * para decidir se deve monitorar/alertar). `horaFim` é EXCLUSIVO no topo da hora
 * (janela [horaInicio:00, horaFim:00)); para 24h use início 00:00 e fim 24:00.
 *
 * Mobile-first: os chips de dia quebram linha (`flex-wrap`); os seletores de hora empilham
 * no mobile e ficam lado a lado no `sm:`.
 */
export interface AgendaConfigProps {
  value: Agenda;
  onChange: (next: Agenda) => void;
  disabled?: boolean;
  className?: string;
  /** Rótulo da seção de dias (default "Dias de acompanhamento"). */
  diasLabel?: string;
  /** Rótulo da seção de horário (default "Janela de horário"). */
  horarioLabel?: string;
}

const HORAS = Array.from({ length: 25 }, (_, h) => h); // 0..24

function rotuloHora(h: number): string {
  if (h >= 24) return "24:00";
  return `${String(h).padStart(2, "0")}:00`;
}

export function AgendaConfig({
  value,
  onChange,
  disabled = false,
  className,
  diasLabel = "Dias de acompanhamento",
  horarioLabel = "Janela de horário",
}: AgendaConfigProps) {
  const agenda = normalizarAgenda(value);

  const toggleDia = (d: number) => {
    const set = new Set(agenda.diasSemana);
    if (set.has(d)) set.delete(d);
    else set.add(d);
    onChange({ ...agenda, diasSemana: Array.from(set).sort((a, b) => a - b) });
  };

  const setHoraInicio = (h: number) =>
    onChange({ ...agenda, horaInicio: h, horaFim: Math.max(h, agenda.horaFim) });
  const setHoraFim = (h: number) =>
    onChange({ ...agenda, horaFim: h, horaInicio: Math.min(h, agenda.horaInicio) });

  return (
    <div className={cn("space-y-4", className)}>
      {/* Dias da semana */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">{diasLabel}</Label>
        <div className="flex flex-wrap gap-1.5">
          {DIAS_SEMANA_LABEL.map((label, d) => {
            const ativo = agenda.diasSemana.includes(d);
            return (
              <Button
                key={d}
                type="button"
                size="sm"
                variant={ativo ? "default" : "outline"}
                disabled={disabled}
                aria-pressed={ativo}
                title={DIAS_SEMANA_NOME[d]}
                onClick={() => toggleDia(d)}
                className={cn("h-9 w-11 px-0 tabular-nums", ativo && "shadow-sm")}
              >
                {label}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Janela de horário */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">{horarioLabel}</Label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Das</span>
            <Select
              value={String(agenda.horaInicio)}
              onValueChange={(v) => setHoraInicio(Number(v))}
              disabled={disabled}
            >
              <SelectTrigger className="w-24 tabular-nums" aria-label="Hora inicial">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HORAS.slice(0, 24).map((h) => (
                  <SelectItem key={h} value={String(h)} className="tabular-nums">
                    {rotuloHora(h)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">às</span>
            <Select
              value={String(agenda.horaFim)}
              onValueChange={(v) => setHoraFim(Number(v))}
              disabled={disabled}
            >
              <SelectTrigger className="w-24 tabular-nums" aria-label="Hora final">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HORAS.filter((h) => h >= 1).map((h) => (
                  <SelectItem key={h} value={String(h)} className="tabular-nums">
                    {rotuloHora(h)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          O acompanhamento só roda nos dias marcados, dentro dessa faixa de horário. Fim às 24:00 = até
          o fim do dia.
        </p>
      </div>
    </div>
  );
}
