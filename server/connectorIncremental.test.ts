/**
 * Testes unitários para a lógica de carga incremental de vendas.
 *
 * Valida:
 * - Decisão automática bootstrap vs incremental (baseado em contagem de datas)
 * - Geração do placeholder {{product_codes_values}} para CROSS JOIN
 * - Validação do schema do payload com mode "append" e "replace"
 * - Lógica de trim (manter no máximo 15 datas)
 */

import { describe, it, expect } from "vitest";

// Reproduz a lógica de decisão do connector (bootstrap quando < 15 datas, incremental quando >= 15)
const MAX_SALES_DATES = 15;
function decideQueryMode(salesDatesCount: number): "bootstrap" | "incremental" {
  return salesDatesCount < MAX_SALES_DATES ? "bootstrap" : "incremental";
}

// Reproduz a geração de product_codes_values (para CROSS JOIN VALUES)
function buildProductCodesValues(codes: number[]): string {
  return codes.map((c) => `(${c})`).join(",");
}

// Reproduz a lógica de trim de datas
function trimDates(dates: string[], maxDates: number): { keep: string[]; remove: string[] } {
  // dates devem estar em ordem DESC (mais recente primeiro)
  const sorted = [...dates].sort((a, b) => b.localeCompare(a));
  return {
    keep: sorted.slice(0, maxDates),
    remove: sorted.slice(maxDates),
  };
}

// Reproduz a validação do mode no payload de vendas
function validateVendasMode(mode: string): boolean {
  return mode === "replace" || mode === "append";
}

describe("connectorIncremental — decisão bootstrap vs incremental", () => {
  it("deve retornar bootstrap quando salesDatesCount é 0", () => {
    expect(decideQueryMode(0)).toBe("bootstrap");
  });

  it("deve retornar bootstrap quando salesDatesCount é 1", () => {
    expect(decideQueryMode(1)).toBe("bootstrap");
  });

  it("deve retornar bootstrap quando salesDatesCount é 14", () => {
    expect(decideQueryMode(14)).toBe("bootstrap");
  });

  it("deve retornar incremental quando salesDatesCount é 15", () => {
    expect(decideQueryMode(15)).toBe("incremental");
  });

  it("deve retornar incremental quando salesDatesCount é 100", () => {
    expect(decideQueryMode(100)).toBe("incremental");
  });
});

describe("connectorIncremental — geração de product_codes_values", () => {
  it("gera VALUES correto para múltiplos códigos", () => {
    const codes = [101, 202, 303];
    const result = buildProductCodesValues(codes);
    expect(result).toBe("(101),(202),(303)");
  });

  it("gera VALUES correto para um único código", () => {
    const codes = [999];
    const result = buildProductCodesValues(codes);
    expect(result).toBe("(999)");
  });

  it("gera string vazia para array vazio", () => {
    const codes: number[] = [];
    const result = buildProductCodesValues(codes);
    expect(result).toBe("");
  });

  it("gera VALUES para muitos códigos sem erro", () => {
    const codes = Array.from({ length: 200 }, (_, i) => i + 1);
    const result = buildProductCodesValues(codes);
    expect(result).toContain("(1),(2),(3)");
    expect(result).toContain("(199),(200)");
    expect(result.split(",").length).toBe(200);
  });
});

describe("connectorIncremental — trim de datas (janela deslizante)", () => {
  it("não remove nada quando há exatamente 15 datas", () => {
    const dates = Array.from({ length: 15 }, (_, i) => `2026-06-${String(i + 1).padStart(2, "0")}`);
    const { keep, remove } = trimDates(dates, 15);
    expect(keep.length).toBe(15);
    expect(remove.length).toBe(0);
  });

  it("não remove nada quando há menos de 15 datas", () => {
    const dates = ["2026-06-10", "2026-06-09", "2026-06-08"];
    const { keep, remove } = trimDates(dates, 15);
    expect(keep.length).toBe(3);
    expect(remove.length).toBe(0);
  });

  it("remove as datas mais antigas quando há mais de 15", () => {
    const dates = Array.from({ length: 18 }, (_, i) => `2026-06-${String(i + 1).padStart(2, "0")}`);
    const { keep, remove } = trimDates(dates, 15);
    expect(keep.length).toBe(15);
    expect(remove.length).toBe(3);
    // As removidas devem ser as mais antigas (01, 02, 03)
    expect(remove).toContain("2026-06-01");
    expect(remove).toContain("2026-06-02");
    expect(remove).toContain("2026-06-03");
    // As mantidas devem incluir as mais recentes
    expect(keep).toContain("2026-06-18");
    expect(keep).toContain("2026-06-17");
    expect(keep).toContain("2026-06-16");
  });

  it("mantém a ordem DESC nas datas retidas", () => {
    const dates = ["2026-06-01", "2026-06-15", "2026-06-10", "2026-06-05"];
    const { keep } = trimDates(dates, 15);
    // Deve estar em ordem DESC
    for (let i = 0; i < keep.length - 1; i++) {
      expect(keep[i] >= keep[i + 1]).toBe(true);
    }
  });
});

describe("connectorIncremental — validação do mode no payload", () => {
  it("aceita mode 'replace'", () => {
    expect(validateVendasMode("replace")).toBe(true);
  });

  it("aceita mode 'append'", () => {
    expect(validateVendasMode("append")).toBe(true);
  });

  it("rejeita mode inválido", () => {
    expect(validateVendasMode("upsert")).toBe(false);
    expect(validateVendasMode("")).toBe(false);
    expect(validateVendasMode("delete")).toBe(false);
  });
});

describe("connectorIncremental — integração renderTemplate com product_codes_values", () => {
  // Reproduz a função renderTemplate do conector
  function renderTemplate(
    template: string,
    replacements: Record<string, string | null | undefined>,
  ): string {
    return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key: string) => {
      if (!(key in replacements)) {
        throw new Error(`Placeholder não resolvido no SQL: ${key}`);
      }
      const value = replacements[key];
      return value === null || value === undefined ? "" : String(value);
    });
  }

  const sqlTemplate = `WITH Codigos AS (
  SELECT Cod_Produto FROM (VALUES {{product_codes_values}}) AS T(Cod_Produto)
)
SELECT c.Cod_Produto AS codigo, CONVERT(VARCHAR(10), cb.Dat_Emissao, 120) AS dataVenda
FROM Codigos c
LEFT JOIN DMD.dbo.NFSIT it ON it.Cod_Produto = c.Cod_Produto`;

  it("injeta corretamente product_codes_values no SQL", () => {
    const codes = [101, 202, 303];
    const values = buildProductCodesValues(codes);
    const rendered = renderTemplate(sqlTemplate, {
      product_codes_values: values,
    });

    expect(rendered).toContain("(VALUES (101),(202),(303))");
  });

  it("lança erro quando product_codes_values não está nos replacements", () => {
    expect(() => renderTemplate(sqlTemplate, {})).toThrow(
      "Placeholder não resolvido no SQL: product_codes_values",
    );
  });
});
