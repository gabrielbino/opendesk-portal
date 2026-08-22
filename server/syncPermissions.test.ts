import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as db from './db';
import { User, PermissionGroup } from '../drizzle/schema';

describe('Sincronização de Permissões entre Usuários e Grupos', () => {
  let testUser: User | null = null;
  let testGroup: PermissionGroup | null = null;
  let testGroup2: PermissionGroup | null = null;

  beforeAll(async () => {
    // Criar grupos de teste
    testGroup = await db.createPermissionGroup({
      name: `Group-Sync-Test-${Date.now()}`,
      description: 'Grupo para teste de sincronização',
      permissions: {
        'Suporte.create': true,
        'Suporte.read': true,
        'Suporte.update': false,
        'Desenvolvimento.create': false,
        'Desenvolvimento.read': true,
      },
    });

    testGroup2 = await db.createPermissionGroup({
      name: `Group-Sync-Test-2-${Date.now()}`,
      description: 'Segundo grupo para teste de sincronização',
      permissions: {
        'Suporte.create': false,
        'Suporte.read': true,
        'Suporte.update': true,
        'Desenvolvimento.create': true,
        'Desenvolvimento.read': true,
      },
    });

    // Criar usuário de teste
    testUser = await db.createUser({
      name: 'Sync Test User',
      email: `sync-test-${Date.now()}@example.com`,
      passwordHash: 'hashed-password',
      role: 'user',
      approvalStatus: 'approved',
    });
  });

  afterAll(async () => {
    // Limpar dados de teste
    try {
      if (testUser?.id) {
        await db.assignGroupToUser(testUser.id, null);
        await db.deleteUser(testUser.id);
      }
    } catch (err) {
      console.warn('[Test Cleanup] Failed to delete test user:', err);
    }
    try {
      if (testGroup?.id) {
        await db.deletePermissionGroup(testGroup.id);
      }
    } catch (err) {
      console.warn('[Test Cleanup] Failed to delete test group:', err);
    }
    try {
      if (testGroup2?.id) {
        await db.deletePermissionGroup(testGroup2.id);
      }
    } catch (err) {
      console.warn('[Test Cleanup] Failed to delete test group 2:', err);
    }
  });

  it('deve sincronizar permissões quando usuário é atribuído a um grupo', async () => {
    if (!testUser?.id || !testGroup?.id) {
      throw new Error('Test user or group not created');
    }

    // Atribuir usuário ao grupo
    const updatedUser = await db.assignGroupToUser(testUser.id, testGroup.id);

    expect(updatedUser).toBeDefined();
    expect(updatedUser?.groupId).toBe(testGroup.id);

    // Verificar que as permissões do grupo foram copiadas para o usuário
    const userPermissions = typeof updatedUser?.permissions === 'string'
      ? JSON.parse(updatedUser.permissions)
      : updatedUser?.permissions;

    const groupPermissions = typeof testGroup.permissions === 'string'
      ? JSON.parse(testGroup.permissions)
      : testGroup.permissions;

    expect(userPermissions).toEqual(groupPermissions);
  });

  it('deve sincronizar permissões de um usuário com seu grupo', async () => {
    if (!testUser?.id || !testGroup?.id) {
      throw new Error('Test user or group not created');
    }

    // Sincronizar permissões do usuário com o grupo
    const syncedUser = await db.syncUserPermissionsFromGroup(testUser.id);

    expect(syncedUser).toBeDefined();
    expect(syncedUser?.groupId).toBe(testGroup.id);

    // Verificar que as permissões foram sincronizadas
    const userPermissions = typeof syncedUser?.permissions === 'string'
      ? JSON.parse(syncedUser.permissions)
      : syncedUser?.permissions;

    const groupPermissions = typeof testGroup.permissions === 'string'
      ? JSON.parse(testGroup.permissions)
      : testGroup.permissions;

    expect(userPermissions).toEqual(groupPermissions);
  });

  it('deve sincronizar todos os usuários quando um grupo é atualizado', async () => {
    if (!testUser?.id || !testGroup?.id) {
      throw new Error('Test user or group not created');
    }

    // Atualizar grupo com novas permissões
    const newPermissions = {
      'Suporte.create': true,
      'Suporte.read': true,
      'Suporte.update': true,
      'Desenvolvimento.create': true,
      'Desenvolvimento.read': true,
    };

    const updatedGroup = await db.updatePermissionGroup(testGroup.id, {
      permissions: newPermissions,
    });

    expect(updatedGroup).toBeDefined();

    // Sincronizar todos os usuários do grupo
    const syncedCount = await db.syncAllUsersInGroup(testGroup.id);

    expect(syncedCount).toBeGreaterThanOrEqual(0);

    // Verificar que o usuário recebeu as novas permissões
    const user = await db.getUserById(testUser.id);
    const userPermissions = typeof user?.permissions === 'string'
      ? JSON.parse(user.permissions)
      : user?.permissions;

    expect(userPermissions).toEqual(newPermissions);
  });

  it('deve trocar usuário de grupo e sincronizar permissões', async () => {
    if (!testUser?.id || !testGroup?.id || !testGroup2?.id) {
      throw new Error('Test user or groups not created');
    }

    // Trocar usuário para o segundo grupo
    const updatedUser = await db.assignGroupToUser(testUser.id, testGroup2.id);

    expect(updatedUser?.groupId).toBe(testGroup2.id);

    // Verificar que as permissões do novo grupo foram aplicadas
    const userPermissions = typeof updatedUser?.permissions === 'string'
      ? JSON.parse(updatedUser.permissions)
      : updatedUser?.permissions;

    const group2Permissions = typeof testGroup2.permissions === 'string'
      ? JSON.parse(testGroup2.permissions)
      : testGroup2.permissions;

    expect(userPermissions).toEqual(group2Permissions);
  });

  it('deve remover usuário de grupo mantendo permissões existentes', async () => {
    if (!testUser?.id) {
      throw new Error('Test user not created');
    }

    // Remover usuário do grupo
    const updatedUser = await db.assignGroupToUser(testUser.id, null);

    expect(updatedUser?.groupId).toBeNull();
    // Permissões devem ser mantidas (não excluídas)
    expect(updatedUser?.permissions).toBeDefined();
  });

  it('deve retornar null ao sincronizar usuário sem grupo', async () => {
    if (!testUser?.id) {
      throw new Error('Test user not created');
    }

    // Remover usuário do grupo primeiro
    await db.assignGroupToUser(testUser.id, null);

    // Tentar sincronizar usuário sem grupo
    const syncedUser = await db.syncUserPermissionsFromGroup(testUser.id);

    // Deve retornar o usuário sem mudanças
    expect(syncedUser?.groupId).toBeNull();
  });

  it('deve retornar 0 ao sincronizar grupo sem usuários', async () => {
    if (!testGroup?.id) {
      throw new Error('Test group not created');
    }

    // Remover todos os usuários do grupo
    await db.assignGroupToUser(testUser?.id || 0, null);

    // Sincronizar grupo vazio
    const syncedCount = await db.syncAllUsersInGroup(testGroup.id);

    expect(syncedCount).toBe(0);
  });
});
