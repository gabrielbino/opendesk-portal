import { TrendingDown, PackageX, Timer, Boxes } from 'lucide-react';
import ModuleHub from '@/components/templates/ModuleHub';
import type { SubmoduleConfig } from '@/components/templates/ModuleHub';

const submodules: SubmoduleConfig[] = [
  {
    id: 'superestocados',
    permissionKey: 'SUPERESTOCADOS',
    name: 'Superestocados',
    description: 'Gestão de estoque excedente por região, análise de lotes e acompanhamento de vendas',
    icon: <TrendingDown size={24} />,
    path: '/superestocados',
    color: 'from-orange-500 to-orange-600',
  },
  {
    id: 'rupturas',
    permissionKey: 'RUPTURAS',
    name: 'Rupturas',
    description: 'Itens em ruptura por marca (zerados e abaixo de 7 dias de estoque)',
    icon: <PackageX size={24} />,
    path: '/rupturas',
    color: 'from-red-500 to-red-600',
  },
  {
    id: 'validades-curtas',
    permissionKey: 'VALIDADES_CURTAS',
    name: 'Validades Curtas',
    description: 'Itens com vencimento próximo e estoque parado — monitoramento por banda de risco',
    icon: <Timer size={24} />,
    path: '/validades-curtas',
    color: 'from-amber-500 to-amber-600',
  },
];

export default function EstoqueHub() {
  return (
    <ModuleHub
      title="Controle de Estoque"
      subtitle="Selecione o painel desejado"
      icon={<Boxes size={20} />}
      iconGradient="from-orange-500 to-red-600"
      submodules={submodules}
      backPath="/negocios"
      backLabel="Gestão de Negócios"
    />
  );
}
