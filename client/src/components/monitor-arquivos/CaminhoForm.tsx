import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ListChecks, Plus, Trash2 } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import ConfirmDialog from "@/components/ConfirmDialog";
import { AgendaConfig } from "@/components/AgendaConfig";
import SegmentedTabs from "@/components/SegmentedTabs";
import { descreverAgenda } from "@shared/agenda";
import { EXTENSAO_LIDA_PADRAO } from "@shared/monitorArquivos";
import type { ConfigRow } from "./types";

/**
 * Formulário de UMA integração monitorada (Monitor de Integrações). Fonte ÚNICA de cadastro/edição,
 * reutilizado pela ConfigModal (aba Caminhos) e pela CaminhoDetalheModal (visualização → edição).
 *
 * Uma integração pode ter **pedidos** (máquina `.ped→._RM` numa pasta) e/ou **listas** (arquivos que
 * devem ser gerados até um horário — preço/estoque/rota). Ambos são opcionais: basta configurar um.
 * As listas ficam numa seção expansível; cada lista se identifica por **extensão (contagem)** ou por
 * **nome exato**. Exclusão usa o `ConfirmDialog` padrão. `readOnly` = visualização (campos travados).
 */

/** Lista em edição no formulário (extensões como texto livre; convertidas ao salvar). */
type FormLista = {
  id?: number;
  rotulo: string;
  caminho: string;
  modoIdentificacao: string; // 'extensao' | 'nome'
  nomeArquivo: string;
  extensoesText: string;
  quantidadeEsperada: number;
  horaAlvo: number;
  minutoAlvo: number;
  realertaMin: number;
  ativo: boolean;
};

const VAZIA: Omit<ConfigRow, "id"> = {
  nome: "",
  caminho: "",
  tipoMonitoramento: "pedidos",
  extensoesPendente: [".ped"],
  extensaoLida: EXTENSAO_LIDA_PADRAO,
  intervaloVarreduraSeg: 60,
  slaLeituraMin: 30,
  gapSemPedidoMin: 60,
  realertaMin: 60,
  diasSemana: [1, 2, 3, 4, 5],
  horaInicio: 8,
  horaFim: 20,
  waContaId: "monitor",
  ativo: true,
};

const LISTA_VAZIA: FormLista = {
  rotulo: "",
  caminho: "",
  modoIdentificacao: "extensao",
  nomeArquivo: "",
  extensoesText: "",
  quantidadeEsperada: 1,
  horaAlvo: 8,
  minutoAlvo: 0,
  realertaMin: 60,
  ativo: true,
};

function extsParaTexto(exts: string[]): string {
  return exts.join(", ");
}
function textoParaExts(texto: string): string[] {
  return texto
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
/** "HH:MM" (parede SP) a partir de hora/minuto, e o inverso — para o <input type="time">. */
function paraTime(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function deTime(v: string): { horaAlvo: number; minutoAlvo: number } {
  const [h, m] = v.split(":");
  return {
    horaAlvo: Math.min(23, Math.max(0, Number(h) || 0)),
    minutoAlvo: Math.min(59, Math.max(0, Number(m) || 0)),
  };
}

function CampoNum({
  label,
  value,
  onChange,
  suffix,
  min = 1,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
  min?: number;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          min={min}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Math.max(min, Number(e.target.value) || min))}
          className="tabular-nums"
        />
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

export interface CaminhoFormProps {
  inicial: ConfigRow | null;
  readOnly?: boolean;
  onCancel: () => void;
  onSaved: () => void;
  /** Chamado após excluir (default: cai no onSaved). */
  onDeleted?: () => void;
}

export default function CaminhoForm({ inicial, readOnly = false, onCancel, onSaved, onDeleted }: CaminhoFormProps) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState<Omit<ConfigRow, "id">>(() => (inicial ? { ...inicial } : { ...VAZIA }));
  const [extText, setExtText] = useState(() => extsParaTexto(inicial?.extensoesPendente ?? VAZIA.extensoesPendente));
  const [listas, setListas] = useState<FormLista[]>([]);
  const [listasAbertas, setListasAbertas] = useState(false);
  const [destinoIds, setDestinoIds] = useState<number[]>([]);
  const [confirmarExcluir, setConfirmarExcluir] = useState(false);

  // Reidrata quando muda o registro (ex.: navegar entre caminhos sem desmontar).
  useEffect(() => {
    setForm(inicial ? { ...inicial } : { ...VAZIA });
    setExtText(extsParaTexto(inicial?.extensoesPendente ?? VAZIA.extensoesPendente));
    if (!inicial) {
      setListas([]);
      setListasAbertas(false);
    }
  }, [inicial]);

  const destinosQuery = trpc.monitorArquivos.listDestinos.useQuery();
  const vinculosQuery = trpc.monitorArquivos.getVinculos.useQuery(
    { configId: inicial?.id ?? 0 },
    { enabled: Boolean(inicial) },
  );
  // Listas existentes (qualquer integração pode ter) — semeiam o editor.
  const listasQuery = trpc.monitorArquivos.getListas.useQuery(
    { configId: inicial?.id ?? 0 },
    { enabled: Boolean(inicial) },
  );

  useEffect(() => {
    if (vinculosQuery.data) setDestinoIds(vinculosQuery.data.map((v) => v.destinoId));
  }, [vinculosQuery.data]);

  useEffect(() => {
    if (listasQuery.data) {
      setListas(
        listasQuery.data.map((l) => ({
          id: l.id,
          rotulo: l.rotulo,
          caminho: l.caminho,
          modoIdentificacao: l.modoIdentificacao,
          nomeArquivo: l.nomeArquivo ?? "",
          extensoesText: extsParaTexto(l.extensoes),
          quantidadeEsperada: l.quantidadeEsperada,
          horaAlvo: l.horaAlvo,
          minutoAlvo: l.minutoAlvo,
          realertaMin: l.realertaMin,
          ativo: l.ativo,
        })),
      );
      if (listasQuery.data.length > 0) setListasAbertas(true);
    }
  }, [listasQuery.data]);

  const set = <K extends keyof Omit<ConfigRow, "id">>(k: K, v: Omit<ConfigRow, "id">[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const setLista = (idx: number, patch: Partial<FormLista>) =>
    setListas((arr) => arr.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const addLista = () => {
    setListas((arr) => [...arr, { ...LISTA_VAZIA }]);
    setListasAbertas(true);
  };
  const removerLista = (idx: number) => setListas((arr) => arr.filter((_, i) => i !== idx));

  const createM = trpc.monitorArquivos.createConfig.useMutation();
  const updateM = trpc.monitorArquivos.updateConfig.useMutation();
  const deleteM = trpc.monitorArquivos.deleteConfig.useMutation();
  const setVinculosM = trpc.monitorArquivos.setVinculos.useMutation();

  const salvando = createM.isPending || updateM.isPending || setVinculosM.isPending;

  async function salvar() {
    if (!form.nome.trim()) {
      toast.error("Informe o nome da integração.");
      return;
    }

    const temPedidos = form.caminho.trim() !== "";
    const exts = textoParaExts(extText);
    const listasLimpas = listas.map((l) => ({
      id: l.id,
      rotulo: l.rotulo.trim(),
      caminho: l.caminho.trim(),
      modoIdentificacao: l.modoIdentificacao === "nome" ? ("nome" as const) : ("extensao" as const),
      nomeArquivo: l.modoIdentificacao === "nome" ? l.nomeArquivo.trim() : null,
      extensoes: textoParaExts(l.extensoesText),
      quantidadeEsperada: Math.max(1, l.quantidadeEsperada),
      horaAlvo: l.horaAlvo,
      minutoAlvo: l.minutoAlvo,
      realertaMin: l.realertaMin,
      ativo: l.ativo,
    }));

    if (!temPedidos && listasLimpas.length === 0) {
      toast.error("Configure a pasta de pedidos ou adicione ao menos uma lista.");
      return;
    }
    if (temPedidos && exts.length === 0) {
      toast.error("Informe ao menos uma extensão pendente dos pedidos.");
      return;
    }
    const listaInvalida = listasLimpas.find(
      (l) => !l.rotulo || !l.caminho || (l.modoIdentificacao === "nome" ? !l.nomeArquivo : l.extensoes.length === 0),
    );
    if (listaInvalida) {
      toast.error("Cada lista precisa de rótulo, caminho e (nome exato ou ao menos uma extensão).");
      return;
    }

    const dados = {
      nome: form.nome.trim(),
      caminho: form.caminho.trim(),
      extensoesPendente: exts.length ? exts : [".ped"],
      extensaoLida: form.extensaoLida || EXTENSAO_LIDA_PADRAO,
      intervaloVarreduraSeg: form.intervaloVarreduraSeg,
      slaLeituraMin: form.slaLeituraMin,
      gapSemPedidoMin: form.gapSemPedidoMin,
      realertaMin: form.realertaMin,
      diasSemana: form.diasSemana ?? [],
      horaInicio: form.horaInicio,
      horaFim: form.horaFim,
      waContaId: form.waContaId,
      ativo: form.ativo,
      listas: listasLimpas,
    };

    try {
      const id = inicial
        ? (await updateM.mutateAsync({ id: inicial.id, dados }), inicial.id)
        : await createM.mutateAsync(dados);
      await setVinculosM.mutateAsync({ configId: id, destinoIds });
      await utils.monitorArquivos.listDestinos.invalidate();
      if (inicial) await utils.monitorArquivos.getListas.invalidate({ configId: inicial.id });
      toast.success(inicial ? "Integração atualizada." : "Integração cadastrada.");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar.");
    }
  }

  async function excluir() {
    if (!inicial) return;
    await deleteM.mutateAsync({ id: inicial.id });
    toast.success("Integração removida.");
    (onDeleted ?? onSaved)();
  }

  const destinos = destinosQuery.data ?? [];
  const destinosVinculados = useMemo(
    () => destinos.filter((d) => destinoIds.includes(d.id)),
    [destinos, destinoIds],
  );

  return (
    <div className="space-y-4">
      {/* Identidade da integração + parâmetros que valem para pedidos E listas */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Nome da integração</Label>
          <Input
            value={form.nome}
            disabled={readOnly}
            onChange={(e) => set("nome", e.target.value)}
            placeholder="Ex.: Rede X — SC"
          />
        </div>
        <CampoNum label="Varredura" suffix="s" min={5} disabled={readOnly} value={form.intervaloVarreduraSeg} onChange={(n) => set("intervaloVarreduraSeg", n)} />
        <CampoNum label="Re-alerta a cada" suffix="min" disabled={readOnly} value={form.realertaMin} onChange={(n) => set("realertaMin", n)} />
      </div>

      {/* Dias e horário (compartilhado por pedidos e listas) */}
      <div className="rounded-lg border p-3">
        {readOnly ? (
          <div className="space-y-1">
            <Label className="text-xs">Dias e horário</Label>
            <p className="text-sm text-foreground">
              {descreverAgenda({ diasSemana: form.diasSemana ?? [], horaInicio: form.horaInicio, horaFim: form.horaFim })}
            </p>
          </div>
        ) : (
          <AgendaConfig
            value={{ diasSemana: form.diasSemana ?? [], horaInicio: form.horaInicio, horaFim: form.horaFim }}
            onChange={(a) => setForm((f) => ({ ...f, diasSemana: a.diasSemana, horaInicio: a.horaInicio, horaFim: a.horaFim }))}
          />
        )}
      </div>

      {/* ─── Seção PEDIDOS (opcional) ─── */}
      <section className="space-y-3 rounded-lg border p-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Pedidos</h3>
          <p className="text-[11px] leading-tight text-muted-foreground">
            Máquina de estados <code className="rounded bg-muted px-1">.ped → ._RM</code>. Opcional — deixe o
            caminho em branco se esta integração só tem listas.
          </p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Caminho da pasta (como o coletor enxerga)</Label>
          <Input
            value={form.caminho}
            disabled={readOnly}
            onChange={(e) => set("caminho", e.target.value)}
            placeholder="Ex.: /mnt/erp/pedidos"
            className="font-mono text-xs"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Extensões pendente (caiu, não lido)</Label>
            <Input
              value={extText}
              disabled={readOnly}
              onChange={(e) => setExtText(e.target.value)}
              placeholder=".ped, .txt, .PNN"
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Extensão lida (pelo ERP)</Label>
            <Input
              value={form.extensaoLida}
              disabled={readOnly}
              onChange={(e) => set("extensaoLida", e.target.value)}
              placeholder="._RM"
              className="font-mono text-xs"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CampoNum label="SLA leitura 🔴" suffix="min" disabled={readOnly} value={form.slaLeituraMin} onChange={(n) => set("slaLeituraMin", n)} />
          <CampoNum label="Sem pedido 🟡" suffix="min" disabled={readOnly} value={form.gapSemPedidoMin} onChange={(n) => set("gapSemPedidoMin", n)} />
        </div>
      </section>

      {/* ─── Seção LISTAS (opcional, expansível) ─── */}
      <section className="rounded-lg border">
        <button
          type="button"
          onClick={() => setListasAbertas((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
        >
          <span className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-indigo-600" />
            <span className="text-sm font-semibold text-foreground">Listas</span>
            {listas.length > 0 && (
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                {listas.length}
              </span>
            )}
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", listasAbertas && "rotate-180")} />
        </button>

        {listasAbertas && (
          <div className="space-y-2 border-t p-3">
            <p className="text-[11px] leading-tight text-muted-foreground">
              Arquivos que devem ser gerados até um horário limite.
            </p>

            {listas.length === 0 ? (
              <p className="rounded-md border border-dashed py-5 text-center text-xs text-muted-foreground">
                Nenhuma lista. {readOnly ? "" : 'Use "Adicionar lista".'}
              </p>
            ) : (
              <div className="space-y-2">
                {listas.map((l, idx) => (
                  <ListaEditor key={l.id ?? `nova-${idx}`} lista={l} readOnly={readOnly} onChange={(p) => setLista(idx, p)} onRemove={() => removerLista(idx)} />
                ))}
              </div>
            )}

            {!readOnly && (
              <Button type="button" variant="outline" size="sm" className="h-8 w-full sm:w-auto" onClick={addLista}>
                <Plus className="mr-1 h-4 w-4" /> Adicionar lista
              </Button>
            )}
          </div>
        )}
      </section>

      {/* Destinos */}
      <div className="space-y-2">
        <Label className="text-xs">Destinos que recebem os alertas</Label>
        {readOnly ? (
          destinosVinculados.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum destino vinculado.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {destinosVinculados.map((d) => (
                <span key={d.id} className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {d.tipo}
                  </span>
                  <span className="min-w-0 truncate">{d.nome}</span>
                </span>
              ))}
            </div>
          )
        ) : destinos.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum destino cadastrado — cadastre na aba "Destinos WhatsApp".</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {destinos.map((d) => {
              const checked = destinoIds.includes(d.id);
              return (
                <label key={d.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => setDestinoIds((ids) => (v ? [...ids, d.id] : ids.filter((x) => x !== d.id)))}
                  />
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {d.tipo}
                  </span>
                  <span className="min-w-0 truncate">{d.nome}</span>
                  {d.universal && (
                    <span
                      className="ml-auto shrink-0 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                      title="Destino universal — já recebe de todas as integrações, mesmo sem marcar"
                    >
                      universal
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Ativo (linha própria, à prova de mobile) + ações (só no modo edição) */}
      <div className="space-y-3 border-t pt-3">
        <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Ativo</p>
            <p className="text-[11px] leading-tight text-muted-foreground">
              Desligado, não é monitorado nem dispara alertas.
            </p>
          </div>
          <div className="shrink-0">
            <Switch checked={form.ativo} disabled={readOnly} onCheckedChange={(v) => set("ativo", v)} aria-label="Ativo" />
          </div>
        </div>

        {!readOnly && (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            {inicial && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-red-600 sm:mr-auto sm:w-auto"
                onClick={() => setConfirmarExcluir(true)}
                disabled={deleteM.isPending}
              >
                <Trash2 className="mr-1 h-4 w-4" />
                Excluir
              </Button>
            )}
            <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={onCancel}>
              Cancelar
            </Button>
            <Button size="sm" className="w-full sm:w-auto" onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmarExcluir}
        onOpenChange={setConfirmarExcluir}
        title={inicial ? `Excluir "${inicial.nome}"?` : "Excluir integração?"}
        description="Os eventos, listas e vínculos serão removidos. Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        destructive
        onConfirm={excluir}
      />
    </div>
  );
}

/* ─── Editor de UMA lista ───────────────────────────────────────────────────── */

function ListaEditor({
  lista,
  readOnly,
  onChange,
  onRemove,
}: {
  lista: FormLista;
  readOnly: boolean;
  onChange: (patch: Partial<FormLista>) => void;
  onRemove: () => void;
}) {
  const porNome = lista.modoIdentificacao === "nome";
  return (
    <div className="space-y-2.5 rounded-md border bg-muted/30 p-2.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <Label className="text-[11px] text-muted-foreground">Rótulo</Label>
          <Input value={lista.rotulo} disabled={readOnly} onChange={(e) => onChange({ rotulo: e.target.value })} placeholder="Ex.: Preços" className="h-8" />
        </div>
        {!readOnly && (
          <Button type="button" variant="ghost" size="icon" className="mt-5 h-8 w-8 shrink-0 text-red-600" onClick={onRemove} aria-label="Remover lista">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="space-y-1">
        <Label className="text-[11px] text-muted-foreground">Caminho da pasta</Label>
        <Input value={lista.caminho} disabled={readOnly} onChange={(e) => onChange({ caminho: e.target.value })} placeholder="Ex.: /mnt/erp/redeX/precos" className="h-8 font-mono text-xs" />
      </div>

      <div className="space-y-1">
        <Label className="text-[11px] text-muted-foreground">Como identificar</Label>
        {readOnly ? (
          <p className="text-xs text-foreground">{porNome ? "Por nome exato" : "Por extensão (contagem)"}</p>
        ) : (
          <SegmentedTabs
            className="sm:max-w-xs"
            value={porNome ? "nome" : "extensao"}
            onValueChange={(v) => onChange({ modoIdentificacao: v })}
            options={[
              { value: "extensao", label: "Por extensão" },
              { value: "nome", label: "Por nome" },
            ]}
          />
        )}
      </div>

      {porNome ? (
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Nome exato do arquivo</Label>
          <Input value={lista.nomeArquivo} disabled={readOnly} onChange={(e) => onChange({ nomeArquivo: e.target.value })} placeholder="Ex.: precos.csv" className="h-8 font-mono text-xs" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[1fr_auto]">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Extensões</Label>
            <Input value={lista.extensoesText} disabled={readOnly} onChange={(e) => onChange({ extensoesText: e.target.value })} placeholder=".csv, .zip" className="h-8 font-mono text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Qtd. esperada</Label>
            <Input
              type="number"
              min={1}
              value={lista.quantidadeEsperada}
              disabled={readOnly}
              onChange={(e) => onChange({ quantidadeEsperada: Math.max(1, Number(e.target.value) || 1) })}
              className="h-8 w-24 tabular-nums"
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Horário limite 🔴</Label>
          <Input type="time" value={paraTime(lista.horaAlvo, lista.minutoAlvo)} disabled={readOnly} onChange={(e) => onChange(deTime(e.target.value))} className="h-8 w-[7.5rem] tabular-nums" />
        </div>
        <label className="flex items-center gap-1.5 pb-1.5 text-xs">
          <Switch checked={lista.ativo} disabled={readOnly} onCheckedChange={(v) => onChange({ ativo: v })} />
          Ativa
        </label>
      </div>
    </div>
  );
}
