/**
 * Acesso a dados do Mapa de Inventário (Almoxarifado de TI).
 * Mapeia linhas planas (drizzle) ↔ domínio compartilhado (@shared/inventarioMapa).
 * Deleções de pai (área/setor) convertem a posição dos filhos de relativa para
 * absoluta dentro de uma transação, espelhando a lógica do canvas.
 */
import { getDb } from "../db";
import {
  inventarioMapaAreas,
  inventarioMapaSetores,
  inventarioMapaEquipamentos,
} from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import type {
  Area,
  Setor,
  Equipment,
  Periferico,
  EquipmentStatus,
  EquipmentType,
  MapaSnapshot,
} from "@shared/inventarioMapa";

// ── Mappers linha → domínio ────────────────────────────────────────────────

function rowToArea(r: any): Area {
  return {
    id: r.id,
    nome: r.nome,
    cor: r.cor,
    posicao: { x: r.posX, y: r.posY },
    tamanho: { width: r.width, height: r.height },
  };
}

function rowToSetor(r: any): Setor {
  return {
    id: r.id,
    nome: r.nome,
    cor: r.cor,
    areaId: r.areaId ?? null,
    posicao: { x: r.posX, y: r.posY },
    tamanho: { width: r.width, height: r.height },
  };
}

function rowToEquipment(r: any): Equipment {
  const perifericos: Periferico[] = Array.isArray(r.perifericos)
    ? r.perifericos
    : typeof r.perifericos === "string"
      ? safeParse(r.perifericos)
      : [];
  return {
    id: r.id,
    tipo: (r.tipo ?? "Computador") as EquipmentType,
    setorId: r.setorId ?? null,
    posicao: { x: r.posX, y: r.posY },
    geral: {
      nome: r.nome ?? "",
      patrimonio: r.patrimonio ?? "",
      mac: r.mac ?? "",
      sistemaOperacional: r.sistemaOperacional ?? "",
      responsavel: r.responsavel ?? "",
      departamento: r.departamento ?? "",
      status: (r.status ?? "Offline") as EquipmentStatus,
    },
    perifericos,
  };
}

function safeParse(s: string): Periferico[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// ── Snapshot (carga inicial) ────────────────────────────────────────────────

export async function getSnapshot(): Promise<MapaSnapshot> {
  const db = (await getDb())!;
  const [areas, setores, equipamentos] = await Promise.all([
    db.select().from(inventarioMapaAreas),
    db.select().from(inventarioMapaSetores),
    db.select().from(inventarioMapaEquipamentos),
  ]);
  return {
    areas: (areas as any[]).map(rowToArea),
    setores: (setores as any[]).map(rowToSetor),
    equipamentos: (equipamentos as any[]).map(rowToEquipment),
  };
}

/**
 * Regrava o mapa inteiro numa transação (apaga tudo e reinsere). Usado por
 * undo/redo e pela importação de JSON — casos em que o cliente já tem o estado
 * final completo. Ordem de exclusão: filhos antes dos pais.
 */
export async function replaceAll(snap: MapaSnapshot): Promise<void> {
  const db = (await getDb())!;
  const now = Date.now();
  await db.transaction(async (tx: any) => {
    await tx.delete(inventarioMapaEquipamentos);
    await tx.delete(inventarioMapaSetores);
    await tx.delete(inventarioMapaAreas);
    if (snap.areas.length) {
      await tx.insert(inventarioMapaAreas).values(
        snap.areas.map((a) => ({
          id: a.id, nome: a.nome, cor: a.cor,
          posX: a.posicao.x, posY: a.posicao.y,
          width: a.tamanho.width, height: a.tamanho.height,
          createdAt: now, updatedAt: now,
        })) as any,
      );
    }
    if (snap.setores.length) {
      await tx.insert(inventarioMapaSetores).values(
        snap.setores.map((s) => ({
          id: s.id, nome: s.nome, cor: s.cor, areaId: s.areaId,
          posX: s.posicao.x, posY: s.posicao.y,
          width: s.tamanho.width, height: s.tamanho.height,
          createdAt: now, updatedAt: now,
        })) as any,
      );
    }
    if (snap.equipamentos.length) {
      await tx.insert(inventarioMapaEquipamentos).values(
        snap.equipamentos.map((e) => ({
          ...equipmentValues(e), createdAt: now, updatedAt: now,
        })) as any,
      );
    }
  });
}

// ── Áreas ───────────────────────────────────────────────────────────────────

export async function createArea(a: Area): Promise<void> {
  const db = (await getDb())!;
  const now = Date.now();
  await db.insert(inventarioMapaAreas).values({
    id: a.id,
    nome: a.nome,
    cor: a.cor,
    posX: a.posicao.x,
    posY: a.posicao.y,
    width: a.tamanho.width,
    height: a.tamanho.height,
    createdAt: now,
    updatedAt: now,
  } as any);
}

export async function updateArea(id: string, data: Partial<Area>): Promise<void> {
  const db = (await getDb())!;
  const set: any = { updatedAt: Date.now() };
  if (data.nome !== undefined) set.nome = data.nome;
  if (data.cor !== undefined) set.cor = data.cor;
  if (data.posicao !== undefined) { set.posX = data.posicao.x; set.posY = data.posicao.y; }
  if (data.tamanho !== undefined) { set.width = data.tamanho.width; set.height = data.tamanho.height; }
  await db.update(inventarioMapaAreas).set(set).where(eq(inventarioMapaAreas.id, id));
}

/** Remove a área; setores filhos ficam soltos com posição convertida p/ absoluta. */
export async function deleteArea(id: string): Promise<void> {
  const db = (await getDb())!;
  await db.transaction(async (tx: any) => {
    const areaRows = await tx.select().from(inventarioMapaAreas).where(eq(inventarioMapaAreas.id, id));
    const area = areaRows[0];
    if (!area) return;
    const filhos = await tx.select().from(inventarioMapaSetores).where(eq(inventarioMapaSetores.areaId, id));
    for (const s of filhos as any[]) {
      await tx.update(inventarioMapaSetores).set({
        areaId: null,
        posX: s.posX + area.posX,
        posY: s.posY + area.posY,
        updatedAt: Date.now(),
      }).where(eq(inventarioMapaSetores.id, s.id));
    }
    await tx.delete(inventarioMapaAreas).where(eq(inventarioMapaAreas.id, id));
  });
}

// ── Setores ─────────────────────────────────────────────────────────────────

export async function createSetor(s: Setor): Promise<void> {
  const db = (await getDb())!;
  const now = Date.now();
  await db.insert(inventarioMapaSetores).values({
    id: s.id,
    nome: s.nome,
    cor: s.cor,
    areaId: s.areaId,
    posX: s.posicao.x,
    posY: s.posicao.y,
    width: s.tamanho.width,
    height: s.tamanho.height,
    createdAt: now,
    updatedAt: now,
  } as any);
}

export async function updateSetor(id: string, data: Partial<Setor>): Promise<void> {
  const db = (await getDb())!;
  const set: any = { updatedAt: Date.now() };
  if (data.nome !== undefined) set.nome = data.nome;
  if (data.cor !== undefined) set.cor = data.cor;
  if (data.areaId !== undefined) set.areaId = data.areaId;
  if (data.posicao !== undefined) { set.posX = data.posicao.x; set.posY = data.posicao.y; }
  if (data.tamanho !== undefined) { set.width = data.tamanho.width; set.height = data.tamanho.height; }
  await db.update(inventarioMapaSetores).set(set).where(eq(inventarioMapaSetores.id, id));
}

/** Move o setor para outra área (ou solta-o); posição já vem calculada pelo canvas. */
export async function reparentSetor(id: string, areaId: string | null, posicao: { x: number; y: number }): Promise<void> {
  return updateSetor(id, { areaId, posicao });
}

/** Remove o setor; equipamentos filhos ficam soltos com posição absoluta. */
export async function deleteSetor(id: string): Promise<void> {
  const db = (await getDb())!;
  await db.transaction(async (tx: any) => {
    const setorRows = await tx.select().from(inventarioMapaSetores).where(eq(inventarioMapaSetores.id, id));
    const setor = setorRows[0];
    if (!setor) return;
    const filhos = await tx.select().from(inventarioMapaEquipamentos).where(eq(inventarioMapaEquipamentos.setorId, id));
    for (const e of filhos as any[]) {
      await tx.update(inventarioMapaEquipamentos).set({
        setorId: null,
        posX: e.posX + setor.posX,
        posY: e.posY + setor.posY,
        updatedAt: Date.now(),
      }).where(eq(inventarioMapaEquipamentos.id, e.id));
    }
    await tx.delete(inventarioMapaSetores).where(eq(inventarioMapaSetores.id, id));
  });
}

// ── Equipamentos ────────────────────────────────────────────────────────────

function equipmentValues(e: Equipment) {
  return {
    id: e.id,
    tipo: e.tipo ?? "Computador",
    setorId: e.setorId,
    posX: e.posicao.x,
    posY: e.posicao.y,
    nome: e.geral.nome,
    patrimonio: e.geral.patrimonio,
    mac: e.geral.mac,
    sistemaOperacional: e.geral.sistemaOperacional,
    responsavel: e.geral.responsavel,
    departamento: e.geral.departamento,
    status: e.geral.status,
    perifericos: e.perifericos ?? [],
  };
}

export async function createEquipment(e: Equipment): Promise<void> {
  const db = (await getDb())!;
  const now = Date.now();
  await db.insert(inventarioMapaEquipamentos).values({
    ...equipmentValues(e),
    createdAt: now,
    updatedAt: now,
  } as any);
}

export async function bulkCreateEquipments(list: Equipment[]): Promise<void> {
  if (!list.length) return;
  const db = (await getDb())!;
  const now = Date.now();
  await db.insert(inventarioMapaEquipamentos).values(
    list.map((e) => ({ ...equipmentValues(e), createdAt: now, updatedAt: now })) as any,
  );
}

export async function updateEquipment(id: string, data: Partial<Equipment>): Promise<void> {
  const db = (await getDb())!;
  const set: any = { updatedAt: Date.now() };
  if (data.tipo !== undefined) set.tipo = data.tipo;
  if (data.setorId !== undefined) set.setorId = data.setorId;
  if (data.posicao !== undefined) { set.posX = data.posicao.x; set.posY = data.posicao.y; }
  if (data.perifericos !== undefined) set.perifericos = data.perifericos;
  if (data.geral !== undefined) {
    const g = data.geral;
    if (g.nome !== undefined) set.nome = g.nome;
    if (g.patrimonio !== undefined) set.patrimonio = g.patrimonio;
    if (g.mac !== undefined) set.mac = g.mac;
    if (g.sistemaOperacional !== undefined) set.sistemaOperacional = g.sistemaOperacional;
    if (g.responsavel !== undefined) set.responsavel = g.responsavel;
    if (g.departamento !== undefined) set.departamento = g.departamento;
    if (g.status !== undefined) set.status = g.status;
  }
  await db.update(inventarioMapaEquipamentos).set(set).where(eq(inventarioMapaEquipamentos.id, id));
}

/** Move o equipamento para outro setor (ou solta-o); posição vem do canvas. */
export async function reparentEquipment(id: string, setorId: string | null, posicao: { x: number; y: number }): Promise<void> {
  return updateEquipment(id, { setorId, posicao });
}

export async function deleteEquipment(id: string): Promise<void> {
  const db = (await getDb())!;
  await db.delete(inventarioMapaEquipamentos).where(eq(inventarioMapaEquipamentos.id, id));
}
