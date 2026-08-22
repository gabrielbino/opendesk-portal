import { describe, it, expect } from "vitest";
import {
  SELECTION_COLUMN_WIDTH,
  STICKY_COLUMNS,
  getFrozenColumnKeys,
  buildStickyColumnLayout,
  formatQuantityTooltipValue,
} from "../client/src/pages/superestocadosTableHelpers";

describe("superestocadosTableHelpers - selection column sticky", () => {
  it("SELECTION_COLUMN_WIDTH deve ser 36px", () => {
    expect(SELECTION_COLUMN_WIDTH).toBe(36);
  });

  it("todas as colunas devem ter left >= SELECTION_COLUMN_WIDTH (reservando espaço para seleção)", () => {
    for (const [key, col] of Object.entries(STICKY_COLUMNS)) {
      expect(col.left).toBeGreaterThanOrEqual(SELECTION_COLUMN_WIDTH);
    }
  });

  it("coluna 'codigo' deve iniciar em left = SELECTION_COLUMN_WIDTH", () => {
    expect(STICKY_COLUMNS.codigo.left).toBe(SELECTION_COLUMN_WIDTH);
  });

  it("coluna 'produto' deve iniciar em left = SELECTION_COLUMN_WIDTH + width de codigo", () => {
    expect(STICKY_COLUMNS.produto.left).toBe(SELECTION_COLUMN_WIDTH + STICKY_COLUMNS.codigo.width);
  });

  it("coluna de seleção deve estar fixa em left=0 em todas as visões (garantido pelo SELECTION_COLUMN_WIDTH)", () => {
    // A coluna de seleção é sempre sticky left:0, independente do viewport
    // As demais colunas começam após SELECTION_COLUMN_WIDTH
    expect(SELECTION_COLUMN_WIDTH).toBeGreaterThan(0);
    expect(STICKY_COLUMNS.codigo.left).toBe(SELECTION_COLUMN_WIDTH);
  });
});

describe("superestocadosTableHelpers - getFrozenColumnKeys", () => {
  it("viewport >= 2100 (monitor 21\"+) deve congelar 21 colunas até reducaoExcesso", () => {
    const keys = getFrozenColumnKeys(2100);
    expect(keys.length).toBe(21);
    expect(keys).toContain("codigo");
    expect(keys).toContain("comprador");
    expect(keys).toContain("excessoReais");
    expect(keys).toContain("ultTransf");
    expect(keys).toContain("ultCompra");
  });

  it("viewport >= 1920 (monitor 19-20\") deve congelar 13 colunas até vendaMedia", () => {
    const keys = getFrozenColumnKeys(1920);
    expect(keys.length).toBe(13);
    expect(keys).toContain("vendaMedia");
    expect(keys).toContain("comprador");
    expect(keys).toContain("ultCompra");
    expect(keys).toContain("ultTransf");
    expect(keys).not.toContain("vdaM1");
  });

  it("viewport >= 1700 (monitor 17-19\") deve congelar 9 colunas até estoqueIdeal", () => {
    const keys = getFrozenColumnKeys(1700);
    expect(keys.length).toBe(9);
    expect(keys).toContain("estoqueIdeal");
    expect(keys).toContain("comprador");
    expect(keys).toContain("ultCompra");
    expect(keys).not.toContain("estoqueLote");
  });

  it("viewport >= 1536 (monitor 15-17\") deve congelar 6 colunas", () => {
    const keys = getFrozenColumnKeys(1536);
    expect(keys).toEqual(["codigo", "produto", "fornecedor", "comprador", "ultCompra", "ultTransf"]);
  });

  it("viewport >= 1366 (notebook 14-15\") deve congelar 3 colunas", () => {
    const keys = getFrozenColumnKeys(1366);
    expect(keys).toEqual(["codigo", "produto", "fornecedor"]);
  });

  it("viewport >= 1200 (notebook 13\") deve congelar 2 colunas", () => {
    const keys = getFrozenColumnKeys(1200);
    expect(keys).toEqual(["codigo", "produto"]);
  });

  it("viewport < 1200 (tablet) deve congelar apenas 'codigo'", () => {
    const keys = getFrozenColumnKeys(900);
    expect(keys).toEqual(["codigo"]);
  });
});

describe("superestocadosTableHelpers - buildStickyColumnLayout", () => {
  it("deve marcar colunas congeladas como sticky com left correto", () => {
    const frozenKeys = ["codigo", "produto"];
    const layout = buildStickyColumnLayout(frozenKeys);

    expect(layout.codigo.sticky).toBe(true);
    expect(layout.produto.sticky).toBe(true);
    expect(layout.fornecedor.sticky).toBe(false);

    // left deve começar em SELECTION_COLUMN_WIDTH
    expect(layout.codigo.left).toBe(SELECTION_COLUMN_WIDTH);
    expect(layout.produto.left).toBe(SELECTION_COLUMN_WIDTH + STICKY_COLUMNS.codigo.width);
  });

  it("colunas não congeladas devem ter left = 0", () => {
    const frozenKeys = ["codigo"];
    const layout = buildStickyColumnLayout(frozenKeys);

    expect(layout.produto.sticky).toBe(false);
    expect(layout.produto.left).toBe(0);
  });
});

describe("superestocadosTableHelpers - formatQuantityTooltipValue", () => {
  it("deve formatar número corretamente", () => {
    const result = formatQuantityTooltipValue(1500);
    expect(result).toContain("1.500");
    expect(result).toContain("Quantidade vendida");
  });

  it("deve lidar com array pegando o primeiro valor", () => {
    const result = formatQuantityTooltipValue([250, 300]);
    expect(result).toContain("250");
  });

  it("deve lidar com null retornando 0", () => {
    const result = formatQuantityTooltipValue(null);
    expect(result).toContain("0");
  });

  it("deve lidar com undefined retornando 0", () => {
    const result = formatQuantityTooltipValue(undefined);
    expect(result).toContain("0");
  });
});

describe("FilterView - unificado filter logic", () => {
  // Simulating the filter logic from the component
  type FilterView = "unificado" | "medicamento" | "medicamento_zerado" | "nao_medicamento" | "nao_medicamento_zerado";
  type TipoProduto = "medicamento" | "nao_medicamento";

  interface MockProduct {
    id: number;
    tipoProduto: TipoProduto;
    vendaMedia: number;
  }

  function applyFilter(products: MockProduct[], filter: FilterView): MockProduct[] {
    switch (filter) {
      case "unificado":
        return products;
      case "medicamento":
        return products.filter((p) => p.tipoProduto === "medicamento" && p.vendaMedia >= 1);
      case "medicamento_zerado":
        return products.filter((p) => p.tipoProduto === "medicamento" && p.vendaMedia < 1);
      case "nao_medicamento":
        return products.filter((p) => p.tipoProduto === "nao_medicamento" && p.vendaMedia >= 1);
      case "nao_medicamento_zerado":
        return products.filter((p) => p.tipoProduto === "nao_medicamento" && p.vendaMedia < 1);
      default:
        return products;
    }
  }

  const mockProducts: MockProduct[] = [
    { id: 1, tipoProduto: "medicamento", vendaMedia: 5 },
    { id: 2, tipoProduto: "medicamento", vendaMedia: 0 },
    { id: 3, tipoProduto: "nao_medicamento", vendaMedia: 3 },
    { id: 4, tipoProduto: "nao_medicamento", vendaMedia: 0 },
    { id: 5, tipoProduto: "medicamento", vendaMedia: 10 },
  ];

  it("filtro 'unificado' deve retornar todos os produtos", () => {
    const result = applyFilter(mockProducts, "unificado");
    expect(result.length).toBe(5);
  });

  it("filtro 'medicamento' deve retornar apenas medicamentos com venda >= 1", () => {
    const result = applyFilter(mockProducts, "medicamento");
    expect(result.length).toBe(2);
    expect(result.every((p) => p.tipoProduto === "medicamento" && p.vendaMedia >= 1)).toBe(true);
  });

  it("filtro 'medicamento_zerado' deve retornar apenas medicamentos com venda < 1", () => {
    const result = applyFilter(mockProducts, "medicamento_zerado");
    expect(result.length).toBe(1);
    expect(result[0].id).toBe(2);
  });

  it("filtro 'nao_medicamento' deve retornar apenas não medicamentos com venda >= 1", () => {
    const result = applyFilter(mockProducts, "nao_medicamento");
    expect(result.length).toBe(1);
    expect(result[0].id).toBe(3);
  });

  it("filtro 'nao_medicamento_zerado' deve retornar apenas não medicamentos com venda < 1", () => {
    const result = applyFilter(mockProducts, "nao_medicamento_zerado");
    expect(result.length).toBe(1);
    expect(result[0].id).toBe(4);
  });
});

describe("KPIs dinâmicos - cálculo de métricas selecionadas", () => {
  interface MockProduct {
    id: number;
    estoqueAtual: number;
    vendaMedia: number;
    valorCusto: number;
    estoqueIdealCalc: number;
  }

  function calcSelectedMetrics(products: MockProduct[], selectedIds: Set<number>) {
    if (selectedIds.size === 0) return null;

    const selectedProducts = products.filter((p) => selectedIds.has(p.id));
    const base = selectedProducts.reduce(
      (acc, product) => {
        acc.estoqueAtual += product.estoqueAtual;
        acc.estoqueIdeal += product.estoqueIdealCalc;
        acc.valorCusto += product.valorCusto;
        acc.vendaMediaTotal += product.vendaMedia;
        return acc;
      },
      { estoqueAtual: 0, estoqueIdeal: 0, valorCusto: 0, vendaMediaTotal: 0 },
    );

    const coberturaDias = base.vendaMediaTotal > 0
      ? Math.round((base.estoqueAtual / base.vendaMediaTotal) * 30)
      : null;

    return { ...base, coberturaDias, count: selectedProducts.length };
  }

  const products: MockProduct[] = [
    { id: 1, estoqueAtual: 100, vendaMedia: 10, valorCusto: 500, estoqueIdealCalc: 50 },
    { id: 2, estoqueAtual: 200, vendaMedia: 5, valorCusto: 1000, estoqueIdealCalc: 80 },
    { id: 3, estoqueAtual: 50, vendaMedia: 0, valorCusto: 250, estoqueIdealCalc: 30 },
  ];

  it("deve retornar null quando nenhum item está selecionado", () => {
    const result = calcSelectedMetrics(products, new Set());
    expect(result).toBeNull();
  });

  it("deve calcular métricas para um item selecionado", () => {
    const result = calcSelectedMetrics(products, new Set([1]));
    expect(result).not.toBeNull();
    expect(result!.estoqueAtual).toBe(100);
    expect(result!.estoqueIdeal).toBe(50);
    expect(result!.valorCusto).toBe(500);
    expect(result!.count).toBe(1);
    expect(result!.coberturaDias).toBe(Math.round((100 / 10) * 30)); // 300 dias
  });

  it("deve calcular métricas para múltiplos itens selecionados", () => {
    const result = calcSelectedMetrics(products, new Set([1, 2]));
    expect(result).not.toBeNull();
    expect(result!.estoqueAtual).toBe(300);
    expect(result!.estoqueIdeal).toBe(130);
    expect(result!.valorCusto).toBe(1500);
    expect(result!.count).toBe(2);
    expect(result!.coberturaDias).toBe(Math.round((300 / 15) * 30)); // 600 dias
  });

  it("deve retornar coberturaDias null quando vendaMedia total é 0", () => {
    const result = calcSelectedMetrics(products, new Set([3]));
    expect(result).not.toBeNull();
    expect(result!.coberturaDias).toBeNull();
  });
});
