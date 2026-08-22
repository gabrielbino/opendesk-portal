/**
 * Permission middleware for tRPC procedures
 * Provides granular action-based permission checking
 */

import { TRPCError } from '@trpc/server';
import { hasPermission, type Module, type Action } from '@shared/permissions';
import type { TrpcContext } from './_core/context';

/**
 * Middleware to check if user has permission for a specific action on a module
 */
export function requirePermission(module: Module, action: Action) {
  return async ({ ctx, next }: { ctx: TrpcContext; next: () => Promise<any> }) => {
    if (!ctx.user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Você precisa estar autenticado para realizar esta ação',
      });
    }

    const hasAccess = hasPermission(ctx.user, module, action);

    if (!hasAccess) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Você não tem permissão para ${getActionLabel(action)} em ${getModuleLabel(module)}`,
      });
    }

    return next();
  };
}

/**
 * Get human-readable action label in Portuguese
 */
function getActionLabel(action: Action): string {
  const labels: Record<Action, string> = {
    create: 'criar',
    read: 'visualizar',
    update: 'editar',
    delete: 'excluir',
  };
  return labels[action] || action;
}

/**
 * Get human-readable module label in Portuguese
 */
function getModuleLabel(module: Module): string {
  const labels: Record<Module, string> = {
    suporte: 'Suporte',
    desenvolvimento: 'Desenvolvimento',
    almoxarifado: 'Almoxarifado',
    gestao_negocios: 'Gestão de Negócios',
    comercial: 'Comercial',
    comercial_associativismo: 'Comercial — Associativismo',
    superestocados: 'Superestocados',
    contratos: 'Contratos',
    repasses: 'Repasses',
    pescador: 'Pescador',
    envio_parcial: 'Envio de Parcial',
    rupturas: 'Rupturas',
    monitor_tv: 'Monitor TV',
    compradores: 'Compradores',
    indicadores_pedidos_layout: 'Pedidos por Layout',
    indicadores_cortes_bi: 'Cortes',
    indicadores_vendas_bi: 'Áreas de Atuação',
    indicadores_iqvia_bi: 'IQVIA',
    indicadores_monitor_arquivos: 'Monitor de Integrações',
    validades_curtas: 'Validades Curtas',
  };
  return labels[module] || module;
}
