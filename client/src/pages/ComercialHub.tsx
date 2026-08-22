import { BarChart3, Building2, Send, Users2 } from 'lucide-react';
import ModuleHub from '@/components/templates/ModuleHub';
import type { SubmoduleConfig } from '@/components/templates/ModuleHub';

const submodules: SubmoduleConfig[] = [
  {
    id: 'analise',
    permissionKey: 'COMERCIAL',
    name: 'Análise Comercial',
    description: 'Análise de rejeições PDE, dados comerciais e importação de planilhas',
    icon: <BarChart3 size={24} />,
    path: '/comercial/analise',
    color: 'from-amber-500 to-amber-600',
  },
  {
    id: 'associativismo',
    permissionKey: 'COMERCIAL_ASSOCIATIVISMO',
    name: 'Associativismo',
    description: 'Concilia a planilha de CNPJs de um grupo com a base: quem cadastrar, remover e já está no grupo',
    icon: <Users2 size={24} />,
    path: '/comercial/associativismo',
    color: 'from-indigo-500 to-indigo-600',
  },
  {
    id: 'envio-parcial',
    permissionKey: 'ENVIO_PARCIAL',
    name: 'Envio de Parcial',
    description: 'Bot de WhatsApp que envia o painel de pedidos sem ST ao grupo comercial em horários agendados',
    icon: <Send size={24} />,
    path: '/comercial/envio-parcial',
    color: 'from-emerald-500 to-emerald-600',
  },
];

export default function ComercialHub() {
  return (
    <ModuleHub
      title="Comercial"
      subtitle="Selecione o módulo desejado"
      icon={<Building2 size={20} />}
      iconGradient="from-amber-500 to-amber-600"
      submodules={submodules}
      backPath="/negocios"
      backLabel="Gestão de Negócios"
    />
  );
}
