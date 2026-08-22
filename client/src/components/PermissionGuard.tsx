/**
 * PermissionGuard - Componente para proteção de rotas por permissão de módulo.
 *
 * Verifica se o usuário autenticado tem permissão de leitura no módulo especificado.
 * Admins sempre têm acesso. Usuários sem permissão veem uma mensagem de acesso negado.
 *
 * Uso:
 * ```tsx
 * <PermissionGuard module={MODULES.SUPERESTOCADOS}>
 *   <SuperestocadosDashboard />
 * </PermissionGuard>
 * ```
 */
import { ReactNode } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { hasModulePermission, type Module } from '@shared/permissions';
import { ShieldX, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLocation } from 'wouter';

interface PermissionGuardProps {
  /** Módulo que o usuário precisa ter permissão de leitura */
  module: Module;
  /** Conteúdo protegido */
  children: ReactNode;
  /** Rota de fallback ao clicar "Voltar" (default: /dashboard) */
  fallbackPath?: string;
}

export function PermissionGuard({ module, children, fallbackPath = '/dashboard' }: PermissionGuardProps) {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  // Admin tem acesso total
  if (user?.role === 'admin') {
    return <>{children}</>;
  }

  // Verificar permissão de leitura no módulo
  if (!hasModulePermission(user, module)) {
    return (
      <div className="min-h-screen w-full bg-[var(--background)] flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <ShieldX size={32} className="text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Acesso Negado</h2>
          <p className="text-muted-foreground mb-6">
            Você não tem permissão para acessar este módulo.
            Entre em contato com o administrador para solicitar acesso.
          </p>
          <Button
            variant="outline"
            onClick={() => navigate(fallbackPath)}
            className="gap-2"
          >
            <ArrowLeft size={16} />
            Voltar ao Portal
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
