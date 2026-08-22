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
import { DIAS_RUPTURA, FAIXAS_RUPTURA, corFaixa } from "@/lib/rupturas";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function RupturasRulesModal({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        {/* Header sticky + fechar */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-card px-4 py-4 sm:px-6">
          <DialogTitle className="min-w-0 flex-1 text-base font-semibold leading-tight sm:text-lg">
            Regras do Painel de Rupturas
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
            O que é ruptura, como a % é calculada, o que cada emoji significa e as demais regras do painel.
          </DialogDescription>
        </DialogHeader>

        {/* Conteúdo rolável */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <div className="space-y-5 text-sm">
            {/* O que o painel mostra */}
            <section>
              <h3 className="mb-2 font-semibold text-foreground">O que o painel mostra</h3>
              <p className="text-xs text-muted-foreground sm:text-sm">
                Produtos <strong>ativos em risco de faltar</strong>, agrupados por <strong>marca</strong>
                {" "}(fornecedor). Serve para o comprador agir e <strong>repor antes da ruptura</strong>.
                Cada linha é uma marca; clique para <strong>expandir</strong> e ver os produtos em ruptura dela.
              </p>
            </section>

            <Separator />

            {/* Definição de ruptura */}
            <section>
              <h3 className="mb-2 font-semibold text-foreground">O que conta como ruptura</h3>
              <div className="mb-3 rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground sm:text-xs">
                ruptura ⇔ estoque = 0 (zerado) OU dias de estoque &lt; {DIAS_RUPTURA}
              </div>
              <div className="space-y-2">
                <RuleItem
                  label="Zerado"
                  value="estoque = 0"
                  description="Produto ativo sem nenhum estoque. É o caso mais grave (realce vermelho)."
                />
                <RuleItem
                  label="Em alerta"
                  value={`< ${DIAS_RUPTURA} dias`}
                  description="Ainda tem estoque, mas dura menos de 7 dias na venda média — risco de zerar em breve (realce âmbar)."
                />
              </div>
            </section>

            <Separator />

            {/* Como a % é calculada */}
            <section>
              <h3 className="mb-2 font-semibold text-foreground">Como a % de ruptura é calculada</h3>
              <div className="mb-3 rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground sm:text-xs">
                % ruptura da marca = itens em ruptura ÷ total de itens ativos da marca × 100
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground sm:text-xs">
                O <strong>total de ativos</strong> é o universo de produtos ativos da marca na região (denominador),
                mesmo os que não estão em ruptura. Quanto maior a %, maior a fatia da marca faltando.
              </p>
            </section>

            <Separator />

            {/* Emojis por faixa */}
            <section>
              <h3 className="mb-2 font-semibold text-foreground">Emojis por faixa de % de ruptura</h3>
              <div className="space-y-2">
                {FAIXAS_RUPTURA.map((f) => {
                  const cor = corFaixa(f.key);
                  return (
                    <div key={f.key} className="rounded-md border border-border bg-muted/30 px-3 py-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className={cn("inline-flex items-center gap-2 text-xs font-medium sm:text-sm", cor.text)}>
                          <span className="text-lg leading-none">{f.emoji}</span>
                          {DESCR_FAIXA[f.key]}
                        </span>
                        <span className="shrink-0 rounded bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary sm:text-xs tabular-nums">
                          {f.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <Separator />

            {/* Colunas */}
            <section>
              <h3 className="mb-2 font-semibold text-foreground">O que cada coluna significa</h3>
              <div className="space-y-2">
                <RuleItem label="Ativos" value="universo da marca" description="Total de produtos ativos da marca na região (denominador da %)." />
                <RuleItem label="Em Ruptura" value="zerados + em alerta" description="Quantos produtos da marca estão em ruptura agora." />
                <RuleItem label="Zerados" value="estoque = 0" description="Subconjunto crítico dos itens em ruptura." />
                <RuleItem label="% Ruptura" value="+ emoji" description="Fatia da marca em ruptura; a cor e o emoji indicam a gravidade." />
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground sm:text-xs">
                Ao expandir a marca, cada produto mostra <strong>Dias Est.</strong> (dias de estoque),
                <strong> Estoque</strong> (unidades) e <strong>Vda. Média</strong> (venda média mensal).
              </p>
            </section>

            <Separator />

            {/* Comprador + filtros */}
            <section>
              <h3 className="mb-2 font-semibold text-foreground">Comprador e filtros</h3>
              <ul className="list-disc space-y-1.5 pl-4 text-[11px] text-muted-foreground sm:text-sm">
                <li>O <strong>comprador</strong> de cada marca vem do submódulo <strong>Gestão de Compradores</strong> (registro único marca↔comprador).</li>
                <li>Filtre por <strong>comprador</strong> ou <strong>fornecedor</strong> (marca), pelas <strong>faixas de emoji</strong> ou pela <strong>busca</strong> (marca, comprador ou produto).</li>
                <li>Ordene as colunas estratégicas (<strong>% Ruptura</strong>, <strong>Em Ruptura</strong>, <strong>Zerados</strong>, <strong>Ativos</strong>) do maior para o menor.</li>
                <li>Selecione fornecedores (ou produtos específicos ao expandir) e <strong>Exporte</strong> em XLSX — a planilha sai <strong>por produto</strong>, com a coluna Fornecedor.</li>
              </ul>
            </section>

            <Separator />

            {/* Observações */}
            <section>
              <h3 className="mb-2 font-semibold text-foreground">Observações</h3>
              <ul className="list-disc space-y-1.5 pl-4 text-[11px] text-muted-foreground sm:text-sm">
                <li>Fonte dos dados: API OpenDesk (<code>dia_estoque</code>), a mesma do Superestocados.</li>
                <li><strong>Unificado</strong> soma SC + RS por marca (cada produto mantém sua UF).</li>
                <li>O painel lista só marcas <strong>com pelo menos um item em ruptura</strong>; a ordenação padrão é a maior % primeiro.</li>
                <li>O limiar de ruptura ({DIAS_RUPTURA} dias) é a regra vigente; ajustes futuros serão parametrizáveis.</li>
              </ul>
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const DESCR_FAIXA: Record<string, string> = {
  baixa: "Baixa — sob controle",
  media: "Média — atenção",
  alta: "Alta — agir logo",
  critica: "Crítica — urgente",
};

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
