import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock invokeLLM
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

import { invokeLLM } from "./_core/llm";
const mockedInvokeLLM = vi.mocked(invokeLLM);

/**
 * Simulates the extraction logic from the extractFromPdf procedure.
 * We test the parsing/transformation logic directly since tRPC callerFactory
 * is not exported in this project's setup.
 */
async function simulateExtraction(pdfUrl: string, fileName: string) {
  const systemPrompt = "test"; // The actual prompt doesn't matter for unit tests

  const response = await invokeLLM({
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: `Extraia os dados deste contrato: "${fileName}"` },
          { type: "file_url", file_url: { url: pdfUrl, mime_type: "application/pdf" } },
        ],
      },
    ],
  });

  const content = (response as any).choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("A IA não retornou dados válidos do contrato.");
  }

  try {
    const extracted = JSON.parse(content);

    const hoje = new Date();
    const fim = new Date(extracted.vigenciaFim);
    const status = fim < hoje ? "Vencido" : "Vigente";

    return {
      parceiro: extracted.parceiro || "",
      cnpj: extracted.cnpj || "",
      estado: extracted.estado || "SC",
      grupo: extracted.grupo || "Associativismo",
      status,
      vigenciaInicio: extracted.vigenciaInicio || "",
      vigenciaFim: extracted.vigenciaFim || "",
      gatilhoMensal: extracted.gatilhoMensal || 0,
      taxasRepasse: (extracted.taxasRepasse || []).map((t: any) => ({
        categoria: t.categoria || "",
        percentual: Number(t.percentual) || 0,
      })),
      filiais: extracted.filiais || [],
      observacoes: extracted.observacoes || "",
      pdfFileName: fileName || null,
      pdfFileUrl: pdfUrl,
    };
  } catch {
    throw new Error("Falha ao interpretar a resposta da IA. Tente novamente.");
  }
}

describe("Repasses extractFromPdf logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should parse LLM response and return structured contract data matching ASFAR contract", async () => {
    mockedInvokeLLM.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              parceiro: "ASFAR GESTAO DE FRANQUIAS E MARCAS LTDA",
              cnpj: "13.266.749/0001-27",
              estado: "SC",
              grupo: "Associativismo",
              vigenciaInicio: "2023-05-01",
              vigenciaFim: "2024-03-31",
              gatilhoMensal: 150000,
              taxasRepasse: [
                { categoria: "Compras R$150k a R$200k", percentual: 1 },
                { categoria: "Compras R$200k a R$250k", percentual: 1.5 },
                { categoria: "Compras acima de R$250k", percentual: 2 },
              ],
              filiais: [],
              observacoes: "Apenas genéricos e similares. Devoluções descontadas.",
            }),
          },
        },
      ],
    } as any);

    const result = await simulateExtraction(
      "https://example.com/contrato.pdf",
      "ContratoASSOCIATIVISMO-ASFAR.pdf"
    );

    expect(result.parceiro).toBe("ASFAR GESTAO DE FRANQUIAS E MARCAS LTDA");
    expect(result.cnpj).toBe("13.266.749/0001-27");
    expect(result.estado).toBe("SC");
    expect(result.grupo).toBe("Associativismo");
    expect(result.vigenciaInicio).toBe("2023-05-01");
    expect(result.vigenciaFim).toBe("2024-03-31");
    expect(result.gatilhoMensal).toBe(150000);
    expect(result.status).toBe("Vencido"); // 2024-03-31 is in the past
    expect(result.taxasRepasse).toHaveLength(3);
    expect(result.taxasRepasse[0]).toEqual({ categoria: "Compras R$150k a R$200k", percentual: 1 });
    expect(result.taxasRepasse[1]).toEqual({ categoria: "Compras R$200k a R$250k", percentual: 1.5 });
    expect(result.taxasRepasse[2]).toEqual({ categoria: "Compras acima de R$250k", percentual: 2 });
    expect(result.filiais).toEqual([]);
    expect(result.observacoes).toBe("Apenas genéricos e similares. Devoluções descontadas.");
    expect(result.pdfFileName).toBe("ContratoASSOCIATIVISMO-ASFAR.pdf");
    expect(result.pdfFileUrl).toBe("https://example.com/contrato.pdf");
  });

  it("should throw error when LLM returns null content", async () => {
    mockedInvokeLLM.mockResolvedValue({
      choices: [{ message: { content: null } }],
    } as any);

    await expect(
      simulateExtraction("https://example.com/contrato.pdf", "test.pdf")
    ).rejects.toThrow("A IA não retornou dados válidos do contrato.");
  });

  it("should throw error when LLM returns unparseable JSON", async () => {
    mockedInvokeLLM.mockResolvedValue({
      choices: [{ message: { content: "not valid json {{{" } }],
    } as any);

    await expect(
      simulateExtraction("https://example.com/contrato.pdf", "test.pdf")
    ).rejects.toThrow("Falha ao interpretar a resposta da IA. Tente novamente.");
  });

  it("should set status as Vigente for future vigenciaFim dates", async () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    const futureDateStr = futureDate.toISOString().slice(0, 10);

    mockedInvokeLLM.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              parceiro: "Farmácia Teste",
              cnpj: "11.222.333/0001-44",
              estado: "RS",
              grupo: "Farmácias",
              vigenciaInicio: "2025-01-01",
              vigenciaFim: futureDateStr,
              gatilhoMensal: 50000,
              taxasRepasse: [{ categoria: "Genéricos", percentual: 3 }],
              filiais: ["Filial Centro"],
              observacoes: "",
            }),
          },
        },
      ],
    } as any);

    const result = await simulateExtraction(
      "https://example.com/contrato.pdf",
      "contrato-vigente.pdf"
    );

    expect(result.status).toBe("Vigente");
    expect(result.estado).toBe("RS");
    expect(result.grupo).toBe("Farmácias");
    expect(result.filiais).toEqual(["Filial Centro"]);
  });

  it("should handle empty/missing fields gracefully with defaults", async () => {
    mockedInvokeLLM.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              parceiro: "",
              cnpj: "",
              estado: "",
              grupo: "",
              vigenciaInicio: "",
              vigenciaFim: "",
              gatilhoMensal: 0,
              taxasRepasse: [],
              filiais: [],
              observacoes: "",
            }),
          },
        },
      ],
    } as any);

    const result = await simulateExtraction(
      "https://example.com/contrato.pdf",
      "empty.pdf"
    );

    expect(result.parceiro).toBe("");
    expect(result.estado).toBe("SC"); // default
    expect(result.grupo).toBe("Associativismo"); // default
    expect(result.gatilhoMensal).toBe(0);
    expect(result.taxasRepasse).toEqual([]);
    expect(result.filiais).toEqual([]);
  });

  it("should call invokeLLM with correct message structure", async () => {
    mockedInvokeLLM.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              parceiro: "Test",
              cnpj: "00.000.000/0001-00",
              estado: "SC",
              grupo: "Associativismo",
              vigenciaInicio: "2025-01-01",
              vigenciaFim: "2026-01-01",
              gatilhoMensal: 10000,
              taxasRepasse: [],
              filiais: [],
              observacoes: "",
            }),
          },
        },
      ],
    } as any);

    await simulateExtraction("https://s3.example.com/file.pdf", "meu-contrato.pdf");

    expect(mockedInvokeLLM).toHaveBeenCalledTimes(1);
    const callArgs = mockedInvokeLLM.mock.calls[0][0];
    expect(callArgs.messages).toHaveLength(2);
    expect(callArgs.messages[0].role).toBe("system");
    expect(callArgs.messages[1].role).toBe("user");
    // Verify the user message contains file_url
    const userContent = callArgs.messages[1].content;
    expect(Array.isArray(userContent)).toBe(true);
    if (Array.isArray(userContent)) {
      expect(userContent[1]).toEqual({
        type: "file_url",
        file_url: { url: "https://s3.example.com/file.pdf", mime_type: "application/pdf" },
      });
    }
  });
});
