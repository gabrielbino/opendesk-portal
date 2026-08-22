import { LayoutDashboard, ShoppingCart, PieChart, FolderClock } from 'lucide-react';
import ModuleHub from '@/components/templates/ModuleHub';
import type { SubmoduleConfig } from '@/components/templates/ModuleHub';

const submodules: SubmoduleConfig[] = [
  {
    id: 'indicadores-pedidos-layout',
    permissionKey: 'INDICADORES_PEDIDOS_LAYOUT',
    name: 'Pedidos por Layout',
    description: 'Pedidos do dia por layout',
    icon: <ShoppingCart size={24} />,
    path: '/indicadores/pedidos-layout',
    color: 'from-indigo-500 to-indigo-600',
  },
  {
    id: 'indicadores-monitor-pedidos',
    permissionKey: 'INDICADORES_MONITOR_ARQUIVOS',
    name: 'Monitor de Integrações',
    description: 'Acompanhamento de pedidos e listas',
    icon: <FolderClock size={24} />,
    path: '/indicadores/monitor-pedidos',
    color: 'from-emerald-500 to-emerald-600',
  },
  {
    id: 'indicadores-visoes-bi',
    // Sub-hub (Cortes + Áreas de Atuação + futuros): visibilidade derivada da PERMISSION_TREE.
    hubGroup: 'Visões Power BI',
    name: 'Visões Power BI',
    description: 'Relatórios Power BI embarcados',
    icon: <PieChart size={24} />,
    path: '/indicadores/visoes-bi',
    color: 'from-rose-500 to-rose-600',
  },
];

export default function Indicadores() {
  return (
    <ModuleHub
      title="Indicadores"
      subtitle="Selecione o painel desejado"
      icon={<LayoutDashboard size={20} />}
      iconGradient="from-slate-700 to-slate-800"
      submodules={submodules}
      backPath="/dashboard"
      backLabel="Portal"
    />
  );
}
