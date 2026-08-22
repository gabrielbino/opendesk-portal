import { useAuth } from '@/_core/hooks/useAuth';
import { useLocation } from 'wouter';
import { ArrowLeft, ChevronRight, LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { hasModulePermission, hasAnyChildPermission, MODULES } from '@shared/permissions';
import { ReactNode } from 'react';

export interface SubmoduleConfig {
  id: string;
  /** Chave de permissão em MODULES (opcional — se omitido, sempre visível para admin) */
  permissionKey?: keyof typeof MODULES;
  /**
   * Quando o card é, ele mesmo, um hub de submódulos: fica visível se o usuário
   * tiver QUALQUER uma dessas permissões (encapsulamento — ver PERMISSION_TREE).
   */
  anyOf?: (keyof typeof MODULES)[];
  /**
   * Quando o card é um hub mapeado na PERMISSION_TREE: visibilidade derivada do
   * label do grupo (aparece se o usuário tem QUALQUER submódulo). Preferível ao
   * `anyOf` — inclui submódulos futuros sem editar este card.
   */
  hubGroup?: string;
  name: string;
  description: string;
  icon: ReactNode;
  path: string;
  /** Gradiente do ícone (ex: "from-orange-500 to-orange-600") */
  color: string;
}

export interface ModuleHubProps {
  /** Título do módulo (ex: "Administração") */
  title: string;
  /** Subtítulo exibido abaixo do título */
  subtitle?: string;
  /** Ícone principal do módulo */
  icon: ReactNode;
  /** Gradiente do ícone principal (ex: "from-indigo-600 to-indigo-700") */
  iconGradient?: string;
  /** Lista de submódulos a exibir */
  submodules: SubmoduleConfig[];
  /** Rota de retorno (padrão: "/dashboard") */
  backPath?: string;
  /** Label do botão de voltar (padrão: "Portal") */
  backLabel?: string;
  /** Se true, exige role admin para acessar o hub inteiro */
  adminOnly?: boolean;
}

/**
 * ModuleHub — Template reutilizável para páginas hub de módulos.
 *
 * Renderiza sob a barra global (AppTopbar): um hero com o botão de voltar inline ao lado do
 * ícone + título/subtítulo (sem cabeçalho próprio, para não duplicar), e um grid de cards
 * (1 col no mobile → 2 no tablet → 3 no desktop) para cada submódulo independente.
 *
 * Cada submódulo tem sua própria rota e pode ter permissão controlada.
 *
 * Uso:
 * ```tsx
 * <ModuleHub
 *   title="Administração"
 *   subtitle="Selecione o módulo desejado"
 *   icon={<Settings size={20} />}
 *   iconGradient="from-slate-600 to-slate-700"
 *   submodules={[...]}
 * />
 * ```
 */
export default function ModuleHub({
  title,
  subtitle = 'Selecione o módulo desejado',
  icon,
  iconGradient = 'from-indigo-600 to-indigo-700',
  submodules,
  backPath = '/dashboard',
  backLabel = 'Portal',
  adminOnly = false,
}: ModuleHubProps) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  // Filtrar submódulos por permissão
  const visibleSubmodules = submodules.filter(m => {
    // Admin vê tudo
    if (user?.role === 'admin') return true;
    // Hub mapeado na árvore: visível se tiver QUALQUER submódulo (deriva da PERMISSION_TREE)
    if (m.hubGroup) return hasAnyChildPermission(user, m.hubGroup);
    // Chaves que liberam o card: a própria + as de encapsulamento (anyOf)
    const keys: (keyof typeof MODULES)[] = [];
    if (m.permissionKey) keys.push(m.permissionKey);
    if (m.anyOf) keys.push(...m.anyOf);
    // Sem nenhuma chave → visível para todos
    if (keys.length === 0) return true;
    // Visível se tiver QUALQUER uma das permissões
    return keys.some((k) => {
      const perm = MODULES[k];
      return perm ? hasModulePermission(user, perm) : false;
    });
  });

  // Se adminOnly e não é admin, bloqueia
  if (adminOnly && user?.role !== 'admin') {
    return (
      <div className="min-h-screen w-full bg-[var(--background)] flex items-center justify-center">
        <p className="text-muted-foreground">Acesso restrito a administradores.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[var(--background)]">
      <main className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <div className="mx-auto max-w-5xl">
          {/* Hero — voltar inline ao lado do ícone + título (sem cabeçalho separado) */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mb-8 flex flex-wrap items-center gap-3 sm:gap-4"
          >
            <button
              onClick={() => setLocation(backPath)}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">{backLabel}</span>
            </button>
            <div className="hidden h-8 w-px bg-border sm:block" aria-hidden />
            <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${iconGradient} shadow-sm shrink-0`}>
              <span className="text-white [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                {title}
              </h1>
              <p className="text-sm text-muted-foreground">
                {subtitle}
              </p>
            </div>
          </motion.div>

          {/* Submodules Grid — 3 por linha em telas grandes */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleSubmodules.map((item, index) => (
              <motion.button
                key={item.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08, duration: 0.3 }}
                onClick={() => setLocation(item.path)}
                className="group relative flex flex-col gap-3 p-4 sm:p-5 rounded-xl border border-border bg-card hover:border-ring/40 hover:shadow-lg hover:-translate-y-1 active:scale-[0.98] transition-all duration-200 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {/* Icon */}
                <div className={`w-11 h-11 rounded-lg bg-gradient-to-br ${item.color} flex items-center justify-center text-white shadow-sm shrink-0`}>
                  <span className="[&>svg]:w-5 [&>svg]:h-5">{item.icon}</span>
                </div>

                {/* Text */}
                <div className="min-w-0 w-full">
                  <p className="text-sm sm:text-base font-semibold text-foreground">
                    {item.name}
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5 leading-snug">
                    {item.description}
                  </p>
                </div>

                {/* Arrow */}
                <ChevronRight
                  size={16}
                  className="absolute top-4 right-4 text-muted-foreground/40 group-hover:text-muted-foreground group-hover:translate-x-0.5 transition-all"
                />
              </motion.button>
            ))}

            {visibleSubmodules.length === 0 && (
              <div className="col-span-full py-16 text-center text-muted-foreground text-sm">
                Você não possui acesso a nenhum submódulo.
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
