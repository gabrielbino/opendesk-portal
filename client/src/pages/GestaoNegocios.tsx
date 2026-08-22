import { Building2, FileSignature, Briefcase, Fish, Tv, Users, Boxes } from 'lucide-react';
import ModuleHub from '@/components/templates/ModuleHub';
import type { SubmoduleConfig } from '@/components/templates/ModuleHub';

const submodules: SubmoduleConfig[] = [
  {
    id: 'estoque',
    // Sub-hub (Superestocados + Rupturas + Validades Curtas): visibilidade derivada da PERMISSION_TREE.
    hubGroup: 'Controle de Estoque',
    name: 'Controle de Estoque',
    description: 'Monitoramento de estoque por região',
    icon: <Boxes size={24} />,
    path: '/negocios/estoque',
    color: 'from-orange-500 to-red-600',
  },
  {
    id: 'comercial',
    // Hub (Análise Comercial + Envio de Parcial): visibilidade derivada da PERMISSION_TREE.
    hubGroup: 'Comercial',
    name: 'Comercial',
    description: 'Análise comercial e envio de parcial (bot WhatsApp)',
    icon: <Building2 size={24} />,
    path: '/comercial',
    color: 'from-amber-500 to-amber-600',
  },
  {
    id: 'contratos',
    // Hub (Repasses + futuros submódulos): visibilidade derivada da PERMISSION_TREE.
    hubGroup: 'Contratos',
    name: 'Contratos',
    description: 'Repasses e demais contratos comerciais com parceiros',
    icon: <FileSignature size={24} />,
    path: '/contratos',
    color: 'from-sky-600 to-sky-700',
  },
  {
    id: 'compradores',
    permissionKey: 'COMPRADORES',
    name: 'Compradores',
    description: 'Cadastro de compradores e vínculo de marcas (base para o foco por comprador nos painéis)',
    icon: <Users size={24} />,
    path: '/compradores',
    color: 'from-teal-500 to-teal-600',
  },
  {
    id: 'monitor-tv',
    permissionKey: 'MONITOR_TV',
    name: 'Monitor TV',
    description: 'Playlists de rotação dos painéis modo TV para o monitor do comercial',
    icon: <Tv size={24} />,
    path: '/monitor/playlists',
    color: 'from-violet-500 to-violet-600',
  },
  {
    id: 'pescador',
    permissionKey: 'PESCADOR',
    name: 'Pescador',
    description: 'Painel comercial Clamed SC: triagem de produtos, pedidos eletrônicos e histórico de preço',
    icon: <Fish size={24} />,
    path: '/pescador',
    color: 'from-blue-500 to-cyan-600',
  },
];

export default function GestaoNegocios() {
  return (
    <ModuleHub
      title="Gestão de Negócios"
      subtitle="Selecione o módulo desejado"
      icon={<Briefcase size={20} />}
      iconGradient="from-indigo-600 to-indigo-700"
      submodules={submodules}
      backPath="/dashboard"
      backLabel="Portal"
    />
  );
}
