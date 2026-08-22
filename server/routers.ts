import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { eq } from "drizzle-orm";

import bcrypt from "bcryptjs";
import * as loginRateLimit from "./loginRateLimit";
import { sdk } from "./_core/sdk";
import { TRPCError } from "@trpc/server";
import { hasModulePermission, MODULES, ACTIONS } from "@shared/permissions";
import { requirePermission } from "./permissionMiddleware";
import { responsibilitiesRouter } from "./routers/responsibilities";
import { gamificationRouter, taskCommentsRouter, taskTemplatesRouter, kanbanRouter } from "./routers/taskEnhancements";
import { itInventoryRouter } from "./routers/itInventory";
import { inventarioMapaRouter } from "./routers/inventarioMapa";
import { commercialRouter } from "./routers/commercial";
import { superestocadosRouter } from "./routers/superestocados";
import { superestocadosAIRouter } from "./routers/superestocadosAI";
import { rupturasRouter } from "./routers/rupturas";
import { validadesCurtasRouter } from "./routers/validadesCurtas";
import { monitorRouter } from "./routers/monitor";
import { compradoresRouter } from "./routers/compradores";
import { indicadoresRouter } from "./routers/indicadores";
import { contatosRouter } from "./routers/contatos";
import { perfilRouter } from "./routers/perfil";
import { associativismoRouter } from "./routers/associativismo";
import { monitorArquivosRouter } from "./routers/monitorArquivos";
import { pescadorRouter } from "./routers/pescador";
import { parcialRouter } from "./routers/parcial";
import { repassesRouter } from "./routers/repasses";
import { adminRouter } from "./routers/admin";
import { subscriptionsRouter } from "./routers/subscriptions";
// Email service removed - keeping system notifications only

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export const appRouter = router({
  system: systemRouter,
  responsibilities: responsibilitiesRouter,
  gamification: gamificationRouter,
  taskComments: taskCommentsRouter,
  taskTemplates: taskTemplatesRouter,
  kanban: kanbanRouter,
  itInventory: itInventoryRouter,
  inventarioMapa: inventarioMapaRouter,
  commercial: commercialRouter,
  superestocados: superestocadosRouter,
  superestocadosAI: superestocadosAIRouter,
  rupturas: rupturasRouter,
  validadesCurtas: validadesCurtasRouter,
  monitor: monitorRouter,
  compradores: compradoresRouter,
  indicadores: indicadoresRouter,
  contatos: contatosRouter,
  perfil: perfilRouter,
  associativismo: associativismoRouter,
  monitorArquivos: monitorArquivosRouter,
  pescador: pescadorRouter,
  parcial: parcialRouter,
  repasses: repassesRouter,
  admin: adminRouter,
  subscriptions: subscriptionsRouter,

  auth: router({
    me: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.user) return null;
      
      // If user has a groupId, merge group permissions with user permissions
      if (ctx.user.groupId) {
        const group = await db.getPermissionGroupById(ctx.user.groupId);
        if (group) {
          // Parse both permissions
          const userPerms = typeof ctx.user.permissions === 'string' 
            ? JSON.parse(ctx.user.permissions) 
            : ctx.user.permissions || {};
          const groupPerms = typeof group.permissions === 'string'
            ? JSON.parse(group.permissions)
            : group.permissions || {};
          
          // Merge: group permissions as base, user permissions override
          const mergedPermissions = { ...groupPerms, ...userPerms };
          
          return db.sanitizeUser({
            ...ctx.user,
            permissions: mergedPermissions
          });
        }
      }

      return db.sanitizeUser(ctx.user);
    }),
    
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),

    // Internal login with email/password
    login: publicProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string().min(6),
      }))
      .mutation(async ({ ctx, input }) => {
        // Anti-força-bruta: bloqueio temporário por conta após várias tentativas malsucedidas.
        const bloqueioSeg = loginRateLimit.lockRemainingSeconds(input.email);
        if (bloqueioSeg > 0) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Muitas tentativas de login. Aguarde ${bloqueioSeg}s e tente novamente.`,
          });
        }

        const user = await db.getUserByEmail(input.email);

        if (!user || !user.passwordHash) {
          loginRateLimit.recordLoginFailure(input.email);
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Email ou senha inválidos",
          });
        }

        const isValidPassword = await bcrypt.compare(input.password, user.passwordHash);
        if (!isValidPassword) {
          loginRateLimit.recordLoginFailure(input.email);
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Email ou senha inválidos",
          });
        }

        // Senha correta → não é ataque; zera o contador (mesmo que a conta esteja pendente/desabilitada).
        loginRateLimit.recordLoginSuccess(input.email);

        if (user.approvalStatus === "pending") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Sua conta está aguardando aprovação do administrador",
          });
        }

        if (user.approvalStatus === "rejected") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Sua conta foi rejeitada. Entre em contato com o administrador.",
          });
        }

        if (user.enabled === false) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Sua conta est\u00e1 desabilitada. Entre em contato com o administrador.",
          });
        }

        // Update last sign in
        await db.updateUserLastSignIn(user.id);

        // Create session token using internal user ID
        const sessionToken = await sdk.createInternalSessionToken(user.id, user.name || "Usuário");
        
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

        return { success: true, user: db.sanitizeUser(user) };
      }),

    // Register new user
    register: publicProcedure
      .input(z.object({
        name: z.string().min(2),
        email: z.string().email(),
        password: z.string().min(6),
        departmentId: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        // Auto-cadastro INTERNO restrito ao domínio corporativo. O portal EXTERNO de
        // clientes/fornecedores terá fluxo próprio (validação por CNPJ na base) — não passa por aqui.
        const DOMINIO_CORPORATIVO = "opendeskdistribuidora.com.br";
        const dominio = input.email.split("@").pop()?.toLowerCase() ?? "";
        if (dominio !== DOMINIO_CORPORATIVO) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Cadastro permitido apenas para e-mails @${DOMINIO_CORPORATIVO}.`,
          });
        }

        // Check if email already exists
        const existingUser = await db.getUserByEmail(input.email);
        if (existingUser) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Este email já está cadastrado",
          });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(input.password, 10);

        // Create user with pending status
        const user = await db.createUser({
          name: input.name,
          email: input.email,
          passwordHash,
          departmentId: input.departmentId,
          approvalStatus: "pending",
        });

        return { 
          success: true, 
          message: "Cadastro realizado com sucesso! Aguarde a aprovação do administrador." 
        };
      }),
  }),

  // ============ USER MANAGEMENT (Admin) ============
  userManagement: router({
    listPending: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
      }
      return (await db.getPendingUsers()).map(db.sanitizeUser);
    }),

    listAll: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
      }
      return (await db.getAllUsers()).map(db.sanitizeUser);
    }),

    createUser: protectedProcedure
      .input(z.object({
        name: z.string().min(2),
        email: z.string().email(),
        password: z.string().min(6),
        departmentId: z.number().optional(),
        groupId: z.number().optional(),
        role: z.enum(["user", "admin"]).default("user"),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
        }

        // Check if email already exists
        const existingUser = await db.getUserByEmail(input.email);
        if (existingUser) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Este email já está cadastrado",
          });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(input.password, 10);

        // Create user with approved status (admin-created users are auto-approved)
        const user = await db.createUser({
          name: input.name,
          email: input.email,
          passwordHash,
          departmentId: input.departmentId,
          groupId: input.groupId,
          role: input.role,
          approvalStatus: "approved",
        });

        return user;
      }),

    approve: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
        }
        return db.sanitizeUser(await db.updateUserApprovalStatus(input.userId, "approved"));
      }),

    reject: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
        }
        return db.sanitizeUser(await db.updateUserApprovalStatus(input.userId, "rejected"));
      }),

    updateRole: protectedProcedure
      .input(z.object({ 
        userId: z.number(),
        role: z.enum(["user", "admin"]),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
        }
        return db.sanitizeUser(await db.updateUserRole(input.userId, input.role));
      }),

    delete: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
        }
        // Prevent self-deletion
        if (input.userId === ctx.user.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode excluir sua própria conta" });
        }
        return await db.deleteUser(input.userId);
      }),

    updateUser: protectedProcedure
      .input(z.object({
        userId: z.number(),
        name: z.string().min(2).optional(),
        email: z.string().email().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
        }

        // Check if email already exists (if changing email)
        if (input.email) {
          const existingUser = await db.getUserByEmail(input.email);
          if (existingUser && existingUser.id !== input.userId) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Este email já está cadastrado",
            });
          }
        }

        return db.sanitizeUser(await db.updateUserData(input.userId, {
          name: input.name,
          email: input.email,
        }));
      }),

    resetPassword: protectedProcedure
      .input(z.object({
        userId: z.number(),
        newPassword: z.string().min(6),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
        }

        const passwordHash = await bcrypt.hash(input.newPassword, 10);
        return db.sanitizeUser(await db.updateUserPassword(input.userId, passwordHash));
      }),

    toggleEnabled: protectedProcedure
      .input(z.object({
        userId: z.number(),
        enabled: z.boolean(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
        }
        // Prevent self-disable
        if (input.userId === ctx.user.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Voc\u00ea n\u00e3o pode desabilitar sua pr\u00f3pria conta" });
        }
        return db.sanitizeUser(await db.toggleUserEnabled(input.userId, input.enabled));
      }),
  }),

  // ============ TICKETS ============
  tickets: router({
    // Dashboard metrics for ticket overview
    dashboardMetrics: protectedProcedure
      .use(requirePermission(MODULES.SUPORTE, ACTIONS.READ))
      .query(async ({ ctx }) => {
        const isAdmin = ctx.user?.role === 'admin';
        
        if (isAdmin) {
          // Admins see all tickets
          return await db.getTicketDashboardMetrics();
        }
        
        // Regular users see tickets from their group or their own
        return await db.getTicketDashboardMetricsByGroup(
          ctx.user?.groupId ?? undefined,
          ctx.user?.id
        );
      }),

    list: protectedProcedure
      .use(requirePermission(MODULES.SUPORTE, ACTIONS.READ))
      .input(z.object({
        status: z.string().optional(),
        priority: z.string().optional(),
        departmentId: z.number().optional(),
        search: z.string().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        // Admins see all tickets
        // Regular users see tickets from all members of their permission group
        // Users without a group see only their own tickets
        const isAdmin = ctx.user?.role === 'admin';
        
        if (isAdmin) {
          return await db.getAllTickets({ ...input });
        }
        
        // Non-admin: filter by group if user has a groupId, otherwise by creatorId
        return await db.getAllTickets({
          ...input,
          groupId: ctx.user?.groupId ?? undefined,
          creatorId: ctx.user?.id,
        });
      }),

    getById: protectedProcedure
      .use(requirePermission(MODULES.SUPORTE, ACTIONS.READ))
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getTicketById(input.id);
      }),

    getByTicketId: protectedProcedure
      .use(requirePermission(MODULES.SUPORTE, ACTIONS.READ))
      .input(z.object({ ticketId: z.string() }))
      .query(async ({ input }) => {
        return await db.getTicketByTicketId(input.ticketId);
      }),

    create: protectedProcedure
      .use(requirePermission(MODULES.SUPORTE, ACTIONS.CREATE))
      .input(z.object({
        title: z.string().min(1),
        description: z.string().min(1),
        category: z.enum(["Técnico", "Acesso", "Funcionalidade", "Dúvida", "Outro"]),
        priority: z.enum(["Baixa", "Média", "Alta", "Crítica"]),
        departmentId: z.number().optional(),
        assignedToId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Bloqueio: usuarios com chamados pendentes de validacao nao podem criar novos
        // Excecao: admins e prioridade Critica
        if (ctx.user.role !== 'admin' && input.priority !== 'Crítica') {
          const pendingTickets = await db.getTicketsPendingEvaluationForUser(ctx.user.id);
          if (pendingTickets.length > 0) {
            throw new TRPCError({
              code: 'PRECONDITION_FAILED',
              message: `Você possui ${pendingTickets.length} chamado(s) aguardando sua validação para encerramento. Finalize-os antes de abrir um novo chamado.`,
            });
          }
        }

        const nextNumber = await db.getNextTicketNumber();
        const ticketId = `bilhete_${nextNumber}`;
        const now = Date.now();
        
        // Sanitize inputs
        const sanitizedTitle = input.title.trim();
        const sanitizedDescription = input.description.trim();

        // Get assigned user name if assignedToId is provided
        let assignedToName = null;
        if (input.assignedToId) {
          const assignedUser = await db.getUserById(input.assignedToId);
          assignedToName = assignedUser?.name || null;
        }

        const ticket = await db.createTicket({
          ticketId,
          title: sanitizedTitle,
          description: sanitizedDescription,
          category: input.category,
          priority: input.priority,
          departmentId: input.departmentId,
          status: "Novos",
          createdById: ctx.user.id,
          createdByName: ctx.user.name || "Usuário",
          assignedToId: input.assignedToId || null,
          assignedToName,
          createdAt: now,
          updatedAt: now,
        });

        if (ticket) {
          // Create initial activity
          await db.createActivity({
            ticketId: ticket.id,
            type: "created",
            authorId: ctx.user.id,
            authorName: ctx.user.name || "Usuário",
            description: `Chamado criado por ${ctx.user.name || "Usuário"}`,
            createdAt: now,
          });

          // Notify all admins about the new ticket (non-blocking)
          try {
            const admins = await db.getUsersByRole('admin');
            for (const admin of admins) {
              await db.createNotification({
                userId: admin.id,
                type: 'ticket_created',
                title: 'Novo Chamado Aberto',
                message: `${ctx.user.name || 'Usuário'} abriu um novo chamado: "${input.title}"`,
                referenceId: ticket.id,
                referenceType: 'ticket',
                actionUrl: `/suporte/${ticket.id}`,
              });
            }
          } catch (notifError) {
            console.error('[Notification] Erro ao notificar admins sobre novo chamado:', notifError);
          }
        }

        return ticket;
      }),

    update: protectedProcedure
      .use(requirePermission(MODULES.SUPORTE, ACTIONS.UPDATE))
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        description: z.string().optional(),
        category: z.enum(["Técnico", "Acesso", "Funcionalidade", "Dúvida", "Outro"]).optional(),
        priority: z.enum(["Baixa", "Média", "Alta", "Crítica"]).optional(),
        status: z.enum(["Novos", "Em Andamento", "Pendente Cliente", "Em Análise", "Pendente ERP", "Resolvido / Aguardando Validação", "Concluído"]).optional(),
        departmentId: z.number().nullable().optional(),
        assignedToId: z.number().nullable().optional(),
        assignedToName: z.string().nullable().optional(),
        order: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...updateData } = input;
        const oldTicket = await db.getTicketById(id);
        
        if (!oldTicket) {
          throw new Error("Ticket not found");
        }

        const now = Date.now();
        const isAdmin = ctx.user.role === 'admin';
        const isTicketCreator = oldTicket.createdById === ctx.user.id;

        // Regra de permissão: Admin não pode concluir chamados
        if (isAdmin && input.status === 'Concluído') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Administradores não podem concluir chamados. Altere o status para "Resolvido / Aguardando Validação" e aguarde a validação do solicitante.',
          });
        }

        // Regra de permissão: Usuário comum não pode alterar para 'Resolvido / Aguardando Validação'
        if (!isAdmin && input.status === 'Resolvido / Aguardando Validação') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Somente administradores podem alterar o status para "Resolvido / Aguardando Validação".',
          });
        }

        // Regra de permissão: Somente o solicitante pode concluir o chamado
        if (!isAdmin && input.status === 'Concluído' && !isTicketCreator) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Somente o solicitante do chamado pode concluí-lo.',
          });
        }

        // Regra: Usuário só pode concluir quando status for 'Resolvido / Aguardando Validação'
        if (!isAdmin && input.status === 'Concluído' && oldTicket.status !== 'Resolvido / Aguardando Validação') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'O chamado precisa estar com status "Resolvido / Aguardando Validação" para ser concluído.',
          });
        }

        // Track changes for activity feed
        if (input.status && input.status !== oldTicket.status) {
          // Clear waitingForDepartment when ticket is resolved or closed
          if (input.status === 'Em Análise' || input.status === 'Pendente ERP') {
            (updateData as any).waitingForDepartment = null;
            (updateData as any).lastRespondentRole = null;
            (updateData as any).lastRespondentId = null;
            (updateData as any).lastRespondentName = null;
          }

          await db.createActivity({
            ticketId: id,
            type: "status_change",
            authorId: ctx.user.id,
            authorName: ctx.user.name || "Usuario",
            oldValue: oldTicket.status,
            newValue: input.status,
            description: `Status alterado de "${oldTicket.status}" para "${input.status}"`,
            createdAt: now,
          });
          
          // Notify the ticket creator about status change (non-blocking)
          try {
            if (oldTicket.createdById) {
              await db.createNotification({
                userId: oldTicket.createdById,
                type: 'ticket_status_changed',
                title: 'Status do Chamado Alterado',
                message: `O status do seu chamado foi alterado para ${input.status}`,
                referenceId: id,
                referenceType: 'ticket',
                actionUrl: `/suporte/${id}`,
              });
            }
          } catch (notifError) {
            console.error('[Notification] Erro ao notificar sobre mudanca de status:', notifError);
          }
        }

        if (input.priority && input.priority !== oldTicket.priority) {
          await db.createActivity({
            ticketId: id,
            type: "priority_change",
            authorId: ctx.user.id,
            authorName: ctx.user.name || "Usuário",
            oldValue: oldTicket.priority,
            newValue: input.priority,
            description: `Prioridade alterada de "${oldTicket.priority}" para "${input.priority}"`,
            createdAt: now,
          });
        }

        if (input.departmentId !== undefined && input.departmentId !== oldTicket.departmentId) {
          const oldDept = oldTicket.departmentId ? await db.getDepartmentById(oldTicket.departmentId) : null;
          const newDept = input.departmentId ? await db.getDepartmentById(input.departmentId) : null;
          await db.createActivity({
            ticketId: id,
            type: "sector_change",
            authorId: ctx.user.id,
            authorName: ctx.user.name || "Usuário",
            oldValue: oldDept?.name || "Sem setor",
            newValue: newDept?.name || "Sem setor",
            description: `Setor alterado de "${oldDept?.name || "Sem setor"}" para "${newDept?.name || "Sem setor"}"`,
            createdAt: now,
          });
        }

        if (input.assignedToName !== undefined && input.assignedToName !== oldTicket.assignedToName) {
          await db.createActivity({
            ticketId: id,
            type: "assignment",
            authorId: ctx.user.id,
            authorName: ctx.user.name || "Usuário",
            oldValue: oldTicket.assignedToName || "Não atribuído",
            newValue: input.assignedToName || "Não atribuído",
            description: `Responsável alterado para "${input.assignedToName || "Não atribuído"}"`,
            createdAt: now,
          });
          
          // Notify the assigned user (non-blocking)
          try {
            if (input.assignedToId) {
              await db.createNotification({
                userId: input.assignedToId,
                type: 'ticket_assigned',
                title: 'Novo Chamado Atribuído',
                message: `Você foi atribuído ao chamado: "${oldTicket.title}"`,
                referenceId: id,
                referenceType: 'ticket',
                actionUrl: `/suporte/${id}`,
              });
            }
          } catch (notifError) {
            console.error('[Notification] Erro ao notificar sobre atribuicao:', notifError);
          }
        }

        return await db.updateTicket(id, updateData);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // Only admins can delete tickets
        if (ctx.user?.role !== 'admin') {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Apenas administradores podem excluir chamados",
          });
        }
        
        return await db.deleteTicket(input.id);
      }),

    stats: protectedProcedure.query(async () => {
      return await db.getTicketStats();
    }),
  }),

  // ============ TICKET EVALUATIONS ============
  ticketEvaluations: router({
    // Criar avaliação ao concluir chamado (somente solicitante)
    create: protectedProcedure
      .input(z.object({
        ticketId: z.number(),
        rating: z.number().min(1).max(5),
        observation: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const ticket = await db.getTicketById(input.ticketId);
        if (!ticket) throw new TRPCError({ code: 'NOT_FOUND', message: 'Chamado não encontrado.' });

        // Somente o solicitante pode avaliar
        if (ticket.createdById !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Somente o solicitante pode avaliar o chamado.' });
        }

        // Só pode avaliar se status for 'Resolvido / Aguardando Validação'
        if (ticket.status !== 'Resolvido / Aguardando Validação') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'O chamado precisa estar com status "Resolvido / Aguardando Validação" para ser avaliado.' });
        }

        // Verificar se já existe avaliação
        const existing = await db.getTicketEvaluationByTicketId(input.ticketId);
        if (existing) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Este chamado já foi avaliado.' });
        }

        const now = Date.now();

        // Calcular tempo de atendimento (desde criação até agora)
        const resolutionTimeMinutes = Math.round((now - ticket.createdAt) / 60000);

        // Buscar setor do avaliador
        let evaluatorSectorId: number | undefined;
        let evaluatorSectorName: string | undefined;
        if (ctx.user.departmentId) {
          const dept = await db.getDepartmentById(ctx.user.departmentId);
          evaluatorSectorId = dept?.id;
          evaluatorSectorName = dept?.name;
        }

        // Criar avaliação
        await db.createTicketEvaluation({
          ticketId: input.ticketId,
          ticketDisplayId: ticket.ticketId,
          ticketTitle: ticket.title,
          ticketCategory: ticket.category,
          assignedToId: ticket.assignedToId ?? undefined,
          assignedToName: ticket.assignedToName ?? undefined,
          rating: input.rating,
          observation: input.observation,
          evaluatorSectorId,
          evaluatorSectorName,
          evaluatorUserId: ctx.user.id,
          evaluatedAt: now,
          resolutionTimeMinutes,
          createdAt: now,
        });

        // Concluir o chamado
        await db.updateTicket(input.ticketId, { status: 'Concluído' });

        // Registrar atividade
        await db.createActivity({
          ticketId: input.ticketId,
          type: 'status_change',
          authorId: ctx.user.id,
          authorName: ctx.user.name || 'Usuário',
          oldValue: 'Resolvido / Aguardando Validação',
          newValue: 'Concluído',
          description: 'Chamado concluído e avaliado pelo solicitante',
          createdAt: now,
        });

        return { success: true };
      }),

    // Listar avaliações (somente admin) - sem dados pessoais do avaliador
    list: protectedProcedure
      .input(z.object({
        period: z.enum(['7d', '30d', '90d', 'all']).optional().default('30d'),
        sectorId: z.number().optional(),
        rating: z.number().min(1).max(5).optional(),
        category: z.string().optional(),
        assignedToId: z.number().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso restrito a administradores.' });
        }
        return await db.listTicketEvaluations(input ?? {});
      }),

    // Indicadores gerenciais (somente admin)
    stats: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso restrito a administradores.' });
      }
      return await db.getTicketEvaluationStats();
    }),

    // Buscar chamados pendentes de avaliacao do usuario
    getPendingForUser: protectedProcedure.query(async ({ ctx }) => {
      return await db.getTicketsPendingEvaluationForUser(ctx.user.id);
    }),

    byWeekAndSector: protectedProcedure
      .input(z.object({
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso restrito a administradores.' });
        }
        return await db.getEvaluationsByWeekAndSector(input?.startDate, input?.endDate);
      }),
  }),

  // ============ COMMENTS ============
  comments: router({
    list: protectedProcedure
      .input(z.object({ ticketId: z.number() }))
      .query(async ({ input }) => {
        return await db.getCommentsByTicketId(input.ticketId);
      }),

    create: protectedProcedure
      .input(z.object({
        ticketId: z.number(),
        content: z.string().min(1),
        mentions: z.array(z.number()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const now = Date.now();

        const comment = await db.createComment({
          ticketId: input.ticketId,
          authorId: ctx.user.id,
          authorName: ctx.user.name || "Usuário",
          content: input.content,
          createdAt: now,
        });

        // Create activity for comment
        await db.createActivity({
          ticketId: input.ticketId,
          type: "comment",
          authorId: ctx.user.id,
          authorName: ctx.user.name || "Usuário",
          description: `Comentário adicionado por ${ctx.user.name || "Usuário"}`,
          createdAt: now,
        });

        // Get ticket details to update waiting status and notify
        try {
          const ticket = await db.getTicketById(input.ticketId);
          if (ticket) {
            // === AGUARDANDO RETORNO LOGIC ===
            // When admin responds → waiting for the creator's department
            // When user responds → waiting for the admin/support department
            let waitingForDepartment: string | null = null;

            if (ctx.user.role === 'admin') {
              // Admin responded - waiting for the creator's department
              if (ticket.departmentId) {
                const dept = await db.getDepartmentById(ticket.departmentId);
                waitingForDepartment = dept?.name || 'Setor do Solicitante';
              } else {
                // Try to get the creator's department
                const creator = await db.getUserById(ticket.createdById);
                if (creator?.departmentId) {
                  const dept = await db.getDepartmentById(creator.departmentId);
                  waitingForDepartment = dept?.name || 'Setor do Solicitante';
                } else {
                  waitingForDepartment = 'Solicitante';
                }
              }
            } else {
              // User responded - waiting for admin/support
              waitingForDepartment = 'Suporte/TI';
            }

            await db.updateTicket(ticket.id, {
              waitingForDepartment,
              lastRespondentRole: ctx.user.role as 'admin' | 'user',
              lastRespondentId: ctx.user.id,
              lastRespondentName: ctx.user.name || 'Usuário',
            } as any);
            // If comment is from admin and ticket was created by user, notify the user
            if (ctx.user.role === 'admin' && ticket.createdById !== ctx.user.id) {
              await db.createNotification({
                userId: ticket.createdById,
                type: 'ticket_comment',
                title: 'Resposta no Chamado',
                message: `${ctx.user.name || 'Admin'} respondeu seu chamado: "${ticket.title}"`,
                referenceId: ticket.id,
                referenceType: 'ticket',
                actionUrl: `/suporte/${ticket.id}`,
              });
            }
            // If comment is from user and ticket is assigned to admin, notify the admin
            else if (ctx.user.role === 'user' && ticket.assignedToId) {
              await db.createNotification({
                userId: ticket.assignedToId,
                type: 'ticket_comment',
                title: 'Novo Comentario no Chamado',
                message: `${ctx.user.name || 'Usuario'} comentou no chamado: "${ticket.title}"`,
                referenceId: ticket.id,
                referenceType: 'ticket',
                actionUrl: `/suporte/${ticket.id}`,
              });
            }

            // Process @mentions - notify mentioned users
            if (input.mentions && input.mentions.length > 0) {
              for (const mentionedUserId of input.mentions) {
                // Don't notify yourself
                if (mentionedUserId === ctx.user.id) continue;
                // Don't duplicate notification if already notified above
                if (mentionedUserId === ticket.createdById && ctx.user.role === 'admin') continue;
                if (mentionedUserId === ticket.assignedToId && ctx.user.role === 'user') continue;

                await db.createNotification({
                  userId: mentionedUserId,
                  type: 'mention',
                  title: 'Voce foi mencionado',
                  message: `${ctx.user.name || 'Usuario'} mencionou voce em um comentario no chamado: "${ticket.title}"`,
                  referenceId: ticket.id,
                  referenceType: 'ticket',
                  actionUrl: `/suporte/${ticket.id}`,
                });
              }
            }
          }
        } catch (notifError) {
          console.error('[Notification] Erro ao notificar sobre comentario:', notifError);
        }

        return comment;
      }),

    delete: protectedProcedure
      .input(z.object({ commentId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // Only admins can delete comments
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas administradores podem deletar comentarios' });
        }

        const success = await db.deleteComment(input.commentId);
        if (!success) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Comentario nao encontrado' });
        }

        return { success: true };
      }),
  }),

  // ============ ACTIVITIES ============
  activities: router({
    list: protectedProcedure
      .input(z.object({ ticketId: z.number() }))
      .query(async ({ input }) => {
        return await db.getActivitiesByTicketId(input.ticketId);
      }),
  }),

  // ============ ATTACHMENTS ============
  attachments: router({
    list: protectedProcedure
      .input(z.object({ ticketId: z.number() }))
      .query(async ({ input }) => {
        return await db.getAttachmentsByTicketId(input.ticketId);
      }),

    create: protectedProcedure
      .input(z.object({
        ticketId: z.number(),
        fileName: z.string(),
        fileUrl: z.string(),
        fileKey: z.string(),
        mimeType: z.string().optional(),
        fileSize: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await db.createAttachment({
          ticketId: input.ticketId,
          fileName: input.fileName,
          fileUrl: input.fileUrl,
          fileKey: input.fileKey,
          mimeType: input.mimeType || null,
          fileSize: input.fileSize || null,
          uploadedById: ctx.user.id,
          uploadedByName: ctx.user.name || "Usuário",
          createdAt: Date.now(),
        });
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return await db.deleteAttachment(input.id);
      }),
  }),

  // ============ ANNOUNCEMENTS ============
  announcements: router({
    list: protectedProcedure.query(async () => {
      return await db.getActiveAnnouncements();
    }),

    create: protectedProcedure
      .input(z.object({
        title: z.string().min(1),
        content: z.string().optional(),
        type: z.enum(["info", "warning", "success", "error"]),
        expiresAt: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await db.createAnnouncement({
          title: input.title,
          content: input.content || null,
          type: input.type,
          isActive: 1,
          createdById: ctx.user.id,
          createdAt: Date.now(),
          expiresAt: input.expiresAt || null,
        });
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        content: z.string().optional(),
        type: z.enum(["info", "warning", "success", "error"]).optional(),
        isActive: z.number().optional(),
        expiresAt: z.number().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return await db.updateAnnouncement(id, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return await db.deleteAnnouncement(input.id);
      }),
  }),

  // ============ PROJECTS ============
  projects: router({
    list: protectedProcedure
      .use(requirePermission(MODULES.DESENVOLVIMENTO, ACTIONS.READ))
      .input(z.object({
        status: z.string().optional(),
        priority: z.string().optional(),
        sector: z.string().optional(),
        projectType: z.string().optional(),
        search: z.string().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        return await db.getAllProjects(input || {});
      }),

    getById: protectedProcedure
      .use(requirePermission(MODULES.DESENVOLVIMENTO, ACTIONS.READ))
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getProjectById(input.id);
      }),

    create: protectedProcedure
      .use(requirePermission(MODULES.DESENVOLVIMENTO, ACTIONS.CREATE))
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        priority: z.enum(["Baixa", "Média", "Alta", "Crítica"]),
        sector: z.enum(["TI", "RH", "Financeiro", "Comercial", "Suporte", "Operações"]),
        projectType: z.enum(["Integração Interna", "Integração Externa"]).optional(),
        ownerId: z.number(),
        ownerName: z.string(),
        startDate: z.number().optional(),
        endDate: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const projectNumber = await db.getNextProjectNumber();
        const projectId = `proj_${projectNumber}`;

        const project = await db.createProject({
          projectId,
          name: input.name,
          description: input.description || null,
          status: "Planejamento",
          priority: input.priority,
          projectType: (input.projectType || "Integração Interna") as any,
          ownerId: input.ownerId,
          ownerName: input.ownerName,
          sector: input.sector,
          startDate: input.startDate ?? null,
          endDate: input.endDate ?? null,
          progress: 0,
          createdById: ctx.user.id,
          createdByName: ctx.user.name || "Usuário",
          updatedById: ctx.user.id,
          updatedByName: ctx.user.name || "Usuário",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        if (project) {
          await db.logProjectActivity({
            projectId: project.id,
            entityType: "project",
            entityId: project.id,
            actionType: "created",
            description: `Projeto "${input.name}" criado por ${ctx.user.name || "Usuário"}`,
            newValues: { name: input.name, priority: input.priority, sector: input.sector },
            userId: ctx.user.id,
            userName: ctx.user.name || "Usuário",
          });
          // Log to dev activity feed
          await db.logDevActivity({
            action: "project_created",
            userId: ctx.user.id,
            userName: ctx.user.name || "Usuário",
            entityType: "project",
            entityId: project.id,
            entityName: input.name,
          });
        }

        return project;
      }),

    update: protectedProcedure
      .use(requirePermission(MODULES.DESENVOLVIMENTO, ACTIONS.UPDATE))
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        status: z.string().optional(),
        priority: z.string().optional(),
        projectType: z.string().optional(),
        ownerId: z.number().optional(),
        ownerName: z.string().optional(),
        departmentId: z.number().nullable().optional(),
        startDate: z.number().nullable().optional(),
        endDate: z.number().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Get current project for comparison
        const oldProject = await db.getProjectById(input.id);
        const { id, ...data } = input;
        const updated = await db.updateProject(id, {
          ...data,
          updatedById: ctx.user.id,
          updatedByName: ctx.user.name || "Usuu00e1rio",
        } as any);

        if (updated && oldProject) {
          // Log specific changes
          const changes: string[] = [];
          if (input.status && input.status !== oldProject.status) {
            changes.push(`status de "${oldProject.status}" para "${input.status}"`);
            await db.logProjectActivity({
              projectId: id,
              entityType: "project",
              entityId: id,
              actionType: "status_changed",
              description: `${ctx.user.name || "Usuário"} alterou o status de "${oldProject.status}" para "${input.status}"`,
              oldValues: { status: oldProject.status },
              newValues: { status: input.status },
              fieldChanged: "status",
              userId: ctx.user.id,
              userName: ctx.user.name || "Usuário",
            });
            await db.logDevActivity({
              action: "project_status_changed",
              userId: ctx.user.id,
              userName: ctx.user.name || "Usuário",
              entityType: "project",
              entityId: id,
              entityName: oldProject.name,
              oldValue: oldProject.status,
              newValue: input.status,
            });
          }
          if (input.priority && input.priority !== oldProject.priority) {
            await db.logProjectActivity({
              projectId: id,
              entityType: "project",
              entityId: id,
              actionType: "priority_changed",
              description: `${ctx.user.name || "Usuário"} alterou a prioridade de "${oldProject.priority}" para "${input.priority}"`,
              oldValues: { priority: oldProject.priority },
              newValues: { priority: input.priority },
              fieldChanged: "priority",
              userId: ctx.user.id,
              userName: ctx.user.name || "Usuário",
            });
          }
          if (input.name && input.name !== oldProject.name) {
            await db.logProjectActivity({
              projectId: id,
              entityType: "project",
              entityId: id,
              actionType: "updated",
              description: `${ctx.user.name || "Usuário"} alterou o nome de "${oldProject.name}" para "${input.name}"`,
              oldValues: { name: oldProject.name },
              newValues: { name: input.name },
              fieldChanged: "name",
              userId: ctx.user.id,
              userName: ctx.user.name || "Usuário",
            });
          }
          // Log generic project update to dev activity feed
          if (!input.status || input.status === oldProject.status) {
            await db.logDevActivity({
              action: "project_updated",
              userId: ctx.user.id,
              userName: ctx.user.name || "Usuário",
              entityType: "project",
              entityId: id,
              entityName: input.name || oldProject.name,
            });
          }
          // Generic update log if no specific changes detected
          if (changes.length === 0 && !input.status && !input.priority && !input.name) {
            await db.logProjectActivity({
              projectId: id,
              entityType: "project",
              entityId: id,
              actionType: "updated",
              description: `${ctx.user.name || "Usuário"} atualizou o projeto`,
              oldValues: oldProject,
              newValues: data,
              userId: ctx.user.id,
              userName: ctx.user.name || "Usuário",
            });
          }
        }

        return updated;
      }),

    delete: protectedProcedure
      .use(requirePermission(MODULES.DESENVOLVIMENTO, ACTIONS.DELETE))
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // Get project to check status
        const project = await db.getProjectById(input.id);
        
        if (!project) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Projeto não encontrado",
          });
        }

        // Only allow deletion of non-completed projects
        if (project.status === "Concluído") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Não é possível excluir projetos concluídos",
          });
        }

        await db.logProjectActivity({
          projectId: input.id,
          entityType: "project",
          entityId: input.id,
          actionType: "deleted",
          description: `${ctx.user.name || "Usuário"} excluiu o projeto "${project.name}"`,
          oldValues: { name: project.name, status: project.status },
          userId: ctx.user.id,
          userName: ctx.user.name || "Usuário",
        });
        await db.logDevActivity({
          action: "project_deleted",
          userId: ctx.user.id,
          userName: ctx.user.name || "Usuário",
          entityType: "project",
          entityId: input.id,
          entityName: project.name,
        });

        const success = await db.deleteProject(input.id);
        
        if (!success) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Erro ao excluir projeto",
          });
        }

        return { success: true };
      }),

    // Dashboard analytics
    getAnalytics: protectedProcedure
      .use(requirePermission(MODULES.DESENVOLVIMENTO, ACTIONS.READ))
      .query(async () => {
        return await db.getProjectAnalytics();
      }),

    getTodayTasks: protectedProcedure
      .use(requirePermission(MODULES.DESENVOLVIMENTO, ACTIONS.READ))
      .query(async () => {
        return await db.getTodayProjectTasks();
      }),

    // Activity history
    getActivityHistory: protectedProcedure
      .use(requirePermission(MODULES.DESENVOLVIMENTO, ACTIONS.READ))
      .input(z.object({
        projectId: z.number(),
        limit: z.number().optional(),
      }))
      .query(async ({ input }) => {
        return await db.getProjectActivityHistory(input.projectId, input.limit || 50);
      }),

    getRecentActivities: protectedProcedure
      .use(requirePermission(MODULES.DESENVOLVIMENTO, ACTIONS.READ))
      .input(z.object({
        limit: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        return await db.getRecentProjectActivities(input?.limit || 20);
      }),

    // Reorder projects within a column (persist kanbanOrder)
    reorder: protectedProcedure
      .use(requirePermission(MODULES.DESENVOLVIMENTO, ACTIONS.UPDATE))
      .input(z.array(z.object({
        id: z.number(),
        kanbanOrder: z.number(),
      })))
      .mutation(async ({ input }) => {
        for (const item of input) {
          await db.updateProject(item.id, { kanbanOrder: item.kanbanOrder } as any);
        }
        return { success: true };
      }),

    // Toggle "em tratamento agora" flag
    toggleTreatment: protectedProcedure
      .use(requirePermission(MODULES.DESENVOLVIMENTO, ACTIONS.UPDATE))
      .input(z.object({
        id: z.number(),
        isBeingTreated: z.boolean(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, isBeingTreated } = input;
        const treatedByName = isBeingTreated ? (ctx.user.name || 'Usuário') : null;
        const treatedAt = isBeingTreated ? Date.now() : null;
        await db.updateProject(id, {
          isBeingTreated: isBeingTreated as any,
          treatedByName: treatedByName as any,
          treatedAt: treatedAt as any,
          updatedById: ctx.user.id,
          updatedByName: ctx.user.name || 'Usuário',
        });
        return { success: true, isBeingTreated, treatedByName, treatedAt };
      }),
  }),

  // ============ PROJECT PHASES ============
  projectPhases: router({
    listByProject: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input }) => {
        return await db.getPhasesByProjectId(input.projectId);
      }),

    create: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        name: z.string().min(1),
        description: z.string().optional(),
        order: z.number(),
        startDate: z.number().optional(),
        endDate: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const phase = await db.createProjectPhase({
          projectId: input.projectId,
          name: input.name,
          description: input.description || null,
          status: "Pendente",
          order: input.order,
          startDate: input.startDate || null,
          endDate: input.endDate || null,
          completedAt: null,
          createdById: ctx.user.id,
          createdByName: ctx.user.name || "Usuário",
          updatedById: ctx.user.id,
          updatedByName: ctx.user.name || "Usuário",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        if (phase) {
          await db.logProjectActivity({
            projectId: input.projectId,
            entityType: "phase",
            entityId: phase.id,
            actionType: "created",
            description: `${ctx.user.name || "Usuário"} criou a etapa "${input.name}"`,
            newValues: { name: input.name, status: "Pendente" },
            userId: ctx.user.id,
            userName: ctx.user.name || "Usuário",
          });
          // Log to dev activity feed
          const parentProject = await db.getProjectById(input.projectId);
          await db.logDevActivity({
            action: "phase_created",
            userId: ctx.user.id,
            userName: ctx.user.name || "Usuário",
            entityType: "phase",
            entityId: phase.id,
            entityName: input.name,
            projectId: input.projectId,
            projectName: parentProject?.name || null,
          });
          // Update project updatedBy
          await db.updateProject(input.projectId, {
            updatedById: ctx.user.id,
            updatedByName: ctx.user.name || "Usuário",
          });
        }

        // Update project progress
        await db.updateProjectProgress(input.projectId);

        return phase;
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        projectId: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        status: z.enum(["Pendente", "Em Andamento", "Concluída", "Atrasada"]).optional(),
        order: z.number().optional(),
        startDate: z.number().nullable().optional(),
        endDate: z.number().nullable().optional(),
        completedAt: z.number().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, projectId, ...data } = input;
        const phase = await db.updateProjectPhase(id, {
          ...data,
          updatedById: ctx.user.id,
          updatedByName: ctx.user.name || "Usuário",
        });

        if (phase) {
          const parentProject = await db.getProjectById(projectId);
          if (input.status) {
            await db.logProjectActivity({
              projectId,
              entityType: "phase",
              entityId: id,
              actionType: "status_changed",
              description: `${ctx.user.name || "Usuário"} alterou o status da etapa "${phase.name}" para "${input.status}"`,
              newValues: { status: input.status },
              fieldChanged: "status",
              userId: ctx.user.id,
              userName: ctx.user.name || "Usuário",
            });
          } else {
            await db.logProjectActivity({
              projectId,
              entityType: "phase",
              entityId: id,
              actionType: "updated",
              description: `${ctx.user.name || "Usuário"} atualizou a etapa "${phase.name}"`,
              newValues: data,
              userId: ctx.user.id,
              userName: ctx.user.name || "Usuário",
            });
          }
          // Log to dev activity feed
          await db.logDevActivity({
            action: input.status ? "phase_updated" : "phase_updated",
            userId: ctx.user.id,
            userName: ctx.user.name || "Usuário",
            entityType: "phase",
            entityId: id,
            entityName: phase.name,
            projectId,
            projectName: parentProject?.name || null,
          });
          // Update project updatedBy
          await db.updateProject(projectId, {
            updatedById: ctx.user.id,
            updatedByName: ctx.user.name || "Usuário",
          });
        }

        // Update project progress
        await db.updateProjectProgress(projectId);

        return phase;
      }),

    delete: protectedProcedure
      .input(z.object({ 
        id: z.number(),
        projectId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.logProjectActivity({
          projectId: input.projectId,
          entityType: "phase",
          entityId: input.id,
          actionType: "deleted",
          description: `${ctx.user.name || "Usuário"} excluiu uma etapa do projeto`,
          userId: ctx.user.id,
          userName: ctx.user.name || "Usuário",
        });
        const parentProjectDel = await db.getProjectById(input.projectId);
        await db.logDevActivity({
          action: "phase_deleted",
          userId: ctx.user.id,
          userName: ctx.user.name || "Usuário",
          entityType: "phase",
          entityId: input.id,
          entityName: "Etapa",
          projectId: input.projectId,
          projectName: parentProjectDel?.name || null,
        });

        const result = await db.deleteProjectPhase(input.id);

        // Update project updatedBy
        await db.updateProject(input.projectId, {
          updatedById: ctx.user.id,
          updatedByName: ctx.user.name || "Usuário",
        });

        // Update project progress
        await db.updateProjectProgress(input.projectId);

        return result;
      }),
  }),

  // ============ PROJECT COMMENTS ============
  projectComments: router({
    listByProject: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input }) => {
        return await db.getProjectComments(input.projectId);
      }),

    create: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        content: z.string().min(1),
        mentions: z.array(z.number()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const comment = await db.createProjectComment({
          projectId: input.projectId,
          authorId: ctx.user.id,
          authorName: ctx.user.name || "Usuário",
          content: input.content,
          mentions: input.mentions ? JSON.stringify(input.mentions) : null,
          createdAt: Date.now(),
        });

        if (comment) {
          await db.logProjectActivity({
            projectId: input.projectId,
            entityType: "comment",
            entityId: comment.id,
            actionType: "comment_added",
            description: `${ctx.user.name || "Usuário"} adicionou um comentário`,
            newValues: { content: input.content.substring(0, 100) },
            userId: ctx.user.id,
            userName: ctx.user.name || "Usuário",
          });
          // Log to dev activity feed
          const commentProject = await db.getProjectById(input.projectId);
          await db.logDevActivity({
            action: "comment_added",
            userId: ctx.user.id,
            userName: ctx.user.name || "Usuário",
            entityType: "comment",
            entityId: comment.id,
            entityName: input.content.substring(0, 60),
            projectId: input.projectId,
            projectName: commentProject?.name || null,
          });
          // Update project updatedBy
          await db.updateProject(input.projectId, {
            updatedById: ctx.user.id,
            updatedByName: ctx.user.name || "Usuário",
          });
        }

        return comment;
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return await db.deleteProjectComment(input.id);
      }),
  }),

  // ============ PROJECT ATTACHMENTS ============
  projectAttachments: router({
    list: protectedProcedure
      .use(requirePermission(MODULES.DESENVOLVIMENTO, ACTIONS.READ))
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input }) => {
        return await db.getProjectAttachments(input.projectId);
      }),

    create: protectedProcedure
      .use(requirePermission(MODULES.DESENVOLVIMENTO, ACTIONS.CREATE))
      .input(z.object({
        projectId: z.number(),
        fileName: z.string().min(1),
        fileUrl: z.string().min(1),
        fileKey: z.string().min(1),
        mimeType: z.string().optional(),
        fileSize: z.number().optional(),
        category: z.enum(["imagem", "planilha", "documento", "outro"]).default("outro"),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const attachment = await db.createProjectAttachment({
          projectId: input.projectId,
          fileName: input.fileName,
          fileUrl: input.fileUrl,
          fileKey: input.fileKey,
          mimeType: input.mimeType || null,
          fileSize: input.fileSize || null,
          category: input.category,
          description: input.description || null,
          uploadedById: ctx.user.id,
          uploadedByName: ctx.user.name || "Usuário",
          createdAt: Date.now(),
        });

        // Log activity
        try {
          const project = await db.getProjectById(input.projectId);
          await db.logDevActivity({
            action: "create",
            userId: ctx.user.id,
            userName: ctx.user.name || "Usuário",
            entityType: "project",
            entityId: input.projectId,
            entityName: project?.name || `Projeto #${input.projectId}`,
            projectId: input.projectId,
            projectName: project?.name || undefined,
            details: `Anexou arquivo: ${input.fileName}`,
          });
        } catch (e) {
          console.error("Failed to log attachment activity:", e);
        }

        return attachment;
      }),

    delete: protectedProcedure
      .use(requirePermission(MODULES.DESENVOLVIMENTO, ACTIONS.DELETE))
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const attachment = await db.getProjectAttachmentById(input.id);
        if (!attachment) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Anexo não encontrado" });
        }

        const result = await db.deleteProjectAttachment(input.id);

        // Log activity
        try {
          const project = await db.getProjectById(attachment.projectId);
          await db.logDevActivity({
            action: "delete",
            userId: ctx.user.id,
            userName: ctx.user.name || "Usuário",
            entityType: "project",
            entityId: attachment.projectId,
            entityName: project?.name || `Projeto #${attachment.projectId}`,
            projectId: attachment.projectId,
            projectName: project?.name || undefined,
            details: `Removeu anexo: ${attachment.fileName}`,
          });
        } catch (e) {
          console.error("Failed to log attachment delete activity:", e);
        }

        return result;
      }),
  }),

  // ============ DAILY TASKS ============
  dailyTasks: router({
    listByProject: protectedProcedure
      .use(requirePermission(MODULES.DESENVOLVIMENTO, ACTIONS.READ))
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input }) => {
        return await db.getDailyTasksByProjectId(input.projectId);
      }),

    getToday: protectedProcedure
      .query(async () => {
        return await db.getTodayDailyTasks();
      }),

    create: protectedProcedure
      .use(requirePermission(MODULES.DESENVOLVIMENTO, ACTIONS.CREATE))
      .input(z.object({
        projectId: z.number(),
        title: z.string().min(1),
        description: z.string().optional(),
        priority: z.enum(["Baixa", "Média", "Alta", "Crítica"]).optional(),
        assignedToId: z.number().optional(),
        assignedToName: z.string().optional(),
        dueDate: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const task = await db.createDailyTask({
          projectId: input.projectId,
          title: input.title,
          description: input.description || null,
          status: "Pendente",
          priority: input.priority || "Média",
          assignedToId: input.assignedToId || null,
          assignedToName: input.assignedToName || null,
          dueDate: input.dueDate || null,
          completedAt: null,
          createdById: ctx.user.id,
          createdByName: ctx.user.name || "Usuário",
          updatedById: ctx.user.id,
          updatedByName: ctx.user.name || "Usuário",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        if (task) {
          await db.logProjectActivity({
            projectId: input.projectId,
            entityType: "daily_task",
            entityId: task.id,
            actionType: "created",
            description: `${ctx.user.name || "Usuário"} criou a tarefa "${input.title}"`,
            newValues: { title: input.title, priority: input.priority || "Média" },
            userId: ctx.user.id,
            userName: ctx.user.name || "Usuário",
          });
          // Log to dev activity feed
          const taskProject = await db.getProjectById(input.projectId);
          await db.logDevActivity({
            action: "task_created",
            userId: ctx.user.id,
            userName: ctx.user.name || "Usuário",
            entityType: "task",
            entityId: task.id,
            entityName: input.title,
            projectId: input.projectId,
            projectName: taskProject?.name || null,
          });
          // Update project updatedBy
          await db.updateProject(input.projectId, {
            updatedById: ctx.user.id,
            updatedByName: ctx.user.name || "Usuário",
          });
        }

        return task;
      }),

    update: protectedProcedure
      .use(requirePermission(MODULES.DESENVOLVIMENTO, ACTIONS.UPDATE))
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        description: z.string().optional(),
        status: z.enum(["Pendente", "Em Andamento", "Concluída"]).optional(),
        priority: z.enum(["Baixa", "Média", "Alta", "Crítica"]).optional(),
        assignedToId: z.number().nullable().optional(),
        assignedToName: z.string().nullable().optional(),
        dueDate: z.number().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const oldTask = await db.getDailyTaskById(input.id);
        const { id, ...data } = input;
        const updated = await db.updateDailyTask(id, {
          ...data,
          updatedById: ctx.user.id,
          updatedByName: ctx.user.name || "Usuário",
        });

        if (updated && oldTask) {
          const actionType = input.status ? "status_changed" as const : "updated" as const;
          const desc = input.status 
            ? `${ctx.user.name || "Usuário"} alterou o status da tarefa "${oldTask.title}" para "${input.status}"`
            : `${ctx.user.name || "Usuário"} atualizou a tarefa "${oldTask.title}"`;
          
          await db.logProjectActivity({
            projectId: oldTask.projectId,
            entityType: "daily_task",
            entityId: id,
            actionType,
            description: desc,
            oldValues: input.status ? { status: oldTask.status } : undefined,
            newValues: data,
            fieldChanged: input.status ? "status" : undefined,
            userId: ctx.user.id,
            userName: ctx.user.name || "Usuário",
          });
          // Log to dev activity feed
          const updTaskProject = await db.getProjectById(oldTask.projectId);
          await db.logDevActivity({
            action: input.status ? "task_status_changed" : "task_updated",
            userId: ctx.user.id,
            userName: ctx.user.name || "Usuário",
            entityType: "task",
            entityId: id,
            entityName: oldTask.title,
            projectId: oldTask.projectId,
            projectName: updTaskProject?.name || null,
            oldValue: input.status ? oldTask.status : null,
            newValue: input.status || null,
          });
          // Update project updatedBy
          await db.updateProject(oldTask.projectId, {
            updatedById: ctx.user.id,
            updatedByName: ctx.user.name || "Usuário",
          });
        }

        return updated;
      }),

    complete: protectedProcedure
      .use(requirePermission(MODULES.DESENVOLVIMENTO, ACTIONS.UPDATE))
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const oldTask = await db.getDailyTaskById(input.id);
        const result = await db.completeDailyTask(input.id);

        if (result && oldTask) {
          await db.logProjectActivity({
            projectId: oldTask.projectId,
            entityType: "daily_task",
            entityId: input.id,
            actionType: "completed",
            description: `${ctx.user.name || "Usuário"} concluiu a tarefa "${oldTask.title}"`,
            oldValues: { status: oldTask.status },
            newValues: { status: "Concluída" },
            fieldChanged: "status",
            userId: ctx.user.id,
            userName: ctx.user.name || "Usuário",
          });
          // Log to dev activity feed
          const complTaskProject = await db.getProjectById(oldTask.projectId);
          await db.logDevActivity({
            action: "task_status_changed",
            userId: ctx.user.id,
            userName: ctx.user.name || "Usuário",
            entityType: "task",
            entityId: input.id,
            entityName: oldTask.title,
            projectId: oldTask.projectId,
            projectName: complTaskProject?.name || null,
            oldValue: oldTask.status,
            newValue: "Concluída",
          });
          // Update project updatedBy
          await db.updateProject(oldTask.projectId, {
            updatedById: ctx.user.id,
            updatedByName: ctx.user.name || "Usuário",
          });
        }

        return result;
      }),

    delete: protectedProcedure
      .use(requirePermission(MODULES.DESENVOLVIMENTO, ACTIONS.DELETE))
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const oldTask = await db.getDailyTaskById(input.id);
        
        if (oldTask) {
          await db.logProjectActivity({
            projectId: oldTask.projectId,
            entityType: "daily_task",
            entityId: input.id,
            actionType: "deleted",
            description: `${ctx.user.name || "Usuário"} excluiu a tarefa "${oldTask.title}"`,
            oldValues: { title: oldTask.title, status: oldTask.status },
            userId: ctx.user.id,
            userName: ctx.user.name || "Usuário",
          });
          // Log to dev activity feed
          const delTaskProject = await db.getProjectById(oldTask.projectId);
          await db.logDevActivity({
            action: "task_deleted",
            userId: ctx.user.id,
            userName: ctx.user.name || "Usuário",
            entityType: "task",
            entityId: input.id,
            entityName: oldTask.title,
            projectId: oldTask.projectId,
            projectName: delTaskProject?.name || null,
          });
          // Update project updatedBy
          await db.updateProject(oldTask.projectId, {
            updatedById: ctx.user.id,
            updatedByName: ctx.user.name || "Usuário",
          });
        }

        return await db.deleteDailyTask(input.id);
      }),
  }),

  // ============ USERS (for assignment dropdown) ============
  permissionGroups: router({
    list: protectedProcedure.query(async () => {
      const groups = await db.getPermissionGroups();
      // Enriquecer cada grupo com a contagem de usuários
      const enriched = await Promise.all(
        groups.map(async (group) => {
          const users = await db.getUsersByGroup(group.id);
          return { ...group, userCount: users.length };
        })
      );
      return enriched;
    }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(100),
        description: z.string().optional(),
        permissions: z.record(z.string(), z.union([
          z.boolean(),
          z.object({
            create: z.boolean(),
            read: z.boolean(),
            update: z.boolean(),
            delete: z.boolean(),
          }),
        ])),
        isDefault: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Only admins can create groups
        if (ctx.user?.role !== 'admin') {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Apenas administradores podem criar grupos",
          });
        }
        
        return await db.createPermissionGroup(input);
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(100),
        description: z.string().optional(),
        permissions: z.record(z.string(), z.union([
          z.boolean(),
          z.object({
            create: z.boolean(),
            read: z.boolean(),
            update: z.boolean(),
            delete: z.boolean(),
          }),
        ])),
        isDefault: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Only admins can update groups
        if (ctx.user?.role !== 'admin') {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Apenas administradores podem editar grupos",
          });
        }
        
        const updatedGroup = await db.updatePermissionGroup(input.id, input);
        
        // Sincroniza todos os usuarios do grupo com as novas permissoes
        if (updatedGroup) {
          const syncedCount = await db.syncAllUsersInGroup(input.id);
          console.log(`[Sync] Atualizadas permissoes de ${syncedCount} usuarios do grupo ${input.id}`);
        }
        
        return updatedGroup;
      }),

    delete: protectedProcedure
      .input(z.object({
        id: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Only admins can delete groups
        if (ctx.user?.role !== 'admin') {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Apenas administradores podem excluir grupos",
          });
        }
        
        return await db.deletePermissionGroup(input.id);
      }),

    getUsersByGroup: protectedProcedure
      .input(z.object({
        groupId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        if (ctx.user?.role !== 'admin') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Apenas administradores podem visualizar usuarios',
          });
        }
        return await db.getUsersByGroup(input.groupId);
      }),

    countUsersByGroup: protectedProcedure
      .input(z.object({
        groupId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        if (ctx.user?.role !== 'admin') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Apenas administradores podem visualizar usuarios',
          });
        }
        const users = await db.getUsersByGroup(input.groupId);
        return users.length;
      }),

    syncGroupUsers: protectedProcedure
      .input(z.object({
        groupId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user?.role !== 'admin') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Apenas administradores podem sincronizar usuarios',
          });
        }
        
        const syncedCount = await db.syncAllUsersInGroup(input.groupId);
        return { syncedCount, message: `${syncedCount} usuarios sincronizados com sucesso` };
      }),
  }),

  users: router({
    list: protectedProcedure.query(async () => {
      return await db.getApprovedUsers();
    }),

    updatePermissions: protectedProcedure
      .input(z.object({
        userId: z.number(),
        permissions: z.record(z.string(), z.object({
          create: z.boolean(),
          read: z.boolean(),
          update: z.boolean(),
          delete: z.boolean(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        // Only admins can update permissions
        if (ctx.user?.role !== 'admin') {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Apenas administradores podem alterar permissões",
          });
        }
        
        return await db.updateUserPermissionsGranular(input.userId, input.permissions);
      }),

    assignGroup: protectedProcedure
      .input(z.object({
        userId: z.number(),
        groupId: z.number().nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Only admins can assign groups
        if (ctx.user?.role !== 'admin') {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Apenas administradores podem atribuir grupos",
          });
        }
        
        const updatedUser = await db.assignGroupToUser(input.userId, input.groupId);
        
        // Sincroniza permissoes do usuario com seu novo grupo
        if (updatedUser && input.groupId) {
          const syncedUser = await db.syncUserPermissionsFromGroup(input.userId);
          console.log(`[Sync] Sincronizadas permissoes do usuario ${input.userId} com grupo ${input.groupId}`);
          return syncedUser;
        }
        
        return updatedUser;
      }),

    // List admin users for ticket assignment
    listAdmins: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user?.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas administradores' });
      }
      const allUsers = await db.getApprovedUsers();
      return allUsers
        .filter((u: any) => u.role === 'admin')
        .map((u: any) => ({ id: u.id, name: u.name }));
    }),
  }),

  // ============ DEPARTMENT MANAGEMENT (Admin) ============
  departments: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      // All authenticated users can view departments
      return await db.getAllDepartments();
    }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(2),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Only admins can create departments
        if (ctx.user?.role !== 'admin') {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Apenas administradores podem criar setores",
          });
        }
        return await db.createDepartment(input);
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(2).optional(),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Only admins can update departments
        if (ctx.user?.role !== 'admin') {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Apenas administradores podem editar setores",
          });
        }
        const { id, ...data } = input;
        return await db.updateDepartment(id, data);
      }),

    delete: protectedProcedure
      .input(z.object({
        id: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Only admins can delete departments
        if (ctx.user?.role !== 'admin') {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Apenas administradores podem excluir setores",
          });
        }
        return await db.deleteDepartment(input.id);
      }),

    assignToUser: protectedProcedure
      .input(z.object({
        userId: z.number(),
        departmentId: z.number().nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Only admins can assign departments
        if (ctx.user?.role !== 'admin') {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Apenas administradores podem atribuir setores",
          });
        }
        return await db.assignDepartmentToUser(input.userId, input.departmentId);
      }),
  }),

  // ============ PURCHASING MODULE ============
  suppliers: router({
    list: protectedProcedure.query(async () => {
      return await db.getAllSuppliers();
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getSupplierById(input.id);
      }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        cnpj: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        zipCode: z.string().optional(),
        contactPerson: z.string().optional(),
        status: z.enum(["Ativo", "Inativo", "Bloqueado"]).default("Ativo"),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await db.createSupplier({
          ...input,
          createdById: ctx.user.id,
          createdByName: ctx.user.name || "Usuário",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        cnpj: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        zipCode: z.string().optional(),
        contactPerson: z.string().optional(),
        status: z.enum(["Ativo", "Inativo", "Bloqueado"]).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...updates } = input;
        return await db.updateSupplier(id, updates);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return await db.deleteSupplier(input.id);
      }),
  }),

  products: router({
    list: protectedProcedure.query(async () => {
      return await db.getAllProducts();
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getProductById(input.id);
      }),

    create: protectedProcedure
      .input(z.object({
        code: z.string().min(1),
        name: z.string().min(1),
        description: z.string().optional(),
        category: z.string().optional(),
        unit: z.string().default("UN"),
        minStock: z.number().default(0),
        currentStock: z.number().default(0),
        status: z.enum(["Ativo", "Inativo"]).default("Ativo"),
        requiresPrescription: z.boolean().default(false),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await db.createProduct({
          ...input,
          createdById: ctx.user.id,
          createdByName: ctx.user.name || "Usuário",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        code: z.string().min(1).optional(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        category: z.string().optional(),
        unit: z.string().optional(),
        minStock: z.number().optional(),
        currentStock: z.number().optional(),
        status: z.enum(["Ativo", "Inativo"]).optional(),
        requiresPrescription: z.boolean().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...updates } = input;
        return await db.updateProduct(id, updates);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return await db.deleteProduct(input.id);
      }),
  }),

  purchaseOrders: router({
    list: protectedProcedure.query(async () => {
      return await db.getAllPurchaseOrders();
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getPurchaseOrderById(input.id);
      }),

    getItems: protectedProcedure
      .input(z.object({ purchaseOrderId: z.number() }))
      .query(async ({ input }) => {
        return await db.getPurchaseOrderItems(input.purchaseOrderId);
      }),

    create: protectedProcedure
      .input(z.object({
        supplierId: z.number(),
        supplierName: z.string(),
        items: z.array(z.object({
          productId: z.number(),
          productCode: z.string(),
          productName: z.string(),
          quantity: z.number(),
          unitPrice: z.number(),
        })),
        expectedDelivery: z.number().optional(),
        paymentTerms: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { items, ...orderData } = input;
        
        // Calculate total
        const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
        
        // Generate order number
        const orderNumber = `PO-${Date.now()}`;
        
        // Create purchase order
        const order = await db.createPurchaseOrder({
          ...orderData,
          orderNumber,
          totalAmount,
          status: "Rascunho",
          createdById: ctx.user.id,
          createdByName: ctx.user.name || "Usuário",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        
        if (!order) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao criar pedido" });
        
        // Create order items
        for (const item of items) {
          await db.createPurchaseOrderItem({
            purchaseOrderId: order.id,
            ...item,
            totalPrice: item.quantity * item.unitPrice,
            receivedQuantity: 0,
            createdAt: Date.now(),
          });
        }
        
        return order;
      }),

    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["Rascunho", "Pendente", "Aprovado", "Enviado", "Recebido Parcial", "Recebido", "Cancelado"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const updates: any = { status: input.status };
        
        // If approving, set approval info
        if (input.status === "Aprovado") {
          updates.approvedById = ctx.user.id;
          updates.approvedByName = ctx.user.name || "Usuário";
          updates.approvedAt = Date.now();
        }
        
        return await db.updatePurchaseOrder(input.id, updates);
      }),
  }),

  backups: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      // Only admins can access backups
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
      }
      const { listBackups } = await import("./backupService");
      return await listBackups();
    }),

    create: protectedProcedure.mutation(async ({ ctx }) => {
      // Only admins can create backups
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
      }
      const { createBackup } = await import("./backupService");
      const result = await createBackup(ctx.user.name || "Admin");
      if (!result.success) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error || "Falha ao criar backup" });
      }
      return result;
    }),

    verify: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        // Only admins can verify backups
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
        }
        const { verifyBackup } = await import("./backupService");
        return await verifyBackup(input.id);
      }),

    restore: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // Only admins can restore backups
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
        }
        const { restoreBackup } = await import("./backupService");
        const result = await restoreBackup(input.id);
        if (!result.success) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error || "Falha ao restaurar backup" });
        }
        return result;
      }),

    pushToGitHub: protectedProcedure.mutation(async ({ ctx }) => {
      // Only admins can push to GitHub
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
      }
      const { runGitHubBackup } = await import("./githubBackup");
      const result = await runGitHubBackup();
      if (!result.success) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.message });
      }
      return result;
    }),

    listGitHubBackups: protectedProcedure.query(async ({ ctx }) => {
      // Only admins can list GitHub backups
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
      }
      const { listGitHubBackups } = await import("./githubRestore");
      return await listGitHubBackups();
    }),

    getGitHubBackupDetails: protectedProcedure
      .input(z.object({ sha: z.string() }))
      .query(async ({ ctx, input }) => {
        // Only admins can view GitHub backup details
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
        }
        const { getGitHubBackupMetadata } = await import("./githubRestore");
        return await getGitHubBackupMetadata(input.sha);
      }),

    restoreFromGitHub: protectedProcedure
      .input(z.object({ sha: z.string() }))
      .mutation(async ({ ctx, input }) => {
        // Only admins can restore from GitHub
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
        }
        const { restoreFromGitHub } = await import("./githubRestore");
        const result = await restoreFromGitHub(input.sha);
        if (!result.success) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.message });
        }
        return result;
      }),
  }),

  // Purchasing Tasks (Kanban)
  purchasingTasks: router({
    list: protectedProcedure.query(async () => {
      return await db.getAllPurchasingTasks();
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getPurchasingTaskById(input.id);
      }),

    create: protectedProcedure
      .input(z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        status: z.enum(["todo", "quoting", "awaiting_approval", "ordered", "received", "completed"]).default("todo"),
        priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
        assignedToId: z.number().optional(),
        tags: z.array(z.string()).default([]),
        dueDate: z.string().optional(),
        position: z.number().default(0),
      }))
      .mutation(async ({ input, ctx }) => {
        const taskId = await db.createPurchasingTask({
          ...input,
          tags: input.tags.length > 0 ? input.tags.join(", ") : null,
          dueDate: input.dueDate || null,
          createdById: ctx.user.id,
        });
        return { id: taskId };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        description: z.string().optional(),
        status: z.enum(["todo", "quoting", "awaiting_approval", "ordered", "received", "completed"]).optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
        assignedToId: z.number().optional(),
        tags: z.array(z.string()).optional(),
        dueDate: z.string().optional(),
        position: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        const updateData = {
          ...data,
          tags: data.tags ? (data.tags.length > 0 ? data.tags.join(", ") : null) : undefined,
        };
        await db.updatePurchasingTask(id, updateData);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deletePurchasingTask(input.id);
        return { success: true };
      }),

    getByStatus: protectedProcedure
      .input(z.object({ status: z.string() }))
      .query(async ({ input }) => {
        return await db.getPurchasingTasksByStatus(input.status);
      }),
  }),

  // Kanban Column Settings
  kanbanColumns: router({
    getAll: protectedProcedure
      .query(async ({ ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        return await db.getKanbanColumnSettings(ctx.user.id, "purchasing");
      }),
    save: protectedProcedure
      .input(z.object({
        columnId: z.string(),
        customName: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        await db.upsertKanbanColumnSetting({
          userId: ctx.user.id,
          module: "purchasing",
          columnKey: input.columnId,
          customName: input.customName,
        });
        return { success: true };
      }),
    getSettings: protectedProcedure
      .input(z.object({ module: z.string() }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        return await db.getKanbanColumnSettings(ctx.user.id, input.module);
      }),
    updateColumnName: protectedProcedure
      .input(z.object({
        module: z.string(),
        columnKey: z.string(),
        customName: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        await db.upsertKanbanColumnSetting({
          userId: ctx.user.id,
          module: input.module,
          columnKey: input.columnKey,
          customName: input.customName,
        });
        return { success: true };
      }),
  }),

  // Notifications
  notifications: router({
    list: protectedProcedure
      .input(z.object({
        unreadOnly: z.boolean().optional(),
        limit: z.number().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        return await db.getNotificationsByUserId(ctx.user.id, {
          unreadOnly: input?.unreadOnly,
          limit: input?.limit || 50,
        });
      }),

    unreadCount: protectedProcedure
      .query(async ({ ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        return await db.getUnreadNotificationCount(ctx.user.id);
      }),

    markAsRead: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const success = await db.markNotificationAsRead(input.id, ctx.user.id);
        return { success };
      }),

    markAllAsRead: protectedProcedure
      .mutation(async ({ ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const success = await db.markAllNotificationsAsRead(ctx.user.id);
        return { success };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const success = await db.deleteNotification(input.id, ctx.user.id);
        return { success };
      }),

    deleteAll: protectedProcedure
      .mutation(async ({ ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const success = await db.deleteAllNotifications(ctx.user.id);
        return { success };
      }),

    // Check for stock alerts (can be called periodically)
    checkStockAlerts: protectedProcedure
      .mutation(async ({ ctx }) => {
        if (!ctx.user || ctx.user.role !== 'admin') {
          throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem verificar alertas" });
        }
        await db.checkAndCreateStockAlerts();
        return { success: true };
      }),
  }),

  // ============ CHAT SYSTEM ============
  chat: router({
    // Create a new conversation
    createConversation: protectedProcedure
      .input(z.object({
        ticketId: z.number().optional(),
        title: z.string().optional(),
        type: z.enum(['ticket_chat', 'direct_message', 'support_request']),
        participantIds: z.array(z.object({
          id: z.number(),
          name: z.string(),
          role: z.enum(['user', 'operator', 'admin']),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        const conversation = await db.createConversation({
          ...input,
          createdById: ctx.user.id,
          createdByName: ctx.user.name,
        });
        if (!conversation) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Falha ao criar conversa' });
        }
        return conversation;
      }),

    // Get conversation by ID
    getConversation: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getConversationById(input.id);
      }),

    // Get conversation by ticket ID
    getConversationByTicket: protectedProcedure
      .input(z.object({ ticketId: z.number() }))
      .query(async ({ input }) => {
        return await db.getConversationByTicketId(input.ticketId);
      }),

    // Get user's conversations
    getMyConversations: protectedProcedure
      .query(async ({ ctx }) => {
        return await db.getUserConversations(ctx.user.id);
      }),

    // Update conversation status
    updateConversationStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(['active', 'waiting', 'resolved', 'closed']),
      }))
      .mutation(async ({ input }) => {
        const success = await db.updateConversationStatus(input.id, input.status);
        if (!success) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Falha ao atualizar status' });
        }
        return { success: true };
      }),

    // Send a message
    sendMessage: protectedProcedure
      .input(z.object({
        conversationId: z.number(),
        content: z.string().min(1),
        messageType: z.enum(['text', 'file', 'image']).optional(),
        attachmentUrl: z.string().optional(),
        attachmentName: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const message = await db.sendMessage({
          ...input,
          senderId: ctx.user.id,
          senderName: ctx.user.name,
          senderRole: ctx.user.role as 'user' | 'admin',
        });
        if (!message) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Falha ao enviar mensagem' });
        }
        return message;
      }),

    // Get messages from a conversation
    getMessages: protectedProcedure
      .input(z.object({
        conversationId: z.number(),
        limit: z.number().optional(),
        before: z.number().optional(),
      }))
      .query(async ({ input }) => {
        return await db.getConversationMessages(input.conversationId, {
          limit: input.limit,
          before: input.before,
        });
      }),

    // Get new messages (for polling)
    getNewMessages: protectedProcedure
      .input(z.object({
        conversationId: z.number(),
        afterTimestamp: z.number(),
      }))
      .query(async ({ input }) => {
        return await db.getNewMessages(input.conversationId, input.afterTimestamp);
      }),

    // Mark messages as read
    markAsRead: protectedProcedure
      .input(z.object({ conversationId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const success = await db.markMessagesAsRead(input.conversationId, ctx.user.id);
        return { success };
      }),

    // Delete a message
    deleteMessage: protectedProcedure
      .input(z.object({ messageId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const success = await db.deleteMessage(input.messageId, ctx.user.id);
        if (!success) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Falha ao deletar mensagem' });
        }
        return { success: true };
      }),

    // Update typing status
    updateTyping: protectedProcedure
      .input(z.object({
        conversationId: z.number(),
        isTyping: z.boolean(),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.updateTypingStatus(input.conversationId, ctx.user.id, input.isTyping);
        return { success: true };
      }),

    // Get typing users
    getTypingUsers: protectedProcedure
      .input(z.object({ conversationId: z.number() }))
      .query(async ({ input }) => {
        return await db.getTypingUsers(input.conversationId);
      }),

    // Get conversation participants
    getParticipants: protectedProcedure
      .input(z.object({ conversationId: z.number() }))
      .query(async ({ input }) => {
        return await db.getConversationParticipants(input.conversationId);
      }),

    // Add participant to conversation
    addParticipant: protectedProcedure
      .input(z.object({
        conversationId: z.number(),
        userId: z.number(),
        userName: z.string(),
        role: z.enum(['user', 'operator', 'admin']),
      }))
      .mutation(async ({ input }) => {
        const success = await db.addParticipantToConversation(input);
        if (!success) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Falha ao adicionar participante' });
        }
        return { success: true };
      }),

    // Remove participant from conversation
    removeParticipant: protectedProcedure
      .input(z.object({
        conversationId: z.number(),
        userId: z.number(),
      }))
      .mutation(async ({ input }) => {
        const success = await db.removeParticipantFromConversation(input.conversationId, input.userId);
        if (!success) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Falha ao remover participante' });
        }
        return { success: true };
      }),
  }),

  // ============ ONLINE STATUS ============
  onlineStatus: router({
    // Update current user's online status
    updateStatus: protectedProcedure
      .input(z.object({
        isOnline: z.boolean(),
        currentPage: z.string().optional(),
        statusMessage: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.updateUserOnlineStatus({
          userId: ctx.user.id,
          userName: ctx.user.name,
          userRole: ctx.user.role as 'user' | 'admin',
          ...input,
        });
        return { success: true };
      }),

    // Get online operators/admins
    getOnlineOperators: protectedProcedure
      .query(async () => {
        return await db.getOnlineOperators();
      }),

    // Get all online users
    getAllOnline: protectedProcedure
      .query(async () => {
        return await db.getAllOnlineUsers();
      }),
  }),

  // ============ CHAT QUEUE ============
  chatQueue: router({
    // User enters the queue
    enterQueue: protectedProcedure
      .input(z.object({
        ticketId: z.number().optional(),
        initialMessage: z.string().optional(),
        priority: z.enum(['normal', 'high', 'urgent']).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const queueEntry = await db.addToQueue({
          userId: ctx.user.id,
          userName: ctx.user.name,
          ...input,
        });
        if (!queueEntry) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Falha ao entrar na fila' });
        }
        return queueEntry;
      }),

    // Get user's current queue status
    getMyStatus: protectedProcedure
      .query(async ({ ctx }) => {
        return await db.getUserQueueStatus(ctx.user.id);
      }),

    // Get user's position in queue
    getMyPosition: protectedProcedure
      .query(async ({ ctx }) => {
        return await db.getQueuePosition(ctx.user.id);
      }),

    // User leaves the queue
    leaveQueue: protectedProcedure
      .mutation(async ({ ctx }) => {
        const success = await db.cancelQueueEntry(ctx.user.id);
        return { success };
      }),

    // Get waiting queue (admin only)
    getWaitingQueue: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas administradores podem ver a fila' });
        }
        return await db.getWaitingQueue();
      }),

    // Accept a chat from queue (admin only)
    acceptChat: protectedProcedure
      .input(z.object({ queueId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas administradores podem aceitar atendimentos' });
        }
        const result = await db.acceptChatFromQueue(input.queueId, ctx.user.id, ctx.user.name);
        if (!result) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Falha ao aceitar atendimento' });
        }
        return result;
      }),

    // Complete a chat (admin only)
    completeChat: protectedProcedure
      .input(z.object({ queueId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas administradores podem finalizar atendimentos' });
        }
        const success = await db.completeChatFromQueue(input.queueId);
        if (!success) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Falha ao finalizar atendimento' });
        }
        return { success: true };
      }),

    // Get operator's active chats
    getMyActiveChats: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'admin') {
          return [];
        }
        return await db.getOperatorActiveChats(ctx.user.id);
      }),
  }),

  // ============ OPERATOR AVAILABILITY ============
  operatorAvailability: router({
    // Update operator availability (admin only)
    updateAvailability: protectedProcedure
      .input(z.object({
        isAvailableForChat: z.boolean(),
        status: z.enum(['available', 'busy', 'away', 'offline']).optional(),
        maxConcurrentChats: z.number().optional(),
        statusMessage: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas administradores podem atualizar disponibilidade' });
        }
        const result = await db.updateOperatorAvailability({
          operatorId: ctx.user.id,
          operatorName: ctx.user.name,
          ...input,
        });
        if (!result) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Falha ao atualizar disponibilidade' });
        }
        return result;
      }),

    // Get my availability (admin only)
    getMyAvailability: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'admin') {
          return null;
        }
        const operators = await db.getAllOperatorsAvailability();
        return operators.find(op => op.operatorId === ctx.user.id) || null;
      }),

    // Get all operators availability (admin only)
    getAllOperators: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas administradores podem ver operadores' });
        }
        return await db.getAllOperatorsAvailability();
      }),

    // Get available operators (for users to see)
    getAvailable: protectedProcedure
      .query(async () => {
        return await db.getAvailableOperators();
      }),

     // Get operator stats summary
    getStats: protectedProcedure
      .query(async () => {
        return await db.getOperatorStats();
      }),
  }),

  // ============ CHAT RATINGS ============
  chatRatings: router({
    // Submit a rating for a chat session
    submit: protectedProcedure
      .input(z.object({
        conversationId: z.number(),
        operatorId: z.number(),
        operatorName: z.string(),
        rating: z.number().min(1).max(5),
        comment: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const result = await db.submitChatRating({
          conversationId: input.conversationId,
          userId: ctx.user.id,
          userName: ctx.user.name,
          operatorId: input.operatorId,
          operatorName: input.operatorName,
          rating: input.rating,
          comment: input.comment,
        });
        if (!result) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Falha ao enviar avaliação' });
        }
        return result;
      }),

    // Check if conversation already has a rating
    getByConversation: protectedProcedure
      .input(z.object({ conversationId: z.number() }))
      .query(async ({ input }) => {
        return await db.getChatRatingByConversation(input.conversationId);
      }),

    // Get ratings for an operator (admin only)
    getOperatorRatings: protectedProcedure
      .input(z.object({ operatorId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas administradores podem ver avaliações' });
        }
        return await db.getOperatorRatings(input.operatorId);
      }),

    // Get operator average rating
    getOperatorAverage: protectedProcedure
      .input(z.object({ operatorId: z.number() }))
      .query(async ({ input }) => {
        return await db.getOperatorAverageRating(input.operatorId);
      }),

    // Get all ratings (admin only)
    getAll: protectedProcedure
      .input(z.object({ limit: z.number().optional() }).optional())
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas administradores podem ver avaliações' });
        }
        return await db.getAllChatRatings(input?.limit);
      }),

    // Get ratings statistics (admin only)
    getStats: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas administradores podem ver estatísticas' });
        }
        return await db.getChatRatingsStats();
      }),
  }),

  // ============ DEV ACTIVITY & PRESENCE ============
  devActivity: router({
    // Get recent activities in the development module
    getRecent: protectedProcedure
      .input(z.object({ limit: z.number().optional() }).optional())
      .query(async ({ input }) => {
        return await db.getRecentDevActivities(input?.limit || 50);
      }),

    // Get activities for a specific project
    getByProject: protectedProcedure
      .input(z.object({ projectId: z.number(), limit: z.number().optional() }))
      .query(async ({ input }) => {
        return await db.getDevActivitiesByProject(input.projectId, input.limit || 30);
      }),

    // Get users currently active in the development module
    getPresence: protectedProcedure
      .query(async () => {
        return await db.getDevModulePresence();
      }),

    // Update heartbeat for dev module presence
    heartbeat: protectedProcedure
      .input(z.object({ currentPage: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await db.updateUserOnlineStatus({
          userId: ctx.user.id,
          userName: ctx.user.name,
          userRole: ctx.user.role as 'user' | 'admin',
          isOnline: true,
          currentPage: input.currentPage,
        });
        return { success: true };
      }),
  }),
});
export type AppRouter = typeof appRouter;
