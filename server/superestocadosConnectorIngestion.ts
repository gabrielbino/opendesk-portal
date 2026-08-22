import { z } from "zod";

import {
  appendDailySales,
  getRegionDashboard,
  replaceRegionalSalesHistory,
  rotateRegionalProducts,
  upsertRegionalLotes,
} from "./db/superestocados";
import type { LoteUploadRow, RegionDashboardData, RegionKey, TipoProduto, VendaUploadRow } from "./superestocadosDataset";

const regionSchema = z.enum(["SC", "RS"]);
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data no formato YYYY-MM-DD.");

const connectorVendaRowSchema = z.object({
  codigo: z.number().int().positive(),
  nomeProduto: z.string().trim().optional().default(""),
  dataVenda: isoDateSchema,
  quantidade: z.number().int(),
});

const connectorLoteRowSchema = z.object({
  codEstabe: z.string().trim().min(1),
  codProduto: z.number().int().positive(),
  codLote: z.string().trim().min(1),
  vencimentoLote: z.string().trim().nullable().optional().transform((value) => {
    if (!value) return null;
    // Aceita formato DD/MM/YYYY (vindo do CONVERT 103 do SQL Server) e converte para YYYY-MM-DD
    const ddmmyyyy = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (ddmmyyyy) {
      return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
    }
    // Aceita formato YYYY-MM-DD diretamente
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }
    return null;
  }),
  qtdVendida: z.number().int().default(0),
  estoqueLote: z.number().int().default(0),
});

const connectorCsvRotationRowSchema = z.object({
  codigo: z.number().int().positive(),
  nomeProduto: z.string().trim().min(1),
  fornecedor: z.string().trim().min(1),
  categoria: z.enum(["medicamento", "nao_medicamento"]),
  dataUltimaCompra: z.string().trim().nullable().optional().transform((value) => value ?? null),
  diasEstoque: z.number().finite(),
  estoqueAtual: z.number().int(),
  valorCusto: z.number().finite().nullable().optional().transform((value) => value ?? null),
  vendaMedia: z.number().finite(),
  // Lote embutido na linha do CSV — substitui o antigo job SQL `lotes.sql`.
  // Todos opcionais; quando vazios, o produto não tem lote rastreado nesta sincronização.
  codLote: z.string().trim().nullable().optional().transform((value) => value ?? null),
  vencimentoLote: z.string().trim().nullable().optional().transform((value) => {
    if (!value) return null;
    // Aceita DD/MM/YYYY e converte para YYYY-MM-DD.
    const ddmmyyyy = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (ddmmyyyy) {
      return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }
    return null;
  }),
  estoqueLote: z.number().int().nullable().optional().transform((value) => value ?? null),
  // Novos campos de vendas e transferência
  dataUltimaTransferencia: z.string().trim().nullable().optional().transform((value) => {
    if (!value) return null;
    // Aceita DD/MM/YYYY e converte para YYYY-MM-DD.
    const ddmmyyyy = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (ddmmyyyy) {
      return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
    }
    // Aceita DD/MM/YYYY HH:MM e converte para YYYY-MM-DD.
    const ddmmyyyyHHMM = value.match(/^(\d{2})\/(\d{2})\/(\d{4})\s/);
    if (ddmmyyyyHHMM) {
      return `${ddmmyyyyHHMM[3]}-${ddmmyyyyHHMM[2]}-${ddmmyyyyHHMM[1]}`;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }
    return null;
  }),
  qtdVendaMesAnterior: z.number().int().nullable().optional().transform((value) => value ?? 0),
  qtdVenda2MesesAnterior: z.number().int().nullable().optional().transform((value) => value ?? 0),
  qtdProjetadoMesAtual: z.number().int().nullable().optional().transform((value) => value ?? 0),
  precoPolitica: z.number().finite().nullable().optional().transform((value) => value ?? null),
  qtdVendaMesAtual: z.number().int().nullable().optional().transform((value) => value ?? 0),
});

const connectorVendasJobSchema = z.object({
  jobKey: z.string().trim().min(1).max(120),
  kind: z.literal("vendas"),
  region: regionSchema,
  mode: z.enum(["replace", "append"]).default("append"),
  rows: z.array(connectorVendaRowSchema),
});

const connectorLotesJobSchema = z.object({
  jobKey: z.string().trim().min(1).max(120),
  kind: z.literal("lotes"),
  region: regionSchema,
  mode: z.literal("replace").default("replace"),
  rows: z.array(connectorLoteRowSchema),
});

const connectorCsvRotationJobSchema = z.object({
  jobKey: z.string().trim().min(1).max(120),
  kind: z.literal("csv-rotation"),
  region: regionSchema,
  mode: z.literal("rotation").default("rotation"),
  rows: z.array(connectorCsvRotationRowSchema),
});

export const connectorSyncPayloadSchema = z.object({
  connectorId: z.string().trim().min(1).max(120),
  sentAt: z.string().datetime().optional(),
  jobs: z.array(
    z.discriminatedUnion("kind", [
      connectorVendasJobSchema,
      connectorLotesJobSchema,
      connectorCsvRotationJobSchema,
    ]),
  ).min(1),
});

export type ConnectorSyncPayload = z.infer<typeof connectorSyncPayloadSchema>;
export type ConnectorSyncJob = ConnectorSyncPayload["jobs"][number];

export function extractBearerToken(authorizationHeader: string | string[] | undefined) {
  const rawHeader = Array.isArray(authorizationHeader) ? authorizationHeader[0] : authorizationHeader;

  if (!rawHeader) {
    return null;
  }

  const [scheme, token] = rawHeader.trim().split(/\s+/, 2);

  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token.trim() || null;
}

export function isConnectorAuthorized(
  authorizationHeader: string | string[] | undefined,
  expectedToken: string,
) {
  if (!expectedToken.trim()) {
    return false;
  }

  return extractBearerToken(authorizationHeader) === expectedToken.trim();
}

export type CsvRotationRow = {
  codigo: number;
  nomeProduto: string;
  fornecedor: string;
  categoria: TipoProduto;
  dataUltimaCompra: string | null;
  diasEstoque: number;
  estoqueAtual: number;
  valorCusto: number | null;
  vendaMedia: number;
  // Lote opcional embutido na linha (vencimentoLote já vem em YYYY-MM-DD após o transform do schema).
  codLote: string | null;
  vencimentoLote: string | null;
  estoqueLote: number | null;
  /** Data da última transferência (YYYY-MM-DD após transform) */
  dataUltimaTransferencia: string | null;
  /** Quantidade vendida no mês anterior */
  qtdVendaMesAnterior: number;
  /** Quantidade vendida 2 meses atrás */
  qtdVenda2MesesAnterior: number;
  /** Quantidade projetada para o mês atual */
  qtdProjetadoMesAtual: number;
  /** Preço política (preço mínimo de venda) */
  precoPolitica: number | null;
  /** Quantidade vendida no mês atual */
  qtdVendaMesAtual: number;
};

function toVendaRows(rows: ConnectorSyncJob["rows"]): VendaUploadRow[] {
  return rows as VendaUploadRow[];
}

function toLoteRows(rows: ConnectorSyncJob["rows"]): LoteUploadRow[] {
  return rows as LoteUploadRow[];
}

function toCsvRotationRows(rows: ConnectorSyncJob["rows"]): CsvRotationRow[] {
  return rows as CsvRotationRow[];
}

export async function processConnectorSync(payload: ConnectorSyncPayload) {
  const touchedRegions = new Set<RegionKey>();
  const results: Array<{
    jobKey: string;
    kind: ConnectorSyncJob["kind"];
    region: RegionKey;
    processedRows: number;
    persistence: Record<string, number>;
  }> = [];

  for (const job of payload.jobs) {
    touchedRegions.add(job.region);

    if (job.kind === "csv-rotation") {
      const csvRows = toCsvRotationRows(job.rows);
      const persistence = await rotateRegionalProducts(job.region, csvRows);

      // Lote embutido no CSV: monta um LoteUploadRow[] virtual e persiste após a rotação,
      // garantindo que os produtos referenciados já existam na superestoque.
      const codEstabe = job.region === "SC" ? "1" : "2";
      const loteRows: LoteUploadRow[] = csvRows
        .filter((row): row is CsvRotationRow & { codLote: string; estoqueLote: number } =>
          typeof row.codLote === "string" &&
          row.codLote.trim() !== "" &&
          typeof row.estoqueLote === "number" &&
          row.estoqueLote > 0,
        )
        .map((row) => ({
          codEstabe,
          codProduto: row.codigo,
          codLote: row.codLote,
          vencimentoLote: row.vencimentoLote ?? null,
          qtdVendida: 0,
          estoqueLote: row.estoqueLote,
        }));

      let lotePersistence: Record<string, number> = {};
      if (loteRows.length > 0) {
        lotePersistence = await upsertRegionalLotes(job.region, loteRows);
      }

      results.push({
        jobKey: job.jobKey,
        kind: job.kind,
        region: job.region,
        processedRows: job.rows.length,
        persistence: {
          ...persistence,
          lotesProcessed: loteRows.length,
          ...(lotePersistence.inserted !== undefined ? { lotesInserted: lotePersistence.inserted } : {}),
          ...(lotePersistence.skipped !== undefined ? { lotesSkipped: lotePersistence.skipped } : {}),
        },
      });
      continue;
    }

    if (job.kind === "lotes") {
      const persistence = await upsertRegionalLotes(job.region, toLoteRows(job.rows));
      results.push({
        jobKey: job.jobKey,
        kind: job.kind,
        region: job.region,
        processedRows: job.rows.length,
        persistence,
      });
      continue;
    }

    // vendas
    let persistence: Record<string, number>;
    if (job.mode === "append") {
      persistence = await appendDailySales(job.region, toVendaRows(job.rows));
    } else {
      persistence = await replaceRegionalSalesHistory(job.region, toVendaRows(job.rows));
    }
    results.push({
      jobKey: job.jobKey,
      kind: job.kind,
      region: job.region,
      processedRows: job.rows.length,
      persistence,
    });
  }

  const dashboards = Object.fromEntries(
    await Promise.all(
      Array.from(touchedRegions).map(async (region) => {
        const dashboard = await getRegionDashboard(region);
        return [region, dashboard] as const;
      }),
    ),
  ) as Record<RegionKey, RegionDashboardData>;

  return {
    connectorId: payload.connectorId,
    receivedAt: new Date().toISOString(),
    jobCount: results.length,
    results,
    dashboards,
  } as const;
}
