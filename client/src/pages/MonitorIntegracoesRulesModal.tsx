import type { ReactNode } from "react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { X } from "lucide-react";
import type { StatusCor } from "@shared/monitorArquivos";
import { StatusBadge } from "@/components/monitor-arquivos/statusVisual";

/**
 * Regras do Monitor de Integrações — um único botão que abre esta modal com abas:
 * "Como ler" (todos) e "Como configurar" (só para quem tem permissão de edição, via `podeConfigurar`).
 * Padrão dos RulesModal do projeto (header sticky + X).
 */
export default function MonitorIntegracoesRulesModal({
  open,
  onClose,
  podeConfigurar,
}: {
  open: boolean;
  onClose: () => void;
  podeConfigurar: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] w-[95vw] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-card px-4 py-4 sm:px-6">
          <DialogTitle className="min-w-0 flex-1 text-base font-semibold leading-tight sm:text-lg">
            Regras do Monitor de Integrações
          </DialogTitle>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
              <X className="h-4 w-4" />
              <span className="sr-only">Fechar</span>
            </Button>
          </DialogClose>
        </div>

        <DialogHeader className="sr-only">
          <DialogDescription>O que cada cor e número significam e, para quem edita, como configurar.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {podeConfigurar ? (
            <Tabs defaultValue="ler">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="ler">Como ler</TabsTrigger>
                <TabsTrigger value="config">Como configurar</TabsTrigger>
              </TabsList>
              <TabsContent value="ler" className="mt-4">
                <ConteudoLer />
              </TabsContent>
              <TabsContent value="config" className="mt-4">
                <ConteudoConfig />
              </TabsContent>
            </Tabs>
          ) : (
            <ConteudoLer />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConteudoLer() {
  const bandas: { cor: StatusCor; descricao: string }[] = [
    {
      cor: "vermelho",
      descricao:
        "Um pedido caiu e não foi lido pelo ERP dentro do SLA. O contador mostra há quanto tempo está parado; dispara alerta no WhatsApp, repetido a cada intervalo, até ser lido.",
    },
    {
      cor: "amarelo",
      descricao:
        "Não passou pedido HOJE (ou o último foi em dia anterior) e já passou do tempo previsto sem novo pedido. Aviso visual — não dispara WhatsApp.",
    },
    {
      cor: "azul",
      descricao:
        "Passou pedido pelo menos uma vez hoje, mas parou de cair (saiu do verde). Serve para o operador saber que aquela integração já funcionou hoje. Só visual.",
    },
    {
      cor: "verde",
      descricao: "Caiu pedido recentemente (na última hora / dentro do tempo previsto) e está sendo lido no prazo.",
    },
    { cor: "inativo", descricao: "Fora do dia/horário de acompanhamento, ou o coletor está offline. Sem alertas." },
  ];

  return (
    <div className="space-y-5 text-sm">
      <section>
        <h3 className="mb-2 font-semibold text-foreground">O que o painel mostra</h3>
        <p className="text-xs text-muted-foreground sm:text-sm">
          Cada card é uma integração. Use o alternador <strong>Pedidos ⇄ Listas</strong> acima dos indicadores
          para trocar a visão: <strong>Pedidos</strong> (os arquivos caem e são lidos pelo ERP) e
          <strong> Listas</strong> (arquivos que devem ser gerados até um horário — preço, estoque, rota). A
          cor responde "está tudo em dia?". Clique num card para ver os detalhes; os KPIs do topo filtram por
          cor. Uma integração pode aparecer nas duas visões se tiver pedidos e listas.
        </p>
      </section>

      <Separator />

      <section>
        <h3 className="mb-2 font-semibold text-foreground">Pedidos — o que cada status significa</h3>
        <div className="space-y-2">
          {bandas.map(({ cor, descricao }) => (
            <div key={cor} className="rounded-md border border-border bg-muted/30 px-3 py-2.5">
              <StatusBadge cor={cor} />
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground sm:text-xs">{descricao}</p>
            </div>
          ))}
        </div>
      </section>

      <Separator />

      <section>
        <h3 className="mb-2 font-semibold text-foreground">Listas — o que cada status significa</h3>
        <p className="mb-2 text-[11px] text-muted-foreground sm:text-xs">
          Cada lista tem seu horário limite; o ciclo do dia vai de <strong>00:00 até o limite</strong>. "Gerada"
          = a contagem de hoje atinge a esperada. O card da integração fica vermelho se qualquer lista atrasar
          (mostra "2 de 3"). Uma lista cadastrada <strong>depois</strong> do limite de hoje só passa a ser
          cobrada no <strong>próximo ciclo</strong> (à meia-noite). Quando há item travado numa aba, aparece um
          <strong> círculo vermelho pulsante</strong> no alternador Pedidos/Listas — pra perceber mesmo estando
          na outra aba.
        </p>
        <div className="space-y-2">
          {[
            { cor: "vermelho" as StatusCor, descricao: "Passou do horário limite sem completar a geração. Dispara alerta no WhatsApp (qual lista, qual integração, X de Y), repetido a cada intervalo. Continua vermelho até gerar — não zera à meia-noite." },
            { cor: "azul" as StatusCor, descricao: "Dentro do prazo do dia (antes do limite) e ainda não gerada; ou aguardando o próximo ciclo (cadastro tardio). Só visual." },
            { cor: "verde" as StatusCor, descricao: "A lista foi gerada hoje. O card mostra o horário da geração e o nome do arquivo." },
            { cor: "inativo" as StatusCor, descricao: "Fora do dia de acompanhamento, sem listas, ou coletor offline. Sem alertas." },
          ].map(({ cor, descricao }) => (
            <div key={cor} className="rounded-md border border-border bg-muted/30 px-3 py-2.5">
              <StatusBadge cor={cor} modo="listas" />
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground sm:text-xs">{descricao}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ConteudoConfig() {
  const itens: { label: string; description: ReactNode }[] = [
    { label: "Caminho", description: <>A pasta como o coletor a enxerga na VM (ex.: <code className="rounded bg-muted px-1">/mnt/erp/pedidos</code>).</> },
    { label: "Extensões pendente", description: <>Formatos de "pedido caiu, mas não lido" (ex.: <code className="rounded bg-muted px-1">.ped, .txt</code>).</> },
    { label: "Extensão lida", description: <>Formato para o qual o arquivo muda quando o ERP lê (ex.: <code className="rounded bg-muted px-1">._RM</code>).</> },
    { label: "Varredura", description: "De quantos em quantos segundos o coletor olha a pasta." },
    { label: "SLA leitura 🔴", description: "Minutos até um pedido não lido virar alerta (vermelho + WhatsApp)." },
    { label: "Sem pedido 🟡🔵", description: "Minutos sem cair pedido novo para sair do verde (fica azul se já passou pedido hoje, amarelo se não). Só visual." },
    { label: "Re-alerta a cada", description: "Intervalo de repetição do alerta enquanto o pedido segue travado." },
    { label: "Dias e horário", description: "Quando o acompanhamento roda (fora disso o caminho fica inativo)." },
    { label: "Destinos", description: 'Grupos/contatos que recebem os alertas: universais (todas as integrações) ou vinculados a este caminho.' },
  ];

  const itensGeracao: { label: string; description: ReactNode }[] = [
    { label: "Seção Listas (expansível)", description: 'Na mesma tela da integração, abra "Listas" e clique em "Adicionar lista" — uma linha por lista a acompanhar (preço, estoque, rota…). Não precisa recriar a integração.' },
    { label: "Rótulo", description: <>Nome da lista que aparece nos alertas (ex.: <code className="rounded bg-muted px-1">Preços</code>).</> },
    { label: "Caminho (por lista)", description: "A pasta onde essa lista é gerada, como o coletor a enxerga na VM. Pode ser a mesma pasta de outra lista." },
    { label: "Como identificar", description: <><strong>Por extensão</strong>: conta quantos arquivos da extensão (ex.: <code className="rounded bg-muted px-1">.zip</code>) foram gerados hoje — informe a <strong>quantidade esperada</strong> (ex.: 3 de 3). <strong>Por nome</strong>: casa um <strong>nome exato</strong> de arquivo com data de hoje.</> },
    { label: "Horário limite 🔴", description: "Até que hora a lista deveria estar gerada. Passou disso sem completar → vermelho + WhatsApp (com qual lista e qual integração)." },
    { label: "Re-alerta (por lista)", description: "Intervalo de repetição do alerta enquanto a lista seguir sem gerar." },
  ];

  return (
    <div className="space-y-5 text-sm">
      <section>
        <p className="text-xs text-muted-foreground sm:text-sm">
          Em <strong>Configurar → Caminhos</strong>, cadastre cada integração a acompanhar (também editável
          clicando no card no painel → lápis "Editar"). O primeiro campo escolhe o <strong>tipo</strong>.
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold text-foreground sm:text-sm">Pedidos</h3>
        <div className="space-y-2">
          {itens.map(({ label, description }) => (
            <div key={label} className="rounded-md border border-border bg-muted/30 px-3 py-2.5">
              <span className="text-xs font-medium text-foreground sm:text-sm">{label}</span>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground sm:text-xs">{description}</p>
            </div>
          ))}
        </div>
      </section>

      <Separator />

      <section>
        <h3 className="mb-2 text-xs font-semibold text-foreground sm:text-sm">Listas</h3>
        <div className="space-y-2">
          {itensGeracao.map(({ label, description }) => (
            <div key={label} className="rounded-md border border-border bg-muted/30 px-3 py-2.5">
              <span className="text-xs font-medium text-foreground sm:text-sm">{label}</span>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground sm:text-xs">{description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
