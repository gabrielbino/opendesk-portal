import { BarChart3, TrendingUp, PieChart, Activity } from 'lucide-react';
import ModuleHub from '@/components/templates/ModuleHub';
import type { SubmoduleConfig } from '@/components/templates/ModuleHub';

const submodules: SubmoduleConfig[] = [
  {
    id: 'indicadores-cortes-bi',
    permissionKey: 'INDICADORES_CORTES_BI',
    name: 'Cortes',
    description: 'Análise detalhada de pedidos cortados',
    icon: <BarChart3 size={24} />,
    path: '/indicadores/cortes-bi',
    color: 'from-slate-700 to-slate-800',
  },
  {
    id: 'indicadores-vendas-bi',
    permissionKey: 'INDICADORES_VENDAS_BI',
    name: 'Áreas de Atuação',
    description: 'Análise por áreas de atuação',
    icon: <TrendingUp size={24} />,
    path: '/indicadores/vendas-bi',
    color: 'from-emerald-500 to-emerald-600',
  },
  {
    id: 'indicadores-iqvia-bi',
    permissionKey: 'INDICADORES_IQVIA_BI',
    name: 'IQVIA',
    description: 'Dados do mercado farmacêutico',
    icon: <Activity size={24} />,
    path: '/indicadores/iqvia-bi',
    color: 'from-violet-500 to-violet-600',
  },
];

export default function VisoesPowerBi() {
  return (
    <ModuleHub
      title="Visões Power BI"
      subtitle="Selecione o relatório desejado"
      icon={<PieChart size={20} />}
      iconGradient="from-rose-500 to-rose-600"
      submodules={submodules}
      backPath="/indicadores"
      backLabel="Indicadores"
    />
  );
}
