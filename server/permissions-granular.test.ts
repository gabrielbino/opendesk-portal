import { describe, it, expect } from 'vitest';
import { hasPermission, hasModulePermission, MODULES, ACTIONS } from '@shared/permissions';

describe('Granular Permissions System', () => {
  describe('hasPermission - Granular CRUD', () => {
    it('should return true for admin regardless of permissions', () => {
      const adminUser = { role: 'admin', permissions: {} };
      expect(hasPermission(adminUser, MODULES.SUPORTE, ACTIONS.READ)).toBe(true);
      expect(hasPermission(adminUser, MODULES.SUPORTE, ACTIONS.CREATE)).toBe(true);
      expect(hasPermission(adminUser, MODULES.SUPORTE, ACTIONS.UPDATE)).toBe(true);
      expect(hasPermission(adminUser, MODULES.SUPORTE, ACTIONS.DELETE)).toBe(true);
    });

    it('should return false for null/undefined user', () => {
      expect(hasPermission(null, MODULES.SUPORTE, ACTIONS.READ)).toBe(false);
      expect(hasPermission(undefined, MODULES.SUPORTE, ACTIONS.READ)).toBe(false);
    });

    it('should check specific action in granular permissions', () => {
      const user = {
        role: 'user',
        permissions: {
          suporte: { create: true, read: true, update: false, delete: false },
          desenvolvimento: { create: false, read: true, update: false, delete: false },
        },
      };

      expect(hasPermission(user, MODULES.SUPORTE, ACTIONS.READ)).toBe(true);
      expect(hasPermission(user, MODULES.SUPORTE, ACTIONS.CREATE)).toBe(true);
      expect(hasPermission(user, MODULES.SUPORTE, ACTIONS.UPDATE)).toBe(false);
      expect(hasPermission(user, MODULES.SUPORTE, ACTIONS.DELETE)).toBe(false);
      expect(hasPermission(user, MODULES.DESENVOLVIMENTO, ACTIONS.READ)).toBe(true);
      expect(hasPermission(user, MODULES.DESENVOLVIMENTO, ACTIONS.CREATE)).toBe(false);
    });

    it('should handle JSON string permissions', () => {
      const user = {
        role: 'user',
        permissions: JSON.stringify({
          comercial: { create: true, read: true, update: true, delete: false },
        }),
      };

      expect(hasPermission(user, MODULES.COMERCIAL, ACTIONS.READ)).toBe(true);
      expect(hasPermission(user, MODULES.COMERCIAL, ACTIONS.CREATE)).toBe(true);
      expect(hasPermission(user, MODULES.COMERCIAL, ACTIONS.DELETE)).toBe(false);
    });

    it('should handle legacy boolean format (backward compat)', () => {
      const user = {
        role: 'user',
        permissions: { suporte: true, desenvolvimento: false },
      };

      // Legacy boolean true = all actions enabled
      expect(hasPermission(user, MODULES.SUPORTE, ACTIONS.READ)).toBe(true);
      expect(hasPermission(user, MODULES.SUPORTE, ACTIONS.CREATE)).toBe(true);
      expect(hasPermission(user, MODULES.SUPORTE, ACTIONS.UPDATE)).toBe(true);
      expect(hasPermission(user, MODULES.SUPORTE, ACTIONS.DELETE)).toBe(true);

      // Legacy boolean false = all actions disabled
      expect(hasPermission(user, MODULES.DESENVOLVIMENTO, ACTIONS.READ)).toBe(false);
    });

    it('should return false for module not in permissions', () => {
      const user = {
        role: 'user',
        permissions: {
          suporte: { create: true, read: true, update: true, delete: true },
        },
      };

      expect(hasPermission(user, MODULES.ALMOXARIFADO, ACTIONS.READ)).toBe(false);
    });
  });

  describe('hasModulePermission - Legacy compatibility', () => {
    it('should check READ action for module permission', () => {
      const user = {
        role: 'user',
        permissions: {
          superestocados: { create: false, read: true, update: false, delete: false },
        },
      };

      expect(hasModulePermission(user, MODULES.SUPERESTOCADOS)).toBe(true);
    });

    it('should return false if user has no READ permission', () => {
      const user = {
        role: 'user',
        permissions: {
          superestocados: { create: true, read: false, update: true, delete: true },
        },
      };

      expect(hasModulePermission(user, MODULES.SUPERESTOCADOS)).toBe(false);
    });

    it('should return true for admin', () => {
      const admin = { role: 'admin', permissions: {} };
      expect(hasModulePermission(admin, MODULES.SUPERESTOCADOS)).toBe(true);
    });
  });

  describe('MODULES constants', () => {
    it('should have all expected modules defined', () => {
      expect(MODULES.SUPORTE).toBe('suporte');
      expect(MODULES.DESENVOLVIMENTO).toBe('desenvolvimento');
      expect(MODULES.ALMOXARIFADO).toBe('almoxarifado');
      expect(MODULES.GESTAO_NEGOCIOS).toBe('gestao_negocios');
      expect(MODULES.COMERCIAL).toBe('comercial');
      expect(MODULES.SUPERESTOCADOS).toBe('superestocados');
      expect(MODULES.CONTRATOS).toBe('contratos');
      expect(MODULES.REPASSES).toBe('repasses');
    });
  });

  describe('ACTIONS constants', () => {
    it('should have all CRUD actions defined', () => {
      expect(ACTIONS.CREATE).toBe('create');
      expect(ACTIONS.READ).toBe('read');
      expect(ACTIONS.UPDATE).toBe('update');
      expect(ACTIONS.DELETE).toBe('delete');
    });
  });

  describe('Permission Group format compatibility', () => {
    it('should handle granular permissions from groups (new format)', () => {
      const user = {
        role: 'user',
        permissions: {
          suporte: { create: true, read: true, update: true, delete: true },
          desenvolvimento: { create: false, read: true, update: false, delete: false },
          almoxarifado: { create: true, read: true, update: true, delete: false },
          comercial: { create: false, read: false, update: false, delete: false },
        },
      };

      // Suporte - full access
      expect(hasPermission(user, MODULES.SUPORTE, ACTIONS.CREATE)).toBe(true);
      expect(hasPermission(user, MODULES.SUPORTE, ACTIONS.DELETE)).toBe(true);

      // Desenvolvimento - read only
      expect(hasPermission(user, MODULES.DESENVOLVIMENTO, ACTIONS.READ)).toBe(true);
      expect(hasPermission(user, MODULES.DESENVOLVIMENTO, ACTIONS.CREATE)).toBe(false);

      // Almoxarifado - no delete
      expect(hasPermission(user, MODULES.ALMOXARIFADO, ACTIONS.CREATE)).toBe(true);
      expect(hasPermission(user, MODULES.ALMOXARIFADO, ACTIONS.DELETE)).toBe(false);

      // Comercial - no access
      expect(hasModulePermission(user, MODULES.COMERCIAL)).toBe(false);
    });

    it('should handle mixed legacy and granular formats', () => {
      const user = {
        role: 'user',
        permissions: {
          suporte: true, // legacy boolean
          desenvolvimento: { create: true, read: true, update: true, delete: false }, // granular
        },
      };

      // Legacy boolean true = full access
      expect(hasPermission(user, MODULES.SUPORTE, ACTIONS.READ)).toBe(true);
      expect(hasPermission(user, MODULES.SUPORTE, ACTIONS.DELETE)).toBe(true);

      // Granular
      expect(hasPermission(user, MODULES.DESENVOLVIMENTO, ACTIONS.READ)).toBe(true);
      expect(hasPermission(user, MODULES.DESENVOLVIMENTO, ACTIONS.DELETE)).toBe(false);
    });
  });
});
