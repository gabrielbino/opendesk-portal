import { describe, expect, it } from "vitest";

/**
 * Testes unitários para a lógica de filtro dinâmico de códigos de produtos
 * usada pelo conector de vendas e pelo endpoint /api/connector/products/:region.
 *
 * Estes testes validam:
 * - A função renderTemplate com o placeholder {{product_codes}}
 * - A lógica de decisão de skip quando não há produtos
 * - A construção correta da lista de códigos
 */

// Reproduz a função renderTemplate do conector (index.mjs)
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

// Reproduz a lógica de decisão de skip do conector
function shouldSkipVendasJob(codes: number[] | null): {
  skip: boolean;
  reason: string | null;
} {
  if (codes === null) {
    return {
      skip: true,
      reason: "Falha ao comunicar com o painel para obter códigos de produtos.",
    };
  }

  if (codes.length === 0) {
    return {
      skip: true,
      reason: "Nenhum produto cadastrado na região. Envie a planilha de medicamentos primeiro.",
    };
  }

  return { skip: false, reason: null };
}

describe("connectorProducts — renderTemplate com product_codes", () => {
  const sqlTemplate = `SELECT it.Cod_Produto AS codigo
FROM DMD.dbo.NFSCB cb
INNER JOIN DMD.dbo.NFSIT it ON cb.Num_Nota = it.Num_Nota
WHERE it.Cod_Produto IN ({{product_codes}})
  AND cb.Dat_Emissao >= '{{last_success_sql}}'`;

  it("injeta corretamente a lista de códigos de produtos no placeholder", () => {
    const codes = [101, 202, 303, 404];
    const rendered = renderTemplate(sqlTemplate, {
      product_codes: codes.join(","),
      last_success_sql: "2026-04-01 00:00:00",
    });

    expect(rendered).toContain("IN (101,202,303,404)");
    expect(rendered).toContain(">= '2026-04-01 00:00:00'");
  });

  it("injeta um único código corretamente", () => {
    const codes = [999];
    const rendered = renderTemplate(sqlTemplate, {
      product_codes: codes.join(","),
      last_success_sql: "1900-01-01 00:00:00",
    });

    expect(rendered).toContain("IN (999)");
  });

  it("injeta string vazia quando product_codes está vazio", () => {
    const rendered = renderTemplate(sqlTemplate, {
      product_codes: "",
      last_success_sql: "1900-01-01 00:00:00",
    });

    expect(rendered).toContain("IN ()");
  });

  it("lança erro quando placeholder não está nos replacements", () => {
    expect(() =>
      renderTemplate(sqlTemplate, {
        last_success_sql: "1900-01-01 00:00:00",
        // product_codes ausente
      }),
    ).toThrow("Placeholder não resolvido no SQL: product_codes");
  });
});

describe("connectorProducts — lógica de skip de vendas", () => {
  it("deve pular quando codes é null (falha de comunicação)", () => {
    const result = shouldSkipVendasJob(null);
    expect(result.skip).toBe(true);
    expect(result.reason).toContain("Falha ao comunicar");
  });

  it("deve pular quando codes é array vazio (nenhum produto cadastrado)", () => {
    const result = shouldSkipVendasJob([]);
    expect(result.skip).toBe(true);
    expect(result.reason).toContain("Nenhum produto cadastrado");
  });

  it("não deve pular quando há códigos de produtos", () => {
    const result = shouldSkipVendasJob([101, 202, 303]);
    expect(result.skip).toBe(false);
    expect(result.reason).toBeNull();
  });

  it("não deve pular com um único código", () => {
    const result = shouldSkipVendasJob([1]);
    expect(result.skip).toBe(false);
    expect(result.reason).toBeNull();
  });
});

describe("connectorProducts — construção da lista de códigos", () => {
  it("gera string de códigos separados por vírgula", () => {
    const codes = [10, 20, 30, 40, 50];
    const codesStr = codes.join(",");
    expect(codesStr).toBe("10,20,30,40,50");
  });

  it("gera string vazia para array vazio", () => {
    const codes: number[] = [];
    const codesStr = codes.join(",");
    expect(codesStr).toBe("");
  });

  it("preserva a ordem dos códigos", () => {
    const codes = [500, 100, 300, 200, 400];
    const codesStr = codes.join(",");
    expect(codesStr).toBe("500,100,300,200,400");
  });

  it("gera SQL válido com IN clause para muitos códigos", () => {
    const codes = Array.from({ length: 100 }, (_, i) => i + 1);
    const codesStr = codes.join(",");
    const sql = `SELECT * FROM t WHERE id IN (${codesStr})`;
    expect(sql).toContain("IN (1,2,3,");
    expect(sql).toContain(",99,100)");
    expect(codes.length).toBe(100);
  });
});
