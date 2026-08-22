import { describe, it, expect } from 'vitest';
import { hasPermission, MODULES, ACTIONS } from '@shared/permissions';

describe('Legacy Permissions Compatibility', () => {
  it('should allow user with chamados:true to access suporte module', () => {
    const user = {
      role: 'user',
      permissions: {
        chamados: true,
        compras: false,
        marketing: false,
        projetos: false,
        rh: false,
        suporte: true,
        tecnologia: false,
      },
    };

    const hasRead = hasPermission(user, MODULES.SUPORTE, ACTIONS.READ);
    const hasCreate = hasPermission(user, MODULES.SUPORTE, ACTIONS.CREATE);

    expect(hasRead).toBe(true);
    expect(hasCreate).toBe(true);
  });

  it('should allow user with only chamados:true to access suporte', () => {
    const user = {
      role: 'user',
      permissions: {
        chamados: true,
      },
    };

    const hasRead = hasPermission(user, MODULES.SUPORTE, ACTIONS.READ);
    expect(hasRead).toBe(true);
  });

  it('should deny access to modules without permission', () => {
    const user = {
      role: 'user',
      permissions: {
        chamados: true,
      },
    };

    // COMERCIAL is a valid module, user doesn't have access
    const hasComercial = hasPermission(user, MODULES.COMERCIAL, ACTIONS.READ);
    expect(hasComercial).toBe(false);
  });

  it('should map ecommerce to desenvolvimento', () => {
    // In LEGACY_MODULE_NAMES, 'ecommerce' maps to 'desenvolvimento'
    const user = {
      role: 'user',
      permissions: {
        ecommerce: true,
      },
    };

    const hasRead = hasPermission(user, MODULES.DESENVOLVIMENTO, ACTIONS.READ);
    expect(hasRead).toBe(true);
  });

  it('should map projetos to desenvolvimento', () => {
    const user = {
      role: 'user',
      permissions: {
        projetos: true,
      },
    };

    const hasRead = hasPermission(user, MODULES.DESENVOLVIMENTO, ACTIONS.READ);
    expect(hasRead).toBe(true);
  });
});
