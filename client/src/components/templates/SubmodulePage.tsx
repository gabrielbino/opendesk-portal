import { useLocation } from 'wouter';
import { ReactNode } from 'react';
import PanelHeader from '@/components/PanelHeader';

export interface SubmodulePageProps {
  /** Título do submódulo */
  title: string;
  /** Subtítulo/descrição (opcional) */
  subtitle?: string;
  /** Ícone do submódulo */
  icon: ReactNode;
  /** Gradiente do ícone (ex: "from-emerald-500 to-emerald-600") */
  iconGradient?: string;
  /** Rota de retorno ao hub do módulo pai */
  backPath: string;
  /** Label do botão de voltar (ex: "Administração") */
  backLabel: string;
  /** Conteúdo principal da página */
  children: ReactNode;
  /** Ações extras no header (botões, filtros) */
  headerActions?: ReactNode;
}

/**
 * SubmodulePage — Template reutilizável para páginas de submódulos independentes.
 *
 * Renderiza sob a barra global: um PanelHeader (voltar ao hub pai + ícone/título + ações) e o
 * conteúdo, tudo no container de largura padrão (max-w-7xl…), igual aos demais painéis.
 *
 * Uso:
 * ```tsx
 * <SubmodulePage
 *   title="Saúde do Sistema"
 *   subtitle="Monitoramento de performance e integridade"
 *   icon={<Activity size={20} />}
 *   iconGradient="from-emerald-500 to-emerald-600"
 *   backPath="/admin"
 *   backLabel="Administração"
 * >
 *   {/* conteúdo específico do submódulo *\/}
 * </SubmodulePage>
 * ```
 */
export default function SubmodulePage({
  title,
  subtitle,
  icon,
  iconGradient = 'from-indigo-600 to-indigo-700',
  backPath,
  backLabel,
  children,
  headerActions,
}: SubmodulePageProps) {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen w-full bg-[var(--background)]">
      <div className="mx-auto max-w-7xl 2xl:max-w-[1600px] min-[1920px]:max-w-[1800px] min-[2560px]:max-w-[2200px] space-y-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <PanelHeader
          onBack={() => setLocation(backPath)}
          backLabel={backLabel}
          icon={icon}
          iconBoxClassName={iconGradient}
          title={title}
          subtitle={subtitle}
          actions={headerActions}
        />
        {children}
      </div>
    </div>
  );
}
