import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import {
  createResponsibilityTag,
  getResponsibilityTags,
  getResponsibilityTagById,
  updateResponsibilityTag,
  deleteResponsibilityTag,
  assignResponsibilityToPerson,
  getPersonResponsibilities,
  updatePersonResponsibility,
  removeResponsibilityFromPerson,
  getUsersByResponsibility,
  assignResponsibilityToTicket,
  getTicketResponsibilities,
  updateTicketResponsibility,
  removeResponsibilityFromTicket,
  assignResponsibilityToTask,
  getTaskResponsibilities,
  updateTaskResponsibility,
  removeResponsibilityFromTask,
  logResponsibilityChange,
  getResponsibilityHistory,
  getUserResponsibilityWorkload,
  getTeamResponsibilityOverview,
} from "../db/responsibilities";

export const responsibilitiesRouter = router({
  tags: router({
    list: protectedProcedure.query(async () => {
      return await getResponsibilityTags();
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const result = await getResponsibilityTagById(input.id);
        return result[0] || null;
      }),

    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(100),
          description: z.string().optional(),
          color: z.string().regex(/^#[0-9A-F]{6}$/i).optional(),
          icon: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const result = await createResponsibilityTag({ ...input, createdById: ctx.user.id });
        const insertId = (result as any).insertId || 0;

        await logResponsibilityChange({
          changeType: "created",
          entityType: "tag",
          entityId: insertId,
          changedById: ctx.user.id,
          changedByName: ctx.user.name,
          newValues: input,
          description: `Created responsibility tag: ${input.name}`,
        });

        return result;
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().optional(),
          description: z.string().optional(),
          color: z.string().optional(),
          icon: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        const result = await updateResponsibilityTag(id, data);

        await logResponsibilityChange({
          changeType: "updated",
          entityType: "tag",
          entityId: id,
          changedById: ctx.user.id,
          changedByName: ctx.user.name,
          newValues: data,
          description: `Updated responsibility tag`,
        });

        return result;
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const result = await deleteResponsibilityTag(input.id);

        await logResponsibilityChange({
          changeType: "deleted",
          entityType: "tag",
          entityId: input.id,
          changedById: ctx.user.id,
          changedByName: ctx.user.name,
          description: `Deleted responsibility tag`,
        });

        return result;
      }),
  }),

  person: router({
    getResponsibilities: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ input }) => {
        return await getPersonResponsibilities(input.userId);
      }),

    assign: protectedProcedure
      .input(
        z.object({
          userId: z.number(),
          tagId: z.number(),
          level: z.enum(["junior", "pleno", "senior", "especialista"]).optional(),
          isPrimary: z.boolean().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const result = await assignResponsibilityToPerson(input);
        const insertId = (result as any).insertId || 0;

        await logResponsibilityChange({
          changeType: "assigned",
          entityType: "person_responsibility",
          entityId: insertId,
          changedById: ctx.user.id,
          changedByName: ctx.user.name,
          newValues: input,
          description: `Assigned responsibility to person`,
        });

        return result;
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          level: z.enum(["junior", "pleno", "senior", "especialista"]).optional(),
          isPrimary: z.boolean().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        const result = await updatePersonResponsibility(id, data);

        await logResponsibilityChange({
          changeType: "updated",
          entityType: "person_responsibility",
          entityId: id,
          changedById: ctx.user.id,
          changedByName: ctx.user.name,
          newValues: data,
          description: `Updated person responsibility`,
        });

        return result;
      }),

    remove: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const result = await removeResponsibilityFromPerson(input.id);

        await logResponsibilityChange({
          changeType: "unassigned",
          entityType: "person_responsibility",
          entityId: input.id,
          changedById: ctx.user.id,
          changedByName: ctx.user.name,
          description: `Removed person responsibility`,
        });

        return result;
      }),

    getUsersByTag: protectedProcedure
      .input(z.object({ tagId: z.number() }))
      .query(async ({ input }) => {
        return await getUsersByResponsibility(input.tagId);
      }),
  }),

  ticket: router({
    getResponsibilities: protectedProcedure
      .input(z.object({ ticketId: z.number() }))
      .query(async ({ input }) => {
        return await getTicketResponsibilities(input.ticketId);
      }),

    assign: protectedProcedure
      .input(
        z.object({
          ticketId: z.number(),
          userId: z.number(),
          role: z.enum(["primary", "secondary", "reviewer"]).optional(),
          estimatedHours: z.number().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const result = await assignResponsibilityToTicket(input);
        const insertId = (result as any).insertId || 0;

        await logResponsibilityChange({
          changeType: "assigned",
          entityType: "ticket_responsibility",
          entityId: insertId,
          changedById: ctx.user.id,
          changedByName: ctx.user.name,
          newValues: input,
          description: `Assigned ticket responsibility`,
        });

        return result;
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          role: z.enum(["primary", "secondary", "reviewer"]).optional(),
          isActive: z.boolean().optional(),
          estimatedHours: z.number().optional(),
          actualHours: z.number().optional(),
          notes: z.string().optional(),
          completedAt: z.date().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        const result = await updateTicketResponsibility(id, data);

        await logResponsibilityChange({
          changeType: "updated",
          entityType: "ticket_responsibility",
          entityId: id,
          changedById: ctx.user.id,
          changedByName: ctx.user.name,
          newValues: data,
          description: `Updated ticket responsibility`,
        });

        return result;
      }),

    remove: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const result = await removeResponsibilityFromTicket(input.id);

        await logResponsibilityChange({
          changeType: "unassigned",
          entityType: "ticket_responsibility",
          entityId: input.id,
          changedById: ctx.user.id,
          changedByName: ctx.user.name,
          description: `Removed ticket responsibility`,
        });

        return result;
      }),
  }),

  task: router({
    getResponsibilities: protectedProcedure
      .input(z.object({ taskId: z.number() }))
      .query(async ({ input }) => {
        return await getTaskResponsibilities(input.taskId);
      }),

    assign: protectedProcedure
      .input(
        z.object({
          taskId: z.number(),
          userId: z.number(),
          role: z.enum(["owner", "collaborator"]).optional(),
          estimatedHours: z.number().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const result = await assignResponsibilityToTask(input);
        const insertId = (result as any).insertId || 0;

        await logResponsibilityChange({
          changeType: "assigned",
          entityType: "task_responsibility",
          entityId: insertId,
          changedById: ctx.user.id,
          changedByName: ctx.user.name,
          newValues: input,
          description: `Assigned task responsibility`,
        });

        return result;
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          role: z.enum(["owner", "collaborator"]).optional(),
          isActive: z.boolean().optional(),
          estimatedHours: z.number().optional(),
          actualHours: z.number().optional(),
          notes: z.string().optional(),
          completedAt: z.date().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        const result = await updateTaskResponsibility(id, data);

        await logResponsibilityChange({
          changeType: "updated",
          entityType: "task_responsibility",
          entityId: id,
          changedById: ctx.user.id,
          changedByName: ctx.user.name,
          newValues: data,
          description: `Updated task responsibility`,
        });

        return result;
      }),

    remove: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const result = await removeResponsibilityFromTask(input.id);

        await logResponsibilityChange({
          changeType: "unassigned",
          entityType: "task_responsibility",
          entityId: input.id,
          changedById: ctx.user.id,
          changedByName: ctx.user.name,
          description: `Removed task responsibility`,
        });

        return result;
      }),
  }),

  dashboard: router({
    userWorkload: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ input }) => {
        return await getUserResponsibilityWorkload(input.userId);
      }),

    teamOverview: protectedProcedure.query(async () => {
      return await getTeamResponsibilityOverview();
    }),

    history: protectedProcedure
      .input(
        z.object({
          entityType: z.string(),
          entityId: z.number(),
        })
      )
      .query(async ({ input }) => {
        return await getResponsibilityHistory(input.entityType, input.entityId);
      }),
  }),
});
