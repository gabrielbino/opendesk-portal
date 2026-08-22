/**
 * Router do Mapa de Inventário (submódulo do Almoxarifado de TI).
 * Pass-through tRPC + persistência MySQL (server/db/inventarioMapa.ts).
 * Permissões sob MODULES.ALMOXARIFADO. Snapshot para carga inicial do canvas;
 * CRUD por entidade (área/setor/equipamento) + reparent + import em lote.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { requirePermission } from "../permissionMiddleware";
import { MODULES, ACTIONS } from "@shared/permissions";
import * as db from "../db/inventarioMapa";

// ── Schemas de domínio (espelham @shared/inventarioMapa) ────────────────────

const posicaoSchema = z.object({ x: z.number(), y: z.number() });
const tamanhoSchema = z.object({ width: z.number(), height: z.number() });

const perifericoSchema = z.object({
  id: z.string(),
  tipo: z.enum(["Monitor", "Nobreak", "Estabilizador", "Leitor de código de barras", "Outro"]),
  descricao: z.string(),
  patrimonio: z.string(),
});

const equipmentGeralSchema = z.object({
  nome: z.string(),
  patrimonio: z.string(),
  mac: z.string(),
  sistemaOperacional: z.string(),
  responsavel: z.string(),
  departamento: z.string(),
  status: z.enum(["Online", "Offline", "Alerta", "Manutencao"]),
});

const areaSchema = z.object({
  id: z.string().min(1).max(36),
  nome: z.string().min(1).max(255),
  cor: z.string().max(16),
  posicao: posicaoSchema,
  tamanho: tamanhoSchema,
});

const setorSchema = z.object({
  id: z.string().min(1).max(36),
  nome: z.string().min(1).max(255),
  cor: z.string().max(16),
  areaId: z.string().max(36).nullable(),
  posicao: posicaoSchema,
  tamanho: tamanhoSchema,
});

const equipmentSchema = z.object({
  id: z.string().min(1).max(36),
  tipo: z.literal("Computador"),
  setorId: z.string().max(36).nullable(),
  posicao: posicaoSchema,
  geral: equipmentGeralSchema,
  perifericos: z.array(perifericoSchema),
});

// Patches (update parcial)
const areaPatch = areaSchema.partial().omit({ id: true });
const setorPatch = setorSchema.partial().omit({ id: true });
const equipmentPatch = equipmentSchema.partial().omit({ id: true });

const read = requirePermission(MODULES.ALMOXARIFADO, ACTIONS.READ);
const create = requirePermission(MODULES.ALMOXARIFADO, ACTIONS.CREATE);
const update = requirePermission(MODULES.ALMOXARIFADO, ACTIONS.UPDATE);
const del = requirePermission(MODULES.ALMOXARIFADO, ACTIONS.DELETE);

const snapshotSchema = z.object({
  areas: z.array(areaSchema),
  setores: z.array(setorSchema),
  equipamentos: z.array(equipmentSchema),
});

export const inventarioMapaRouter = router({
  /** Carga inicial do mapa inteiro (áreas + setores + equipamentos). */
  snapshot: protectedProcedure.use(read).query(async () => db.getSnapshot()),

  /** Regrava o mapa inteiro (undo/redo e importação de JSON). */
  replaceAll: protectedProcedure.use(update).input(snapshotSchema).mutation(async ({ input }) => {
    await db.replaceAll(input);
    return { ok: true };
  }),

  areas: router({
    create: protectedProcedure.use(create).input(areaSchema).mutation(async ({ input }) => {
      await db.createArea(input);
      return { ok: true };
    }),
    update: protectedProcedure.use(update)
      .input(z.object({ id: z.string(), data: areaPatch }))
      .mutation(async ({ input }) => {
        await db.updateArea(input.id, input.data);
        return { ok: true };
      }),
    delete: protectedProcedure.use(del)
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        await db.deleteArea(input.id);
        return { ok: true };
      }),
  }),

  setores: router({
    create: protectedProcedure.use(create).input(setorSchema).mutation(async ({ input }) => {
      await db.createSetor(input);
      return { ok: true };
    }),
    update: protectedProcedure.use(update)
      .input(z.object({ id: z.string(), data: setorPatch }))
      .mutation(async ({ input }) => {
        await db.updateSetor(input.id, input.data);
        return { ok: true };
      }),
    reparent: protectedProcedure.use(update)
      .input(z.object({ id: z.string(), areaId: z.string().nullable(), posicao: posicaoSchema }))
      .mutation(async ({ input }) => {
        await db.reparentSetor(input.id, input.areaId, input.posicao);
        return { ok: true };
      }),
    delete: protectedProcedure.use(del)
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        await db.deleteSetor(input.id);
        return { ok: true };
      }),
  }),

  equipamentos: router({
    create: protectedProcedure.use(create).input(equipmentSchema).mutation(async ({ input }) => {
      await db.createEquipment(input);
      return { ok: true };
    }),
    /** Import em lote (coletas do pendrive). */
    bulkCreate: protectedProcedure.use(create)
      .input(z.object({ equipamentos: z.array(equipmentSchema) }))
      .mutation(async ({ input }) => {
        await db.bulkCreateEquipments(input.equipamentos);
        return { ok: true, total: input.equipamentos.length };
      }),
    update: protectedProcedure.use(update)
      .input(z.object({ id: z.string(), data: equipmentPatch }))
      .mutation(async ({ input }) => {
        await db.updateEquipment(input.id, input.data);
        return { ok: true };
      }),
    reparent: protectedProcedure.use(update)
      .input(z.object({ id: z.string(), setorId: z.string().nullable(), posicao: posicaoSchema }))
      .mutation(async ({ input }) => {
        await db.reparentEquipment(input.id, input.setorId, input.posicao);
        return { ok: true };
      }),
    delete: protectedProcedure.use(del)
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        await db.deleteEquipment(input.id);
        return { ok: true };
      }),
  }),
});
