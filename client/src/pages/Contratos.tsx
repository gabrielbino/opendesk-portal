import { FileSignature, Handshake } from 'lucide-react';
import ModuleHub from '@/components/templates/ModuleHub';
import type { SubmoduleConfig } from '@/components/templates/ModuleHub';

const submodules: SubmoduleConfig[] = [
  {
    id: 'repasses',
    permissionKey: 'REPASSES',
    name: 'Repasses',
    description:
      'Contratos de repasse com farmácias e associativismos. Upload de PDF com extração por IA e curadoria humana.',
    icon: <Handshake size={24} />,
    path: '/contratos/repasses',
    color: 'from-sky-500 to-sky-600',
  },
];

export default function Contratos() {
  return (
    <ModuleHub
      title="Contratos"
      subtitle="Selecione o submódulo desejado"
      icon={<FileSignature size={20} />}
      iconGradient="from-sky-600 to-sky-700"
      submodules={submodules}
      backPath="/negocios"
      backLabel="Gestão de Negócios"
    />
  );
}
