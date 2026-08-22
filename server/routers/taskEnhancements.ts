import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb, createNotification } from "../db";
import { userStats, taskComments, taskTemplates, dailyTasks } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";

// ============ BADGE DEFINITIONS ============
const BADGES = {
  FIRST_TASK: { id: "first_task", name: "Primeira Tarefa", description: "Completou sua primeira tarefa", icon: "target", requirement: 1 },
  TASK_MASTER_10: { id: "task_master_10", name: "Mestre de Tarefas", description: "Completou 10 tarefas", icon: "star", requirement: 10 },
  TASK_MASTER_50: { id: "task_master_50", name: "Super Mestre", description: "Completou 50 tarefas", icon: "trophy", requirement: 50 },
  TASK_MASTER_100: { id: "task_master_100", name: "Lendario", description: "Completou 100 tarefas", icon: "crown", requirement: 100 },
  STREAK_3: { id: "streak_3", name: "Consistente", description: "3 dias seguidos de produtividade", icon: "flame", requirement: 3 },
  STREAK_7: { id: "streak_7", name: "Semana Perfeita", description: "7 dias seguidos de produtividade", icon: "zap", requirement: 7 },
  STREAK_30: { id: "streak_30", name: "Imparavel", description: "30 dias seguidos de produtividade", icon: "rocket", requirement: 30 },
  POINTS_100: { id: "points_100", name: "Centuriao", description: "Acumulou 100 pontos", icon: "award", requirement: 100 },
  POINTS_500: { id: "points_500", name: "Elite", description: "Acumulou 500 pontos", icon: "gem", requirement: 500 },
  POINTS_1000: { id: "points_1000", name: "Diamante", description: "Acumulou 1000 pontos", icon: "sparkles", requirement: 1000 },
};

const DIFFICULTY_POINTS: Record<string, number> = {
  "Facil": 5,
  "Normal": 10,
  "Dificil": 20,
  "Muito Dificil": 40,
};

function calculateLevel(totalPoints: number): number {
  if (totalPoints >= 5000) return 10;
  if (totalPoints >= 3000) return 9;
  if (totalPoints >= 2000) return 8;
  if (totalPoints >= 1500) return 7;
  if (totalPoints >= 1000) return 6;
  if (totalPoints >= 700) return 5;
  if (totalPoints >= 500) return 4;
  if (totalPoints >= 300) return 3;
  if (totalPoints >= 100) return 2;
  return 1;
}

function checkNewBadges(stats: { totalPoints: number; tasksCompleted: number; currentStreak: number; badges: string[] }): string[] {
  const newBadges: string[] = [];
  const existing = new Set(stats.badges || []);

  if (stats.tasksCompleted >= 1 && !existing.has(BADGES.FIRST_TASK.id)) newBadges.push(BADGES.FIRST_TASK.id);
  if (stats.tasksCompleted >= 10 && !existing.has(BADGES.TASK_MASTER_10.id)) newBadges.push(BADGES.TASK_MASTER_10.id);
  if (stats.tasksCompleted >= 50 && !existing.has(BADGES.TASK_MASTER_50.id)) newBadges.push(BADGES.TASK_MASTER_50.id);
  if (stats.tasksCompleted >= 100 && !existing.has(BADGES.TASK_MASTER_100.id)) newBadges.push(BADGES.TASK_MASTER_100.id);
  if (stats.currentStreak >= 3 && !existing.has(BADGES.STREAK_3.id)) newBadges.push(BADGES.STREAK_3.id);
  if (stats.currentStreak >= 7 && !existing.has(BADGES.STREAK_7.id)) newBadges.push(BADGES.STREAK_7.id);
  if (stats.currentStreak >= 30 && !existing.has(BADGES.STREAK_30.id)) newBadges.push(BADGES.STREAK_30.id);
  if (stats.totalPoints >= 100 && !existing.has(BADGES.POINTS_100.id)) newBadges.push(BADGES.POINTS_100.id);
  if (stats.totalPoints >= 500 && !existing.has(BADGES.POINTS_500.id)) newBadges.push(BADGES.POINTS_500.id);
  if (stats.totalPoints >= 1000 && !existing.has(BADGES.POINTS_1000.id)) newBadges.push(BADGES.POINTS_1000.id);

  return newBadges;
}

export const gamificationRouter = router({
  myStats: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const [stats] = await db.select().from(userStats).where(eq(userStats.userId, ctx.user.id));
    if (!stats) {
      const now = Date.now();
      await db.insert(userStats).values({
        userId: ctx.user.id,
        totalPoints: 0,
        tasksCompleted: 0,
        currentStreak: 0,
        longestStreak: 0,
        level: 1,
        badges: [],
        createdAt: now,
        updatedAt: now,
      });
      return { totalPoints: 0, tasksCompleted: 0, currentStreak: 0, longestStreak: 0, level: 1, badges: [] as string[], nextLevelPoints: 100 };
    }
    return {
      ...stats,
      badges: (stats.badges || []) as string[],
      nextLevelPoints: [0, 100, 300, 500, 700, 1000, 1500, 2000, 3000, 5000, 10000][stats.level] || 10000,
    };
  }),

  leaderboard: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const results = await db.select().from(userStats).orderBy(desc(userStats.totalPoints)).limit(20);
    return results.map(r => ({ ...r, badges: (r.badges || []) as string[] }));
  }),

  badges: protectedProcedure.query(async () => {
    return Object.values(BADGES);
  }),

  awardPoints: protectedProcedure
    .input(z.object({ taskId: z.number(), difficulty: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const points = DIFFICULTY_POINTS[input.difficulty || "Normal"] || 10;
      const today = new Date().toISOString().split("T")[0];

      const [existing] = await db.select().from(userStats).where(eq(userStats.userId, ctx.user.id));

      if (!existing) {
        const now = Date.now();
        await db.insert(userStats).values({
          userId: ctx.user.id, totalPoints: points, tasksCompleted: 1, currentStreak: 1,
          longestStreak: 1, lastActiveDate: new Date(today), level: calculateLevel(points),
          badges: [], createdAt: now, updatedAt: now,
        });
        const newBadges = checkNewBadges({ totalPoints: points, tasksCompleted: 1, currentStreak: 1, badges: [] });
        if (newBadges.length > 0) {
          await db.update(userStats).set({ badges: newBadges }).where(eq(userStats.userId, ctx.user.id));
        }
        return { points, newBadges, level: calculateLevel(points), totalPoints: points };
      }

      let newStreak = existing.currentStreak;
      const lastActive = existing.lastActiveDate ? new Date(existing.lastActiveDate).toISOString().split("T")[0] : null;
      const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
      if (lastActive === yesterday) { newStreak = existing.currentStreak + 1; }
      else if (lastActive !== today) { newStreak = 1; }

      const newTotalPoints = existing.totalPoints + points;
      const newTasksCompleted = existing.tasksCompleted + 1;
      const newLongestStreak = Math.max(existing.longestStreak, newStreak);
      const newLevel = calculateLevel(newTotalPoints);
      const allBadges = (existing.badges || []) as string[];
      const newBadges = checkNewBadges({ totalPoints: newTotalPoints, tasksCompleted: newTasksCompleted, currentStreak: newStreak, badges: allBadges });

      await db.update(userStats).set({
        totalPoints: newTotalPoints, tasksCompleted: newTasksCompleted, currentStreak: newStreak,
        longestStreak: newLongestStreak, lastActiveDate: new Date(today), level: newLevel,
        badges: [...allBadges, ...newBadges], updatedAt: Date.now(),
      }).where(eq(userStats.userId, ctx.user.id));

      return { points, newBadges, level: newLevel, totalPoints: newTotalPoints };
    }),
});

export const taskCommentsRouter = router({
  list: protectedProcedure
    .input(z.object({ taskId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return await db.select().from(taskComments).where(eq(taskComments.taskId, input.taskId)).orderBy(desc(taskComments.createdAt));
    }),

  create: protectedProcedure
    .input(z.object({ taskId: z.number(), content: z.string().min(1), mentions: z.array(z.number()).optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [result] = await db.insert(taskComments).values({
        taskId: input.taskId, authorId: ctx.user.id, authorName: ctx.user.name || "Usuario",
        content: input.content, mentions: input.mentions || [], createdAt: Date.now(),
      }).$returningId();

      // Process @mentions - notify mentioned users
      if (input.mentions && input.mentions.length > 0) {
        try {
          // Get task title for notification
          const [task] = await db.select().from(dailyTasks).where(eq(dailyTasks.id, input.taskId));
          const taskTitle = task?.title || 'Tarefa';

          for (const mentionedUserId of input.mentions) {
            if (mentionedUserId === ctx.user.id) continue; // Don't notify yourself
            await createNotification({
              userId: mentionedUserId,
              type: 'mention',
              title: 'Voce foi mencionado',
              message: `${ctx.user.name || 'Usuario'} mencionou voce em um comentario na tarefa: "${taskTitle}"`,
              referenceId: input.taskId,
              referenceType: 'task',
              actionUrl: `/desenvolvimento/tarefas-diarias`,
            });
          }
        } catch (notifError) {
          console.error('[Notification] Erro ao notificar mencao em tarefa:', notifError);
        }
      }

      return result;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      if (ctx.user.role !== "admin") {
        const [comment] = await db.select().from(taskComments).where(eq(taskComments.id, input.id));
        if (!comment || comment.authorId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao para deletar este comentario" });
        }
      }
      await db.delete(taskComments).where(eq(taskComments.id, input.id));
      return { success: true };
    }),
});

export const taskTemplatesRouter = router({
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return await db.select().from(taskTemplates).orderBy(desc(taskTemplates.createdAt));
  }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1), description: z.string().optional(),
      defaultPriority: z.enum(["Baixa", "Média", "Alta", "Crítica"]).optional(),
      defaultDifficulty: z.enum(["Facil", "Normal", "Dificil", "Muito Dificil"]).optional(),
      defaultPoints: z.number().optional(), defaultTags: z.array(z.string()).optional(),
      isRecurring: z.boolean().optional(), recurrencePattern: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const now = Date.now();
      const [result] = await db.insert(taskTemplates).values({
        name: input.name, description: input.description || null,
        defaultPriority: input.defaultPriority || "Média", defaultDifficulty: input.defaultDifficulty || "Normal",
        defaultPoints: input.defaultPoints || 10, defaultTags: input.defaultTags || [],
        isRecurring: input.isRecurring || false, recurrencePattern: input.recurrencePattern || null,
        createdById: ctx.user.id, createdByName: ctx.user.name || "Usuario",
        createdAt: now, updatedAt: now,
      }).$returningId();
      return result;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas admins podem deletar templates" });
      }
      await db.delete(taskTemplates).where(eq(taskTemplates.id, input.id));
      return { success: true };
    }),

  createFromTemplate: protectedProcedure
    .input(z.object({
      templateId: z.number(), projectId: z.number(), title: z.string().optional(),
      assignedToId: z.number().optional(), assignedToName: z.string().optional(), dueDate: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [template] = await db.select().from(taskTemplates).where(eq(taskTemplates.id, input.templateId));
      if (!template) throw new TRPCError({ code: "NOT_FOUND", message: "Template nao encontrado" });

      const now = Date.now();
      const [result] = await db.insert(dailyTasks).values({
        projectId: input.projectId, title: input.title || template.name,
        description: template.description, status: "Pendente",
        priority: template.defaultPriority, difficulty: template.defaultDifficulty,
        points: template.defaultPoints, tags: template.defaultTags,
        assignedToId: input.assignedToId || null, assignedToName: input.assignedToName || null,
        dueDate: input.dueDate || null, completedAt: null,
        isRecurring: template.isRecurring, recurrencePattern: template.recurrencePattern,
        templateId: template.id, order: 0,
        createdById: ctx.user.id, createdByName: ctx.user.name || "Usuario",
        createdAt: now, updatedAt: now,
      }).$returningId();
      return result;
    }),
});

export const kanbanRouter = router({
  reorder: protectedProcedure
    .input(z.object({
      tasks: z.array(z.object({
        id: z.number(), order: z.number(),
        status: z.enum(["Pendente", "Em Andamento", "Concluída"]).optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      for (const task of input.tasks) {
        const updateData: Record<string, any> = { order: task.order, updatedAt: Date.now() };
        if (task.status) updateData.status = task.status;
        await db.update(dailyTasks).set(updateData).where(eq(dailyTasks.id, task.id));
      }
      return { success: true };
    }),
});
