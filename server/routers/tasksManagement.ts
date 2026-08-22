import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { tasksManagement, taskManagementComments } from "../../drizzle/schema";
import { eq, and, or, desc, asc, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const tasksManagementRouter = router({
  // Create task
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        type: z.enum(["daily", "weekly", "monthly"]),
        priority: z.enum(["Baixa", "Média", "Alta", "Crítica"]),
        difficulty: z.enum(["Facil", "Normal", "Dificil", "Muito Dificil"]),
        points: z.number().optional(),
        assignedToId: z.number().optional(),
        assignedToName: z.string().optional(),
        dueDate: z.number().optional(),
        recurrencePattern: z.string().optional(),
        tags: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection failed" });
      
      const now = Date.now();

      const result = await db.insert(tasksManagement).values({
        title: input.title,
        description: input.description,
        type: input.type,
        priority: input.priority,
        difficulty: input.difficulty,
        points: input.points || 10,
        assignedToId: input.assignedToId,
        assignedToName: input.assignedToName,
        dueDate: input.dueDate,
        recurrencePattern: input.recurrencePattern,
        tags: input.tags ? JSON.stringify(input.tags) : null,
        createdById: ctx.user.id,
        createdByName: ctx.user.name,
        createdAt: now,
        updatedAt: now,
      });

      return { id: result[0].insertId };
    }),

  // List tasks with filters
  list: protectedProcedure
    .input(
      z.object({
        type: z.enum(["daily", "weekly", "monthly"]).optional(),
        status: z.enum(["pending", "in_progress", "completed"]).optional(),
        assignedToId: z.number().optional(),
        sortBy: z.enum(["dueDate", "createdAt", "priority"]).optional(),
        sortOrder: z.enum(["asc", "desc"]).optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection failed" });
      
      const conditions = [];

      if (input.type) conditions.push(eq(tasksManagement.type, input.type));
      if (input.status) conditions.push(eq(tasksManagement.status, input.status));
      if (input.assignedToId) conditions.push(eq(tasksManagement.assignedToId, input.assignedToId));

      let query: any = db.select().from(tasksManagement);

      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }

      // Apply sorting
      if (input.sortBy === "dueDate") {
        query = query.orderBy(input.sortOrder === "asc" ? asc(tasksManagement.dueDate) : desc(tasksManagement.dueDate));
      } else if (input.sortBy === "createdAt") {
        query = query.orderBy(input.sortOrder === "asc" ? asc(tasksManagement.createdAt) : desc(tasksManagement.createdAt));
      } else {
        query = query.orderBy(desc(tasksManagement.createdAt));
      }

      const tasks = await query;
      return tasks.map((t: any) => ({
        ...t,
        tags: t.tags ? JSON.parse(t.tags as string) : [],
      }));
    }),

  // Get single task
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection failed" });
      
      const task = await db.select().from(tasksManagement).where(eq(tasksManagement.id, input.id));

      if (!task.length) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });

      return {
        ...task[0],
        tags: task[0].tags ? JSON.parse(task[0].tags as string) : [],
      };
    }),

  // Update task
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().optional(),
        description: z.string().optional(),
        status: z.enum(["pending", "in_progress", "completed"]).optional(),
        priority: z.enum(["Baixa", "Média", "Alta", "Crítica"]).optional(),
        difficulty: z.enum(["Facil", "Normal", "Dificil", "Muito Dificil"]).optional(),
        assignedToId: z.number().optional().nullable(),
        assignedToName: z.string().optional().nullable(),
        dueDate: z.number().optional().nullable(),
        completedDate: z.number().optional().nullable(),
        tags: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection failed" });
      
      const now = Date.now();

      const updates: any = { updatedAt: now };
      if (input.title !== undefined) updates.title = input.title;
      if (input.description !== undefined) updates.description = input.description;
      if (input.status !== undefined) updates.status = input.status;
      if (input.priority !== undefined) updates.priority = input.priority;
      if (input.difficulty !== undefined) updates.difficulty = input.difficulty;
      if (input.assignedToId !== undefined) updates.assignedToId = input.assignedToId;
      if (input.assignedToName !== undefined) updates.assignedToName = input.assignedToName;
      if (input.dueDate !== undefined) updates.dueDate = input.dueDate;
      if (input.completedDate !== undefined) updates.completedDate = input.completedDate;
      if (input.tags !== undefined) updates.tags = JSON.stringify(input.tags);

      await db.update(tasksManagement).set(updates).where(eq(tasksManagement.id, input.id));

      return { success: true };
    }),

  // Delete task
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection failed" });

      // Only admin or creator can delete
      const task = await db.select().from(tasksManagement).where(eq(tasksManagement.id, input.id));
      if (!task.length) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      if (task[0].createdById !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can only delete your own tasks" });
      }

      await db.delete(tasksManagement).where(eq(tasksManagement.id, input.id));
      return { success: true };
    }),

  // Reorder tasks (for kanban)
  reorder: protectedProcedure
    .input(
      z.object({
        taskId: z.number(),
        newStatus: z.enum(["pending", "in_progress", "completed"]),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection failed" });
      
      const now = Date.now();
      const completedDate = input.newStatus === "completed" ? now : null;

      await db
        .update(tasksManagement)
        .set({ status: input.newStatus, completedDate, updatedAt: now })
        .where(eq(tasksManagement.id, input.taskId));

      return { success: true };
    }),

  // Add comment
  addComment: protectedProcedure
    .input(
      z.object({
        taskId: z.number(),
        content: z.string().min(1),
        mentionedUserIds: z.array(z.number()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection failed" });
      
      const now = Date.now();

      const result = await db.insert(taskManagementComments).values({
        taskId: input.taskId,
        userId: ctx.user.id,
        userName: ctx.user.name,
        content: input.content,
        mentionedUserIds: input.mentionedUserIds ? JSON.stringify(input.mentionedUserIds) : null,
        createdAt: now,
        updatedAt: now,
      });

      return { id: result[0].insertId };
    }),

  // Get task comments
  getComments: protectedProcedure
    .input(z.object({ taskId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection failed" });
      
      const comments = await db
        .select()
        .from(taskManagementComments)
        .where(eq(taskManagementComments.taskId, input.taskId))
        .orderBy(desc(taskManagementComments.createdAt));

      return comments.map((c: any) => ({
        ...c,
        mentionedUserIds: c.mentionedUserIds ? JSON.parse(c.mentionedUserIds as string) : [],
      }));
    }),

  // Delete comment
  deleteComment: protectedProcedure
    .input(z.object({ commentId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection failed" });

      const comment = await db
        .select()
        .from(taskManagementComments)
        .where(eq(taskManagementComments.id, input.commentId));

      if (!comment.length) throw new TRPCError({ code: "NOT_FOUND", message: "Comment not found" });
      if (comment[0].userId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can only delete your own comments" });
      }

      const result = await db.delete(taskManagementComments).where(eq(taskManagementComments.id, input.commentId));

      if ((result as any)[0].affectedRows === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Comment not found" });
      }

      return { success: true };
    }),

  // Get statistics
  getStats: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection failed" });

    const allTasks = await db.select().from(tasksManagement);
    const userTasks = allTasks.filter((t: any) => t.assignedToId === ctx.user.id);

    const stats = {
      total: allTasks.length,
      completed: allTasks.filter((t: any) => t.status === "completed").length,
      pending: allTasks.filter((t: any) => t.status === "pending").length,
      inProgress: allTasks.filter((t: any) => t.status === "in_progress").length,
      userTotal: userTasks.length,
      userCompleted: userTasks.filter((t: any) => t.status === "completed").length,
      userPending: userTasks.filter((t: any) => t.status === "pending").length,
      byType: {
        daily: allTasks.filter((t: any) => t.type === "daily").length,
        weekly: allTasks.filter((t: any) => t.type === "weekly").length,
        monthly: allTasks.filter((t: any) => t.type === "monthly").length,
      },
    };

    return stats;
  }),
});
