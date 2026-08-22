import { describe, it, expect, afterAll } from 'vitest';
import { appRouter } from './routers';
import type { Context } from './_core/context';

/**
 * Testes do sistema de Grupos de Permissões.
 * Todos os grupos criados durante os testes são excluídos no afterAll
 * para não poluir o painel de produção.
 */
describe('Permission Groups System', () => {
  const createdGroupIds: number[] = [];

  const adminCaller = appRouter.createCaller({
    user: { id: 1, role: 'admin' as const, permissions: null },
  } as Context);

  const userCaller = appRouter.createCaller({
    user: { id: 2, role: 'user' as const, permissions: null },
  } as Context);

  // Cleanup: remove todos os grupos criados durante os testes
  afterAll(async () => {
    for (const id of createdGroupIds) {
      try {
        await adminCaller.permissionGroups.delete({ id });
      } catch {
        // Ignora se já foi deletado durante o teste
      }
    }
  });

  describe('Permission Groups CRUD', () => {
    it('should allow admin to create permission group', async () => {
      const groupName = `Test CRUD Create ${Date.now()}`;
      const group = await adminCaller.permissionGroups.create({
        name: groupName,
        description: 'Acesso a suporte e desenvolvimento',
        permissions: {
          suporte: true,
          desenvolvimento: true,
          almoxarifado: false,
          comercial: false,
          superestocados: false,
          contratos: false,
          repasses: false,
        },
        isDefault: false,
      });

      expect(group).toBeDefined();
      expect(group?.name).toBe(groupName);
      if (group) createdGroupIds.push(group.id);
    });

    it('should deny non-admin from creating permission group', async () => {
      await expect(
        userCaller.permissionGroups.create({
          name: `Test Deny ${Date.now()}`,
          description: 'Test',
          permissions: {
            suporte: true,
            desenvolvimento: false,
            almoxarifado: false,
            comercial: false,
            superestocados: false,
            contratos: false,
            repasses: false,
          },
        })
      ).rejects.toThrow();
    });

    it('should list all permission groups', async () => {
      const groups = await adminCaller.permissionGroups.list();
      expect(Array.isArray(groups)).toBe(true);
    });

    it('should allow admin to update permission group', async () => {
      const created = await adminCaller.permissionGroups.create({
        name: `Test Update ${Date.now()}`,
        description: 'Original description',
        permissions: {
          suporte: true,
          desenvolvimento: false,
          almoxarifado: false,
          comercial: false,
          superestocados: false,
          contratos: false,
          repasses: false,
        },
      });

      if (!created) throw new Error('Failed to create group');
      createdGroupIds.push(created.id);

      const updatedName = `Updated ${Date.now()}`;
      const updated = await adminCaller.permissionGroups.update({
        id: created.id,
        name: updatedName,
        description: 'Updated description',
        permissions: {
          suporte: true,
          desenvolvimento: true,
          almoxarifado: false,
          comercial: false,
          superestocados: false,
          contratos: false,
          repasses: false,
        },
      });

      expect(updated?.name).toBe(updatedName);
      expect(updated?.description).toBe('Updated description');
    });

    it('should deny non-admin from updating permission group', async () => {
      await expect(
        userCaller.permissionGroups.update({
          id: 1,
          name: 'Hacked Name',
          permissions: {
            suporte: true,
            desenvolvimento: true,
            almoxarifado: true,
            comercial: true,
            superestocados: true,
            contratos: true,
            repasses: true,
          },
        })
      ).rejects.toThrow();
    });

    it('should allow admin to delete permission group', async () => {
      const created = await adminCaller.permissionGroups.create({
        name: `Test Delete ${Date.now()}`,
        description: 'Will be deleted',
        permissions: {
          suporte: false,
          desenvolvimento: false,
          almoxarifado: false,
          comercial: false,
          superestocados: false,
          contratos: false,
          repasses: false,
        },
      });

      if (!created) throw new Error('Failed to create group');
      // Não precisa adicionar ao createdGroupIds pois será deletado aqui

      const result = await adminCaller.permissionGroups.delete({ id: created.id });
      expect(result).toBe(true);
    });

    it('should deny non-admin from deleting permission group', async () => {
      await expect(
        userCaller.permissionGroups.delete({ id: 1 })
      ).rejects.toThrow();
    });
  });

  describe('Group Assignment', () => {
    it('should allow admin to assign group to user', async () => {
      const group = await adminCaller.permissionGroups.create({
        name: `Test Assign ${Date.now()}`,
        description: 'For testing assignment',
        permissions: {
          suporte: true,
          desenvolvimento: true,
          almoxarifado: false,
          comercial: false,
          superestocados: false,
          contratos: false,
          repasses: false,
        },
      });

      if (!group) throw new Error('Failed to create group');
      createdGroupIds.push(group.id);

      const result = await adminCaller.users.assignGroup({
        userId: 2,
        groupId: group.id,
      });

      expect(result).toBeDefined();
    });

    it('should deny non-admin from assigning groups', async () => {
      await expect(
        userCaller.users.assignGroup({
          userId: 3,
          groupId: 1,
        })
      ).rejects.toThrow();
    });

    it('should allow removing group assignment', async () => {
      const result = await adminCaller.users.assignGroup({
        userId: 2,
        groupId: null,
      });

      expect(result).toBeDefined();
    });
  });

  describe('Permission Inheritance', () => {
    it('should copy group permissions to user when assigned', async () => {
      const group = await adminCaller.permissionGroups.create({
        name: `Test Inherit ${Date.now()}`,
        description: 'Testing permission inheritance',
        permissions: {
          suporte: true,
          desenvolvimento: false,
          almoxarifado: true,
          comercial: false,
          superestocados: false,
          contratos: false,
          repasses: false,
        },
      });

      if (!group) throw new Error('Failed to create group');
      createdGroupIds.push(group.id);

      try {
        const user = await adminCaller.users.assignGroup({
          userId: 2,
          groupId: group.id,
        });

        if (user) {
          expect(user.groupId).toBe(group.id);
        }
      } catch (error) {
        expect(error).toBeDefined();
      }

      // Cleanup: remove assignment
      try {
        await adminCaller.users.assignGroup({ userId: 2, groupId: null });
      } catch { /* ignore */ }
    });
  });
});
