import { describe, it, expect } from 'vitest';
import { appRouter } from './routers';
import type { Context } from './_core/context';
import { hasModulePermission, MODULES, type UserPermissions } from '../shared/permissions';
import * as db from './db';

describe('Module Permissions System', () => {
  describe('Permission Helper Functions', () => {
    it('should correctly identify users with module permissions', () => {
      // User has suporte:true, desenvolvimento:false
      const userWithTickets = {
        id: 1,
        role: 'user' as const,
        permissions: JSON.stringify({
          suporte: true,
          desenvolvimento: false,
        }),
      };

      expect(hasModulePermission(userWithTickets, MODULES.SUPORTE)).toBe(true);
      expect(hasModulePermission(userWithTickets, MODULES.DESENVOLVIMENTO)).toBe(false);
    });

    it('should grant admins access to all modules', () => {
      const adminUser = {
        id: 1,
        role: 'admin' as const,
        permissions: JSON.stringify({
          suporte: false,
          desenvolvimento: false,
        }),
      };

      // Admin should have access regardless of permissions field
      expect(hasModulePermission(adminUser, MODULES.SUPORTE)).toBe(true);
      expect(hasModulePermission(adminUser, MODULES.DESENVOLVIMENTO)).toBe(true);
      expect(hasModulePermission(adminUser, MODULES.ALMOXARIFADO)).toBe(true);
      expect(hasModulePermission(adminUser, MODULES.COMERCIAL)).toBe(true);
    });

    it('should handle users with multiple module permissions', () => {
      const multiAccessUser = {
        id: 1,
        role: 'user' as const,
        permissions: JSON.stringify({
          suporte: true,
          desenvolvimento: true,
          almoxarifado: false,
          comercial: false,
        }),
      };

      expect(hasModulePermission(multiAccessUser, MODULES.SUPORTE)).toBe(true);
      expect(hasModulePermission(multiAccessUser, MODULES.DESENVOLVIMENTO)).toBe(true);
      expect(hasModulePermission(multiAccessUser, MODULES.ALMOXARIFADO)).toBe(false);
      expect(hasModulePermission(multiAccessUser, MODULES.COMERCIAL)).toBe(false);
    });

    it('should handle users with no permissions', () => {
      const noAccessUser = {
        id: 1,
        role: 'user' as const,
        permissions: JSON.stringify({
          suporte: false,
          desenvolvimento: false,
          almoxarifado: false,
          comercial: false,
        }),
      };

      expect(hasModulePermission(noAccessUser, MODULES.SUPORTE)).toBe(false);
      expect(hasModulePermission(noAccessUser, MODULES.DESENVOLVIMENTO)).toBe(false);
      expect(hasModulePermission(noAccessUser, MODULES.ALMOXARIFADO)).toBe(false);
    });

    it('should handle null or undefined permissions gracefully', () => {
      const userWithoutPermissions = {
        id: 1,
        role: 'user' as const,
        permissions: null,
      };

      // Should default to false for regular users
      expect(hasModulePermission(userWithoutPermissions, MODULES.SUPORTE)).toBe(false);
    });

    it('should handle legacy module names mapping', () => {
      // 'chamados' maps to 'suporte', 'projetos' maps to 'desenvolvimento'
      const userWithLegacy = {
        id: 1,
        role: 'user' as const,
        permissions: JSON.stringify({
          chamados: true,
          projetos: true,
        }),
      };

      expect(hasModulePermission(userWithLegacy, MODULES.SUPORTE)).toBe(true);
      expect(hasModulePermission(userWithLegacy, MODULES.DESENVOLVIMENTO)).toBe(true);
    });
  });

  describe('Permission Middleware', () => {
    it('should allow access to tickets for users with suporte permission', async () => {
      const userWithTicketsAccess = {
        id: 1,
        role: 'user' as const,
        permissions: JSON.stringify({
          suporte: { create: true, read: true, update: true, delete: true },
          desenvolvimento: false,
        }),
      };

      const caller = appRouter.createCaller({
        user: userWithTicketsAccess,
      } as Context);

      // This should succeed because user has suporte permission with read access
      const tickets = await caller.tickets.list();
      expect(Array.isArray(tickets)).toBe(true);
    });

    it('should allow access to projects for users with desenvolvimento permission', async () => {
      const userWithProjectsAccess = {
        id: 1,
        role: 'user' as const,
        permissions: JSON.stringify({
          suporte: false,
          desenvolvimento: { create: true, read: true, update: true, delete: true },
        }),
      };

      const caller = appRouter.createCaller({
        user: userWithProjectsAccess,
      } as Context);

      // This should succeed because user has desenvolvimento permission with read access
      const projects = await caller.projects.list();
      expect(Array.isArray(projects)).toBe(true);
    });

    it('should deny access to tickets for users without suporte permission', async () => {
      const userWithoutTicketsAccess = {
        id: 1,
        role: 'user' as const,
        permissions: JSON.stringify({
          suporte: false,
          desenvolvimento: true,
        }),
      };

      const caller = appRouter.createCaller({
        user: userWithoutTicketsAccess,
      } as Context);

      // This should throw an error
      await expect(caller.tickets.list()).rejects.toThrow();
    });

    it('should deny access to projects for users without desenvolvimento permission', async () => {
      const userWithoutProjectsAccess = {
        id: 1,
        role: 'user' as const,
        permissions: JSON.stringify({
          suporte: true,
          desenvolvimento: false,
        }),
      };

      const caller = appRouter.createCaller({
        user: userWithoutProjectsAccess,
      } as Context);

      // This should throw an error
      await expect(caller.projects.list()).rejects.toThrow();
    });

    it('should allow admins to access all modules', async () => {
      const adminUser = {
        id: 1,
        role: 'admin' as const,
        permissions: JSON.stringify({
          suporte: false,
          desenvolvimento: false,
        }),
      };

      const caller = appRouter.createCaller({
        user: adminUser,
      } as Context);

      // Admins should have access to everything
      const tickets = await caller.tickets.list();
      expect(Array.isArray(tickets)).toBe(true);

      const projects = await caller.projects.list();
      expect(Array.isArray(projects)).toBe(true);
    });
  });
});

describe('Group Permissions Integration', () => {
  it('should merge group permissions with user permissions in auth.me', async () => {
    // Create a test group with comercial permission
    const group = await db.createPermissionGroup({
      name: `Test Group ${Date.now()}`,
      description: 'Test group for permission testing',
      permissions: {
        comercial: {
          create: true,
          read: true,
          update: true,
          delete: true,
        },
      },
    });

    expect(group).toBeDefined();
    if (!group) throw new Error('Failed to create test group');

    // Create a test user with this group
    const user = await db.createUser({
      name: 'Test User',
      email: `test${Date.now()}@example.com`,
      passwordHash: 'test',
      groupId: group.id,
      role: 'user',
      approvalStatus: 'approved',
    });

    expect(user).toBeDefined();
    if (!user) throw new Error('Failed to create test user');

    // Simulate auth.me call
    const caller = appRouter.createCaller({
      user: user,
    } as Context);

    const me = await caller.auth.me();
    expect(me).toBeDefined();
    expect(me?.groupId).toBe(group.id);
    
    // Check that permissions were merged
    const permissions = typeof me?.permissions === 'string'
      ? JSON.parse(me.permissions)
      : me?.permissions;
    
    expect(permissions).toHaveProperty('comercial');
    expect(permissions.comercial).toHaveProperty('read', true);

    // Cleanup: remove test user and group
    try {
      await db.deleteUser(user.id);
    } catch (err) {
      console.warn('[Test Cleanup] Failed to delete test user:', err);
    }
    try {
      await db.deletePermissionGroup(group.id);
    } catch (err) {
      console.warn('[Test Cleanup] Failed to delete test group:', err);
    }
  });
});
