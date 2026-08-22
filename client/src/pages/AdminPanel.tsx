import { Settings, Users, Newspaper, HardDrive, Activity, Sliders, Bug, CreditCard } from "lucide-react";
import ModuleHub from "@/components/templates/ModuleHub";
import type { SubmoduleConfig } from "@/components/templates/ModuleHub";

const adminSubmodules: SubmoduleConfig[] = [
  {
    id: "saude",
    name: "Saúde do Sistema",
    description: "Monitoramento de performance, banco de dados, memória e validação de nomenclatura",
    icon: <Activity size={24} />,
    path: "/admin/saude",
    color: "from-emerald-500 to-emerald-600",
  },
  {
    id: "usuarios",
    name: "Usuários",
    description: "Aprovação de cadastros, gerenciamento de papéis e permissões de acesso",
    icon: <Users size={24} />,
    path: "/admin/usuarios",
    color: "from-violet-500 to-violet-600",
  },
  {
    id: "comunicados",
    name: "Comunicados",
    description: "Criação e gerenciamento de avisos exibidos no portal",
    icon: <Newspaper size={24} />,
    path: "/admin/comunicados",
    color: "from-blue-500 to-blue-600",
  },
  {
    id: "backups",
    name: "Backups",
    description: "Backups automáticos, restauração e sincronização com GitHub",
    icon: <HardDrive size={24} />,
    path: "/admin/backups",
    color: "from-amber-500 to-amber-600",
  },
  {
    id: "parametros",
    name: "Parâmetros",
    description: "Configurações e constantes do sistema editáveis em tempo real",
    icon: <Sliders size={24} />,
    path: "/admin/parametros",
    color: "from-slate-500 to-slate-600",
  },
  {
    id: "error-logs",
    name: "Logs de Erros",
    description: "Registro de falhas do sistema para análise e correção pela equipe de TI",
    icon: <Bug size={24} />,
    path: "/admin/logs",
    color: "from-red-500 to-red-600",
  },
  {
    id: "assinaturas",
    name: "Assinaturas e Licenças",
    description: "Gerenciamento de contratos, renovações, custos e alertas de vencimento",
    icon: <CreditCard size={24} />,
    path: "/admin/assinaturas",
    color: "from-indigo-500 to-indigo-600",
  },
];

export default function AdminPanel() {
  return (
    <ModuleHub
      title="Administração"
      subtitle="Gerenciamento centralizado do portal"
      icon={<Settings size={20} />}
      iconGradient="from-slate-600 to-slate-700"
      submodules={adminSubmodules}
      backPath="/dashboard"
      backLabel="Portal"
      adminOnly
    />
  );
}
