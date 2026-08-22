import { getDb } from "../db";
import { commercialUploads, commercialPdeRejections, commercialProducts } from "../../drizzle/schema";
import { eq, desc, sql, and, like, count } from "drizzle-orm";

// ==================== UPLOADS ====================

export async function createCommercialUpload(data: {
  fileName: string;
  originalName: string;
  fileUrl?: string;
  fileKey?: string;
  uploadedById: number;
  uploadedByName: string;
}) {
  const db = await getDb();
  const result = await db!.insert(commercialUploads).values({
    ...data,
    status: "processing",
    totalRecords: 0,
    createdAt: Date.now(),
  });
  return result[0].insertId;
}

export async function updateCommercialUpload(id: number, data: {
  status?: "processing" | "completed" | "error";
  totalRecords?: number;
  errorMessage?: string;
  fileUrl?: string;
  fileKey?: string;
}) {
  const db = await getDb();
  await db!.update(commercialUploads).set(data).where(eq(commercialUploads.id, id));
}

export async function getCommercialUploads() {
  const db = await getDb();
  return db!.select().from(commercialUploads).orderBy(desc(commercialUploads.createdAt));
}

export async function deleteCommercialUpload(id: number) {
  const db = await getDb();
  // Delete related records first
  await db!.delete(commercialPdeRejections).where(eq(commercialPdeRejections.uploadId, id));
  await db!.delete(commercialProducts).where(eq(commercialProducts.uploadId, id));
  await db!.delete(commercialUploads).where(eq(commercialUploads.id, id));
}

// ==================== PDE REJECTIONS ====================

export async function insertPdeRejections(uploadId: number, records: any[]) {
  const db = await getDb();
  const BATCH_SIZE = 500;
  let totalInserted = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE).map((r: any) => ({
      uploadId,
      dataRegistro: r.dataRegistro || null,
      estado: r.estado || null,
      razaoSocial: r.razaoSocial || null,
      cnpj: r.cnpj || null,
      pedido: r.pedido || null,
      codProduto: r.codProduto || null,
      produto: r.produto || null,
      percentualDesconto: r.percentualDesconto || null,
      precoUnitario: r.precoUnitario || null,
      qtdSolicitado: r.qtdSolicitado || null,
      qtdAtendido: r.qtdAtendido || null,
      codFabricante: r.codFabricante || null,
      fabricante: r.fabricante || null,
      idPolitica: r.idPolitica || null,
      politica: r.politica || null,
      motivoRejeicao: r.motivoRejeicao || null,
      layout: r.layout || null,
      createdAt: Date.now(),
    }));

    if (batch.length > 0) {
      await db!.insert(commercialPdeRejections).values(batch as any);
      totalInserted += batch.length;
    }
  }

  return totalInserted;
}

export async function insertCommercialProducts(uploadId: number, records: any[]) {
  const db = await getDb();
  const BATCH_SIZE = 500;
  let totalInserted = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE).map((r: any) => ({
      uploadId,
      codigoProduto: r.codigoProduto || null,
      produto: r.produto || null,
      codigoEan: r.codigoEan || null,
      classificacaoFiscal: r.classificacaoFiscal || null,
      codigoCest: r.codigoCest || null,
      classificacaoTributaria: r.classificacaoTributaria || null,
      descricaoClassificacao: r.descricaoClassificacao || null,
      fabricante: r.fabricante || null,
      createdAt: Date.now(),
    }));

    if (batch.length > 0) {
      await db!.insert(commercialProducts).values(batch as any);
      totalInserted += batch.length;
    }
  }

  return totalInserted;
}

export async function getPdeRejections(filters: {
  uploadId?: number;
  estado?: string;
  motivoRejeicao?: string;
  fabricante?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const db = await getDb();
  const page = filters.page || 1;
  const limit = filters.limit || 50;
  const offset = (page - 1) * limit;

  const conditions: any[] = [];
  if (filters.uploadId) conditions.push(eq(commercialPdeRejections.uploadId, filters.uploadId));
  if (filters.estado) conditions.push(eq(commercialPdeRejections.estado, filters.estado));
  if (filters.motivoRejeicao) conditions.push(eq(commercialPdeRejections.motivoRejeicao, filters.motivoRejeicao));
  if (filters.fabricante) conditions.push(eq(commercialPdeRejections.fabricante, filters.fabricante));
  if (filters.search) {
    conditions.push(
      sql`(${commercialPdeRejections.produto} LIKE ${`%${filters.search}%`} OR ${commercialPdeRejections.razaoSocial} LIKE ${`%${filters.search}%`} OR ${commercialPdeRejections.cnpj} LIKE ${`%${filters.search}%`})`
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [data, totalResult] = await Promise.all([
    db!.select().from(commercialPdeRejections)
      .where(whereClause)
      .orderBy(desc(commercialPdeRejections.id))
      .limit(limit)
      .offset(offset),
    db!.select({ total: count() }).from(commercialPdeRejections).where(whereClause),
  ]);

  return {
    data,
    total: totalResult[0]?.total || 0,
    page,
    limit,
    totalPages: Math.ceil((totalResult[0]?.total || 0) / limit),
  };
}

// ==================== ANALYTICS ====================

export async function getPdeAnalytics(uploadId?: number, motivoRejeicao?: string, estado?: string, fabricante?: string, mes?: number, ano?: number) {
  const db = await getDb();
  const conditions = [];
  if (uploadId) conditions.push(eq(commercialPdeRejections.uploadId, uploadId));
  if (motivoRejeicao) conditions.push(eq(commercialPdeRejections.motivoRejeicao, motivoRejeicao));
  if (estado) conditions.push(eq(commercialPdeRejections.estado, estado));
  if (fabricante) conditions.push(eq(commercialPdeRejections.fabricante, fabricante));
  
  // Add date filters if provided
  if (ano) {
    conditions.push(sql`YEAR(STR_TO_DATE(${commercialPdeRejections.dataRegistro}, '%d/%m/%Y')) = ${ano}`);
  }
  if (mes) {
    conditions.push(sql`MONTH(STR_TO_DATE(${commercialPdeRejections.dataRegistro}, '%d/%m/%Y')) = ${mes}`);
  }
  
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Total de rejeições
  const [totalResult] = await db!.select({ total: count() }).from(commercialPdeRejections).where(whereClause);

  // Por motivo de rejeição
  const byMotivo = await db!.select({
    motivoRejeicao: commercialPdeRejections.motivoRejeicao,
    total: count(),
  }).from(commercialPdeRejections).where(whereClause).groupBy(commercialPdeRejections.motivoRejeicao);

  // Por estado
  const byEstado = await db!.select({
    estado: commercialPdeRejections.estado,
    total: count(),
  }).from(commercialPdeRejections).where(whereClause).groupBy(commercialPdeRejections.estado);

  // Por fabricante (top 10)
  const byFabricante = await db!.select({
    fabricante: commercialPdeRejections.fabricante,
    total: count(),
  }).from(commercialPdeRejections).where(whereClause).groupBy(commercialPdeRejections.fabricante).orderBy(desc(count())).limit(10);

  // Valor total rejeitado
  const valorTotal = await db!.select({
    total: sql<string>`COALESCE(SUM(${commercialPdeRejections.precoUnitario} * ${commercialPdeRejections.qtdSolicitado}), 0)`,
  }).from(commercialPdeRejections).where(whereClause);

  // Quantidade total rejeitada
  const qtdTotal = await db!.select({
    total: sql<number>`COALESCE(SUM(${commercialPdeRejections.qtdSolicitado}), 0)`,
  }).from(commercialPdeRejections).where(whereClause);

  // Quantidade total atendida
  const qtdAtendida = await db!.select({
    total: sql<number>`COALESCE(SUM(${commercialPdeRejections.qtdAtendido}), 0)`,
  }).from(commercialPdeRejections).where(whereClause);

  // Top 10 produtos mais rejeitados
  const topProdutos = await db!.select({
    codProduto: commercialPdeRejections.codProduto,
    produto: commercialPdeRejections.produto,
    total: count(),
  }).from(commercialPdeRejections).where(whereClause).groupBy(commercialPdeRejections.codProduto, commercialPdeRejections.produto).orderBy(desc(count())).limit(10);

  // Top 10 clientes com mais rejeições
  const topClientes = await db!.select({
    razaoSocial: commercialPdeRejections.razaoSocial,
    cnpj: commercialPdeRejections.cnpj,
    total: count(),
  }).from(commercialPdeRejections).where(whereClause).groupBy(commercialPdeRejections.razaoSocial, commercialPdeRejections.cnpj).orderBy(desc(count())).limit(10);

  return {
    totalRejeicoes: totalResult?.total || 0,
    valorTotalRejeitado: parseFloat(valorTotal[0]?.total || "0"),
    qtdTotalSolicitada: Number(qtdTotal[0]?.total || 0),
    qtdTotalAtendida: Number(qtdAtendida[0]?.total || 0),
    byMotivo,
    byEstado,
    byFabricante,
    topProdutos,
    topClientes,
  };
}

export async function getDistinctEstados(uploadId?: number) {
  const db = await getDb();
  const whereClause = uploadId ? eq(commercialPdeRejections.uploadId, uploadId) : undefined;
  const result = await db!.selectDistinct({ estado: commercialPdeRejections.estado }).from(commercialPdeRejections).where(whereClause);
  return result.map(r => r.estado).filter(Boolean);
}

export async function getDistinctMotivos(uploadId?: number) {
  const db = await getDb();
  const whereClause = uploadId ? eq(commercialPdeRejections.uploadId, uploadId) : undefined;
  const result = await db!.selectDistinct({ motivoRejeicao: commercialPdeRejections.motivoRejeicao }).from(commercialPdeRejections).where(whereClause);
  return result.map(r => r.motivoRejeicao).filter(Boolean);
}

export async function getDistinctFabricantes(uploadId?: number) {
  const db = await getDb();
  const whereClause = uploadId ? eq(commercialPdeRejections.uploadId, uploadId) : undefined;
  const result = await db!.selectDistinct({ fabricante: commercialPdeRejections.fabricante }).from(commercialPdeRejections).where(whereClause).limit(100);
  return result.map(r => r.fabricante).filter(Boolean);
}


export async function getMotivoRejeicaoDetalhes(motivoRejeicao: string, uploadId?: number, mes?: number, ano?: number) {
  const db = await getDb();
  const conditions = [];
  
  if (motivoRejeicao) conditions.push(eq(commercialPdeRejections.motivoRejeicao, motivoRejeicao));
  if (uploadId) conditions.push(eq(commercialPdeRejections.uploadId, uploadId));
  
  // Add date filters if provided
  if (ano) {
    conditions.push(sql`YEAR(STR_TO_DATE(${commercialPdeRejections.dataRegistro}, '%d/%m/%Y')) = ${ano}`);
  }
  if (mes) {
    conditions.push(sql`MONTH(STR_TO_DATE(${commercialPdeRejections.dataRegistro}, '%d/%m/%Y')) = ${mes}`);
  }
  
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Total de rejeições para este motivo
  const [totalResult] = await db!.select({ total: count() }).from(commercialPdeRejections).where(whereClause);

  // Valor total rejeitado para este motivo
  const valorTotal = await db!.select({
    total: sql<string>`COALESCE(SUM(${commercialPdeRejections.precoUnitario} * ${commercialPdeRejections.qtdSolicitado}), 0)`,
  }).from(commercialPdeRejections).where(whereClause);

  // Quantidade total solicitada
  const qtdTotal = await db!.select({
    total: sql<number>`COALESCE(SUM(${commercialPdeRejections.qtdSolicitado}), 0)`,
  }).from(commercialPdeRejections).where(whereClause);

  // Quantidade total atendida
  const qtdAtendida = await db!.select({
    total: sql<number>`COALESCE(SUM(${commercialPdeRejections.qtdAtendido}), 0)`,
  }).from(commercialPdeRejections).where(whereClause);

  // Distribuição por estado
  const byEstado = await db!.select({
    estado: commercialPdeRejections.estado,
    total: count(),
  }).from(commercialPdeRejections).where(whereClause).groupBy(commercialPdeRejections.estado).orderBy(desc(count()));

  // Distribuição por fabricante (top 10)
  const byFabricante = await db!.select({
    fabricante: commercialPdeRejections.fabricante,
    total: count(),
  }).from(commercialPdeRejections).where(whereClause).groupBy(commercialPdeRejections.fabricante).orderBy(desc(count())).limit(10);

  // Top 10 produtos rejeitados com este motivo
  const topProdutos = await db!.select({
    codProduto: commercialPdeRejections.codProduto,
    produto: commercialPdeRejections.produto,
    total: count(),
  }).from(commercialPdeRejections).where(whereClause).groupBy(commercialPdeRejections.codProduto, commercialPdeRejections.produto).orderBy(desc(count())).limit(10);

  return {
    motivoRejeicao,
    totalRejeicoes: totalResult?.total || 0,
    valorTotalRejeitado: parseFloat(valorTotal[0]?.total || "0"),
    qtdTotalSolicitada: Number(qtdTotal[0]?.total || 0),
    qtdTotalAtendida: Number(qtdAtendida[0]?.total || 0),
    byEstado,
    byFabricante,
    topProdutos,
  };
}
