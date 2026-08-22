import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "../db/itInventory";
import { MODULES, ACTIONS } from "@shared/permissions";
import { requirePermission } from "../permissionMiddleware";

export const itInventoryRouter = router({
  // ============ CATEGORIES ============
  categories: router({
    list: protectedProcedure
      .use(requirePermission(MODULES.ALMOXARIFADO, ACTIONS.READ))
      .query(async () => {
        return await db.getAllItInventoryCategories();
      }),

    create: protectedProcedure
      .use(requirePermission(MODULES.ALMOXARIFADO, ACTIONS.CREATE))
      .input(
        z.object({
          name: z.string().min(1),
          description: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        return await db.createItInventoryCategory({
          name: input.name,
          description: input.description || null,
        });
      }),
  }),

  // ============ ITEMS ============
  items: router({
    list: protectedProcedure
      .use(requirePermission(MODULES.ALMOXARIFADO, ACTIONS.READ))
      .input(
        z.object({
          status: z.string().optional(),
          categoryId: z.number().optional(),
          search: z.string().optional(),
          tag: z.string().optional(),
          sector: z.string().optional(),
          responsible: z.string().optional(),
        })
      )
      .query(async ({ input }) => {
        return await db.getAllItInventoryItems(input);
      }),

    getById: protectedProcedure
      .use(requirePermission(MODULES.ALMOXARIFADO, ACTIONS.READ))
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const item = await db.getItInventoryItemById(input.id);
        if (!item) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Equipamento não encontrado",
          });
        }
        return item;
      }),

    // Verifica se uma TAG já existe (para validação em tempo real no frontend)
    checkTag: protectedProcedure
      .use(requirePermission(MODULES.ALMOXARIFADO, ACTIONS.READ))
      .input(z.object({ tag: z.string(), excludeId: z.number().optional() }))
      .query(async ({ input }) => {
        const exists = await db.checkItInventoryTagExists(input.tag, input.excludeId);
        return { exists };
      }),

    create: protectedProcedure
      .use(requirePermission(MODULES.ALMOXARIFADO, ACTIONS.CREATE))
      .input(
        z.object({
          name: z.string().min(1),
          tag: z.string().min(1),
          sector: z.string().optional(),
          responsible: z.string().optional(),
          status: z.enum(["Disponível", "Em Uso", "Manutenção", "Descartado", "Emprestado"]).default("Disponível"),
          description: z.string().optional(),
          categoryId: z.number().default(0),
          categoryName: z.string().default(""),
          serialNumber: z.string().optional(),
          model: z.string().optional(),
          manufacturer: z.string().optional(),
          purchaseDate: z.number().optional(),
          purchasePrice: z.string().optional(),
          warrantyExpiration: z.number().optional(),
          location: z.string().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Validação condicional: se status != "Disponível", setor e responsável são obrigatórios
        if (input.status !== "Disponível") {
          if (!input.sector || !input.sector.trim()) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Setor é obrigatório quando o equipamento não está disponível",
            });
          }
          if (!input.responsible || !input.responsible.trim()) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Responsável é obrigatório quando o equipamento não está disponível",
            });
          }
        }

        // Verificar se a TAG já existe
        const tagExists = await db.checkItInventoryTagExists(input.tag);
        if (tagExists) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `A TAG "${input.tag}" já está em uso por outro equipamento`,
          });
        }

        const itemNumber = await db.getNextItInventoryItemNumber();
        const itemId = `EQUIP_${String(itemNumber).padStart(4, "0")}`;

        return await db.createItInventoryItem({
          itemId,
          tag: input.tag.trim(),
          name: input.name,
          description: input.description || null,
          categoryId: input.categoryId,
          categoryName: input.categoryName,
          sector: input.sector?.trim() || null,
          responsible: input.responsible?.trim() || null,
          serialNumber: input.serialNumber || null,
          model: input.model || null,
          manufacturer: input.manufacturer || null,
          purchaseDate: input.purchaseDate || null,
          purchasePrice: input.purchasePrice ? parseFloat(input.purchasePrice).toString() : null,
          warrantyExpiration: input.warrantyExpiration || null,
          status: input.status,
          location: input.location || null,
          assignedToId: null,
          assignedToName: null,
          assignedDate: null,
          notes: input.notes || null,
          createdById: ctx.user.id,
          createdByName: ctx.user.name || "Usuário",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }),

    update: protectedProcedure
      .use(requirePermission(MODULES.ALMOXARIFADO, ACTIONS.UPDATE))
      .input(
        z.object({
          id: z.number(),
          name: z.string().optional(),
          tag: z.string().optional(),
          sector: z.string().optional().nullable(),
          responsible: z.string().optional().nullable(),
          description: z.string().optional(),
          categoryId: z.number().optional(),
          categoryName: z.string().optional(),
          serialNumber: z.string().optional(),
          model: z.string().optional(),
          manufacturer: z.string().optional(),
          purchaseDate: z.number().optional(),
          purchasePrice: z.string().optional(),
          warrantyExpiration: z.number().optional(),
          status: z.enum(["Disponível", "Em Uso", "Manutenção", "Descartado", "Emprestado"]).optional(),
          location: z.string().optional(),
          assignedToId: z.number().optional().nullable(),
          assignedToName: z.string().optional().nullable(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;

        // Validação condicional: se status != "Disponível", setor e responsável são obrigatórios
        if (data.status && data.status !== "Disponível") {
          // Buscar item atual para verificar campos existentes
          const currentItem = await db.getItInventoryItemById(id);
          const finalSector = data.sector !== undefined ? data.sector : currentItem?.sector;
          const finalResponsible = data.responsible !== undefined ? data.responsible : currentItem?.responsible;
          
          if (!finalSector || !finalSector.trim()) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Setor é obrigatório quando o equipamento não está disponível",
            });
          }
          if (!finalResponsible || !finalResponsible.trim()) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Responsável é obrigatório quando o equipamento não está disponível",
            });
          }
        }

        // Verificar unicidade da TAG se estiver sendo alterada
        if (data.tag) {
          const tagExists = await db.checkItInventoryTagExists(data.tag, id);
          if (tagExists) {
            throw new TRPCError({
              code: "CONFLICT",
              message: `A TAG "${data.tag}" já está em uso por outro equipamento`,
            });
          }
        }

        const updateData: any = { ...data };

        if (data.purchasePrice) {
          updateData.purchasePrice = parseFloat(data.purchasePrice);
        }

        return await db.updateItInventoryItem(id, updateData);
      }),

    delete: protectedProcedure
      .use(requirePermission(MODULES.ALMOXARIFADO, ACTIONS.DELETE))
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // Verificar se o usuário é admin
        if (ctx.user.role !== "admin") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Apenas administradores podem excluir equipamentos",
          });
        }

        const item = await db.getItInventoryItemById(input.id);
        if (!item) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Equipamento não encontrado",
          });
        }

        const deleted = await db.deleteItInventoryItem(input.id);
        if (!deleted) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Erro ao deletar equipamento",
          });
        }

        return { success: true };
      }),

    assign: protectedProcedure
      .use(requirePermission(MODULES.ALMOXARIFADO, ACTIONS.UPDATE))
      .input(
        z.object({
          id: z.number(),
          assignedToId: z.number(),
          assignedToName: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        return await db.updateItInventoryItem(input.id, {
          status: "Em Uso",
          assignedToId: input.assignedToId,
          assignedToName: input.assignedToName,
          assignedDate: Date.now(),
        });
      }),

    unassign: protectedProcedure
      .use(requirePermission(MODULES.ALMOXARIFADO, ACTIONS.UPDATE))
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return await db.updateItInventoryItem(input.id, {
          status: "Disponível",
          assignedToId: null,
          assignedToName: null,
          assignedDate: null,
        });
      }),
  }),

  // ============ MOVEMENTS ============
  movements: router({
    create: protectedProcedure
      .use(requirePermission(MODULES.ALMOXARIFADO, ACTIONS.CREATE))
      .input(
        z.object({
          itemId: z.number(),
          itemName: z.string(),
          type: z.enum(["Entrada", "Saída", "Transferência", "Devolução", "Manutenção"]),
          quantity: z.number().default(1),
          fromLocation: z.string().optional(),
          toLocation: z.string().optional(),
          fromUserId: z.number().optional(),
          fromUserName: z.string().optional(),
          toUserId: z.number().optional(),
          toUserName: z.string().optional(),
          reason: z.string().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const movementNumber = await db.getNextItInventoryMovementNumber();
        const movementId = `MOV_${String(movementNumber).padStart(5, "0")}`;

        return await db.createItInventoryMovement({
          movementId,
          itemId: input.itemId,
          itemName: input.itemName,
          type: input.type,
          quantity: input.quantity,
          fromLocation: input.fromLocation || null,
          toLocation: input.toLocation || null,
          fromUserId: input.fromUserId || null,
          fromUserName: input.fromUserName || null,
          toUserId: input.toUserId || null,
          toUserName: input.toUserName || null,
          reason: input.reason || null,
          notes: input.notes || null,
          authorizedById: ctx.user.id,
          authorizedByName: ctx.user.name || "Usuário",
          createdById: ctx.user.id,
          createdByName: ctx.user.name || "Usuário",
          createdAt: Date.now(),
        });
      }),

    getByItemId: protectedProcedure
      .use(requirePermission(MODULES.ALMOXARIFADO, ACTIONS.READ))
      .input(z.object({ itemId: z.number() }))
      .query(async ({ input }) => {
        return await db.getItInventoryMovementsByItemId(input.itemId);
      }),
  }),

  // ============ WRITE-OFFS ============
  writeOffs: router({
    create: protectedProcedure
      .use(requirePermission(MODULES.ALMOXARIFADO, ACTIONS.CREATE))
      .input(
        z.object({
          itemId: z.number(),
          itemName: z.string(),
          serialNumber: z.string().optional(),
          reason: z.enum(["Defeito", "Obsoleto", "Perda", "Roubo", "Doação", "Venda", "Outro"]),
          reasonDescription: z.string().optional(),
          estimatedValue: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const writeOffNumber = await db.getNextItInventoryWriteOffNumber();
        const writeOffId = `WRITEOFF_${String(writeOffNumber).padStart(5, "0")}`;

        // Update item status to Descartado
        await db.updateItInventoryItem(input.itemId, {
          status: "Descartado",
        });

        return await db.createItInventoryWriteOff({
          writeOffId,
          itemId: input.itemId,
          itemName: input.itemName,
          serialNumber: input.serialNumber || null,
          reason: input.reason,
          reasonDescription: input.reasonDescription || null,
          writeOffDate: Date.now(),
          estimatedValue: input.estimatedValue ? parseFloat(input.estimatedValue).toString() : null,
          authorizedById: ctx.user.id,
          authorizedByName: ctx.user.name || "Usuário",
          createdById: ctx.user.id,
          createdByName: ctx.user.name || "Usuário",
          createdAt: Date.now(),
        });
      }),

    list: protectedProcedure
      .use(requirePermission(MODULES.ALMOXARIFADO, ACTIONS.READ))
      .query(async () => {
        return await db.getAllItInventoryWriteOffs();
      }),
  }),

  // ============ MAINTENANCE ============
  maintenance: router({
    create: protectedProcedure
      .use(requirePermission(MODULES.ALMOXARIFADO, ACTIONS.CREATE))
      .input(
        z.object({
          itemId: z.number(),
          itemName: z.string(),
          type: z.enum(["Preventiva", "Corretiva", "Limpeza", "Inspeção"]),
          description: z.string().optional(),
          startDate: z.number(),
          technician: z.string().optional(),
          cost: z.string().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const maintenanceNumber = await db.getNextItInventoryMaintenanceNumber();
        const maintenanceId = `MAINT_${String(maintenanceNumber).padStart(5, "0")}`;

        // Update item status to Manutenção
        await db.updateItInventoryItem(input.itemId, {
          status: "Manutenção",
        });

        return await db.createItInventoryMaintenance({
          maintenanceId,
          itemId: input.itemId,
          itemName: input.itemName,
          type: input.type,
          description: input.description || null,
          startDate: input.startDate,
          endDate: null,
          status: "Agendada",
          technician: input.technician || null,
          cost: input.cost ? parseFloat(input.cost).toString() : null,
          notes: input.notes || null,
          createdById: ctx.user.id,
          createdByName: ctx.user.name || "Usuário",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }),

    getByItemId: protectedProcedure
      .use(requirePermission(MODULES.ALMOXARIFADO, ACTIONS.READ))
      .input(z.object({ itemId: z.number() }))
      .query(async ({ input }) => {
        return await db.getItInventoryMaintenanceByItemId(input.itemId);
      }),

    update: protectedProcedure
      .use(requirePermission(MODULES.ALMOXARIFADO, ACTIONS.UPDATE))
      .input(
        z.object({
          id: z.number(),
          status: z.enum(["Agendada", "Em Andamento", "Concluída", "Cancelada"]).optional(),
          endDate: z.number().optional(),
          technician: z.string().optional(),
          cost: z.string().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        const updateData: any = { ...data };

        if (data.cost) {
          updateData.cost = parseFloat(data.cost);
        }

        const maintenance = await db.updateItInventoryMaintenance(id, updateData);

        // If maintenance is completed, update item status back to Disponível
        if (data.status === "Concluída" && maintenance) {
          await db.updateItInventoryItem(maintenance.itemId, {
            status: "Disponível",
          });
        }

        return maintenance;
      }),
  }),

  // ============ STATISTICS ============
  stats: router({
    summary: protectedProcedure
      .use(requirePermission(MODULES.ALMOXARIFADO, ACTIONS.READ))
      .query(async () => {
        const allItems = await db.getAllItInventoryItems();

        const stats = {
          total: allItems.length,
          available: allItems.filter((i) => i.status === "Disponível").length,
          inUse: allItems.filter((i) => i.status === "Em Uso").length,
          maintenance: allItems.filter((i) => i.status === "Manutenção").length,
          discarded: allItems.filter((i) => i.status === "Descartado").length,
          borrowed: allItems.filter((i) => i.status === "Emprestado").length,
        };

        return stats;
      }),
  }),
});
