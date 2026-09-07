import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { useLocation } from 'wouter';
import { useState } from 'react';
import {
  MessageSquare,
  Zap,
  Search,
  Package,
  Briefcase,
  LayoutDashboard,
  ChevronRight,
  BarChart3,
  Shield,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { hasModulePermission, hasAnyChildPermission, MODULES } from '@shared/permissions';
import AnnouncementsList from '@/components/AnnouncementsList';

export default function PortalDashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const [searchQuery, setSearchQuery] = useState('');

  const { data: announcements = [] } = trpc.announcements.list.useQuery();

  const allModules = [
    {
      id: 'suporte',
      name: 'Suporte',
      description: 'Chamados e atendimento',
      icon: <MessageSquare size={22} />,
      path: '/suporte',
      color: 'from-blue-500 to-blue-600',
      accent: 'bg-blue-50 border-blue-200 text-blue-700',
    },
    {
      id: 'desenvolvimento',
      name: 'Desenvolvimento',
      description: 'Projetos e tarefas',
      icon: <Zap size={22} />,
      path: '/desenvolvimento',
      color: 'from-violet-600 to-violet-700',
      accent: 'bg-violet-50 border-violet-200 text-violet-700',
    },
    {
      id: 'almoxarifado',
      name: 'Almoxarifado',
      description: 'Inventário de TI',
      icon: <Package size={22} />,
      path: '/tecnologia/almoxarifado',
      color: 'from-emerald-600 to-emerald-700',
      accent: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    },
    {
      id: 'negocios',
      name: 'Gestão de Negócios',
      description: 'Compras, Trade e Comercial',
      icon: <Briefcase size={22} />,
      path: '/negocios',
      color: 'from-indigo-600 to-indigo-700',
      accent: 'bg-indigo-50 border-indigo-200 text-indigo-700',
    },
    {
      id: 'indicadores',
      name: 'Indicadores',
      description: 'Painéis informativos de leitura rápida',
      icon: <LayoutDashboard size={22} />,
      path: '/indicadores',
      color: 'from-slate-700 to-slate-800',
      accent: 'bg-slate-50 border-slate-200 text-slate-700',
    },
  ];

  const adminModules = user?.role === 'admin' ? [
    {
      id: 'admin',
      name: 'Administração',
      description: 'Gestão do sistema',
      icon: <Shield size={22} />,
      path: '/admin',
      color: 'from-rose-600 to-rose-700',
      accent: 'bg-rose-50 border-rose-200 text-rose-700',
    },
  ] : [];

  const visibleModules = allModules.filter(m => {
    // "Gestão de Negócios" é o hub: visível se o usuário tem QUALQUER submódulo dele
    // (derivado da PERMISSION_TREE — inclui submódulos futuros automaticamente).
    if (m.id === 'negocios') {
      return hasAnyChildPermission(user, 'Gestão de Negócios');
    }
    // "Indicadores" também é hub: visível se o usuário tem QUALQUER submódulo dele.
    if (m.id === 'indicadores') {
      return hasAnyChildPermission(user, 'Indicadores');
    }
    const key = m.id.toUpperCase() as keyof typeof MODULES;
    const perm = MODULES[key];
    return perm ? hasModulePermission(user, perm) : true;
  });

  const allItems = [...visibleModules, ...adminModules];

  const filteredItems = searchQuery
    ? allItems.filter(m =>
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allItems;


  return (
    <div className="flex min-h-screen w-full flex-col bg-[var(--background)]">

      {/* ── Main Content ── */}
      <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="max-w-7xl 2xl:max-w-[1600px] min-[1920px]:max-w-[1800px] mx-auto">

          {/* ── Welcome Banner ── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-6 sm:mb-8"
          >
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-700 via-blue-600 to-blue-500 p-5 sm:p-7 shadow-lg">
              {/* Decorative circles */}
              <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-white/10 pointer-events-none" />
              <div className="absolute -bottom-12 right-20 w-56 h-56 rounded-full bg-white/10 pointer-events-none" />

              <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="text-white/80 text-sm font-medium mb-1">
                    Bem-vindo de volta,
                  </p>
                  <h1 className="text-white font-bold text-xl sm:text-2xl lg:text-3xl tracking-tight">
                    {user?.name?.split(' ')[0] || 'Usuário'}
                  </h1>
                  <p className="text-white/70 text-sm mt-1 hidden sm:block">
                    OpenDesk — Sistema Integrado de Gestão Corporativa
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white/15 flex items-center justify-center">
                    <BarChart3 size={24} className="text-white" />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* ── Search ── */}
          <div className="relative mb-6 sm:mb-8 max-w-lg">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar módulo..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring transition-all"
            />
          </div>

          {/* ── Grid: Modules + Notices ── */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-8">

            {/* Modules */}
            <div className="xl:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Módulos
                </h2>
                <span className="text-xs text-muted-foreground">
                  {filteredItems.length} {filteredItems.length === 1 ? 'disponível' : 'disponíveis'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-3 2xl:grid-cols-4 gap-3 sm:gap-4">
                {filteredItems.map((item, index) => (
                  <motion.button
                    key={item.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05, duration: 0.3 }}
                    onClick={() => item.path !== '#' && setLocation(item.path)}
                    className="group relative flex flex-col items-start gap-3 p-4 rounded-xl border border-border bg-card hover:border-ring/40 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {/* Icon */}
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center text-white shadow-sm shrink-0`}>
                      {item.icon}
                    </div>

                    {/* Text */}
                    <div className="min-w-0 w-full">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {item.name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {item.description}
                      </p>
                    </div>

                    {/* Arrow */}
                    <ChevronRight
                      size={14}
                      className="absolute top-4 right-4 text-muted-foreground/40 group-hover:text-muted-foreground group-hover:translate-x-0.5 transition-all"
                    />
                  </motion.button>
                ))}

                {filteredItems.length === 0 && (
                  <div className="col-span-full py-10 text-center text-muted-foreground text-sm">
                    Nenhum módulo encontrado para "{searchQuery}".
                  </div>
                )}
              </div>
            </div>

            {/* Notices */}
            <div className="xl:col-span-1">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Avisos
                </h2>
                {announcements.length > 0 && (
                  <span className="text-xs bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
                    {announcements.length}
                  </span>
                )}
              </div>

              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <AnnouncementsList items={announcements} />
              </div>

              {/* Quick stats */}
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-border bg-card p-3 text-center">
                  <p className="text-2xl font-bold text-foreground">{allItems.length}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Módulos</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-3 text-center">
                  <p className="text-2xl font-bold text-foreground capitalize">
                    {user?.role === 'admin' ? 'Admin' : 'Usuário'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Perfil</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-border/50 px-4 sm:px-6 lg:px-8 py-3">
        <div className="max-w-7xl 2xl:max-w-[1600px] min-[1920px]:max-w-[1800px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>OpenDesk — Portal Corporativo</span>
          <span>© {new Date().getFullYear()} Todos os direitos reservados</span>
        </div>
      </footer>
    </div>
  );
}
