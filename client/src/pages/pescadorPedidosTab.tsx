/**
 * Aba Pedidos do módulo Pescador.
 *
 * Estratégia de dados (mesma do protótipo original): o servidor entrega os
 * itens flat (join pedido × item) UMA vez via `pescador.getPedidosItens`;
 * filtros, agregações (3 visões) e paginação acontecem client-side.
 *
 * Visões:
 *  - "item" (default): 1 card por SKU × status × motivo, expandindo nos pedidos.
 *  - "pedido": 1 card por pedido (chave natural CNPJ+CodPedCli+Desdob).
 *  - "flat": tabela plana de itens.
 *
 * Status reais do ERP: APROVADO | PARCIAL | REJEITADO TOTAL.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronRight,
  Minus,
  Package,
  Rows3,
  Search,
  ShoppingCart,
  X,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { DataTablePagination } from "@/components/DataTablePagination";

/* ─── Types ─────────────────────────────────────────────────────────────── */

type PedidoItemRow = {
  itemId: number;
  codInterno: string;
  ean: string | null;
  descricao: string | null;
  fabricante: string | null;
  politica: string | null;
  qtdSolicitada: number | null;
  qtdAtendida: number | null;
  statusAtendimento: string | null;
  motivoRejeicaoItem: string | null;
  precoUnitarioPedido: number | null;
  valorTotalItemPedido: number | null;
  qtdFaturada: number | null;
  pedidoId: number;
  dataPedido: string | null;
  numeroPedidoVenda: string;
  codigoPedidoCliente: string | null;
  cnpjCliente: string | null;
  numeroDesdobramento: number | null;
  valorTotalPedido: number | null;
};

type ViewMode = "item" | "pedido" | "flat";

/* ─── Formatters ────────────────────────────────────────────────────────── */

const brl = (n: number | null | undefined) =>
  n == null || Number.isNaN(Number(n))
    ? "—"
    : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });

const intFmt = (n: number | null | undefined) =>
  n == null || Number.isNaN(Number(n)) ? "—" : Number(n).toLocaleString("pt-BR");

function fdate(iso: string | null | undefined) {
  if (!iso) return "—";
  const parts = String(iso).slice(0, 10).split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : iso;
}

/** Chave natural do pedido (NUMERO_PEDIDO_VENDA = '0' em rejeitados). */
function pedKey(r: PedidoItemRow) {
  return `${r.cnpjCliente ?? ""}|${r.codigoPedidoCliente ?? ""}|${r.numeroDesdobramento ?? 0}`;
}

/** Identificador exibível do pedido. */
function pedidoLabel(r: PedidoItemRow) {
  const numVen = r.numeroPedidoVenda;
  if (numVen && numVen !== "0") return `#${numVen}`;
  return `cli ${r.codigoPedidoCliente ?? "—"}`;
}

/* ─── Badges de status ──────────────────────────────────────────────────── */

function StatusIcon({ st }: { st: string | null }) {
  if (st === "APROVADO") return <Check className="h-3.5 w-3.5 text-emerald-600" />;
  if (st === "PARCIAL") return <Minus className="h-3.5 w-3.5 text-amber-600" />;
  return <X className="h-3.5 w-3.5 text-rose-600" />;
}

function StatusTag({ st, extra }: { st: string; extra?: string }) {
  if (st === "APROVADO")
    return <span className="inline-flex items-center rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Aprovado{extra ? ` ${extra}` : ""}</span>;
  if (st === "PARCIAL")
    return <span className="inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Parcial{extra ? ` ${extra}` : ""}</span>;
  return <span className="inline-flex items-center rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">Rejeitado{extra ? ` ${extra}` : ""}</span>;
}

/** Status agregado de um pedido a partir dos seus itens (regra do protótipo). */
function pedidoStatus(itens: PedidoItemRow[]): { code: string; ap: number; re: number } {
  const ap = itens.filter((r) => r.statusAtendimento === "APROVADO").length;
  const re = itens.filter((r) => r.statusAtendimento === "REJEITADO TOTAL").length;
  if (re === 0) return { code: "APROVADO", ap, re };
  if (ap === 0) return { code: "REJEITADO TOTAL", ap, re };
  return { code: "PARCIAL", ap, re };
}

/* ─── Component ─────────────────────────────────────────────────────────── */

const PER_PAGE_CARDS = 20;
const PER_PAGE_FLAT = 50;

export default function PescadorPedidosTab({
  politica,
  onOpenProduto,
}: {
  /** Filtro global de política (valor "__todas__" = sem filtro) */
  politica: string;
  onOpenProduto: (produto: { codInterno: string; politica?: string }) => void;
}) {
  const itensQuery = trpc.pescador.getPedidosItens.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });

  const [view, setView] = useState<ViewMode>("item");
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("__todos__");
  const [motivo, setMotivo] = useState("__todos__");
  const [cnpj, setCnpj] = useState("__todos__");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [page, setPage] = useState(1);
  const [openCards, setOpenCards] = useState<Set<string>>(new Set());

  useEffect(() => {
    setPage(1);
    setOpenCards(new Set());
  }, [view, busca, status, motivo, cnpj, dataInicio, dataFim, politica]);

  const todos = useMemo(() => (itensQuery.data?.itens ?? []) as PedidoItemRow[], [itensQuery.data]);

  /* Facets derivadas do dataset completo */
  const facets = useMemo(() => {
    const motivos = new Map<string, number>();
    const cnpjs = new Set<string>();
    let minData: string | null = null;
    let maxData: string | null = null;
    for (const r of todos) {
      if (r.motivoRejeicaoItem) motivos.set(r.motivoRejeicaoItem, (motivos.get(r.motivoRejeicaoItem) ?? 0) + 1);
      if (r.cnpjCliente) cnpjs.add(r.cnpjCliente);
      if (r.dataPedido) {
        if (!minData || r.dataPedido < minData) minData = r.dataPedido;
        if (!maxData || r.dataPedido > maxData) maxData = r.dataPedido;
      }
    }
    return {
      motivos: Array.from(motivos.keys()).sort(),
      cnpjs: Array.from(cnpjs).sort().slice(0, 60),
      minData,
      maxData,
    };
  }, [todos]);

  /* Filtragem client-side (mesma ordem do protótipo) */
  const itens = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return todos.filter((r) => {
      if (politica !== "__todas__" && r.politica !== politica) return false;
      if (status !== "__todos__" && r.statusAtendimento !== status) return false;
      if (motivo !== "__todos__" && r.motivoRejeicaoItem !== motivo) return false;
      if (cnpj !== "__todos__" && r.cnpjCliente !== cnpj) return false;
      if (dataInicio && (r.dataPedido ?? "") < dataInicio) return false;
      if (dataFim && (r.dataPedido ?? "") > dataFim) return false;
      if (q) {
        const hay = `${r.codInterno} ${r.descricao ?? ""} ${r.ean ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [todos, politica, status, motivo, cnpj, dataInicio, dataFim, busca]);

  /* KPIs por SKU distinto (regra do protótipo: SKU rejeitado em 30 pedidos = 1) */
  const kpis = useMemo(() => {
    const peds = new Set(itens.map(pedKey));
    const skuStatus = new Map<string, { ap: number; pa: number; re: number }>();
    for (const r of itens) {
      let e = skuStatus.get(r.codInterno);
      if (!e) { e = { ap: 0, pa: 0, re: 0 }; skuStatus.set(r.codInterno, e); }
      if (r.statusAtendimento === "APROVADO") e.ap++;
      else if (r.statusAtendimento === "PARCIAL") e.pa++;
      else e.re++;
    }
    let dAp = 0, dPa = 0, dRe = 0;
    skuStatus.forEach((e) => { if (e.ap > 0) dAp++; if (e.pa > 0) dPa++; if (e.re > 0) dRe++; });
    return { skus: skuStatus.size, linhas: itens.length, pedidos: peds.size, aprov: dAp, parcial: dPa, rejeit: dRe };
  }, [itens]);

  /* Top motivos por SKUs distintos (top 6, clicáveis) */
  const topMotivos = useMemo(() => {
    const byMot = new Map<string, { skus: Set<string>; linhas: number }>();
    for (const r of itens) {
      const m = r.motivoRejeicaoItem;
      if (!m) continue;
      let e = byMot.get(m);
      if (!e) { e = { skus: new Set(), linhas: 0 }; byMot.set(m, e); }
      e.skus.add(r.codInterno);
      e.linhas++;
    }
    return Array.from(byMot.entries())
      .sort((a, b) => b[1].skus.size - a[1].skus.size)
      .slice(0, 6)
      .map(([m, e]) => ({ motivo: m, skus: e.skus.size, linhas: e.linhas }));
  }, [itens]);

  /* Chips de filtros ativos */
  const filtrosAtivos = useMemo(() => {
    const ativos: Array<{ label: string; onClear: () => void }> = [];
    if (status !== "__todos__") ativos.push({ label: `Status: ${status}`, onClear: () => setStatus("__todos__") });
    if (motivo !== "__todos__") ativos.push({ label: `Motivo: ${motivo}`, onClear: () => setMotivo("__todos__") });
    if (cnpj !== "__todos__") ativos.push({ label: `CNPJ: ${cnpj}`, onClear: () => setCnpj("__todos__") });
    if (dataInicio) ativos.push({ label: `De ${fdate(dataInicio)}`, onClear: () => setDataInicio("") });
    if (dataFim) ativos.push({ label: `Até ${fdate(dataFim)}`, onClear: () => setDataFim("") });
    if (busca.trim()) ativos.push({ label: `Busca: "${busca.trim()}"`, onClear: () => setBusca("") });
    return ativos;
  }, [status, motivo, cnpj, dataInicio, dataFim, busca]);

  function limparTudo() {
    setStatus("__todos__"); setMotivo("__todos__"); setCnpj("__todos__");
    setDataInicio(""); setDataFim(""); setBusca("");
  }

  function toggleCard(key: string) {
    setOpenCards((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /* Indica se há filtro de item ativo (afeta exibição do total na visão por pedido) */
  const itemFiltrado = status !== "__todos__" || motivo !== "__todos__" || !!busca.trim();

  /* ── Agrupamentos das visões ── */

  /* Visão por ITEM: grupos (cod + status + motivo), rejeitados primeiro */
  const gruposPorItem = useMemo(() => {
    if (view !== "item") return [];
    const groups = new Map<string, {
      cod: string; st: string; mt: string;
      desc: string; fab: string; ean: string; pol: string;
      pedidos: PedidoItemRow[]; pedSet: Set<string>;
      qtdSol: number; qtdAtend: number; valor: number;
    }>();
    for (const r of itens) {
      const st = r.statusAtendimento ?? "";
      const mt = r.motivoRejeicaoItem ?? "";
      const k = `${r.codInterno}|${st}|${mt}`;
      let g = groups.get(k);
      if (!g) {
        g = {
          cod: r.codInterno, st, mt,
          desc: r.descricao ?? "", fab: r.fabricante ?? "", ean: r.ean ?? "", pol: r.politica ?? "",
          pedidos: [], pedSet: new Set(), qtdSol: 0, qtdAtend: 0, valor: 0,
        };
        groups.set(k, g);
      }
      g.pedidos.push(r);
      g.pedSet.add(pedKey(r));
      g.qtdSol += r.qtdSolicitada ?? 0;
      g.qtdAtend += r.qtdAtendida ?? 0;
      g.valor += r.valorTotalItemPedido ?? 0;
    }
    const stOrder: Record<string, number> = { "REJEITADO TOTAL": 0, "PARCIAL": 1, "APROVADO": 2 };
    return Array.from(groups.values()).sort((a, b) => {
      const so = (stOrder[a.st] ?? 9) - (stOrder[b.st] ?? 9);
      if (so) return so;
      const np = b.pedSet.size - a.pedSet.size;
      if (np) return np;
      return b.valor - a.valor;
    });
  }, [itens, view]);

  /* Visão por PEDIDO: grupos pela chave natural, data desc */
  const gruposPorPedido = useMemo(() => {
    if (view !== "pedido") return [];
    const groups = new Map<string, PedidoItemRow[]>();
    for (const r of itens) {
      const k = pedKey(r);
      const arr = groups.get(k);
      if (arr) arr.push(r);
      else groups.set(k, [r]);
    }
    return Array.from(groups.entries()).sort((a, b) => {
      const da = a[1][0].dataPedido ?? "";
      const dbb = b[1][0].dataPedido ?? "";
      return dbb.localeCompare(da) || b[0].localeCompare(a[0]);
    });
  }, [itens, view]);

  /* Paginação client-side */
  const perPage = view === "flat" ? PER_PAGE_FLAT : PER_PAGE_CARDS;
  const totalRegistros = view === "item" ? gruposPorItem.length : view === "pedido" ? gruposPorPedido.length : itens.length;
  const totalPaginas = Math.max(1, Math.ceil(totalRegistros / perPage));
  const pageClamped = Math.min(page, totalPaginas);
  const sliceStart = (pageClamped - 1) * perPage;

  /* ─── Render ─────────────────────────────────────────────────────────── */

  if (itensQuery.isLoading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* KPIs por SKU distinto */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Itens únicos (SKU)</span>
          <span className="mt-2 font-bold tabular-nums text-2xl text-slate-800">{intFmt(kpis.skus)}</span>
          <span className="mt-1 text-[11px] text-muted-foreground">{intFmt(kpis.linhas)} linhas em {intFmt(kpis.pedidos)} pedido(s)</span>
        </div>
        <div className="flex flex-col rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">SKUs com aprovação</span>
          <span className="mt-2 font-bold tabular-nums text-2xl text-emerald-700">{intFmt(kpis.aprov)}</span>
          <span className="mt-1 text-[11px] text-muted-foreground">em ao menos 1 pedido</span>
        </div>
        <div className="flex flex-col rounded-xl border border-amber-200 bg-amber-50 p-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">SKUs com atend. parcial</span>
          <span className="mt-2 font-bold tabular-nums text-2xl text-amber-700">{intFmt(kpis.parcial)}</span>
          <span className="mt-1 text-[11px] text-muted-foreground">em ao menos 1 pedido</span>
        </div>
        <div className="flex flex-col rounded-xl border border-rose-200 bg-rose-50 p-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-rose-700">SKUs com rejeição</span>
          <span className="mt-2 font-bold tabular-nums text-2xl text-rose-700">{intFmt(kpis.rejeit)}</span>
          <span className="mt-1 text-[11px] text-muted-foreground">em ao menos 1 pedido</span>
        </div>
      </div>

      {/* Top motivos de rejeição (clicáveis) */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Top motivos de rejeição (SKUs distintos)
        </span>
        {topMotivos.length === 0 ? (
          <span className="text-xs text-slate-400">— nenhuma rejeição com motivo no recorte</span>
        ) : topMotivos.map((m) => (
          <button
            key={m.motivo}
            type="button"
            title={`${m.linhas} linhas em pedidos — ${m.skus} SKUs únicos`}
            onClick={() => setMotivo(motivo === m.motivo ? "__todos__" : m.motivo)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition",
              motivo === m.motivo
                ? "border-rose-400 bg-rose-100 font-semibold text-rose-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100",
            )}
          >
            {m.motivo}
            <span className="rounded bg-slate-900/80 px-1.5 text-[10px] font-bold text-white">{intFmt(m.skus)}</span>
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <Card className="border border-slate-200">
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar produto, código, EAN…"
              className="h-8 rounded-lg border-slate-200 bg-slate-50 pl-8 text-xs" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-8 w-auto min-w-[120px] rounded-lg text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__todos__">Todos os status</SelectItem>
              <SelectItem value="APROVADO">Aprovado</SelectItem>
              <SelectItem value="PARCIAL">Parcial</SelectItem>
              <SelectItem value="REJEITADO TOTAL">Rejeitado</SelectItem>
            </SelectContent>
          </Select>
          <Select value={motivo} onValueChange={setMotivo}>
            <SelectTrigger className="h-8 w-auto min-w-[160px] rounded-lg text-xs">
              <SelectValue placeholder="Motivo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__todos__">Todos os motivos</SelectItem>
              {facets.motivos.map((m) => (<SelectItem key={m} value={m}>{m}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={cnpj} onValueChange={setCnpj}>
            <SelectTrigger className="h-8 w-auto min-w-[150px] rounded-lg text-xs">
              <SelectValue placeholder="CNPJ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__todos__">Todas as lojas</SelectItem>
              {facets.cnpjs.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Período</span>
            <Input type="date" value={dataInicio} min={facets.minData ?? undefined} max={facets.maxData ?? undefined}
              onChange={(e) => setDataInicio(e.target.value)}
              className="h-8 w-[140px] rounded-lg border-slate-200 bg-slate-50 text-xs" />
            <span className="text-xs text-slate-400">→</span>
            <Input type="date" value={dataFim} min={facets.minData ?? undefined} max={facets.maxData ?? undefined}
              onChange={(e) => setDataFim(e.target.value)}
              className="h-8 w-[140px] rounded-lg border-slate-200 bg-slate-50 text-xs" />
          </div>

          {/* Alternância de visualização */}
          <div className="ml-auto inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
            {([
              ["item", "Por item", Package],
              ["pedido", "Por pedido", ShoppingCart],
              ["flat", "Tabela", Rows3],
            ] as const).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition",
                  view === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Chips de filtros ativos */}
      {filtrosAtivos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {filtrosAtivos.map((f) => (
            <button key={f.label} type="button" onClick={f.onClear}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100">
              {f.label}<X className="h-3 w-3" />
            </button>
          ))}
          <button type="button" onClick={limparTudo}
            className="text-xs font-medium text-slate-500 underline-offset-2 hover:underline">
            limpar todos
          </button>
        </div>
      )}

      {/* Contagem do recorte */}
      <p className="text-xs text-slate-500">
        {view === "item" && `${intFmt(gruposPorItem.length)} item(ns) único(s) · ${intFmt(itens.length)} linha(s) em ${intFmt(kpis.pedidos)} pedido(s)`}
        {view === "pedido" && `${intFmt(gruposPorPedido.length)} pedido(s) · ${intFmt(itens.length)} item(ns) no recorte`}
        {view === "flat" && `${intFmt(itens.length)} linha(s) no recorte`}
      </p>

      {/* ── VISÃO POR ITEM ── */}
      {view === "item" && (
        <div className="space-y-2">
          {gruposPorItem.length === 0 && (
            <Card className="border border-slate-200">
              <CardContent className="p-10 text-center text-sm text-muted-foreground">
                Nenhum item nesse recorte. Ajuste os filtros.
              </CardContent>
            </Card>
          )}
          {gruposPorItem.slice(sliceStart, sliceStart + perPage).map((g) => {
            const cardKey = `${g.cod}|${g.st}|${g.mt}`;
            const isOpen = openCards.has(cardKey);
            return (
              <Card key={cardKey} className="overflow-hidden border border-slate-200">
                <button
                  type="button"
                  className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
                  onClick={() => toggleCard(cardKey)}
                >
                  <ChevronRight className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", isOpen && "rotate-90")} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        role="link"
                        tabIndex={0}
                        className="font-mono text-sky-700 hover:underline"
                        onClick={(e) => { e.stopPropagation(); onOpenProduto({ codInterno: g.cod, politica: g.pol || undefined }); }}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onOpenProduto({ codInterno: g.cod, politica: g.pol || undefined }); } }}
                      >
                        {g.cod}
                      </span>
                      <span className="truncate text-sm font-medium">{g.desc}</span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {g.fab || "—"} · {g.pol || "—"} · EAN <span className="font-mono">{g.ean || "—"}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-center">
                    <div>
                      <div className="text-[10px] uppercase text-slate-400">Pedidos</div>
                      <div className="text-sm font-semibold tabular-nums">{intFmt(g.pedSet.size)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-slate-400">Solicit.</div>
                      <div className="text-sm font-semibold tabular-nums">{intFmt(g.qtdSol)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-slate-400">Atend.</div>
                      <div className={cn("text-sm font-semibold tabular-nums", g.qtdAtend < g.qtdSol ? "text-rose-600" : "text-emerald-600")}>
                        {intFmt(g.qtdAtend)}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1.5">
                      <StatusTag st={g.st} />
                      {g.mt && <span className="max-w-[180px] truncate rounded bg-rose-50 px-1.5 py-0.5 text-[10px] text-rose-600" title={g.mt}>{g.mt}</span>}
                    </div>
                    <span className="text-sm font-bold tabular-nums">{brl(g.valor)}</span>
                  </div>
                </button>
                {isOpen && (
                  <div className="overflow-x-auto border-t border-slate-100 bg-slate-50/50 px-4 py-3">
                    <table className="w-full text-xs">
                      <thead className="text-slate-500">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-semibold">Pedido</th>
                          <th className="px-2 py-1.5 text-left font-semibold">Data</th>
                          <th className="px-2 py-1.5 text-left font-semibold">CNPJ</th>
                          <th className="px-2 py-1.5 text-right font-semibold">Sol.</th>
                          <th className="px-2 py-1.5 text-right font-semibold">Atend.</th>
                          <th className="px-2 py-1.5 text-right font-semibold">Pç un.</th>
                          <th className="px-2 py-1.5 text-right font-semibold">Valor do item</th>
                          <th className="px-2 py-1.5 text-right font-semibold">Total do pedido</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...g.pedidos]
                          .sort((a, b) => (b.dataPedido ?? "").localeCompare(a.dataPedido ?? ""))
                          .map((r) => (
                            <tr key={r.itemId} className="border-t border-slate-100">
                              <td className="px-2 py-1.5 font-mono">{pedidoLabel(r)}</td>
                              <td className="px-2 py-1.5">{fdate(r.dataPedido)}</td>
                              <td className="px-2 py-1.5 font-mono text-[11px]">{r.cnpjCliente ?? "—"}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums">{intFmt(r.qtdSolicitada)}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums">{intFmt(r.qtdAtendida)}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums">{brl(r.precoUnitarioPedido)}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums">{brl(r.valorTotalItemPedido)}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums text-slate-400" title="Valor total do pedido completo, incluindo outros itens">
                                {brl(r.valorTotalPedido)}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ── VISÃO POR PEDIDO ── */}
      {view === "pedido" && (
        <div className="space-y-2">
          {gruposPorPedido.length === 0 && (
            <Card className="border border-slate-200">
              <CardContent className="p-10 text-center text-sm text-muted-foreground">
                Nenhum pedido nesse recorte. Ajuste os filtros ou o período.
              </CardContent>
            </Card>
          )}
          {gruposPorPedido.slice(sliceStart, sliceStart + perPage).map(([key, its]) => {
            const head = its[0];
            const st = pedidoStatus(its);
            const totalParcial = its.reduce((s, r) => s + (r.valorTotalItemPedido ?? 0), 0);
            const totalPedido = head.valorTotalPedido ?? 0;
            const cropped = itemFiltrado && totalParcial + 0.01 < totalPedido;
            const isOpen = openCards.has(key);
            return (
              <Card key={key} className="overflow-hidden border border-slate-200">
                <button
                  type="button"
                  className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
                  onClick={() => toggleCard(key)}
                >
                  <ChevronRight className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", isOpen && "rotate-90")} />
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-sm font-semibold">{pedidoLabel(head)}</div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {fdate(head.dataPedido)} · CNPJ {head.cnpjCliente ?? "—"} · {its.length} ite{its.length === 1 ? "m" : "ns"}
                      {cropped ? " (filtrado · pedido tem outros itens fora do recorte)" : ""}
                    </p>
                  </div>
                  <StatusTag st={st.code} extra={st.code === "PARCIAL" ? `· ${st.ap} ok / ${st.re} rej` : undefined} />
                  <div className="flex flex-col items-end">
                    <span className="text-sm font-bold tabular-nums">{brl(cropped ? totalParcial : totalPedido)}</span>
                    {cropped && <span className="text-[10px] text-slate-400">de {brl(totalPedido)} no pedido</span>}
                  </div>
                </button>
                {isOpen && (
                  <div className="overflow-x-auto border-t border-slate-100 bg-slate-50/50 px-4 py-3">
                    <table className="w-full text-xs">
                      <thead className="text-slate-500">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-semibold">Cód</th>
                          <th className="px-2 py-1.5 text-left font-semibold">Descrição</th>
                          <th className="px-2 py-1.5 text-left font-semibold">Fabricante</th>
                          <th className="px-2 py-1.5 text-right font-semibold">Sol.</th>
                          <th className="px-2 py-1.5 text-right font-semibold">Atend.</th>
                          <th className="px-2 py-1.5 text-left font-semibold">Status</th>
                          <th className="px-2 py-1.5 text-left font-semibold">Motivo</th>
                          <th className="px-2 py-1.5 text-right font-semibold">Pç un.</th>
                          <th className="px-2 py-1.5 text-right font-semibold">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {its.map((r) => (
                          <tr key={r.itemId} className="border-t border-slate-100">
                            <td className="px-2 py-1.5">
                              <button
                                type="button"
                                className="font-mono text-sky-700 hover:underline"
                                onClick={() => onOpenProduto({ codInterno: r.codInterno, politica: r.politica ?? undefined })}
                              >
                                {r.codInterno}
                              </button>
                            </td>
                            <td className="min-w-[200px] whitespace-normal px-2 py-1.5">{r.descricao ?? "—"}</td>
                            <td className="px-2 py-1.5 text-slate-600">{r.fabricante ?? "—"}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{intFmt(r.qtdSolicitada)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{intFmt(r.qtdAtendida)}</td>
                            <td className="px-2 py-1.5">
                              <span className="inline-flex items-center gap-1">
                                <StatusIcon st={r.statusAtendimento} />
                                <StatusTag st={r.statusAtendimento ?? ""} />
                              </span>
                            </td>
                            <td className="whitespace-normal px-2 py-1.5 text-rose-600">{r.motivoRejeicaoItem ?? ""}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{brl(r.precoUnitarioPedido)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{brl(r.valorTotalItemPedido)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ── TABELA PLANA ── */}
      {view === "flat" && (
        <Card className="border border-slate-200">
          <CardContent className="p-0">
            <div className="overflow-x-auto overflow-y-auto max-h-[65vh] overscroll-x-contain isolate">
              <table className="w-max min-w-full text-xs border-separate border-spacing-0">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    {["Data", "Pedido", "CNPJ", "Cód", "Descrição", "Política", "Sol.", "Atend.", "Status", "Motivo", "Pç un.", "Total"].map((h, i) => (
                      <th key={h} className={cn(
                        "sticky top-0 z-30 bg-slate-900 px-2.5 py-2 text-xs font-semibold",
                        [6, 7, 10, 11].includes(i) ? "text-right" : "text-left",
                      )}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {itens.length === 0 && (
                    <tr>
                      <td colSpan={12} className="px-3 py-10 text-center text-muted-foreground">
                        Nenhuma linha no recorte.
                      </td>
                    </tr>
                  )}
                  {itens.slice(sliceStart, sliceStart + perPage).map((r, index) => {
                    const rowBackground = index % 2 === 0 ? "#ffffff" : "#f8fafc";
                    return (
                      <tr key={r.itemId} className="transition-colors hover:bg-slate-50" style={{ backgroundColor: rowBackground }}>
                        <td className="border-b border-slate-100 px-2.5 py-1.5">{fdate(r.dataPedido)}</td>
                        <td className="border-b border-slate-100 px-2.5 py-1.5 font-mono">{pedidoLabel(r)}</td>
                        <td className="border-b border-slate-100 px-2.5 py-1.5 font-mono text-[11px]">{r.cnpjCliente ?? "—"}</td>
                        <td className="border-b border-slate-100 px-2.5 py-1.5">
                          <button
                            type="button"
                            className="font-mono text-sky-700 hover:underline"
                            onClick={() => onOpenProduto({ codInterno: r.codInterno, politica: r.politica ?? undefined })}
                          >
                            {r.codInterno}
                          </button>
                        </td>
                        <td className="max-w-[280px] border-b border-slate-100 px-2.5 py-1.5">
                          <span className="block truncate" title={r.descricao ?? ""}>{r.descricao ?? "—"}</span>
                        </td>
                        <td className="max-w-[160px] border-b border-slate-100 px-2.5 py-1.5 text-slate-600">
                          <span className="block truncate" title={r.politica ?? ""}>{r.politica ?? "—"}</span>
                        </td>
                        <td className="border-b border-slate-100 px-2.5 py-1.5 text-right tabular-nums">{intFmt(r.qtdSolicitada)}</td>
                        <td className="border-b border-slate-100 px-2.5 py-1.5 text-right tabular-nums">{intFmt(r.qtdAtendida)}</td>
                        <td className="border-b border-slate-100 px-2.5 py-1.5"><StatusTag st={r.statusAtendimento ?? ""} /></td>
                        <td className="max-w-[220px] border-b border-slate-100 px-2.5 py-1.5 text-rose-600">
                          <span className="block truncate" title={r.motivoRejeicaoItem ?? ""}>{r.motivoRejeicaoItem ?? ""}</span>
                        </td>
                        <td className="border-b border-slate-100 px-2.5 py-1.5 text-right tabular-nums">{brl(r.precoUnitarioPedido)}</td>
                        <td className="border-b border-slate-100 px-2.5 py-1.5 text-right tabular-nums">{brl(r.valorTotalItemPedido)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Paginação (padrão do projeto) */}
      {totalRegistros > 0 && (
        <DataTablePagination
          page={pageClamped}
          pageSize={perPage}
          total={totalRegistros}
          onPageChange={setPage}
          itemLabel="registros"
        />
      )}
    </div>
  );
}
