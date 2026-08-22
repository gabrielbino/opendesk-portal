import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  Users2,
  Upload,
  Download,
  FileSpreadsheet,
  ChevronsUpDown,
  CheckCircle2,
  UserPlus,
  UserMinus,
  RefreshCw,
  FileDown,
} from "lucide-react";

import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import KpiGrid from "@/components/KpiGrid";
import KpiCard from "@/components/templates/KpiCard";
import PanelHeader from "@/components/PanelHeader";
import SegmentedTabs from "@/components/SegmentedTabs";
import { DataTablePagination } from "@/components/DataTablePagination";
import { DATA_TABLE_SHELL, DATA_TABLE_EL, DATA_TABLE_HEAD_ROW } from "@/components/dataTable";
import type { ItemReconc } from "@shared/associativismo";

type Balde = "cadastrar" | "remover" | "ja";
const PAGE_SIZE = 25;

/** Formata CNPJ 14 dígitos como 00.000.000/0000-00 (só visual; o dado é o dígito puro). */
function fmtCnpj(c: string): string {
  if (c.length !== 14) return c;
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}
const grupoLabel = (cod: number | null, desc: string | null) =>
  cod == null ? "—" : `${desc || "(sem descrição)"} · ${cod}`;

export default function ComercialAssociativismo() {
  const [, setLocation] = useLocation();
  const [codGrupos, setCodGrupos] = useState<number[]>([]);
  const [comboOpen, setComboOpen] = useState(false);
  const [cnpjs, setCnpjs] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [balde, setBalde] = useState<Balde>("cadastrar");
  const [page, setPage] = useState(1);

  const gruposQuery = trpc.associativismo.listarGrupos.useQuery(undefined, { staleTime: 60_000 });
  const reconc = trpc.associativismo.reconciliar.useMutation();
  const resultado = reconc.data ?? null;

  const grupos = gruposQuery.data ?? [];
  const selSet = useMemo(() => new Set(codGrupos), [codGrupos]);
  const gruposSel = grupos.filter((g) => selSet.has(g.cod));
  const gruposRest = grupos.filter((g) => !selSet.has(g.cod));
  const clientesNoEscopo = gruposSel.reduce((a, g) => a + g.qtd, 0);

  function toggleGrupo(cod: number) {
    setCodGrupos((prev) => (prev.includes(cod) ? prev.filter((c) => c !== cod) : [...prev, cod]));
    reconc.reset();
  }

  async function onArquivo(file: File | undefined | null) {
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]!];
      const linhas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, raw: false });
      const lista: string[] = [];
      for (const l of linhas) {
        const c = Array.isArray(l) ? l[0] : undefined;
        if (c == null) continue;
        const dig = String(c).replace(/\D/g, "");
        if (dig.length >= 11) lista.push(dig); // pula o cabeçalho "CNPJ" (sem dígito)
      }
      if (lista.length === 0) {
        toast.error("Nenhum CNPJ encontrado na 1ª coluna da planilha.");
        return;
      }
      setCnpjs(lista);
      setFileName(file.name);
      reconc.reset();
      toast.success(`${lista.length} CNPJ(s) lidos de "${file.name}".`);
    } catch {
      toast.error("Não consegui ler a planilha. Use .xlsx ou .csv com os CNPJs na 1ª coluna.");
    }
  }

  function baixarModelo() {
    const ws = XLSX.utils.aoa_to_sheet([["CNPJ"], ["02215338000277"]]);
    ws["!cols"] = [{ wch: 22 }];
    for (const ref of ["A1", "A2"]) if (ws[ref]) { ws[ref]!.t = "s"; ws[ref]!.z = "@"; }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "CNPJs");
    XLSX.writeFile(wb, "modelo-associativismo.xlsx");
  }

  function conferir() {
    if (codGrupos.length === 0) return toast.error("Selecione ao menos um grupo.");
    if (cnpjs.length === 0) return toast.error("Envie a planilha de CNPJs.");
    setPage(1);
    setBalde("cadastrar");
    reconc.mutate({ codGrupos, cnpjs });
  }

  function exportarAcoes() {
    if (!resultado) return;
    const aoa: (string | number)[][] = [["CNPJ", "Ação", "Grupo atual"]];
    for (const i of resultado.aCadastrar) aoa.push([i.cnpj, "CADASTRAR", i.grupoAtualCod ?? "", i.grupoAtualDesc ?? ""]);
    for (const i of resultado.aRemover) aoa.push([i.cnpj, "REMOVER", i.grupoAtualCod ?? "", i.grupoAtualDesc ?? ""]);
    if (aoa.length === 1) return toast.info("Sem ações a exportar (nada a cadastrar ou remover).");
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 30 }];
    ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: 3, r: aoa.length - 1 } }) };
    for (let r = 1; r < aoa.length; r++) {
      const ref = XLSX.utils.encode_cell({ c: 0, r });
      if (ws[ref]) { ws[ref]!.t = "s"; ws[ref]!.z = "@"; }
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ações");
    const nomeBase =
      resultado.grupos.length === 1
        ? resultado.grupos[0]!.desc || String(resultado.grupos[0]!.cod)
        : `${resultado.grupos.length}-grupos`;
    XLSX.writeFile(wb, `acoes-associativismo-${nomeBase.replace(/[^\w-]+/g, "_")}.xlsx`);
  }

  const lista: ItemReconc[] = useMemo(() => {
    if (!resultado) return [];
    return balde === "cadastrar" ? resultado.aCadastrar : balde === "remover" ? resultado.aRemover : resultado.jaNoGrupo;
  }, [resultado, balde]);
  const listaPagina = useMemo(() => lista.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [lista, page]);

  const podeConferir = codGrupos.length > 0 && cnpjs.length > 0 && !reconc.isPending;

  const renderGrupoItem = (g: (typeof grupos)[number]) => (
    <CommandItem key={g.cod} value={`${g.desc} ${g.cod}`} onSelect={() => toggleGrupo(g.cod)}>
      <Checkbox checked={selSet.has(g.cod)} className="pointer-events-none mr-2" />
      <span className="min-w-0 flex-1 truncate">{g.desc}</span>
      <span className="ml-2 shrink-0 text-xs tabular-nums text-muted-foreground">{g.qtd}</span>
    </CommandItem>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-background">
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        {/* Header */}
        <PanelHeader
          onBack={() => setLocation("/comercial")}
          icon={Users2}
          title="Associativismo"
          subtitle="Conciliação de CNPJs por grupo"
        />

        {/* Passo 1: grupo + planilha */}
        <div className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:p-5 lg:grid-cols-2">
          {/* Grupo alvo */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">1. Grupo(s) de associativismo</label>
            <Popover open={comboOpen} onOpenChange={setComboOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={comboOpen}
                  className="w-full justify-between font-normal"
                  disabled={gruposQuery.isLoading}
                >
                  <span className="truncate">
                    {gruposQuery.isLoading
                      ? "Carregando grupos…"
                      : codGrupos.length === 0
                        ? "Selecione os grupos…"
                        : codGrupos.length === 1
                          ? gruposSel[0]?.desc ?? "1 grupo"
                          : `${codGrupos.length} grupos selecionados`}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar grupo…" />
                  <CommandList>
                    <CommandEmpty>Nenhum grupo encontrado.</CommandEmpty>
                    {gruposSel.length > 0 && (
                      <CommandGroup heading={`Selecionados (${gruposSel.length})`}>
                        {gruposSel.map(renderGrupoItem)}
                      </CommandGroup>
                    )}
                    <CommandGroup heading={gruposSel.length > 0 ? "Outros grupos" : undefined}>
                      {gruposRest.map(renderGrupoItem)}
                    </CommandGroup>
                  </CommandList>
                </Command>
                {codGrupos.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setCodGrupos([]);
                      reconc.reset();
                    }}
                    className="w-full border-t border-border px-3 py-2 text-left text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    Limpar ({codGrupos.length})
                  </button>
                )}
              </PopoverContent>
            </Popover>
            <p className="text-[11px] text-muted-foreground">
              {codGrupos.length > 0
                ? `${clientesNoEscopo} cliente(s) hoje no(s) grupo(s) selecionado(s).`
                : "A planilha define quem DEVE estar no(s) grupo(s) selecionado(s)."}
            </p>
          </div>

          {/* Planilha */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">2. Planilha de CNPJs</label>
            <div className="flex flex-wrap items-center gap-2">
              <label
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-border bg-background px-3 py-2 text-sm hover:bg-accent/40"
              >
                <Upload className="h-4 w-4 text-muted-foreground" />
                {fileName ? "Trocar planilha" : "Enviar planilha"}
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => onArquivo(e.target.files?.[0])}
                />
              </label>
              <Button type="button" variant="ghost" size="sm" onClick={baixarModelo} className="text-muted-foreground">
                <Download className="mr-1 h-4 w-4" /> Baixar modelo
              </Button>
            </div>
            {fileName ? (
              <p className="inline-flex items-center gap-1.5 text-[11px] text-emerald-600">
                <FileSpreadsheet className="h-3.5 w-3.5" /> {fileName} · {cnpjs.length} CNPJ(s)
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">1 coluna “CNPJ” (com ou sem máscara). .xlsx ou .csv.</p>
            )}
          </div>

          <div className="lg:col-span-2">
            <Button onClick={conferir} disabled={!podeConferir} className="w-full sm:w-auto">
              {reconc.isPending ? (
                <>
                  <RefreshCw className="mr-1.5 h-4 w-4 animate-spin" /> Conferindo…
                </>
              ) : (
                <>Conferir</>
              )}
            </Button>
          </div>
        </div>

        {reconc.isError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
            Falha ao conferir: {reconc.error.message}
          </div>
        )}

        {/* Resultado */}
        {resultado && (
          <>
            <KpiGrid cols={3}>
              <KpiCard
                title="Já no grupo"
                value={resultado.jaNoGrupo.length}
                icon={<CheckCircle2 />}
                iconColor="text-emerald-600"
                sublabel="nenhuma ação"
              />
              <KpiCard
                title="A cadastrar"
                value={resultado.aCadastrar.length}
                icon={<UserPlus />}
                iconColor="text-indigo-600"
                valueClassName={resultado.aCadastrar.length > 0 ? "text-indigo-600" : undefined}
                sublabel="mover para este grupo"
              />
              <KpiCard
                title="A remover"
                value={resultado.aRemover.length}
                icon={<UserMinus />}
                iconColor="text-rose-600"
                valueClassName={resultado.aRemover.length > 0 ? "text-rose-600" : undefined}
                sublabel="estão no grupo, fora da planilha"
              />
            </KpiGrid>

            <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <h2
                    className="truncate text-sm font-semibold text-foreground"
                    title={resultado.grupos.map((g) => g.desc || g.cod).join(", ")}
                  >
                    Resultado ·{" "}
                    {resultado.grupos.length === 1
                      ? resultado.grupos[0]!.desc || resultado.grupos[0]!.cod
                      : `${resultado.grupos.length} grupos`}
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    {resultado.totalPlanilha} CNPJ(s) na planilha
                    {resultado.ignorados > 0 ? ` · ${resultado.ignorados} fora da base (ignorados)` : ""}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={exportarAcoes}>
                  <FileDown className="mr-1.5 h-4 w-4" /> Gerar Excel de ações
                </Button>
              </div>

              <SegmentedTabs
                value={balde}
                onValueChange={(v) => {
                  setBalde(v as Balde);
                  setPage(1);
                }}
                options={[
                  { value: "cadastrar", label: `A cadastrar (${resultado.aCadastrar.length})` },
                  { value: "remover", label: `A remover (${resultado.aRemover.length})` },
                  { value: "ja", label: `Já no grupo (${resultado.jaNoGrupo.length})` },
                ]}
              />

              {lista.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Nada neste balde.</p>
              ) : (
                <>
                  <div className={cn(DATA_TABLE_SHELL, "mt-3 max-h-[60vh]")}>
                    <table className={DATA_TABLE_EL}>
                      <thead>
                        <tr className={DATA_TABLE_HEAD_ROW}>
                          <th className="px-3 py-2 text-left">CNPJ</th>
                          <th className="px-3 py-2 text-left">
                            {balde === "cadastrar" ? "Sai do grupo (atual)" : "Grupo atual"}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {listaPagina.map((i, idx) => (
                          <tr
                            key={i.cnpj}
                            className={cn(idx % 2 === 1 && "bg-slate-50 dark:bg-slate-900/40")}
                          >
                            <td className="px-3 py-2 font-mono tabular-nums text-foreground">{fmtCnpj(i.cnpj)}</td>
                            <td className="px-3 py-2 text-muted-foreground">{grupoLabel(i.grupoAtualCod, i.grupoAtualDesc)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {lista.length > PAGE_SIZE && (
                    <div className="mt-3">
                      <DataTablePagination
                        page={page}
                        pageSize={PAGE_SIZE}
                        total={lista.length}
                        onPageChange={setPage}
                        itemLabel="CNPJs"
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
