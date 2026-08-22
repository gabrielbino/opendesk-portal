/**
 * Granular permissions system
 * Defines available modules, actions, and permission checking utilities
 */

export const MODULES = {
  SUPORTE: 'suporte',
  DESENVOLVIMENTO: 'desenvolvimento',
  ALMOXARIFADO: 'almoxarifado',
  GESTAO_NEGOCIOS: 'gestao_negocios',
  COMERCIAL: 'comercial',
  COMERCIAL_ASSOCIATIVISMO: 'comercial_associativismo',
  SUPERESTOCADOS: 'superestocados',
  CONTRATOS: 'contratos',
  REPASSES: 'repasses',
  PESCADOR: 'pescador',
  ENVIO_PARCIAL: 'envio_parcial',
  RUPTURAS: 'rupturas',
  MONITOR_TV: 'monitor_tv',
  COMPRADORES: 'compradores',
  INDICADORES_PEDIDOS_LAYOUT: 'indicadores_pedidos_layout',
  INDICADORES_CORTES_BI: 'indicadores_cortes_bi',
  INDICADORES_VENDAS_BI: 'indicadores_vendas_bi',
  INDICADORES_IQVIA_BI: 'indicadores_iqvia_bi',
  INDICADORES_MONITOR_ARQUIVOS: 'indicadores_monitor_arquivos',
  VALIDADES_CURTAS: 'validades_curtas',
} as const;

/**
 * Legacy module names mapping to current names
 * Used for backward compatibility with existing user permissions
 */
export const LEGACY_MODULE_NAMES: Record<string, Module> = {
  'chamados': 'suporte',
  'chamado': 'suporte',
  'ecommerce': 'desenvolvimento',
  'compras': 'desenvolvimento',
  'projetos': 'desenvolvimento',
  'rh': 'suporte',
  'marketing': 'suporte',
  'tecnologia': 'almoxarifado',
  'superestoque': 'superestocados',
  'superestocados': 'superestocados',
  // Módulo "Diretoria" renomeado para "Indicadores" (jul/2026): mantém grants já gravados.
  'diretoria_pedidos_layout': 'indicadores_pedidos_layout',
  'diretoria_cortes_bi': 'indicadores_cortes_bi',
  'diretoria_vendas_bi': 'indicadores_vendas_bi',
} as const;

export const ACTIONS = {
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
} as const;

export type Module = typeof MODULES[keyof typeof MODULES];
export type Action = typeof ACTIONS[keyof typeof ACTIONS];

/**
 * Granular permission structure per module
 * Each module can have specific action permissions
 */
export interface ModulePermissions {
  create: boolean;
  read: boolean;
  update: boolean;
  delete: boolean;
}

/**
 * User permissions structure
 * Maps each module to its action permissions
 */
export type UserPermissions = {
  [K in Module]?: ModulePermissions;
};

export interface UserWithPermissions {
  id: number;
  name: string;
  email: string;
  role: 'user' | 'admin';
  permissions: UserPermissions;
}

/**
 * Default permissions for a module (all actions disabled)
 */
export const DEFAULT_MODULE_PERMISSIONS: ModulePermissions = {
  create: false,
  read: false,
  update: false,
  delete: false,
};

/**
 * Full access permissions for a module (all actions enabled)
 */
export const FULL_MODULE_PERMISSIONS: ModulePermissions = {
  create: true,
  read: true,
  update: true,
  delete: true,
};

/**
 * Check if user has permission to perform a specific action on a module
 * Admins have full access to all modules and actions by default
 */
export function hasPermission(
  user: { role: string; permissions?: unknown } | null | undefined,
  module: Module,
  action: Action
): boolean {
  if (!user) return false;
  
  // Admins have full access to everything
  if (user.role === 'admin') return true;
  
  // Parse permissions
  const permissions = parsePermissions(user.permissions);
  
  // Check if module exists in permissions
  const modulePerms = permissions[module];
  if (!modulePerms) {
    console.warn(`[Permission] Module ${module} not found in permissions for user ${user.role}. Available: ${Object.keys(permissions).join(', ')}`);
    return false;
  }
  
  // Check specific action
  const hasAccess = modulePerms[action] === true;
  if (!hasAccess) {
    console.warn(`[Permission] User ${user.role} denied ${action} on ${module}`);
  }
  return hasAccess;
}

/**
 * Check if user has read access to a module (legacy compatibility)
 */
export function hasModulePermission(
  user: { role: string; permissions?: unknown } | null | undefined,
  module: Module
): boolean {
  return hasPermission(user, module, ACTIONS.READ);
}

/**
 * Parse permissions from various formats (JSON string, object, legacy array)
 */
function parsePermissions(permissions: unknown): UserPermissions {
  // Handle JSON string
  if (typeof permissions === 'string') {
    try {
      const parsed = JSON.parse(permissions);
      return normalizePermissions(parsed);
    } catch {
      return {};
    }
  }
  
  // Handle legacy array format (convert to read-only access)
  if (Array.isArray(permissions)) {
    const result: UserPermissions = {};
    for (const module of permissions) {
      if (Object.values(MODULES).includes(module as Module)) {
        result[module as Module] = { ...FULL_MODULE_PERMISSIONS };
      }
    }
    return result;
  }
  
  // Handle object format
  if (typeof permissions === 'object' && permissions !== null) {
    return normalizePermissions(permissions);
  }
  
  return {};
}

/**
 * Normalize permissions object to ensure proper structure
 * Handles both legacy boolean format and new granular format
 * Also handles legacy module names
 */
function normalizePermissions(permissions: any): UserPermissions {
  const result: UserPermissions = {};
  
  // First, map legacy module names to current names
  const normalizedPermissions: any = {};
  for (const [key, value] of Object.entries(permissions)) {
    const moduleKey = LEGACY_MODULE_NAMES[key] || key;
    normalizedPermissions[moduleKey] = value;
  }
  
  for (const module of Object.values(MODULES)) {
    const moduleValue = normalizedPermissions[module];
    
    // If it's a boolean (legacy format), convert to full or no access
    if (typeof moduleValue === 'boolean') {
      result[module] = moduleValue ? { ...FULL_MODULE_PERMISSIONS } : { ...DEFAULT_MODULE_PERMISSIONS };
    }
    // If it's an object with action permissions (new format)
    else if (typeof moduleValue === 'object' && moduleValue !== null) {
      result[module] = {
        create: moduleValue.create === true,
        read: moduleValue.read === true,
        update: moduleValue.update === true,
        delete: moduleValue.delete === true,
      };
    }
    // If module not explicitly set, leave as undefined (will use default permissions)
    // This ensures that legacy permissions are properly mapped
  }
  
  return result;
}

export function getUserModules(user: { role: string; permissions?: unknown } | null | undefined): Module[] {
  if (!user) return [];
  
  // Admins have access to all modules
  if (user.role === 'admin') {
    return Object.values(MODULES);
  }
  
  const permissions = parsePermissions(user.permissions);
  
  // Return modules where user has at least read access
  return Object.entries(permissions)
    .filter(([module, perms]) => perms.read === true)
    .map(([module]) => module as Module)
    .filter(module => Object.values(MODULES).includes(module));
}

/**
 * Get user's permissions for a specific module
 */
export function getModulePermissions(
  user: { role: string; permissions?: unknown } | null | undefined,
  module: Module
): ModulePermissions {
  if (!user) return { ...DEFAULT_MODULE_PERMISSIONS };
  
  // Admins have full access
  if (user.role === 'admin') return { ...FULL_MODULE_PERMISSIONS };
  
  const permissions = parsePermissions(user.permissions);
  return permissions[module] || { ...DEFAULT_MODULE_PERMISSIONS };
}

/**
 * Check if user can perform any action on a module
 */
export function hasAnyPermission(
  user: { role: string; permissions?: unknown } | null | undefined,
  module: Module
): boolean {
  const perms = getModulePermissions(user, module);
  return perms.create || perms.read || perms.update || perms.delete;
}

/**
 * Árvore de permissões (hubs → submódulos). FONTE ÚNICA usada por:
 *  - a UI de atribuição de permissões (render aninhado; marcar o pai marca os filhos);
 *  - a visibilidade dos hubs de navegação (hub aparece se houver QUALQUER filho).
 *
 * Nós com `module` são gates reais (folhas). Nós sem `module` são apenas grupos
 * (hubs) — não geram permissão própria. Ao criar um submódulo novo, adicione-o
 * aqui sob o hub correspondente (ver checklist de wiring no CLAUDE.md).
 */
export interface PermissionNode {
  module?: Module;
  label: string;
  children?: PermissionNode[];
}

export const PERMISSION_TREE: PermissionNode[] = [
  { module: MODULES.SUPORTE, label: 'Suporte (Help Desk)' },
  { module: MODULES.DESENVOLVIMENTO, label: 'Desenvolvimento' },
  { module: MODULES.ALMOXARIFADO, label: 'Almoxarifado' },
  {
    label: 'Gestão de Negócios',
    children: [
      {
        label: 'Comercial',
        children: [
          { module: MODULES.COMERCIAL, label: 'Análise Comercial' },
          { module: MODULES.COMERCIAL_ASSOCIATIVISMO, label: 'Associativismo' },
          { module: MODULES.ENVIO_PARCIAL, label: 'Envio de Parcial' },
        ],
      },
      {
        // Sub-hub: painéis de monitoramento de estoque.
        // Visão de futuro (ver docs/compradores-handoff.md): unificar num só submódulo.
        label: 'Controle de Estoque',
        children: [
          { module: MODULES.SUPERESTOCADOS, label: 'Superestocados' },
          { module: MODULES.RUPTURAS, label: 'Rupturas' },
          { module: MODULES.VALIDADES_CURTAS, label: 'Validades Curtas' },
        ],
      },
      { module: MODULES.MONITOR_TV, label: 'Monitor TV' },
      { module: MODULES.COMPRADORES, label: 'Compradores' },
      {
        // Contratos é um hub (terá outros submódulos além de Repasses).
        label: 'Contratos',
        children: [
          { module: MODULES.REPASSES, label: 'Repasses' },
        ],
      },
      { module: MODULES.PESCADOR, label: 'Pescador' },
    ],
  },
  {
    // Indicadores (renomeado de "Diretoria", jul/2026) — hub de painéis informativos, multi-setor.
    // Chaves antigas `diretoria_*` seguem em LEGACY_MODULE_NAMES (não derruba grants existentes).
    label: 'Indicadores',
    children: [
      { module: MODULES.INDICADORES_PEDIDOS_LAYOUT, label: 'Pedidos por Layout' },
      { module: MODULES.INDICADORES_MONITOR_ARQUIVOS, label: 'Monitor de Integrações' },
      {
        // Sub-hub: painéis Power BI embarcados (Cortes, Áreas de Atuação, IQVIA, ...).
        label: 'Visões Power BI',
        children: [
          { module: MODULES.INDICADORES_CORTES_BI, label: 'Cortes' },
          { module: MODULES.INDICADORES_VENDAS_BI, label: 'Áreas de Atuação' },
          { module: MODULES.INDICADORES_IQVIA_BI, label: 'Iqvia' },
        ],
      },
    ],
  },
];

/** Todos os módulos-gate (folhas) sob um nó da árvore. */
export function collectLeafModules(node: PermissionNode): Module[] {
  if (node.module) return [node.module];
  return (node.children ?? []).flatMap(collectLeafModules);
}

/** Acha o nó (hub) de um grupo pelo label, no topo da árvore. */
export function findPermissionGroup(label: string): PermissionNode | undefined {
  const walk = (nodes: PermissionNode[]): PermissionNode | undefined => {
    for (const n of nodes) {
      if (!n.module && n.label === label) return n;
      if (n.children) {
        const found = walk(n.children);
        if (found) return found;
      }
    }
    return undefined;
  };
  return walk(PERMISSION_TREE);
}

/**
 * O usuário tem acesso a QUALQUER folha (gate) sob o hub de label informado?
 * Usado para mostrar o card do hub na navegação.
 */
export function hasAnyChildPermission(
  user: { role: string; permissions?: unknown } | null | undefined,
  hubLabel: string,
): boolean {
  if (!user) return false;
  if ((user as { role?: string }).role === 'admin') return true;
  const node = findPermissionGroup(hubLabel);
  if (!node) return false;
  return collectLeafModules(node).some((m) => hasModulePermission(user, m));
}
