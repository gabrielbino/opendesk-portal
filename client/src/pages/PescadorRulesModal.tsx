import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { Loader2, X } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Formata fração (0.04) como percentual ("4%"). */
function fracPct(v: number | null | undefined, fallback: number): string {
  const n = v == null ? fallback : v;
  return `${+(n * 100).toFixed(4)}%`;
}

/**
 * Regras do painel Pescador (aba Triagem). Espelha o modelo do Superestocados.
 * Puxa as premissas da MC do `getMeta` (o que a última carga usou), pra refletir o real.
 */
export default function PescadorRulesModal({ open, onOpenChange }: Props) {
  const metaQuery = trpc.pescador.getMeta.useQuery(undefined, { enabled: open });
  const meta = metaQuery.data;
  const isLoading = metaQuery.isLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-card px-4 py-4 sm:px-6">
          <DialogTitle className="min-w-0 flex-1 text-base font-semibold leading-tight sm:text-lg">
            Regras do Painel Pescador
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
            Como cada métrica do painel é calculada e o que determina os status e os filtros.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-5 text-sm">
              {/* MC */}
              <section>
                <h3 className="mb-2 font-semibold text-foreground">MC — Margem de Contribuição</h3>
                <p className="mb-3 text-xs text-muted-foreground sm:text-sm">
                  Margem líquida do produto: parte do preço que sobra depois de abater impostos, comissão,
                  frete, custos variáveis e o custo médio. É exibida em <strong>%</strong> (coluna MC %).
                </p>
                <div className="space-y-2">
                  <RuleItem label="Fórmula (por unidade)" value="MC = preço × (1 − Σ%) − custo médio"
                    description="Σ% é a soma dos percentuais de despesa sobre o preço líquido (ICMS, PIS, COFINS, comissão, frete, investimento, associativismo, perdas/vencidos, contratos). MC % = MC ÷ preço." />
                  <RuleItem label="Custo médio" value="Vlr_CustoMedio"
                    description="Custo médio comercial (valor fixo em R$), abatido integralmente. É a base do Markup também." />
                  <RuleItem label="Repasse" value="informativo"
                    description="Reduz a base de cálculo na consulta, mas NÃO é abatido diretamente da MC." />
                </div>
              </section>

              <Separator />

              {/* Cores da MC% */}
              <section>
                <h3 className="mb-2 font-semibold text-foreground">Cores da MC %</h3>
                <div className="space-y-2">
                  <RuleItem label="Crítico (vermelho)" value="< 10%" description="Margem de contribuição abaixo de 10%." />
                  <RuleItem label="Atenção (âmbar)" value="10% – 12,5%" description="Margem na faixa de alerta." />
                  <RuleItem label="Saudável (verde)" value="> 12,5%" description="Margem acima de 12,5%." />
                </div>
              </section>

              <Separator />

              {/* Markup */}
              <section>
                <h3 className="mb-2 font-semibold text-foreground">Markup</h3>
                <div className="space-y-2">
                  <RuleItem label="Fórmula" value="(preço ÷ custo médio − 1) × 100"
                    description="Usa o custo médio comercial (Vlr_CustoMedio), não mais o custo da última compra." />
                </div>
              </section>

              <Separator />

              {/* Premissas da MC */}
              <section>
                <h3 className="mb-2 font-semibold text-foreground">Premissas da MC (custos variáveis)</h3>
                <p className="mb-3 text-xs text-muted-foreground sm:text-sm">
                  Percentuais aplicados sobre o preço líquido, definidos pela área. Editáveis em
                  <strong> Admin → Parâmetros</strong> (módulo <code>pescador</code>). No painel, o botão
                  <strong> ⚙ Premissas MC</strong> permite simular (what-if) sem salvar.
                </p>
                <div className="space-y-2">
                  <RuleItem label="Frete" value={fracPct(meta?.mcVarFrete, 0.04)} description="Percentual de frete sobre o preço líquido." />
                  <RuleItem label="Perdas / vencidos" value={fracPct(meta?.mcVarPerdasVencidos, 0.01)} description="Provisão para perdas e vencidos." />
                  <RuleItem label="Contratos" value={fracPct(meta?.mcVarContratos, 0.005)} description="Custo de contratos comerciais." />
                  <RuleItem label="Investimento empresa" value={fracPct(meta?.mcVarInvestEmp, 0)} description="Investimento da empresa." />
                  <RuleItem label="Associativismo" value={fracPct(meta?.mcVarAssociativismo, 0)} description="Custo de associativismo." />
                  <RuleItem label="Região tributária" value={meta?.mcRegiaoTributaria ?? "200"} description="Define ICMS/PIS/COFINS por produto (não editável no popover)." />
                </div>
              </section>

              <Separator />

              {/* Dinâmica (filtro) */}
              <section>
                <h3 className="mb-2 font-semibold text-foreground">Dinâmica (filtro de comportamento)</h3>
                <p className="mb-3 text-xs text-muted-foreground sm:text-sm">
                  O dropdown <strong>Dinâmica</strong> agrupa o status de venda (coluna Acomp.) e o filtro
                  de movimento. O status compara os <strong>dois dias úteis completos mais recentes</strong> — o dia corrente
                  (em andamento) <strong>não entra</strong>, para não sujar a leitura.
                </p>
                <div className="space-y-2">
                  <RuleItem label="Com movimento" value="≥1 em algum dos 7 dias úteis"
                    description="Traz só produtos que venderam ao menos 1 unidade em pelo menos um dos 7 dias úteis COMPLETOS. Assim como o status, o dia corrente não entra (venda parcial da manhã sujaria a leitura)." />
                  <RuleItem label="Subiu" value="dia recente > anterior" description="Venda do último dia útil completo maior que a do anterior." />
                  <RuleItem label="Caiu" value="dia recente < anterior" description="Venda menor que a do dia útil anterior." />
                  <RuleItem label="Estável" value="recente = anterior (> 0)" description="Mesma venda nos dois dias (e maior que zero)." />
                  <RuleItem label="Sem venda" value="≥2 dias úteis parado (vendeu no mês)"
                    description="Vendeu no mês, mas está há 2 ou mais dias úteis consecutivos sem vender (os 2 dias úteis comparados, já sem o dia corrente, ficaram zerados). É o sinal de 'estava vendendo e parou'." />
                  <RuleItem label="Sem movimento" value="mês atual e anterior = 0"
                    description="Sem nenhuma venda no mês atual E no anterior (~2 meses parado). Produto realmente sem giro." />
                </div>
              </section>

              <Separator />

              {/* Comparativo 7x7 */}
              <section>
                <h3 className="mb-2 font-semibold text-foreground">Comparativo 7×7</h3>
                <p className="mb-3 text-xs text-muted-foreground sm:text-sm">
                  Aparece abaixo dos KPIs quando há filtro ativo. Compara os <strong>7 dias úteis mais
                  recentes</strong> com os <strong>7 anteriores</strong> (14 dias completos, sem o dia corrente),
                  sobre todo o conjunto filtrado.
                </p>
                <div className="space-y-2">
                  <RuleItem label="Itens / Unidades" value="da janela" description="SKUs distintos que venderam e total de unidades em cada período." />
                  <RuleItem label="Valor" value="aproximado" description="Unidades × preço atual. Valor real virá da API da aba de Pedidos (em evolução)." />
                  <RuleItem label="MC gerada" value="estimada" description="Unidades × MC por unidade. Lente de margem gerada no período." />
                  <RuleItem label="Drill-down" value="por movimento" description="Deixou de vender · Desaceleraram · Aceleraram · Entraram · Mantidos. Clicar filtra a tabela sem perder os filtros; o filtro do comparativo é removível." />
                </div>
              </section>

              <Separator />

              {/* Vencimento + simulação + KPIs */}
              <section>
                <h3 className="mb-2 font-semibold text-foreground">Outras regras</h3>
                <div className="space-y-2">
                  <RuleItem label="Vencimento do lote" value="status + proximidade"
                    description="NÃO ACEITÁVEL → tag vermelha; SEM LOTE → sem estoque; SEM REGRA → sem regra; senão realce por proximidade (vencido, ≤30d, ok)." />
                  <RuleItem label="Simulação (what-if)" value="não persiste"
                    description="Editar o Pç unitário (por linha) e/ou as premissas (⚙) recalcula MC %, Markup e a memória de cálculo ao vivo. Não salva — o próximo sync restaura." />
                  <RuleItem label="KPIs" value="4 cards"
                    description="Produtos com queda · Sem giro no mês · Lotes vencendo ≤30d · 'À definir' (métrica a definir com a gestão)." />
                </div>
              </section>

              <section>
                <h3 className="mb-2 font-semibold text-foreground">Observações</h3>
                <ul className="list-disc space-y-1.5 pl-4 text-xs text-muted-foreground sm:text-sm">
                  <li>O <strong>Valor</strong> do comparativo é aproximado (preço atual) até a API de pedidos trazer o faturamento real.</li>
                  <li>As premissas da MC são ajustáveis por administradores em Admin → Parâmetros (módulo <code>pescador</code>).</li>
                  <li>Use o botão <strong>Atualizar</strong> para puxar os dados mais recentes sob demanda, além do sync agendado.</li>
                </ul>
              </section>
            </div>
          )}
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
