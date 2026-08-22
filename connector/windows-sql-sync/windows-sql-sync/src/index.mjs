import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import sql from "mssql";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const connectorRoot = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(connectorRoot, ".env") });

const envSchema = z.object({
  CONNECTOR_ID: z.string().trim().min(1),
  DASHBOARD_SYNC_URL: z.string().trim().url(),
  CONNECTOR_SHARED_TOKEN: z.string().trim().min(20),
  SQL_SERVER: z.string().trim().min(1),
  SQL_PORT: z.coerce.number().int().positive().default(1433),
  SQL_DATABASE: z.string().trim().min(1),
  SQL_USER: z.string().trim().min(1),
  SQL_PASSWORD: z.string().min(1),
  SQL_ENCRYPT: z.string().optional().default("false"),
  SQL_TRUST_SERVER_CERTIFICATE: z.string().optional().default("true"),
  SQL_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  SQL_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(600000),
  CONNECTOR_LOG_DIR: z.string().trim().default("./04_Logs"),
  CONNECTOR_STATE_FILE: z.string().trim().default("./state/connector-state.json"),
  CONNECTOR_CONFIG_FILE: z.string().trim().default("./config/jobs.json"),
});

const jobKindSchema = z.enum(["vendas", "lotes", "csv-rotation"]);
const regionSchema = z.enum(["SC", "RS"]);

const jobsConfigSchema = z.object({
  jobs: z.array(
    z.object({
      key: z.string().trim().min(1).max(120),
      enabled: z.boolean().default(true),
      kind: jobKindSchema,
      region: regionSchema,
      sqlFile: z.string().trim().optional().default(""),
      sqlFileBootstrap: z.string().trim().optional().default(""),
      csvFile: z.string().trim().optional(),
      trackState: z.boolean().default(false),
      tipoProduto: z.string().trim().optional(),
      variables: z.record(z.union([z.string(), z.number(), z.boolean()])).optional().default({}),
    }),
  ).min(1),
});

const vendaRowSchema = z.object({
  codigo: z.number().int().positive(),
  nomeProduto: z.string().trim().optional().default(""),
  dataVenda: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  quantidade: z.number().int(),
});

const loteRowSchema = z.object({
  codEstabe: z.union([z.string(), z.number()]).transform(v => String(v).trim()),
  codProduto: z.number().int().positive(),
  codLote: z.union([z.string(), z.number()]).transform(v => String(v).trim()),
  vencimentoLote: z.union([z.string(), z.null()]).nullable().optional().default(null),
  qtdVendida: z.number().int().default(0),
  estoqueLote: z.number().int().default(0),
});

const csvRotationRowSchema = z.object({
  codigo: z.number().int().positive(),
  nomeProduto: z.string().trim().min(1),
  fornecedor: z.string().trim().min(1),
  categoria: z.enum(["medicamento", "nao_medicamento"]),
  dataUltimaCompra: z.string().trim().nullable().optional().transform(v => v || null),
  diasEstoque: z.number().finite(),
  estoqueAtual: z.number().int(),
  valorCusto: z.number().finite().nullable(),
  vendaMedia: z.number().finite(),
  // Data de cadastro do produto no sistema (DD/MM/YYYY). Produtos com menos de 90 dias
  // de cadastro não devem ser considerados superestocados.
  dataCadastroProduto: z.string().trim().nullable().optional().default(null),
  // Lote info embutida na linha do CSV (substitui o job SQL lotes.sql).
  // Pode vir vazio quando o produto não tem lote rastreado.
  codLote: z.string().trim().nullable().optional().default(null),
  vencimentoLote: z.string().trim().nullable().optional().default(null),
  estoqueLote: z.number().int().nullable().optional().default(null),
  // Novos campos adicionados
  dataUltimaTransferencia: z.string().trim().nullable().optional().transform(v => v || null),
  qtdVendaMesAnterior: z.number().int().nullable().optional().default(0),
  qtdVenda2MesesAnterior: z.number().int().nullable().optional().default(0),
  qtdProjetadoMesAtual: z.number().int().nullable().optional().default(0),
  precoPolitica: z.number().finite().nullable().optional().default(null),
  qtdVendaMesAtual: z.number().int().nullable().optional().default(0),
});

function parseArgs(argv) {
  const args = {
    dryRun: false,
    checkConfig: false,
    job: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }

    if (arg === "--check-config") {
      args.checkConfig = true;
      continue;
    }

    if (arg === "--job") {
      args.job = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg.startsWith("--job=")) {
      args.job = arg.slice("--job=".length);
    }
  }

  return args;
}

function resolveConnectorPath(relativePath) {
  return path.resolve(connectorRoot, relativePath);
}

async function ensureDirectory(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function toBoolean(value) {
  return String(value).toLowerCase() === "true";
}

function formatDateForLog(date = new Date()) {
  return date.toISOString();
}

function formatDateOnly(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Data inválida recebida: ${String(value)}`);
  }

  return date.toISOString().slice(0, 10);
}

function formatSqlTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "1900-01-01 00:00:00";
  }

  return date.toISOString().slice(0, 19).replace("T", " ");
}

function sanitizeValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value).trim();
}

function createLogger(logDirectory) {
  const logFilePath = path.join(logDirectory, `${new Date().toISOString().slice(0, 10)}.log`);

  async function write(level, message, extra) {
    const line = JSON.stringify({
      timestamp: formatDateForLog(),
      level,
      message,
      ...(extra ? { extra } : {}),
    });
    await fs.appendFile(logFilePath, `${line}\n`, "utf8");
  }

  return {
    info(message, extra) {
      return write("info", message, extra);
    },
    warn(message, extra) {
      return write("warn", message, extra);
    },
    error(message, extra) {
      return write("error", message, extra);
    },
    logFilePath,
  };
}

async function loadState(stateFilePath) {
  try {
    const raw = await fs.readFile(stateFilePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : { jobs: {} };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return { jobs: {} };
    }

    throw error;
  }
}

async function saveState(stateFilePath, state) {
  await ensureDirectory(path.dirname(stateFilePath));
  await fs.writeFile(stateFilePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function loadEnvironment() {
  return envSchema.parse(process.env);
}

async function loadJobsConfig(configFilePath) {
  const raw = await fs.readFile(configFilePath, "utf8");
  return jobsConfigSchema.parse(JSON.parse(raw));
}

async function assertConfigFiles(config, configFilePath) {
  for (const job of config.jobs) {
    if (job.kind === "csv-rotation") {
      if (!job.csvFile) {
        throw new Error(`Job ${job.key} (csv-rotation) requer campo 'csvFile' configurado.`);
      }
      try {
        await fs.access(job.csvFile);
      } catch {
        console.warn(`Aviso: arquivo CSV não acessível no momento: ${job.csvFile}`);
      }
      continue;
    }
    if (!job.sqlFile) {
      throw new Error(`Job ${job.key} requer campo 'sqlFile' configurado.`);
    }
    const sqlFilePath = path.resolve(path.dirname(configFilePath), job.sqlFile);
    await fs.access(sqlFilePath);
  }
}

function renderTemplate(template, replacements) {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => {
    if (!(key in replacements)) {
      throw new Error(`Placeholder não resolvido no SQL: ${key}`);
    }

    const value = replacements[key];
    return value === null || value === undefined ? "" : String(value);
  });
}

function normalizeVendaRow(row) {
  const normalized = vendaRowSchema.parse({
    codigo: Number(row.codigo),
    nomeProduto: sanitizeValue(row.nomeProduto) || "",
    dataVenda: formatDateOnly(row.dataVenda),
    quantidade: Number(row.quantidade),
  });

  return normalized;
}

function normalizeLoteRow(row) {
  const normalized = loteRowSchema.parse({
    codEstabe: sanitizeValue(row.codEstabe) || sanitizeValue(row.Cod_Estabe) || "",
    codProduto: Number(row.codProduto ?? row.Cod_Produto ?? row.codProdut ?? 0),
    codLote: sanitizeValue(row.codLote) || sanitizeValue(row.Cod_Lote) || "",
    vencimentoLote: sanitizeValue(row.vencimentoLote) || sanitizeValue(row.Vencimento_Lote) || null,
    qtdVendida: Number(row.qtdVendida ?? row.Qtd_Vendida ?? 0),
    estoqueLote: Number(row.estoqueLote ?? row.Estoque_Lote ?? row.Estoque_Atual_Remanescente ?? 0),
  });

  return normalized;
}

/**
 * Parseia um valor decimal no formato brasileiro (vírgula como separador decimal).
 */
function parseBrazilianDecimal(value) {
  if (value === null || value === undefined || value === "") return null;
  const str = String(value).trim();
  if (!str || str === "-") return null;
  const normalized = str
    .replace(/\./g, "")
    .replace(/,/g, ".");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

/**
 * Parseia uma data no formato DD/MM/YYYY e a preserva nesse formato.
 */
function parseBrazilianDate(value) {
  if (value === null || value === undefined || value === "") return null;
  const str = String(value).trim();
  if (!str || str === "-") return null;
  // Aceita DD/MM/YYYY HH:mm:ss — extrai apenas DD/MM/YYYY
  const match = str.match(/^(\d{2}\/\d{2}\/\d{4})/);
  if (match) {
    return match[1];
  }
  // Aceita YYYY-MM-DD e converte para DD/MM/YYYY
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }
  return str;
}

/**
 * Mapeia a coluna "Categoria" do CSV para o enum interno.
 */
function mapCategoria(categoriaRaw) {
  const cat = String(categoriaRaw ?? "").trim().toLowerCase();
  if (cat === "medicamentos" || cat === "medicamento") return "medicamento";
  return "nao_medicamento";
}

/**
 * Lê um arquivo CSV da rede (caminho UNC) e retorna as linhas parseadas.
 * Detecta automaticamente encoding (UTF-8 BOM, UTF-8, latin1) e separador (TAB ou ;).
 */
async function readCsvFile(filePath, logger) {
  await logger.info(`Lendo arquivo CSV: ${filePath}`);

  const rawBuffer = await fs.readFile(filePath);

  // Detecta encoding: UTF-8 BOM (EF BB BF) ou latin1/windows-1252
  let content;
  if (rawBuffer[0] === 0xEF && rawBuffer[1] === 0xBB && rawBuffer[2] === 0xBF) {
    content = rawBuffer.slice(3).toString("utf8");
    await logger.info("Encoding detectado: UTF-8 com BOM");
  } else {
    const utf8Attempt = rawBuffer.toString("utf8");
    const hasInvalidUtf8 = utf8Attempt.includes("\uFFFD");
    content = hasInvalidUtf8 ? rawBuffer.toString("latin1") : utf8Attempt;
    await logger.info(`Encoding detectado: ${hasInvalidUtf8 ? "latin1/windows-1252" : "UTF-8"}`);
  }

  const lines = content.split(/\r?\n/).filter(line => line.trim() !== "");

  if (lines.length < 2) {
    throw new Error(`Arquivo CSV vazio ou sem dados: ${filePath}`);
  }

  // Detecta separador automaticamente: tab ou ponto-e-vírgula
  const firstLine = lines[0];
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const separator = tabCount > semicolonCount ? "\t" : ";";
  await logger.info(`Separador detectado: ${separator === "\t" ? "TAB" : "ponto-e-vírgula"}`);

  // Primeira linha é o header
  const headers = firstLine.split(separator).map(h => h.trim());

  await logger.info(`CSV headers: ${headers.join(", ")}`, { headerCount: headers.length });

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(separator);
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (values[j] ?? "").trim();
    }
    rows.push(row);
  }

  await logger.info(`CSV lido com sucesso: ${rows.length} linhas.`, {
    filePath,
    rowCount: rows.length,
  });

  return rows;
}

/**
 * Normaliza uma linha do CSV para o formato de rotação.
 * Inclui o campo "categoria" mapeado a partir da coluna "Categoria" do CSV.
 */
function normalizeCsvRotationRow(row) {
  const codigo = parseInt(row["Código"] || row["Codigo"] || "0", 10);
  const nomeProduto = sanitizeValue(row["Nome Produto"] || row["NomeProduto"] || "");
  const fornecedor = sanitizeValue(row["Fornecedor"] || "");
  const categoria = mapCategoria(row["Categoria"]);
  const dataUltimaCompra = parseBrazilianDate(row["Data Última Compra"] || row["Data Ultima Compra"] || null);
  const diasEstoqueRaw = parseBrazilianDecimal(row["Dias de Estoque (Unidades)"] || row["Dias de Estoque"] || "0");
  const diasEstoque = diasEstoqueRaw !== null ? diasEstoqueRaw : 0;
  const estoqueAtual = parseInt(String(parseBrazilianDecimal(row["Qtd em Estoque"] || row["QtdEmEstoque"] || "0") ?? 0), 10);
  const valorCusto = parseBrazilianDecimal(row["Valor Estoque Custo"] || row["ValorEstoqueCusto"] || null);
  const vendaMedia = parseBrazilianDecimal(row["Qtd Venda Média Mês"] || row["Qtd Venda Media Mes"] || "0") ?? 0;

  // Data de cadastro do produto no sistema
  const dataCadastroProduto = parseBrazilianDate(row["Data Cadastro Produto"] || row["DataCadastroProduto"] || row["Data Cadastro"] || null);

  // Lote embutido no CSV — pode estar vazio quando o produto não tem lote rastreado.
  const codLoteRaw = sanitizeValue(row["Lote"] || row["Cod_Lote"] || row["CodLote"] || "");
  const codLote = codLoteRaw && codLoteRaw !== "-" ? codLoteRaw : null;
  const vencimentoLote = parseBrazilianDate(row["Validade Lote"] || row["ValidadeLote"] || row["Vencimento Lote"] || null);
  const estoqueLoteRaw = parseBrazilianDecimal(row["Estoque Lote"] || row["EstoqueLote"] || "");
  const estoqueLote = estoqueLoteRaw !== null && Number.isFinite(estoqueLoteRaw)
    ? Math.trunc(estoqueLoteRaw)
    : null;

  // Novos campos
  const dataUltimaTransferencia = parseBrazilianDate(row["Data Ultima Transferencia"] || row["Data \u00daltima Transfer\u00eancia"] || null);
  const qtdVendaMesAnteriorRaw = parseBrazilianDecimal(row["Qtd Venda Mes Anterior"] || row["Qtd Venda M\u00eas Anterior"] || "0");
  const qtdVendaMesAnterior = qtdVendaMesAnteriorRaw !== null ? Math.trunc(qtdVendaMesAnteriorRaw) : 0;
  const qtdVenda2MesesAnteriorRaw = parseBrazilianDecimal(row["Qtd Venda 2 Meses Anterior"] || row["Qtd Venda 2 Meses Anteriores"] || "0");
  const qtdVenda2MesesAnterior = qtdVenda2MesesAnteriorRaw !== null ? Math.trunc(qtdVenda2MesesAnteriorRaw) : 0;
  const qtdProjetadoMesAtualRaw = parseBrazilianDecimal(row["Qtd Projetado Mes Atual"] || row["Qtd Projetado M\u00eas Atual"] || "0");
  const qtdProjetadoMesAtual = qtdProjetadoMesAtualRaw !== null ? Math.trunc(qtdProjetadoMesAtualRaw) : 0;
  const precoPolitica = parseBrazilianDecimal(row["Pre\u00e7o Politica"] || row["Preco Politica"] || row["Pre\u00e7o Pol\u00edtica"] || null);
  const qtdVendaMesAtualRaw = parseBrazilianDecimal(row["Qtd Venda Mes Atual"] || row["Qtd Venda M\u00eas Atual"] || "0");
  const qtdVendaMesAtual = qtdVendaMesAtualRaw !== null ? Math.trunc(qtdVendaMesAtualRaw) : 0;

  const normalized = csvRotationRowSchema.parse({
    codigo,
    nomeProduto,
    fornecedor,
    categoria,
    dataUltimaCompra,
    diasEstoque: Number.isFinite(diasEstoque) ? diasEstoque : 0,
    estoqueAtual: Number.isFinite(estoqueAtual) ? estoqueAtual : 0,
    valorCusto,
    vendaMedia,
    dataCadastroProduto,
    codLote,
    vencimentoLote,
    estoqueLote,
    dataUltimaTransferencia,
    qtdVendaMesAnterior,
    qtdVenda2MesesAnterior,
    qtdProjetadoMesAtual,
    precoPolitica,
    qtdVendaMesAtual,
  });

  return normalized;
}

function normalizeResultRows(kind, rows) {
  if (kind === "lotes") {
    return rows.map(normalizeLoteRow);
  }

  return rows.map(normalizeVendaRow);
}

/**
 * Busca os códigos de produtos cadastrados no painel para uma região.
 * Retorna um array de inteiros (códigos) ou null se o endpoint não responder.
 */
async function fetchProductCodesFromDashboard(env, region, logger, tipoProduto) {
  const syncUrl = env.DASHBOARD_SYNC_URL;
  const baseUrl = syncUrl.replace(/\/api\/connector\/sync\/?$/, "");
  let productsUrl = `${baseUrl}/api/connector/products/${region}`;

  if (tipoProduto) {
    productsUrl += `?tipo=${encodeURIComponent(tipoProduto)}`;
  }

  try {
    const response = await fetch(productsUrl, {
      method: "GET",
      headers: {
        authorization: `Bearer ${env.CONNECTOR_SHARED_TOKEN}`,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      await logger.warn(`Falha ao buscar códigos de produtos da região ${region}: HTTP ${response.status}`, {
        url: productsUrl,
        status: response.status,
        body: body.slice(0, 500),
      });
      return null;
    }

    const data = await response.json();

    if (!data.success || !Array.isArray(data.codes)) {
      await logger.warn(`Resposta inesperada do endpoint de produtos da região ${region}.`, {
        url: productsUrl,
        data,
      });
      return null;
    }

    return data.codes;
  } catch (error) {
    await logger.warn(`Erro de rede ao buscar códigos de produtos da região ${region}.`, {
      url: productsUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Executa um job do tipo csv-rotation: lê o arquivo CSV da rede,
 * normaliza as linhas incluindo a categoria, e envia ao backend para rotação.
 * Após leitura bem-sucedida, exclui o arquivo CSV.
 */
async function runCsvRotationJob(job, env, logger) {
  if (!job.csvFile) {
    throw new Error(`Job ${job.key}: campo 'csvFile' não configurado.`);
  }

  const csvRows = await readCsvFile(job.csvFile, logger);
  const normalizedRows = [];
  const errors = [];

  for (let i = 0; i < csvRows.length; i++) {
    try {
      const normalized = normalizeCsvRotationRow(csvRows[i]);
      if (normalized.codigo > 0 && normalized.nomeProduto) {
        normalizedRows.push(normalized);
      }
    } catch (err) {
      errors.push({ line: i + 2, error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (errors.length > 0) {
    await logger.warn(`Job ${job.key}: ${errors.length} linhas com erro de validação.`, {
      jobKey: job.key,
      sampleErrors: errors.slice(0, 10),
    });
  }

  // Contagem por categoria
  const medCount = normalizedRows.filter(r => r.categoria === "medicamento").length;
  const nmedCount = normalizedRows.filter(r => r.categoria === "nao_medicamento").length;

  await logger.info(`Job ${job.key}: CSV processado com sucesso.`, {
    jobKey: job.key,
    kind: job.kind,
    region: job.region,
    totalCsvRows: csvRows.length,
    validRows: normalizedRows.length,
    medicamentos: medCount,
    naoMedicamentos: nmedCount,
    errorRows: errors.length,
  });

  // NOTA: A exclusão do CSV é feita APÓS o envio bem-sucedido ao dashboard (na função main).
  // Isso garante que os dados não se percam caso o envio falhe.

  return {
    jobKey: job.key,
    kind: job.kind,
    region: job.region,
    mode: "rotation",
    rows: normalizedRows,
    csvFilePath: job.csvFile,
    rowCount: normalizedRows.length,
    trackState: false,
    skipped: false,
  };
}

/**
 * Consulta o painel para saber quantas datas de venda a região já possui.
 * Retorna o número de datas distintas, ou null se o endpoint falhar.
 */
async function fetchSalesDatesCount(env, region, logger) {
  const syncUrl = env.DASHBOARD_SYNC_URL;
  const baseUrl = syncUrl.replace(/\/api\/connector\/sync\/?$/, "");
  const url = `${baseUrl}/api/connector/sales-dates/${region}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        authorization: `Bearer ${env.CONNECTOR_SHARED_TOKEN}`,
      },
    });

    if (!response.ok) {
      await logger.warn(`Falha ao consultar datas de vendas da região ${region}: HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (!data.success || typeof data.count !== "number") {
      await logger.warn(`Resposta inesperada do endpoint sales-dates da região ${region}.`, { data });
      return null;
    }

    return data.count;
  } catch (error) {
    await logger.warn(`Erro de rede ao consultar datas de vendas da região ${region}.`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function runJob(pool, job, configFilePath, state, env, logger) {
  const lastSuccessAt = job.trackState ? (state.jobs?.[job.key]?.lastSuccessAt ?? null) : null;
  const lastRunAt = job.trackState ? (state.jobs?.[job.key]?.lastRunAt ?? null) : null;

  // Para jobs de vendas e lotes, buscar os códigos de produtos do painel
  let productCodes = "";
  let productCodesValues = "";
  if (job.kind === "vendas" || job.kind === "lotes") {
    const codes = await fetchProductCodesFromDashboard(env, job.region, logger, job.tipoProduto);

    if (codes === null) {
      await logger.warn(`Job ${job.key} pulado: não foi possível obter códigos de produtos do painel.`, {
        jobKey: job.key,
        region: job.region,
      });
      return {
        jobKey: job.key,
        kind: job.kind,
        region: job.region,
        mode: "append",
        rows: [],
        sqlFilePath: "",
        rowCount: 0,
        trackState: job.trackState,
        skipped: true,
        skipReason: "Falha ao comunicar com o painel para obter códigos de produtos.",
      };
    }

    if (codes.length === 0) {
      await logger.info(`Job ${job.key}: nenhum produto cadastrado na região ${job.region}. Pulando.`, {
        jobKey: job.key,
        region: job.region,
      });
      return {
        jobKey: job.key,
        kind: job.kind,
        region: job.region,
        mode: "append",
        rows: [],
        sqlFilePath: "",
        rowCount: 0,
        trackState: job.trackState,
        skipped: true,
        skipReason: `Nenhum produto cadastrado na região ${job.region}.`,
      };
    }

    productCodes = codes.join(",");
    // Formato VALUES para CROSS JOIN: (123),(456),(789)
    productCodesValues = codes.map(c => `(${c})`).join(",");
    await logger.info(`Job ${job.key}: ${codes.length} códigos de produtos obtidos do painel.`, {
      jobKey: job.key,
      kind: job.kind,
      region: job.region,
      productCount: codes.length,
      sampleCodes: codes.slice(0, 10),
    });
  }

  // Decisão automática para jobs de vendas: bootstrap (completa) ou incremental
  const MAX_SALES_DATES = 15;
  let useBootstrap = false;
  if (job.kind === "vendas" && job.sqlFileBootstrap) {
    const datesCount = await fetchSalesDatesCount(env, job.region, logger);
    if (datesCount === null) {
      // Se não conseguiu consultar, usa bootstrap por segurança para garantir dados completos
      useBootstrap = true;
      await logger.warn(`Job ${job.key}: não foi possível verificar datas existentes — usando query bootstrap (completa).`);
    } else if (datesCount < MAX_SALES_DATES) {
      useBootstrap = true;
      await logger.info(`Job ${job.key}: região ${job.region} possui ${datesCount} datas (< ${MAX_SALES_DATES}) — usando query bootstrap (completa).`, {
        jobKey: job.key,
        region: job.region,
        existingDates: datesCount,
      });
    } else {
      await logger.info(`Job ${job.key}: região ${job.region} possui ${datesCount} datas (>= ${MAX_SALES_DATES}) — usando query incremental.`, {
        jobKey: job.key,
        region: job.region,
        existingDates: datesCount,
      });
    }
  }

  const chosenSqlFile = useBootstrap ? job.sqlFileBootstrap : job.sqlFile;
  const sqlFilePath = path.resolve(path.dirname(configFilePath), chosenSqlFile);
  let sqlTemplate = await fs.readFile(sqlFilePath, "utf8");
  // Remove BOM (U+FEFF) caso o arquivo SQL tenha sido salvo como UTF-8 com BOM
  if (sqlTemplate.charCodeAt(0) === 0xFEFF) {
    sqlTemplate = sqlTemplate.slice(1);
    await logger.info(`BOM removido do arquivo SQL ${chosenSqlFile}.`);
  }

  const renderedSql = renderTemplate(sqlTemplate, {
    last_success_sql: formatSqlTimestamp(lastSuccessAt),
    last_run_sql: formatSqlTimestamp(lastRunAt),
    now_sql: formatSqlTimestamp(new Date()),
    product_codes: productCodes,
    product_codes_values: productCodesValues,
    ...Object.fromEntries(
      Object.entries(job.variables ?? {}).map(([key, value]) => [key, String(value)]),
    ),
  });

  const result = await pool.request().query(renderedSql);
  const normalizedRows = normalizeResultRows(job.kind, result.recordset ?? []);

  // Para vendas: mode é "replace" no bootstrap (substitui tudo) ou "append" no incremental
  const mode = job.kind === "vendas" ? (useBootstrap ? "replace" : "append") : "replace";

  return {
    jobKey: job.key,
    kind: job.kind,
    region: job.region,
    mode,
    rows: normalizedRows,
    sqlFilePath,
    rowCount: normalizedRows.length,
    trackState: job.trackState,
    skipped: false,
  };
}

async function postPayload(url, token, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  let parsedBody = null;

  try {
    parsedBody = responseText ? JSON.parse(responseText) : null;
  } catch {
    parsedBody = { raw: responseText };
  }

  if (!response.ok) {
    throw new Error(`Falha HTTP ${response.status} ao enviar carga: ${JSON.stringify(parsedBody)}`);
  }

  return parsedBody;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = await loadEnvironment();

  const logDirectory = resolveConnectorPath(env.CONNECTOR_LOG_DIR);
  const stateFilePath = resolveConnectorPath(env.CONNECTOR_STATE_FILE);
  const configFilePath = resolveConnectorPath(env.CONNECTOR_CONFIG_FILE);

  await ensureDirectory(logDirectory);
  const logger = createLogger(logDirectory);

  try {
    const jobsConfig = await loadJobsConfig(configFilePath);
    await assertConfigFiles(jobsConfig, configFilePath);

    const selectedJobs = jobsConfig.jobs.filter(job => job.enabled !== false);
    const jobs = args.job ? selectedJobs.filter(job => job.key === args.job) : selectedJobs;

    if (jobs.length === 0) {
      throw new Error("Nenhum job habilitado foi encontrado para execução.");
    }

    if (args.checkConfig) {
      await logger.info("Configuração validada com sucesso.", {
        connectorId: env.CONNECTOR_ID,
        jobs: jobs.map(job => ({ key: job.key, kind: job.kind, region: job.region })),
      });
      console.log(`Configuração válida. Jobs prontos: ${jobs.map(job => job.key).join(", ")}`);
      return;
    }

    const state = await loadState(stateFilePath);

    // Separa jobs que precisam de SQL Server dos jobs de CSV
    const sqlJobs = jobs.filter(job => job.kind !== "csv-rotation");
    const csvJobs = jobs.filter(job => job.kind === "csv-rotation");
    const hasSqlJobs = sqlJobs.length > 0;

    let pool = null;
    if (hasSqlJobs) {
      pool = new sql.ConnectionPool({
        user: env.SQL_USER,
        password: env.SQL_PASSWORD,
        server: env.SQL_SERVER,
        port: env.SQL_PORT,
        database: env.SQL_DATABASE,
        pool: {
          max: 2,
          min: 0,
          idleTimeoutMillis: 30000,
        },
        options: {
          encrypt: toBoolean(env.SQL_ENCRYPT),
          trustServerCertificate: toBoolean(env.SQL_TRUST_SERVER_CERTIFICATE),
        },
        connectionTimeout: env.SQL_CONNECTION_TIMEOUT_MS,
        requestTimeout: env.SQL_REQUEST_TIMEOUT_MS,
      });

      await pool.connect();
      await logger.info("Conexão com SQL Server estabelecida.", {
        connectorId: env.CONNECTOR_ID,
        server: env.SQL_SERVER,
        database: env.SQL_DATABASE,
        jobs: jobs.map(job => job.key),
        dryRun: args.dryRun,
      });
    } else {
      await logger.info("Nenhum job SQL nesta execução. Conexão SQL Server não necessária.", {
        connectorId: env.CONNECTOR_ID,
        jobs: jobs.map(job => job.key),
        dryRun: args.dryRun,
      });
    }

    const executedJobs = [];
    const skippedJobs = [];

    // Executa jobs de CSV (rotação) primeiro — eles atualizam o painel
    for (const job of csvJobs) {
      try {
        const execution = await runCsvRotationJob(job, env, logger);

        if (execution.skipped) {
          skippedJobs.push(execution);
          await logger.info(`Job ${job.key} pulado.`, {
            jobKey: job.key,
            kind: job.kind,
            region: job.region,
            reason: execution.skipReason,
          });
          continue;
        }

        executedJobs.push(execution);
        await logger.info("Job CSV-rotation processado com sucesso.", {
          jobKey: job.key,
          kind: job.kind,
          region: job.region,
          rowCount: execution.rowCount,
          csvFile: job.csvFile,
        });
      } catch (csvError) {
        // ENOENT é esperado quando o CSV já foi consumido por execução anterior do dia,
        // ou quando a empresa ainda não gerou o arquivo do dia. Não é erro — só skip.
        const isMissingFile =
          csvError && typeof csvError === "object" && "code" in csvError && csvError.code === "ENOENT";

        const message = csvError instanceof Error ? csvError.message : String(csvError);

        if (isMissingFile) {
          await logger.info(`Job ${job.key} pulado: CSV não disponível (já consumido ou ainda não gerado).`, {
            jobKey: job.key,
            csvFile: job.csvFile,
          });
        } else {
          await logger.error(`Erro ao processar job CSV ${job.key}.`, {
            jobKey: job.key,
            error: message,
          });
        }

        skippedJobs.push({
          jobKey: job.key,
          kind: job.kind,
          region: job.region,
          mode: "rotation",
          rows: [],
          rowCount: 0,
          trackState: false,
          skipped: true,
          skipReason: isMissingFile
            ? `CSV não disponível: ${job.csvFile}`
            : `Erro ao ler CSV: ${message}`,
        });
      }
    }

    // Envia payload dos CSV jobs primeiro (rotação deve ocorrer antes dos lotes/vendas)
    if (executedJobs.length > 0) {
      const csvPayload = {
        connectorId: env.CONNECTOR_ID,
        sentAt: new Date().toISOString(),
        jobs: executedJobs.map(job => ({
          jobKey: job.jobKey,
          kind: job.kind,
          region: job.region,
          mode: job.mode,
          rows: job.rows,
        })),
      };

      const previewFilePath = path.join(path.dirname(stateFilePath), "last-csv-payload.preview.json");
      // Salva preview sem as rows (muito grande)
      const previewData = {
        ...csvPayload,
        jobs: csvPayload.jobs.map(j => ({ ...j, rows: `[${j.rows.length} rows]` })),
      };
      await fs.writeFile(previewFilePath, `${JSON.stringify(previewData, null, 2)}\n`, "utf8");

      if (!args.dryRun) {
        const csvApiResult = await postPayload(env.DASHBOARD_SYNC_URL, env.CONNECTOR_SHARED_TOKEN, csvPayload);
        await logger.info("Payload CSV-rotation enviado ao dashboard com sucesso.", {
          connectorId: env.CONNECTOR_ID,
          response: csvApiResult,
        });

        // Excluir os arquivos CSV após envio bem-sucedido ao dashboard
        for (const job of executedJobs) {
          if (job.csvFilePath) {
            try {
              await fs.unlink(job.csvFilePath);
              await logger.info(`Arquivo CSV excluído com sucesso após envio: ${job.csvFilePath}`);
            } catch (unlinkErr) {
              // Retry com pequeno delay (arquivo pode estar sendo liberado pelo SO)
              await new Promise(resolve => setTimeout(resolve, 2000));
              try {
                await fs.unlink(job.csvFilePath);
                await logger.info(`Arquivo CSV excluído com sucesso (2ª tentativa): ${job.csvFilePath}`);
              } catch (retryErr) {
                await logger.warn(`Não foi possível excluir o arquivo CSV após envio: ${job.csvFilePath}`, {
                  error: retryErr instanceof Error ? retryErr.message : String(retryErr),
                  hint: "Verifique permissões de escrita no compartilhamento de rede ou se outro processo mantém lock no arquivo.",
                });
              }
            }
          }
        }
      } else {
        await logger.info("Modo dry-run: payload CSV-rotation não enviado (arquivos CSV preservados).", { previewFilePath });
      }
    }

    // Executa jobs SQL (vendas e lotes) — agora o painel já foi atualizado
    const sqlExecutedJobs = [];
    for (const job of sqlJobs) {
      const execution = await runJob(pool, job, configFilePath, state, env, logger);

      if (execution.skipped) {
        skippedJobs.push(execution);
        await logger.info(`Job ${job.key} pulado.`, {
          jobKey: job.key,
          kind: job.kind,
          region: job.region,
          reason: execution.skipReason,
        });
        continue;
      }

      sqlExecutedJobs.push(execution);
      await logger.info("Job SQL consultado com sucesso.", {
        jobKey: job.key,
        kind: job.kind,
        region: job.region,
        rowCount: execution.rowCount,
        sqlFile: path.relative(connectorRoot, execution.sqlFilePath),
      });
    }

    if (pool) {
      await pool.close();
    }

    // Envia payload dos SQL jobs
    if (sqlExecutedJobs.length > 0) {
      const sqlPayload = {
        connectorId: env.CONNECTOR_ID,
        sentAt: new Date().toISOString(),
        jobs: sqlExecutedJobs.map(job => ({
          jobKey: job.jobKey,
          kind: job.kind,
          region: job.region,
          mode: job.mode,
          rows: job.rows,
        })),
      };

      const previewFilePath = path.join(path.dirname(stateFilePath), "last-sql-payload.preview.json");
      const previewData = {
        ...sqlPayload,
        jobs: sqlPayload.jobs.map(j => ({ ...j, rows: `[${j.rows.length} rows]` })),
      };
      await fs.writeFile(previewFilePath, `${JSON.stringify(previewData, null, 2)}\n`, "utf8");

      if (!args.dryRun) {
        const sqlApiResult = await postPayload(env.DASHBOARD_SYNC_URL, env.CONNECTOR_SHARED_TOKEN, sqlPayload);
        await logger.info("Payload SQL enviado ao dashboard com sucesso.", {
          connectorId: env.CONNECTOR_ID,
          response: sqlApiResult,
        });
      } else {
        await logger.info("Modo dry-run: payload SQL não enviado.", { previewFilePath });
      }
    }

    // Atualiza state
    const nextState = {
      jobs: {
        ...(state.jobs ?? {}),
      },
    };

    for (const job of [...executedJobs, ...sqlExecutedJobs]) {
      if (!job.trackState) {
        continue;
      }

      nextState.jobs[job.jobKey] = {
        lastRunAt: new Date().toISOString(),
        lastSuccessAt: new Date().toISOString(),
        lastStatus: "success",
        lastRowCount: job.rowCount,
      };
    }

    await saveState(stateFilePath, nextState);

    // Se todos os jobs foram pulados, informar
    if (executedJobs.length === 0 && sqlExecutedJobs.length === 0) {
      await logger.info("Todos os jobs foram pulados nesta execução.", {
        connectorId: env.CONNECTOR_ID,
        skippedJobs: skippedJobs.map(job => ({
          key: job.jobKey,
          reason: job.skipReason,
        })),
      });
      console.log(JSON.stringify({
        success: true,
        connectorId: env.CONNECTOR_ID,
        message: "Todos os jobs foram pulados.",
        skippedJobs: skippedJobs.map(job => ({
          key: job.jobKey,
          reason: job.skipReason,
        })),
      }, null, 2));
      return;
    }

    console.log(JSON.stringify({
      success: true,
      connectorId: env.CONNECTOR_ID,
      jobs: [...executedJobs, ...sqlExecutedJobs].map(job => ({ key: job.jobKey, rows: job.rowCount })),
      skippedJobs: skippedJobs.map(job => ({ key: job.jobKey, reason: job.skipReason })),
      stateFilePath,
      logFilePath: logger.logFilePath,
    }, null, 2));
  } catch (error) {
    const env = process.env;
    const fallbackLogDir = path.resolve(connectorRoot, env.CONNECTOR_LOG_DIR || "./04_Logs");
    await ensureDirectory(fallbackLogDir);
    const logger = createLogger(fallbackLogDir);
    const stateFilePath = path.resolve(connectorRoot, env.CONNECTOR_STATE_FILE || "./state/connector-state.json");
    const state = await loadState(stateFilePath);
    const failedJob = parseArgs(process.argv.slice(2)).job;

    if (failedJob) {
      state.jobs = state.jobs ?? {};
      state.jobs[failedJob] = {
        ...(state.jobs[failedJob] ?? {}),
        lastRunAt: new Date().toISOString(),
        lastStatus: "error",
        lastError: error instanceof Error ? error.message : String(error),
      };
      await saveState(stateFilePath, state);
    }

    await logger.error("Falha durante a execução do conector.", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
    });

    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

await main();
