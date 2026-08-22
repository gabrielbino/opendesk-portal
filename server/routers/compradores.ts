import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { ACTIONS, MODULES } from "@shared/permissions";
import { protectedProcedure, router } from "../_core/trpc";
import { requirePermission } from "../permissionMiddleware";
import {
  createComprador,
  deleteComprador,
  desvincularMarca,
  getMarcaVinculo,
  listCompradores,
  listMarcas,
  renameComprador,
  setMarcaComprador,
  syncMarcasCatalogo,
} from "../db/compradores";

/**
 * Compradores (compartilhada — painéis de estoque). Registro ÚNICO
 * comprador↔marca; cada marca em um só comprador (a atribuição bloqueia se a marca já
 * pertence a outro, devolvendo CONFLICT com o nome do dono atual).
 */
export const compradoresRouter = router({
  listCompradores: protectedProcedure
    .use(requirePermission(MODULES.COMPRADORES, ACTIONS.READ))
    .query(async () => listCompradores()),

  /** Catálogo de marcas + comprador atual de cada (null = livre). */
  listMarcas: protectedProcedure
    .use(requirePermission(MODULES.COMPRADORES, ACTIONS.READ))
    .query(async () => listMarcas()),

  createComprador: protectedProcedure
    .use(requirePermission(MODULES.COMPRADORES, ACTIONS.CREATE))
    .input(z.object({ nome: z.string().trim().min(1).max(255) }))
    .mutation(async ({ input }) => {
      try {
        return await createComprador(input.nome);
      } catch (e) {
        throw new TRPCError({ code: "CONFLICT", message: e instanceof Error ? e.message : "Falha ao criar comprador." });
      }
    }),

  renameComprador: protectedProcedure
    .use(requirePermission(MODULES.COMPRADORES, ACTIONS.UPDATE))
    .input(z.object({ id: z.number().int().positive(), nome: z.string().trim().min(1).max(255) }))
    .mutation(async ({ input }) => {
      await renameComprador(input.id, input.nome);
      return { ok: true };
    }),

  deleteComprador: protectedProcedure
    .use(requirePermission(MODULES.COMPRADORES, ACTIONS.DELETE))
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await deleteComprador(input.id);
      return { ok: true };
    }),

  /** Vincula a marca a um comprador. Bloqueia se já estiver com OUTRO comprador. */
  atribuirMarca: protectedProcedure
    .use(requirePermission(MODULES.COMPRADORES, ACTIONS.UPDATE))
    .input(z.object({ marca: z.string().trim().min(1).max(255), compradorId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const vinculo = await getMarcaVinculo(input.marca);
      if (vinculo && vinculo.compradorId !== input.compradorId) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A marca "${input.marca}" já está vinculada ao comprador "${vinculo.compradorNome}". Desvincule de lá antes de vincular a outro.`,
        });
      }
      await setMarcaComprador(input.marca, input.compradorId);
      return { ok: true };
    }),

  desvincularMarca: protectedProcedure
    .use(requirePermission(MODULES.COMPRADORES, ACTIONS.UPDATE))
    .input(z.object({ marca: z.string().trim().min(1).max(255) }))
    .mutation(async ({ input }) => {
      await desvincularMarca(input.marca);
      return { ok: true };
    }),

  /** Atualiza o catálogo de marcas a partir da base dia_estoque (botão "Atualizar marcas"). */
  syncMarcas: protectedProcedure
    .use(requirePermission(MODULES.COMPRADORES, ACTIONS.UPDATE))
    .mutation(async () => syncMarcasCatalogo()),
});
