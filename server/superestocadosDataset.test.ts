import { describe, expect, it } from "vitest";

import {
  isConnectorAuthorized,
  extractBearerToken,
  connectorSyncPayloadSchema,
} from "./superestocadosConnectorIngestion";

describe("superestocadosConnectorIngestion", () => {
  it("extrai corretamente o bearer token do cabeçalho de autorização", () => {
    expect(extractBearerToken("Bearer segredo-123")).toBe("segredo-123");
    expect(extractBearerToken("Basic abc")).toBeNull();
    expect(extractBearerToken(undefined)).toBeNull();
  });

  it("valida o token compartilhado do conector", () => {
    expect(isConnectorAuthorized("Bearer token-correto", "token-correto")).toBe(true);
    expect(isConnectorAuthorized("Bearer token-incorreto", "token-correto")).toBe(false);
    expect(isConnectorAuthorized(undefined, "token-correto")).toBe(false);
  });

  it("valida o schema de lotes do conector com formato DD/MM/YYYY", () => {
    const payload = {
      connectorId: "test-connector",
      jobs: [
        {
          jobKey: "lotes-sc",
          kind: "lotes",
          region: "SC",
          rows: [
            {
              codEstabe: "1",
              codProduto: 101,
              codLote: "LOTE-001",
              vencimentoLote: "15/06/2027",
              qtdVendida: 10,
              estoqueLote: 50,
            },
            {
              codEstabe: "1",
              codProduto: 102,
              codLote: "LOTE-002",
              vencimentoLote: "2027-12-31",
              qtdVendida: 5,
              estoqueLote: 30,
            },
          ],
        },
      ],
    };

    const result = connectorSyncPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      const loteJob = result.data.jobs[0];
      expect(loteJob.kind).toBe("lotes");
      // DD/MM/YYYY deve ser convertido para YYYY-MM-DD
      expect(loteJob.rows[0].vencimentoLote).toBe("2027-06-15");
      // YYYY-MM-DD deve ser mantido
      expect(loteJob.rows[1].vencimentoLote).toBe("2027-12-31");
    }
  });

  it("aceita vencimentoLote nulo no schema de lotes", () => {
    const payload = {
      connectorId: "test-connector",
      jobs: [
        {
          jobKey: "lotes-rs",
          kind: "lotes",
          region: "RS",
          rows: [
            {
              codEstabe: "2",
              codProduto: 201,
              codLote: "LOTE-X",
              vencimentoLote: null,
              qtdVendida: 0,
              estoqueLote: 100,
            },
          ],
        },
      ],
    };

    const result = connectorSyncPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.jobs[0].rows[0].vencimentoLote).toBeNull();
    }
  });
});
