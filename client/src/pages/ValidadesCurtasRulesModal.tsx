import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { BANDAS_CONFIG, VC_DEFAULTS, type BandaId } from "@shared/validadesCurtas";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Faixas por banda (dias até vencer), da menos para a mais urgente — derivadas dos defaults. */
const FAIXAS: { id: BandaId; de: number; ate: number }[] = [
  { id: "atencao", de: VC_DEFAULTS.ALERTA_ATE + 1, ate: VC_DEFAULTS.ATENCAO_ATE },
  { id: "alerta", de: VC_DEFAULTS.ALTO_RISCO_ATE + 1, ate: VC_DEFAULTS.ALERTA_ATE },
  { id: "alto_risco", de: VC_DEFAULTS.BONIFICAVEL_ATE + 1, ate: VC_DEFAULTS.ALTO_RISCO_ATE },
  { id: "bonificavel", de: VC_DEFAULTS.DESCARTE_ATE + 1, ate: VC_DEFAULTS.BONIFICAVEL_ATE },
  { id: "descarte", de: 0, ate: VC_DEFAULTS.DESCARTE_ATE },
];

export default function ValidadesCurtasRulesModal({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        {/* Header sticky + fechar */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-card px-4 py-4 sm:px-6">
          <DialogTitle className="min-w-0 flex-1 text-base font-semibold leading-tight sm:text-lg">
            Regras do Painel de Validades Curtas
          </DialogTitle>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
              <X className="h-4 w-4" />
              <span className="sr-only">Fechar</span>
            </Button>
          </DialogClose>
        </div>

        <DialogHeader className="sr-only">
          <DialogDescription>
            Como o painel escolhe os itens (regra de entrada), o que cada número significa e as bandas de urgência.
          </DialogDescription>
        </DialogHeader>

        {/* Conteúdo rolável */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <div className="space-y-5 text-sm">
            {/* O que o painel mostra */}
            <section>
              <h3 className="mb-2 font-semibold text-foreground">O que o painel mostra</h3>
              <p className="text-xs text-muted-foreground sm:text-sm">
                Itens que vão <strong>vencer com estoque parado</strong> — ou seja, o estoque não escoa
                antes de o produto entrar na janela de risco (padrão {VC_DEFAULTS.JANELA_RISCO_DIAS} dias),
                virando risco de perda. Serve para agir <strong>antes</strong> (promoção, transferência,
                bonificação) e evitar o descarte.
              </p>
            </section>

            <Separator />

            {/* Regra de entrada */}
            <section>
              <h3 className="mb-2 font-semibold text-foreground">Critério de Entrada</h3>
              <div className="mb-3 rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground sm:text-xs">
                entra ⇔ MtV &lt; {VC_DEFAULTS.ATENCAO_ATE} (teto) E DpV &gt; (MtV − {VC_DEFAULTS.JANELA_RISCO_DIAS})
              </div>
              <div className="space-y-2">
                <RuleItem
                  label="Teto de entrada"
                  value={`${VC_DEFAULTS.ATENCAO_ATE} dias`}
                  description="Vencimento máximo para o item aparecer (≈ 12 meses)."
                />
                <RuleItem
                  label="Janela de risco"
                  value={`${VC_DEFAULTS.JANELA_RISCO_DIAS} dias`}
                  description="A partir daqui o cliente recusa validade curta → risco de perda."
                />
                <RuleItem
                  label="Venda zerada"
                  value="Sempre entra"
                  description="Sem venda média, o estoque nunca escoa (pior caso: vence parado)."
                />
                <RuleItem
                  label="Já ≤ 180 dias"
                  value="Sempre entra"
                  description="Itens que já cruzaram a janela de risco são o risco em si."
                />
              </div>
            </section>

            <Separator />

            {/* Definições */}
            <section>
              <h3 className="mb-2 font-semibold text-foreground">Como os números são calculados</h3>
              <div className="space-y-2">
                <RuleItem
                  label="MtV — Dias até vencer"
                  value="lote mais próximo"
                  description="Dias de hoje até o vencimento do lote mais próximo."
                />
                <RuleItem
                  label="DpV — Dias para vender"
                  value="estoque × 30 ÷ venda média"
                  description="Quanto tempo o estoque leva para escoar. Venda zerada ⇒ infinito (∞)."
                />
                <RuleItem
                  label="Valor em risco"
                  value="estoque × custo"
                  description="Valor do estoque exposto a custo."
                />
              </div>
            </section>

            <Separator />

            {/* Bandas */}
            <section>
              <h3 className="mb-2 font-semibold text-foreground">Bandas de urgência (por dias até vencer)</h3>
              <div className="space-y-2">
                {FAIXAS.map(({ id, de, ate }) => {
                  const cfg = BANDAS_CONFIG[id];
                  return (
                    <div key={id} className="rounded-md border border-border bg-muted/30 px-3 py-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium sm:text-sm", cfg.color)}>
                          <span className={cn("h-2 w-2 rounded-full", cfg.bgColor, "ring-1 ring-current/30")} />
                          {cfg.label}
                        </span>
                        <span className="shrink-0 rounded bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary sm:text-xs tabular-nums">
                          {de}–{ate} dias
                        </span>
                      </div>
                      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground sm:text-xs">{cfg.descricao}</p>
                    </div>
                  );
                })}
              </div>
            </section>

            <Separator />

            {/* Observações */}
            <section>
              <h3 className="mb-2 font-semibold text-foreground">Observações</h3>
              <ul className="list-disc space-y-1.5 pl-4 text-[11px] text-muted-foreground sm:text-sm">
                <li>Fonte dos dados: a mesma do Superestocados (API OpenDesk <code>dia_estoque</code>).</li>
                <li>MtV usa o lote mais próximo; DpV usa o estoque total (simplificação; refino por lote é evolução futura).</li>
                <li>Os limites das bandas e a janela de risco são <strong>editáveis</strong> por administradores em
                  Admin → Parâmetros (escopo <code>validades_curtas</code>). Os valores acima são os padrões.</li>
              </ul>
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RuleItem({ label, value, description }: { label: string; value: string; description: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground sm:text-sm">{label}</span>
        <span className="shrink-0 rounded bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary sm:text-xs">
          {value}
        </span>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground sm:text-xs">{description}</p>
    </div>
  );
}
