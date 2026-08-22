import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  contratosRepasse,
  contratosRepasseFiliais,
  contratosRepasseLog,
  contratosRepasseTaxas,
} from "../../drizzle/schema";

// ==================================================================
// Tipos de domínio (DTOs)
// ==================================================================
export type Estado = "SC" | "RS";
export type Grupo = "Associativismo" | "Farmácias";
export type StatusContrato = "Vigente" | "Vencido";

export interface TaxaRepasseDTO {
  categoria: string;
  percentual: number;
}

export interface ContratoRepasseDTO {
  id: number;
  codigo: string | null;
  apelidoInterno: string | null;
  parceiro: string;
  cnpj: string;
  estado: Estado;
  grupo: Grupo;
  status: StatusContrato;
  gatilhoMensal: number;
  vigenciaInicio: string;
  vigenciaFim: string;
  observacoes: string | null;
  pdfFileName: string | null;
  pdfFileKey: string | null;
  pdfFileUrl: string | null;
  createdById: number | null;
  createdByName: string | null;
  updatedById: number | null;
  updatedByName: string | null;
  createdAt: number;
  updatedAt: number;
  taxas: TaxaRepasseDTO[];
  filiais: string[];
}

export interface ContratoRepasseFilters {
  estado?: Estado;
  grupo?: Grupo;
  status?: StatusContrato | "Todos";
  search?: string;
}

export interface ContratoRepasseInput {
  apelidoInterno?: string | null;
  parceiro: string;
  cnpj: string;
  estado: Estado;
  grupo: Grupo;
  status?: StatusContrato;
  gatilhoMensal: number;
  vigenciaInicio: string;
  vigenciaFim: string;
  observacoes?: string | null;
  pdfFileName?: string | null;
  pdfFileKey?: string | null;
  pdfFileUrl?: string | null;
  taxas: TaxaRepasseDTO[];
  filiais: string[];
}

// ==================================================================
// Helpers internos
// ==================================================================
async function hydrateContratos(rows: any[]): Promise<ContratoRepasseDTO[]> {
  if (rows.length === 0) return [];
  const db = await getDb();
  const ids = rows.map((r) => r.id);

  const [taxas, filiais] = await Promise.all([
    db!
      .select()
      .from(contratosRepasseTaxas)
      .where(sql`${contratosRepasseTaxas.contratoId} IN (${sql.join(ids, sql`, `)})`),
    db!
      .select()
      .from(contratosRepasseFiliais)
      .where(sql`${contratosRepasseFiliais.contratoId} IN (${sql.join(ids, sql`, `)})`),
  ]);

  const taxasMap = new Map<number, TaxaRepasseDTO[]>();
  for (const t of taxas) {
    const arr = taxasMap.get(t.contratoId) ?? [];
    arr.push({ categoria: t.categoria, percentual: Number(t.percentual) });
    taxasMap.set(t.contratoId, arr);
  }
  // Mantém ordem original
  taxasMap.forEach((arr) => {
    arr.sort((a, b) => a.categoria.localeCompare(b.categoria));
  });

  const filiaisMap = new Map<number, string[]>();
  for (const f of filiais) {
    const arr = filiaisMap.get(f.contratoId) ?? [];
    arr.push(f.nome);
    filiaisMap.set(f.contratoId, arr);
  }

  return rows.map(
    (r): ContratoRepasseDTO => ({
      id: r.id,
      codigo: r.codigo,
      apelidoInterno: r.apelidoInterno,
      parceiro: r.parceiro,
      cnpj: r.cnpj,
      estado: r.estado,
      grupo: r.grupo,
      status: r.status,
      gatilhoMensal: Number(r.gatilhoMensal),
      vigenciaInicio: r.vigenciaInicio,
      vigenciaFim: r.vigenciaFim,
      observacoes: r.observacoes,
      pdfFileName: r.pdfFileName,
      pdfFileKey: r.pdfFileKey,
      pdfFileUrl: r.pdfFileUrl,
      createdById: r.createdById,
      createdByName: r.createdByName,
      updatedById: r.updatedById,
      updatedByName: r.updatedByName,
      createdAt: Number(r.createdAt),
      updatedAt: Number(r.updatedAt),
      taxas: taxasMap.get(r.id) ?? [],
      filiais: filiaisMap.get(r.id) ?? [],
    })
  );
}

function autoStatus(vigenciaFim: string, forced?: StatusContrato): StatusContrato {
  if (forced) return forced;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const fim = new Date(vigenciaFim + "T00:00:00");
  return fim.getTime() >= today.getTime() ? "Vigente" : "Vencido";
}

/**
 * Corrige datas invalidas (ex: 2026-06-31 -> 2026-06-30).
 * Ultima linha de defesa antes do INSERT no banco.
 */
function sanitizeDateForDb(dateStr: string): string {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateStr;
  const [, yearStr, monthStr, dayStr] = match;
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  if (month < 1 || month > 12) return dateStr;
  const lastDay = new Date(year, month, 0).getDate();
  const correctedDay = Math.min(day, lastDay);
  return `${yearStr}-${monthStr}-${String(correctedDay).padStart(2, '0')}`;
}

// ==================================================================
// Consultas
// ==================================================================
export async function listContratosRepasse(
  filters: ContratoRepasseFilters
): Promise<ContratoRepasseDTO[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions: any[] = [];
  if (filters.estado) conditions.push(eq(contratosRepasse.estado, filters.estado));
  if (filters.grupo) conditions.push(eq(contratosRepasse.grupo, filters.grupo));
  if (filters.status && filters.status !== "Todos") {
    conditions.push(eq(contratosRepasse.status, filters.status));
  }
  if (filters.search && filters.search.trim().length > 0) {
    const term = `%${filters.search.trim()}%`;
    const cnpjDigits = filters.search.replace(/\D/g, "");
    const orConds: any[] = [like(contratosRepasse.parceiro, term)];
    if (cnpjDigits.length >= 2) {
      orConds.push(like(contratosRepasse.cnpj, `%${cnpjDigits}%`));
      orConds.push(like(contratosRepasse.cnpj, term));
    }
    conditions.push(or(...orConds));
  }

  const rows = await db
    .select()
    .from(contratosRepasse)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(contratosRepasse.updatedAt));

  return hydrateContratos(rows);
}

export async function getContratoRepasseById(id: number): Promise<ContratoRepasseDTO | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(contratosRepasse)
    .where(eq(contratosRepasse.id, id))
    .limit(1);
  if (rows.length === 0) return null;
  const [hydrated] = await hydrateContratos(rows);
  return hydrated ?? null;
}

// ==================================================================
// Mutações
// ==================================================================
export async function createContratoRepasse(
  input: ContratoRepasseInput,
  actor: { id: number | null; name: string | null }
): Promise<ContratoRepasseDTO> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não configurado");

  const now = Date.now();
  const status = autoStatus(input.vigenciaFim, input.status);

  const insertResult = await db.insert(contratosRepasse).values({
    apelidoInterno: input.apelidoInterno ?? null,
    parceiro: input.parceiro,
    cnpj: input.cnpj,
    estado: input.estado,
    grupo: input.grupo,
    status,
    gatilhoMensal: String(input.gatilhoMensal),
    vigenciaInicio: sanitizeDateForDb(input.vigenciaInicio),
    vigenciaFim: sanitizeDateForDb(input.vigenciaFim),
    observacoes: input.observacoes ?? null,
    pdfFileName: input.pdfFileName ?? null,
    pdfFileKey: input.pdfFileKey ?? null,
    pdfFileUrl: input.pdfFileUrl ?? null,
    createdById: actor.id,
    createdByName: actor.name,
    updatedById: actor.id,
    updatedByName: actor.name,
    createdAt: now,
    updatedAt: now,
  });

  const contratoId = (insertResult as any)[0]?.insertId as number;

  if (input.taxas.length > 0) {
    await db.insert(contratosRepasseTaxas).values(
      input.taxas.map((t, idx) => ({
        contratoId,
        categoria: t.categoria,
        percentual: String(t.percentual),
        ordem: idx,
      }))
    );
  }
  if (input.filiais.length > 0) {
    await db.insert(contratosRepasseFiliais).values(
      input.filiais.map((nome, idx) => ({ contratoId, nome, ordem: idx }))
    );
  }

  const result = await getContratoRepasseById(contratoId);
  if (!result) throw new Error("Falha ao recuperar contrato criado");
  return result;
}

export async function updateContratoRepasse(
  id: number,
  input: Partial<ContratoRepasseInput>,
  actor: { id: number | null; name: string | null }
): Promise<ContratoRepasseDTO> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não configurado");

  const existing = await getContratoRepasseById(id);
  if (!existing) throw new Error("Contrato não encontrado");

  const now = Date.now();
  const updateData: any = {
    updatedAt: now,
    updatedById: actor.id,
    updatedByName: actor.name,
  };

  if (input.apelidoInterno !== undefined) updateData.apelidoInterno = input.apelidoInterno;
  if (input.parceiro !== undefined) updateData.parceiro = input.parceiro;
  if (input.cnpj !== undefined) updateData.cnpj = input.cnpj;
  if (input.estado !== undefined) updateData.estado = input.estado;
  if (input.grupo !== undefined) updateData.grupo = input.grupo;
  if (input.gatilhoMensal !== undefined) updateData.gatilhoMensal = String(input.gatilhoMensal);
  if (input.vigenciaInicio !== undefined) updateData.vigenciaInicio = sanitizeDateForDb(input.vigenciaInicio);
  if (input.vigenciaFim !== undefined) updateData.vigenciaFim = sanitizeDateForDb(input.vigenciaFim);
  if (input.observacoes !== undefined) updateData.observacoes = input.observacoes;
  if (input.pdfFileName !== undefined) updateData.pdfFileName = input.pdfFileName;
  if (input.pdfFileKey !== undefined) updateData.pdfFileKey = input.pdfFileKey;
  if (input.pdfFileUrl !== undefined) updateData.pdfFileUrl = input.pdfFileUrl;

  const newVigenciaFim = input.vigenciaFim ?? existing.vigenciaFim;
  updateData.status = autoStatus(newVigenciaFim, input.status);

  await db.update(contratosRepasse).set(updateData).where(eq(contratosRepasse.id, id));

  // Replace strategy para taxas e filiais (simples e suficiente)
  if (input.taxas !== undefined) {
    await db.delete(contratosRepasseTaxas).where(eq(contratosRepasseTaxas.contratoId, id));
    if (input.taxas.length > 0) {
      await db.insert(contratosRepasseTaxas).values(
        input.taxas.map((t, idx) => ({
          contratoId: id,
          categoria: t.categoria,
          percentual: String(t.percentual),
          ordem: idx,
        }))
      );
    }
  }
  if (input.filiais !== undefined) {
    await db.delete(contratosRepasseFiliais).where(eq(contratosRepasseFiliais.contratoId, id));
    if (input.filiais.length > 0) {
      await db.insert(contratosRepasseFiliais).values(
        input.filiais.map((nome, idx) => ({ contratoId: id, nome, ordem: idx }))
      );
    }
  }

  const result = await getContratoRepasseById(id);
  if (!result) throw new Error("Falha ao recuperar contrato atualizado");
  return result;
}

// ==================================================================
// Log de atualizações
// ==================================================================
export type AcaoLog = "criacao" | "atualizacao" | "edicao";

export interface LogInput {
  contratoId: number;
  acao: AcaoLog;
  motivo?: string | null;
  dadosAnteriores?: any;
  userId?: number | null;
  userName?: string | null;
}

export async function registrarLogContrato(input: LogInput): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(contratosRepasseLog).values({
    contratoId: input.contratoId,
    acao: input.acao,
    motivo: input.motivo ?? null,
    dadosAnteriores: input.dadosAnteriores ?? null,
    userId: input.userId ?? null,
    userName: input.userName ?? null,
    createdAt: Date.now(),
  });
}

export async function getLogsContrato(contratoId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(contratosRepasseLog)
    .where(eq(contratosRepasseLog.contratoId, contratoId))
    .orderBy(desc(contratosRepasseLog.createdAt));
}

export async function deleteContratoRepasse(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não configurado");
  // ON DELETE CASCADE cuida das filhas, mas removemos explicitamente para
  // não depender da constraint estar criada no banco existente.
  await db.delete(contratosRepasseTaxas).where(eq(contratosRepasseTaxas.contratoId, id));
  await db.delete(contratosRepasseFiliais).where(eq(contratosRepasseFiliais.contratoId, id));
  await db.delete(contratosRepasse).where(eq(contratosRepasse.id, id));
}
