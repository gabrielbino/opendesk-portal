import { Clock, HelpCircle, RefreshCw, Tv } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Ações padrão do header dos painéis de estoque (Superestocados, Validades Curtas, Rupturas).
 *
 * Ordem (esquerda → direita): selo "atualizado" · Atualizar · Modo TV · Regras — todos `ghost`.
 * Cada item é OPCIONAL: passe só o que o painel usa (ex.: Superestocados não tem selo; no VC o
 * Modo TV é placeholder desabilitado). Elimina a duplicação do trio de botões que estava inline
 * em cada painel.
 */
export interface PanelHeaderActionsProps {
  /** Timestamp da última atualização (ms). Mostra o selo "atualizado DD/MM HH:MM" quando presente. */
  ultimaAtualizacaoMs?: number | null;
  /** Atualizar — passe o handler só quando permitido (ex.: gated por permissão UPDATE). */
  onAtualizar?: () => void;
  atualizando?: boolean;
  /** Modo TV — `onClick` navega; `disabled` vira placeholder ("em breve"). Omitido = sem botão. */
  modoTv?: { onClick?: () => void; disabled?: boolean; title?: string };
  /** Regras — abre a modal de regras do painel. Omitido = sem botão. */
  onRegras?: () => void;
}

const GHOST = "rounded-lg text-muted-foreground hover:text-foreground";

export default function PanelHeaderActions({
  ultimaAtualizacaoMs,
  onAtualizar,
  atualizando,
  modoTv,
  onRegras,
}: PanelHeaderActionsProps) {
  return (
    <div className="flex items-center gap-2">
      {ultimaAtualizacaoMs != null && (
        <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex">
          <Clock className="h-3.5 w-3.5" />
          atualizado{" "}
          {new Date(ultimaAtualizacaoMs).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      )}
      {onAtualizar && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={GHOST}
          onClick={onAtualizar}
          disabled={atualizando}
          title="Atualizar os dados do painel pela API"
        >
          <RefreshCw className={cn("h-4 w-4 mr-1", atualizando && "animate-spin")} />
          <span className="hidden sm:inline text-xs">{atualizando ? "Atualizando..." : "Atualizar"}</span>
        </Button>
      )}
      {modoTv && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={GHOST}
          onClick={modoTv.onClick}
          disabled={modoTv.disabled}
          title={modoTv.title ?? (modoTv.disabled ? "Modo TV (em breve)" : "Abrir o painel em modo TV (monitor)")}
        >
          <Tv className="h-4 w-4 mr-1" />
          <span className="hidden sm:inline text-xs">Modo TV</span>
        </Button>
      )}
      {onRegras && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={GHOST}
          onClick={onRegras}
          title="Regras de exibição do painel"
        >
          <HelpCircle className="h-4 w-4 mr-1" />
          <span className="hidden sm:inline text-xs">Regras</span>
        </Button>
      )}
    </div>
  );
}
