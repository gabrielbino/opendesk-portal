import { describe, it, expect, vi, beforeEach } from "vitest";

import { historicoVendas, loteSuperestoque, superestoque } from "../drizzle/schema";
import { rotateRegionalProducts } from "./db/superestocados";
import type { CsvRotationRow } from "./superestocadosConnectorIngestion";

// Mocka o módulo `./db` para controlar o que `getDb()` devolve dentro de
// `db/superestocados.ts` (que importa `getDb` de `../db`).
vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

// Mocka o módulo de parâmetros para retornar defaults sem acessar o banco
vi.mock("./db/parametros", () => ({
  getSuperestocadosParams: vi.fn().mockResolvedValue({
    DIAS_ESTOQUE_ENTRADA: 90,
    DIAS_ESTOQUE_SAIDA_MEDICAMENTO: 60,
    DIAS_ESTOQUE_SAIDA_NAO_MEDICAMENTO: 45,
    DIAS_CADASTRO_MINIMO: 60,
    SLOTS_POR_REGIAO_TIPO: 50,
    ZERADO_SLOTS_POR_REGIAO: 10,
    VENDA_MEDIA_MINIMA: 1,
    MESES_ESTOQUE_IDEAL: 2,
    DIAS_SEM_VENDA_ALERTA: 3,
    ROTATIVIDADE_SEMANA: 3,
    ROTATIVIDADE_DIA_UTIL: true,
  }),
  invalidateParametrosCache: vi.fn(),
}));

import { getDb } from "./db";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures e fake DB
// ─────────────────────────────────────────────────────────────────────────────

type FakeProductRow = {
  id: number;
  codigo: number;
  tipoProduto: "medicamento" | "nao_medicamento";
  diasEstoque: number;
  estoqueAtual: number;
  vendaMedia: number;
  vendaZeradaEntradaEm: Date | null;
  vendaZeradaEstoqueInicial: number | null;
};

type CapturedOps = {
  inserts: Array<{ table: unknown; values: any }>;
  updates: Array<{ set: any }>;
  deletes: Array<{ table: unknown }>;
};

/**
 * Fake DB chainable mínimo que `rotateRegionalProducts` consome.
 * - `select(...).from(...).where(...)` devolve o estado inicial passado.
 * - `insert(table).values(v)` captura.
 * - `update(table).set(s).where(w)` captura.
 * - `delete(table).where(w)` captura.
 *
 * A implementação assume **1 único** `select` durante a execução — coerente
 * com o `rotateRegionalProducts` atual, que faz toda a re-classificação em
 * memória após o select inicial.
 */
function createFakeDb(initialProducts: FakeProductRow[]) {
  const captured: CapturedOps = { inserts: [], updates: [], deletes: [] };

  const fakeDb = {
    select: () => ({
      from: () => ({
        where: async () => initialProducts,
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: any) => {
        captured.inserts.push({ table, values });
        return {
          onDuplicateKeyUpdate: async () => {},
        };
      },
    }),
    update: (_table: unknown) => ({
      set: (set: any) => ({
        where: async () => {
          captured.updates.push({ set });
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: async () => {
        captured.deletes.push({ table });
      },
    }),
  };

  return { fakeDb, captured };
}

function buildCsvRow(
  partial: Partial<CsvRotationRow> & Pick<CsvRotationRow, "codigo">,
): CsvRotationRow {
  return {
    nomeProduto: `Produto ${partial.codigo}`,
    fornecedor: "Fornecedor X",
    categoria: "medicamento",
    dataUltimaCompra: null,
    diasEstoque: 100,
    estoqueAtual: 100,
    valorCusto: 1000,
    vendaMedia: 2,
    codLote: null,
    vencimentoLote: null,
    estoqueLote: null,
    ...partial,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Testes
// ─────────────────────────────────────────────────────────────────────────────

describe("rotateRegionalProducts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preenche painel vazio com candidatos do CSV ordenados por valorCusto DESC (bootstrap)", async () => {
    const { fakeDb, captured } = createFakeDb([]);
    vi.mocked(getDb).mockResolvedValue(fakeDb as any);

    const csvRows: CsvRotationRow[] = [
      buildCsvRow({ codigo: 1, valorCusto: 500, vendaMedia: 2, diasEstoque: 100 }),
      buildCsvRow({ codigo: 2, valorCusto: 5000, vendaMedia: 3, diasEstoque: 120 }),
      buildCsvRow({ codigo: 3, valorCusto: 50, vendaMedia: 1.5, diasEstoque: 91 }),
    ];

    const result = await rotateRegionalProducts("SC", csvRows);

    expect(result.removed).toBe(0);
    expect(result.inserted).toBe(3);
    expect(result.updated).toBe(0);
    expect(result.zeradosInserted).toBe(0);

    // Os 3 inserts são no painel principal (tabela superestoque).
    const supInserts = captured.inserts.filter((i) => i.table === superestoque);
    expect(supInserts).toHaveLength(3);

    // Ordem por valorCusto DESC: codigo 2 (5000) → 1 (500) → 3 (50).
    expect(supInserts.map((i) => i.values.codigo)).toEqual([2, 1, 3]);

    // Nenhum entra no painel de zerados.
    expect(supInserts.every((i) => i.values.vendaZeradaEntradaEm === undefined)).toBe(true);

    // Nenhum delete colateral em lote/historico.
    expect(captured.deletes).toHaveLength(0);
  });

  it("sem limite de slots: candidato qualificado entra mesmo com painel cheio", async () => {
    // 50 medicamentos no painel principal, todos acima do limiar de saída (60).
    const incumbents: FakeProductRow[] = Array.from({ length: 50 }, (_, i) => ({
      id: i + 1,
      codigo: 1000 + i,
      tipoProduto: "medicamento" as const,
      diasEstoque: 95,
      estoqueAtual: 500,
      vendaMedia: 2,
      vendaZeradaEntradaEm: null,
      vendaZeradaEstoqueInicial: null,
    }));

    const { fakeDb, captured } = createFakeDb(incumbents);
    vi.mocked(getDb).mockResolvedValue(fakeDb as any);

    const csvRows: CsvRotationRow[] = [
      // Atualizações que mantêm os incumbentes acima do limiar de saída.
      ...incumbents.map((p) =>
        buildCsvRow({
          codigo: p.codigo,
          diasEstoque: 95,
          estoqueAtual: 500,
          valorCusto: 1000,
          vendaMedia: 2,
        }),
      ),
      // Candidato qualificado — DEVE entrar (sem limite de slots).
      buildCsvRow({ codigo: 9999, diasEstoque: 200, valorCusto: 999_999, vendaMedia: 10 }),
    ];

    const result = await rotateRegionalProducts("SC", csvRows);

    expect(result.removed).toBe(0);   // ninguém saiu (95 > 60)
    expect(result.inserted).toBe(1);  // candidato 9999 entra (sem cap)
    expect(result.updated).toBe(50);  // todos os incumbentes atualizados na parte 0

    // Nenhum delete em superestoque.
    expect(captured.deletes.filter((d) => d.table === superestoque)).toHaveLength(0);
    // 1 insert em superestoque (candidato 9999).
    expect(captured.inserts.filter((i) => i.table === superestoque)).toHaveLength(1);
  });

  it("promovido qualificado entra no painel principal (sem limite de slots)", async () => {
    // Painel com 50 medicamentos incumbentes (todos sobrevivem).
    const incumbents: FakeProductRow[] = Array.from({ length: 50 }, (_, i) => ({
      id: i + 1,
      codigo: 1000 + i,
      tipoProduto: "medicamento" as const,
      diasEstoque: 95,
      estoqueAtual: 500,
      vendaMedia: 2,
      vendaZeradaEntradaEm: null,
      vendaZeradaEstoqueInicial: null,
    }));

    // 1 produto vindo do painel de zerados — vendaMedia subiu para >= 1 no CSV de hoje.
    const promovido: FakeProductRow = {
      id: 999,
      codigo: 7777,
      tipoProduto: "medicamento",
      diasEstoque: 95,
      estoqueAtual: 100,
      vendaMedia: 0.5, // valor "antigo" no DB
      vendaZeradaEntradaEm: new Date("2026-05-01"),
      vendaZeradaEstoqueInicial: 100,
    };

    const { fakeDb, captured } = createFakeDb([...incumbents, promovido]);
    vi.mocked(getDb).mockResolvedValue(fakeDb as any);

    const csvRows: CsvRotationRow[] = [
      ...incumbents.map((p) =>
        buildCsvRow({
          codigo: p.codigo,
          diasEstoque: 95,
          estoqueAtual: 500,
          valorCusto: 1000,
          vendaMedia: 2,
        }),
      ),
      // Promovido qualifica para entrada (95 > 90) — agora entra sem limite.
      buildCsvRow({
        codigo: 7777,
        diasEstoque: 95,
        vendaMedia: 1.8,
        valorCusto: 100,
        estoqueAtual: 100,
      }),
    ];

    const result = await rotateRegionalProducts("SC", csvRows);

    // Promovido entra no painel principal (sem cap, não é mais "perdedor").
    expect(result.removed).toBe(0);
    expect(result.inserted).toBe(0); // promovido já existe no DB, só é atualizado
    expect(result.zeradosRemoved).toBe(0);

    // O promovido foi atualizado (vendaZeradaEntradaEm = null) via update, não deletado.
    const promovidoUpdates = captured.updates.filter(
      (u) => u.set?.vendaZeradaEntradaEm === null
    );
    expect(promovidoUpdates.length).toBeGreaterThanOrEqual(1);
  });

  it("remove incumbente que caiu abaixo do limiar de saída e preenche slot com novo candidato", async () => {
    const incumbent: FakeProductRow = {
      id: 1,
      codigo: 100,
      tipoProduto: "medicamento",
      diasEstoque: 70, // estado anterior — acima do limiar de saída
      estoqueAtual: 100,
      vendaMedia: 2,
      vendaZeradaEntradaEm: null,
      vendaZeradaEstoqueInicial: null,
    };

    const { fakeDb, captured } = createFakeDb([incumbent]);
    vi.mocked(getDb).mockResolvedValue(fakeDb as any);

    const csvRows: CsvRotationRow[] = [
      // Incumbente caiu para 50 dias → resolveu, sai (50 <= 60).
      buildCsvRow({ codigo: 100, diasEstoque: 50, estoqueAtual: 60, vendaMedia: 2, valorCusto: 1000 }),
      // Novo candidato qualificado.
      buildCsvRow({ codigo: 200, diasEstoque: 120, vendaMedia: 3, valorCusto: 8000 }),
    ];

    const result = await rotateRegionalProducts("SC", csvRows);

    expect(result.updated).toBe(1);   // incumbente atualizado na parte 0
    expect(result.removed).toBe(1);   // incumbente saiu por critério de saída
    expect(result.inserted).toBe(1);  // candidato 200 preencheu o slot

    const supInserts = captured.inserts.filter((i) => i.table === superestoque);
    expect(supInserts).toHaveLength(1);
    expect(supInserts[0].values.codigo).toBe(200);
    expect(supInserts[0].values.tipoProduto).toBe("medicamento");
    expect(supInserts[0].values.vendaZeradaEntradaEm).toBeUndefined();
  });
});
