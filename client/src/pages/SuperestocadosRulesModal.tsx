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
import { trpc } from "@/lib/trpc";
import { Loader2, X } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type ParamItem = {
  chave: string;
  valor: string;
  descricao: string | null;
};

function getParamValue(params: ParamItem[], key: string, fallback: string): string {
  const found = params.find((p) => p.chave === key);
  return found?.valor ?? fallback;
}

export default function SuperestocadosRulesModal({ open, onOpenChange }: Props) {
  const parametrosQuery = trpc.superestocados.getParametros.useQuery(undefined, {
    enabled: open,
  });

  const params = parametrosQuery.data ?? [];
  const isLoading = parametrosQuery.isLoading;

  const diasEntrada = getParamValue(params, "DIAS_ESTOQUE_ENTRADA", "90");
  const diasSaidaMed = getParamValue(params, "DIAS_ESTOQUE_SAIDA_MEDICAMENTO", "60");
  const diasSaidaNaoMed = getParamValue(params, "DIAS_ESTOQUE_SAIDA_NAO_MEDICAMENTO", "45");
  const diasCadastro = getParamValue(params, "DIAS_CADASTRO_MINIMO", "60");
  const vendaMediaMin = getParamValue(params, "VENDA_MEDIA_MINIMA", "1");
  const mesesIdeal = getParamValue(params, "MESES_ESTOQUE_IDEAL", "2");
  const diasSemVendaAlerta = getParamValue(params, "DIAS_SEM_VENDA_ALERTA", "3");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        {/* Sticky header with close button */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-card px-4 py-4 sm:px-6">
          <DialogTitle className="min-w-0 flex-1 text-base font-semibold leading-tight sm:text-lg">
            Regras do Painel de Superestocados
          </DialogTitle>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
              <X className="h-4 w-4" />
              <span className="sr-only">Fechar</span>
            </Button>
          </DialogClose>
        </div>

        {/* Hidden description for accessibility (aria-describedby) */}
        <DialogHeader className="sr-only">
          <DialogDescription>
            Critérios que determinam quais produtos aparecem no painel e como são classificados.
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-5 text-sm">
              {/* Critérios de entrada */}
              <section>
                <h3 className="font-semibold text-foreground mb-2">Critérios de Entrada</h3>
                <p className="text-muted-foreground mb-3 text-xs sm:text-sm">
                  Um produto entra no painel quando atende simultaneamente a todas as condições abaixo:
                </p>
                <div className="space-y-2">
                  <RuleItem
                    label="Dias de estoque acima do limite"
                    value={`${diasEntrada} dias`}
                    description="Produto com cobertura de estoque superior a este valor é considerado superestocado."
                  />
                  <RuleItem
                    label="Última compra no sistema"
                    value={`${diasCadastro} dias`}
                    description="Produtos recém-comprados são ignorados para evitar falsos positivos."
                  />
                  <RuleItem
                    label="Venda média mínima (painel principal)"
                    value={`${vendaMediaMin} un/mês`}
                    description="Produtos com venda média abaixo deste valor são tratados separadamente na aba de venda zerada."
                  />
                  <RuleItem
                    label="Estoque atual"
                    value="Maior que 0"
                    description="Produtos sem estoque não aparecem no painel."
                  />
                </div>
              </section>

              <Separator />

              {/* Critérios de saída */}
              <section>
                <h3 className="font-semibold text-foreground mb-2">Critérios de Saída</h3>
                <p className="text-muted-foreground mb-3 text-xs sm:text-sm">
                  Um produto sai do painel quando sua cobertura de estoque cai abaixo do limite de saída:
                </p>
                <div className="space-y-2">
                  <RuleItem
                    label="Medicamentos"
                    value={`${diasSaidaMed} dias`}
                    description="Cobertura abaixo deste valor remove o medicamento do painel."
                  />
                  <RuleItem
                    label="Não-medicamentos"
                    value={`${diasSaidaNaoMed} dias`}
                    description="Cobertura abaixo deste valor remove o não-medicamento do painel."
                  />
                </div>
              </section>

              <Separator />

              {/* Estoque ideal */}
              <section>
                <h3 className="font-semibold text-foreground mb-2">Estoque Ideal</h3>
                <div className="space-y-2">
                  <RuleItem
                    label="Cálculo do estoque ideal"
                    value={`Venda média x ${mesesIdeal} meses`}
                    description="O estoque ideal é calculado multiplicando a venda média mensal pelo número de meses configurado. O excesso é: estoque atual - estoque ideal."
                  />
                </div>
              </section>

              <Separator />

              {/* Capacidade */}
              <section>
                <h3 className="font-semibold text-foreground mb-2">Capacidade e Exibição</h3>
                <div className="space-y-2">
                  <RuleItem
                    label="Exibição de produtos"
                    value="100%"
                    description="Todos os produtos que atendem aos critérios de entrada são exibidos no painel, sem limite de quantidade."
                  />
                  <RuleItem
                    label="Alerta de dias sem venda"
                    value={`${diasSemVendaAlerta} dias`}
                    description="Produtos sem venda por este período recebem destaque visual (linha amarela) no painel."
                  />
                </div>
              </section>

              <Separator />

              {/* Classificação */}
              <section>
                <h3 className="font-semibold text-foreground mb-2">Classificação e Abas</h3>
                <div className="space-y-2">
                  <RuleItem
                    label="Medicamentos"
                    value="Venda média >= 1"
                    description="Produtos classificados como medicamento com venda média acima do limiar."
                  />
                  <RuleItem
                    label="Não-medicamentos"
                    value="Venda média >= 1"
                    description="Produtos classificados como não-medicamento com venda média acima do limiar."
                  />
                  <RuleItem
                    label="Medicamentos (Venda Zerada)"
                    value={`Venda média < ${vendaMediaMin}`}
                    description="Medicamentos com venda média abaixo do limiar. Saem automaticamente quando o estoque cai pela metade ou zera."
                  />
                  <RuleItem
                    label="Não-medicamentos (Venda Zerada)"
                    value={`Venda média < ${vendaMediaMin}`}
                    description="Não-medicamentos com venda média abaixo do limiar. Mesma regra de saída dos zerados."
                  />
                </div>
              </section>

              <Separator />

              {/* Observações */}
              <section>
                <h3 className="font-semibold text-foreground mb-2">Observações Importantes</h3>
                <ul className="space-y-1.5 text-muted-foreground text-xs sm:text-sm list-disc pl-4">
                  <li>Produtos em campanha permanecem no painel independentemente dos critérios de saída, até que a campanha seja encerrada.</li>
                  <li>A ordenação padrão prioriza produtos com maior número de dias de estoque.</li>
                  <li>A prioridade de entrada considera: valor de custo em excesso, dias de estoque e venda média.</li>
                  <li>Produtos com venda zerada que recuperam vendas (média sobe acima do limiar) migram automaticamente para o painel principal.</li>
                  <li>Os parâmetros acima podem ser ajustados por administradores na seção de configurações.</li>
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
        <span className="font-medium text-foreground text-xs sm:text-sm">{label}</span>
        <span className="shrink-0 rounded bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary sm:text-xs">
          {value}
        </span>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed sm:text-xs">{description}</p>
    </div>
  );
}
