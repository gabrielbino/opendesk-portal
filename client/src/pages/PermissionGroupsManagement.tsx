import React, { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Shield, Plus, Pencil, Trash2, Users, ChevronRight, ChevronDown, Eye, Edit, PlusCircle, Trash, Search } from 'lucide-react';
import PanelHeader from '@/components/PanelHeader';
import { MODULES, ACTIONS, type ModulePermissions } from '@shared/permissions';
import { useLocation } from 'wouter';

/**
 * Tipo de permissões granulares por módulo
 */
type GranularPermissions = Record<string, ModulePermissions>;

interface PermissionGroupForm {
  name: string;
  description: string;
  permissions: GranularPermissions;
  isDefault: boolean;
}

/**
 * Hierarquia de módulos para exibição no card e no formulário.
 * Cada item pode ter children (sub-módulos).
 */
interface ModuleNode {
  key: string;
  label: string;
  description?: string;
  children?: ModuleNode[];
}

const MODULE_HIERARCHY: ModuleNode[] = [
  { key: MODULES.SUPORTE, label: 'Suporte', description: 'Help Desk e chamados internos' },
  { key: MODULES.DESENVOLVIMENTO, label: 'Desenvolvimento', description: 'Projetos, tarefas diárias e dashboard' },
  { key: MODULES.ALMOXARIFADO, label: 'Almoxarifado', description: 'Inventário de TI e requisições de compra' },
  {
    key: MODULES.GESTAO_NEGOCIOS,
    label: 'Gestão de Negócios',
    description: 'Módulo pai — acesso ao hub de negócios',
    children: [
      { key: MODULES.COMERCIAL, label: 'Comercial', description: 'Cotações, pedidos e operações comerciais' },
      { key: MODULES.SUPERESTOCADOS, label: 'Superestocados', description: 'Gestão de estoque excedente e campanhas' },
      {
        key: MODULES.CONTRATOS,
        label: 'Contratos',
        description: 'Gestão de contratos comerciais',
        children: [
          { key: MODULES.REPASSES, label: 'Repasses', description: 'Contratos de repasse e acordos' },
        ],
      },
    ],
  },
];

const ACTION_LABELS: Record<string, { label: string; icon: any; shortLabel: string }> = {
  [ACTIONS.READ]: { label: 'Visualizar', icon: Eye, shortLabel: 'Ler' },
  [ACTIONS.CREATE]: { label: 'Criar', icon: PlusCircle, shortLabel: 'Criar' },
  [ACTIONS.UPDATE]: { label: 'Editar', icon: Edit, shortLabel: 'Editar' },
  [ACTIONS.DELETE]: { label: 'Excluir', icon: Trash, shortLabel: 'Excluir' },
};

/** Flat labels for display in cards */
const MODULE_LABELS: Record<string, string> = {
  [MODULES.SUPORTE]: 'Suporte',
  [MODULES.DESENVOLVIMENTO]: 'Desenvolvimento',
  [MODULES.ALMOXARIFADO]: 'Almoxarifado',
  [MODULES.GESTAO_NEGOCIOS]: 'Gestão de Negócios',
  [MODULES.COMERCIAL]: 'Comercial',
  [MODULES.SUPERESTOCADOS]: 'Superestocados',
  [MODULES.CONTRATOS]: 'Contratos',
  [MODULES.REPASSES]: 'Repasses',
};

const DEFAULT_MODULE_PERMS: ModulePermissions = {
  create: false,
  read: false,
  update: false,
  delete: false,
};

const FULL_MODULE_PERMS: ModulePermissions = {
  create: true,
  read: true,
  update: true,
  delete: true,
};

/** Retorna todos os módulos-folha (que possuem key real no MODULES) */
function getAllModuleKeys(nodes: ModuleNode[]): string[] {
  const result: string[] = [];
  for (const node of nodes) {
    if (Object.values(MODULES).includes(node.key as any)) {
      result.push(node.key);
    }
    if (node.children) {
      result.push(...getAllModuleKeys(node.children));
    }
  }
  return result;
}

/** Verifica se um nó é um módulo real (existe no MODULES) */
function isRealModule(key: string): boolean {
  return Object.values(MODULES).includes(key as any);
}

/**
 * Normaliza permissões de qualquer formato (boolean legado ou granular) para o formato granular
 */
function normalizeToGranular(permissions: any): GranularPermissions {
  if (!permissions) return {};
  
  const parsed = typeof permissions === 'string' ? JSON.parse(permissions) : permissions;
  const result: GranularPermissions = {};
  
  for (const [key, value] of Object.entries(parsed)) {
    if (!isRealModule(key)) continue;
    
    if (typeof value === 'boolean') {
      result[key] = value ? { ...FULL_MODULE_PERMS } : { ...DEFAULT_MODULE_PERMS };
    } else if (typeof value === 'object' && value !== null) {
      const v = value as any;
      result[key] = {
        create: v.create === true,
        read: v.read === true,
        update: v.update === true,
        delete: v.delete === true,
      };
    }
  }
  
  return result;
}

/** Conta quantos módulos têm pelo menos uma permissão ativa */
function countActiveModules(permissions: GranularPermissions): number {
  return Object.values(permissions).filter(p => p.create || p.read || p.update || p.delete).length;
}

/** Conta total de ações ativas */
function countActiveActions(permissions: GranularPermissions): number {
  return Object.values(permissions).reduce((acc, p) => {
    return acc + (p.create ? 1 : 0) + (p.read ? 1 : 0) + (p.update ? 1 : 0) + (p.delete ? 1 : 0);
  }, 0);
}

export default function PermissionGroupsManagement() {
  const [, navigate] = useLocation();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [isUsersModalOpen, setIsUsersModalOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [usersSearchQuery, setUsersSearchQuery] = useState('');
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});

  const defaultPermissions: GranularPermissions = {};
  Object.values(MODULES).forEach(m => { defaultPermissions[m] = { ...DEFAULT_MODULE_PERMS }; });

  const [formData, setFormData] = useState<PermissionGroupForm>({
    name: '',
    description: '',
    permissions: { ...defaultPermissions },
    isDefault: false,
  });

  const { data: groups = [], refetch } = trpc.permissionGroups.list.useQuery();

  // Fetch users for selected group
  const { data: groupUsers = [] } = trpc.permissionGroups.getUsersByGroup.useQuery(
    { groupId: selectedGroupId || 0 },
    { enabled: !!selectedGroupId }
  );

  const createMutation = trpc.permissionGroups.create.useMutation();
  const updateMutation = trpc.permissionGroups.update.useMutation();
  const deleteMutation = trpc.permissionGroups.delete.useMutation();

  // Filter users based on search query
  const filteredUsers = groupUsers.filter((user: any) =>
    user.name?.toLowerCase().includes(usersSearchQuery.toLowerCase()) ||
    user.email?.toLowerCase().includes(usersSearchQuery.toLowerCase())
  );

  const handleOpenUsersModal = (groupId: number) => {
    setSelectedGroupId(groupId);
    setUsersSearchQuery('');
    setIsUsersModalOpen(true);
  };

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast.error('Nome do grupo é obrigatório');
      return;
    }

    try {
      await createMutation.mutateAsync({
        name: formData.name,
        description: formData.description,
        permissions: formData.permissions,
        isDefault: formData.isDefault,
      });
      toast.success('Grupo criado com sucesso');
      setIsCreateDialogOpen(false);
      resetForm();
      refetch();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao criar grupo');
    }
  };

  const handleEdit = async () => {
    if (!editingGroupId) return;
    if (!formData.name.trim()) {
      toast.error('Nome do grupo é obrigatório');
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id: editingGroupId,
        name: formData.name,
        description: formData.description,
        permissions: formData.permissions,
        isDefault: formData.isDefault,
      });
      toast.success('Grupo atualizado com sucesso');
      setIsEditDialogOpen(false);
      resetForm();
      refetch();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao atualizar grupo');
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Tem certeza que deseja excluir o grupo "${name}"? Os usuários com este grupo perderão a atribuição.`)) {
      return;
    }

    try {
      await deleteMutation.mutateAsync({ id });
      toast.success('Grupo excluído com sucesso');
      refetch();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao excluir grupo');
    }
  };

  const openEditDialog = (group: any) => {
    setEditingGroupId(group.id);
    const perms = normalizeToGranular(group.permissions);
    // Garantir que todos os módulos existam no objeto
    const fullPerms: GranularPermissions = {};
    Object.values(MODULES).forEach(m => {
      fullPerms[m] = perms[m] || { ...DEFAULT_MODULE_PERMS };
    });
    setFormData({
      name: group.name,
      description: group.description || '',
      permissions: fullPerms,
      isDefault: group.isDefault || false,
    });
    // Expandir módulos que têm permissões ativas
    const expanded: Record<string, boolean> = {};
    Object.entries(fullPerms).forEach(([key, p]) => {
      if (p.create || p.read || p.update || p.delete) {
        expanded[key] = true;
      }
    });
    setExpandedModules(expanded);
    setIsEditDialogOpen(true);
  };

  const resetForm = () => {
    const defaultPerms: GranularPermissions = {};
    Object.values(MODULES).forEach(m => { defaultPerms[m] = { ...DEFAULT_MODULE_PERMS }; });
    setFormData({
      name: '',
      description: '',
      permissions: defaultPerms,
      isDefault: false,
    });
    setEditingGroupId(null);
    setExpandedModules({});
  };

  /** Toggle uma ação específica de um módulo */
  const toggleAction = (module: string, action: string) => {
    setFormData(prev => {
      const modulePerms = prev.permissions[module] || { ...DEFAULT_MODULE_PERMS };
      return {
        ...prev,
        permissions: {
          ...prev.permissions,
          [module]: {
            ...modulePerms,
            [action]: !(modulePerms as any)[action],
          },
        },
      };
    });
  };

  /** Toggle todas as ações de um módulo */
  const toggleAllActions = (module: string) => {
    setFormData(prev => {
      const modulePerms = prev.permissions[module] || { ...DEFAULT_MODULE_PERMS };
      const hasAny = modulePerms.create || modulePerms.read || modulePerms.update || modulePerms.delete;
      return {
        ...prev,
        permissions: {
          ...prev.permissions,
          [module]: hasAny ? { ...DEFAULT_MODULE_PERMS } : { ...FULL_MODULE_PERMS },
        },
      };
    });
  };

  /** Toggle expandir/colapsar módulo no formulário */
  const toggleExpand = (module: string) => {
    setExpandedModules(prev => ({ ...prev, [module]: !prev[module] }));
  };

  /** Renderiza a hierarquia de módulos no card (somente leitura, compacto) */
  const renderCardPermissions = (permissions: GranularPermissions) => {
    const renderNodes = (nodes: ModuleNode[], indent: number = 0): React.ReactNode[] => {
      const elements: React.ReactNode[] = [];
      for (const node of nodes) {
        const modulePerms = permissions[node.key];
        const hasAny = modulePerms && (modulePerms.create || modulePerms.read || modulePerms.update || modulePerms.delete);
        
        if (node.children) {
          // Verificar se algum filho está ativo
          const childKeys = getAllModuleKeys(node.children);
          const anyChildActive = childKeys.some(k => {
            const p = permissions[k];
            return p && (p.create || p.read || p.update || p.delete);
          });
          const parentActive = hasAny || anyChildActive;

          elements.push(
            <div key={node.key} className="space-y-0.5">
              <div className="flex items-center gap-1.5 text-sm" style={{ paddingLeft: `${indent * 16}px` }}>
                <ChevronRight size={12} className="text-muted-foreground" />
                <span className={`font-medium ${parentActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {node.label}
                </span>
                {hasAny && (
                  <span className="text-xs text-muted-foreground ml-1">
                    ({[modulePerms.read && 'L', modulePerms.create && 'C', modulePerms.update && 'E', modulePerms.delete && 'X'].filter(Boolean).join('')})
                  </span>
                )}
              </div>
              {renderNodes(node.children, indent + 1)}
            </div>
          );
        } else {
          const activeActions = modulePerms
            ? [modulePerms.read && 'L', modulePerms.create && 'C', modulePerms.update && 'E', modulePerms.delete && 'X'].filter(Boolean)
            : [];
          
          elements.push(
            <div key={node.key} className="flex items-center gap-2 text-sm" style={{ paddingLeft: `${indent * 16}px` }}>
              <div className={`w-2 h-2 rounded-full ${hasAny ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
              <span className={hasAny ? 'text-foreground' : 'text-muted-foreground'}>
                {node.label}
              </span>
              {activeActions.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  ({activeActions.join('')})
                </span>
              )}
            </div>
          );
        }
      }
      return elements;
    };

    return renderNodes(MODULE_HIERARCHY);
  };

  /** Renderiza a hierarquia de módulos no formulário (checkboxes granulares) */
  const renderFormPermissions = (prefix: string) => {
    const renderNodes = (nodes: ModuleNode[], indent: number = 0): React.ReactNode[] => {
      const elements: React.ReactNode[] = [];
      for (const node of nodes) {
        const modulePerms = formData.permissions[node.key] || { ...DEFAULT_MODULE_PERMS };
        const hasAny = modulePerms.create || modulePerms.read || modulePerms.update || modulePerms.delete;
        const isExpanded = expandedModules[node.key] || false;
        const activeCount = Object.values(modulePerms).filter(Boolean).length;

        if (node.children && isRealModule(node.key)) {
          // Módulo pai com filhos E que é um módulo real
          elements.push(
            <div key={node.key} className="space-y-1" style={{ marginLeft: indent > 0 ? '1rem' : undefined }}>
              <div className={`rounded-md border transition-colors ${
                hasAny ? 'border-primary/30 bg-primary/5' : 'border-border/50 bg-transparent'
              }`}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleExpand(node.key)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(node.key); } }}
                  className="flex items-center w-full gap-2 px-3 py-2.5 cursor-pointer hover:bg-muted/30 rounded-md transition-colors"
                >
                  <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                    <Checkbox
                      id={`${prefix}-module-${node.key}`}
                      checked={hasAny}
                      onCheckedChange={() => toggleAllActions(node.key)}
                    />
                  </span>
                  {isExpanded ? <ChevronDown size={14} className="text-muted-foreground shrink-0" /> : <ChevronRight size={14} className="text-muted-foreground shrink-0" />}
                  <span className="text-sm font-medium text-foreground flex-1 text-left truncate">
                    {node.label}
                  </span>
                  {hasAny && (
                    <span className="text-[10px] text-primary font-medium shrink-0">
                      {activeCount}/4
                    </span>
                  )}
                </div>
                {isExpanded && (
                  <div className="px-3 pb-2.5 pt-0">
                    {node.description && (
                      <p className="text-xs text-muted-foreground mb-2 ml-9">{node.description}</p>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 ml-9">
                      {Object.entries(ACTION_LABELS).map(([action, { shortLabel, icon: Icon }]) => (
                        <label
                          key={action}
                          htmlFor={`${prefix}-${node.key}-${action}`}
                          className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer text-xs transition-colors ${
                            (modulePerms as any)[action] ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted/50 text-muted-foreground'
                          }`}
                        >
                          <Checkbox
                            id={`${prefix}-${node.key}-${action}`}
                            checked={(modulePerms as any)[action] || false}
                            onCheckedChange={() => toggleAction(node.key, action)}
                            className="h-3.5 w-3.5"
                          />
                          <Icon size={11} />
                          {shortLabel}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {renderNodes(node.children, indent + 1)}
            </div>
          );
        } else if (node.children) {
          // Grupo organizacional sem módulo real
          elements.push(
            <div key={node.key} className="space-y-1" style={{ marginLeft: indent > 0 ? '1rem' : undefined }}>
              <div className="flex items-center gap-1.5 px-3 py-1.5">
                <ChevronRight size={14} className="text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">{node.label}</span>
              </div>
              {renderNodes(node.children, indent + 1)}
            </div>
          );
        } else {
          // Módulo folha (sem filhos)
          elements.push(
            <div key={node.key} className="space-y-1" style={{ marginLeft: indent > 0 ? '1rem' : undefined }}>
              <div className={`rounded-md border transition-colors ${
                hasAny ? 'border-primary/30 bg-primary/5' : 'border-border/50 bg-transparent'
              }`}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleExpand(node.key)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(node.key); } }}
                  className="flex items-center w-full gap-2 px-3 py-2.5 cursor-pointer hover:bg-muted/30 rounded-md transition-colors"
                >
                  <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                    <Checkbox
                      id={`${prefix}-module-${node.key}`}
                      checked={hasAny}
                      onCheckedChange={() => toggleAllActions(node.key)}
                    />
                  </span>
                  {isExpanded ? <ChevronDown size={14} className="text-muted-foreground shrink-0" /> : <ChevronRight size={14} className="text-muted-foreground shrink-0" />}
                  <span className="text-sm font-medium text-foreground flex-1 text-left truncate">
                    {node.label}
                  </span>
                  {hasAny && (
                    <span className="text-[10px] text-primary font-medium shrink-0">
                      {activeCount}/4
                    </span>
                  )}
                </div>
                {isExpanded && (
                  <div className="px-3 pb-2.5 pt-0">
                    {node.description && (
                      <p className="text-xs text-muted-foreground mb-2 ml-9">{node.description}</p>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 ml-9">
                      {Object.entries(ACTION_LABELS).map(([action, { shortLabel, icon: Icon }]) => (
                        <label
                          key={action}
                          htmlFor={`${prefix}-${node.key}-${action}`}
                          className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer text-xs transition-colors ${
                            (modulePerms as any)[action] ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted/50 text-muted-foreground'
                          }`}
                        >
                          <Checkbox
                            id={`${prefix}-${node.key}-${action}`}
                            checked={(modulePerms as any)[action] || false}
                            onCheckedChange={() => toggleAction(node.key, action)}
                            className="h-3.5 w-3.5"
                          />
                          <Icon size={11} />
                          {shortLabel}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        }
      }
      return elements;
    };

    return renderNodes(MODULE_HIERARCHY);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl 2xl:max-w-[1600px] min-[1920px]:max-w-[1800px] min-[2560px]:max-w-[2200px] space-y-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <PanelHeader
          onBack={() => navigate('/admin/usuarios')}
          backLabel="Usuários"
          icon={Shield}
          title="Grupos de Permissões"
          subtitle="Gerencie perfis de acesso com permissões granulares"
          color="indigo"
          actions={
            <Button
              size="sm"
              className="shrink-0 gap-1.5 text-xs"
              onClick={() => {
                resetForm();
                setIsCreateDialogOpen(true);
              }}
            >
              <Plus size={14} />
              <span className="hidden sm:inline">Novo Grupo</span>
              <span className="sm:hidden">Novo</span>
            </Button>
          }
        />

        {/* Legend */}
        <div className="mb-6 flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 sm:px-4 py-2 border border-border/50">
          <span className="font-medium">Legenda:</span>
          <span>L = Ler</span>
          <span>C = Criar</span>
          <span>E = Editar</span>
          <span>X = Excluir</span>
        </div>

        {/* Groups Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((group: any) => {
            const permissions = normalizeToGranular(group.permissions);
            const moduleCount = countActiveModules(permissions);
            const actionCount = countActiveActions(permissions);
            const userCount = group.userCount ?? 0;

            return (
              <Card key={group.id} className="bg-card hover:shadow-lg transition-shadow">
                <CardHeader className="p-4 pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-foreground flex items-center gap-2 text-base">
                        <Shield size={18} />
                        {group.name}
                      </CardTitle>
                      {group.description && (
                        <CardDescription className="mt-1">
                          {group.description}
                        </CardDescription>
                      )}
                    </div>
                    {group.isDefault && (
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-medium">
                        Padrão
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="space-y-3">
                    {/* User Count & Permission Count */}
                    <div className="space-y-2">
                      <button
                        onClick={() => handleOpenUsersModal(group.id)}
                        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary hover:underline cursor-pointer transition-colors"
                      >
                        <Users size={16} />
                        <span>{userCount} usuário{userCount !== 1 ? 's' : ''}</span>
                      </button>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Shield size={16} />
                        <span>{moduleCount} módulo{moduleCount !== 1 ? 's' : ''} · {actionCount} aç{actionCount !== 1 ? 'ões' : 'ão'}</span>
                      </div>
                    </div>

                    {/* Permission Hierarchy */}
                    <div className="space-y-1">
                      {renderCardPermissions(permissions)}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-3 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(group)}
                        className="flex-1"
                      >
                        <Pencil size={14} className="mr-1" />
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(group.id, group.name)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {groups.length === 0 && (
            <div className="col-span-full text-center py-12">
              <Shield size={48} className="mx-auto text-muted-foreground/70 mb-4" />
              <p className="text-muted-foreground text-lg">Nenhum grupo criado ainda</p>
              <p className="text-muted-foreground/70 text-sm mt-2">Crie grupos para facilitar o gerenciamento de permissões</p>
            </div>
          )}
        </div>

        {/* Create Dialog */}
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent className="bg-card border-border text-foreground w-full max-w-[calc(100%-2rem)] sm:max-w-2xl lg:max-w-3xl !p-0 !gap-0 max-h-[90vh] sm:max-h-[85vh] !grid-rows-[auto_auto_1fr_auto_auto] !grid">
            {/* Modal Header */}
            <div className="px-4 sm:px-6 pt-5 pb-4">
              <DialogHeader>
                <DialogTitle className="text-lg font-semibold">Criar Novo Grupo</DialogTitle>
                <DialogDescription className="text-xs sm:text-sm mt-0.5">
                  Defina permissões granulares por módulo
                </DialogDescription>
              </DialogHeader>
            </div>

            <Separator />

            {/* Modal Body - Scrollable */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="px-4 sm:px-6 py-4 space-y-5">
                {/* Nome e Descrição */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-foreground text-sm font-medium">Nome do Grupo *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Ex: Suporte, Gerente, Trade"
                      className="bg-background border-border"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description" className="text-foreground text-sm font-medium">Descrição</Label>
                    <Input
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Propósito deste grupo"
                      className="bg-background border-border"
                    />
                  </div>
                </div>

                {/* Permissões */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-foreground text-sm font-medium">Permissões de Módulos</Label>
                    <Badge variant="secondary" className="text-xs">
                      {countActiveActions(formData.permissions)} aç{countActiveActions(formData.permissions) !== 1 ? 'ões' : 'ão'} ativa{countActiveActions(formData.permissions) !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Clique no checkbox para ativar/desativar todas as ações. Expanda para configurar individualmente.
                  </p>
                  <div className="space-y-2 border border-border rounded-lg p-3 sm:p-4 bg-muted/20">
                    {renderFormPermissions('create')}
                  </div>
                </div>

                {/* Grupo padrão */}
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
                  <Checkbox
                    id="isDefault"
                    checked={formData.isDefault}
                    onCheckedChange={(checked) => setFormData({ ...formData, isDefault: checked as boolean })}
                    className="mt-0.5"
                  />
                  <div>
                    <label
                      htmlFor="isDefault"
                      className="text-sm font-medium leading-none cursor-pointer"
                    >
                      Grupo padrão
                    </label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Atribuído automaticamente a novos usuários
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Modal Footer */}
            <div className="flex-shrink-0 px-4 sm:px-6 py-4">
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                  className="bg-transparent border-border text-foreground hover:bg-accent"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={createMutation.isPending}
                  className="bg-primary text-primary-foreground font-semibold hover:opacity-90"
                >
                  {createMutation.isPending ? 'Criando...' : 'Criar Grupo'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="bg-card border-border text-foreground w-full max-w-[calc(100%-2rem)] sm:max-w-2xl lg:max-w-3xl !p-0 !gap-0 max-h-[90vh] sm:max-h-[85vh] !grid-rows-[auto_auto_1fr_auto_auto] !grid">
            {/* Modal Header */}
            <div className="px-4 sm:px-6 pt-5 pb-4">
              <DialogHeader>
                <DialogTitle className="text-lg font-semibold">Editar Grupo</DialogTitle>
                <DialogDescription className="text-xs sm:text-sm mt-0.5">
                  Alterações sincronizam para todos os usuários deste grupo
                </DialogDescription>
              </DialogHeader>
            </div>

            <Separator />

            {/* Modal Body - Scrollable */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="px-4 sm:px-6 py-4 space-y-5">
                {/* Nome e Descrição */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-name" className="text-foreground text-sm font-medium">Nome do Grupo *</Label>
                    <Input
                      id="edit-name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Ex: Suporte, Gerente, Trade"
                      className="bg-background border-border"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-description" className="text-foreground text-sm font-medium">Descrição</Label>
                    <Input
                      id="edit-description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Propósito deste grupo"
                      className="bg-background border-border"
                    />
                  </div>
                </div>

                {/* Permissões */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-foreground text-sm font-medium">Permissões de Módulos</Label>
                    <Badge variant="secondary" className="text-xs">
                      {countActiveActions(formData.permissions)} aç{countActiveActions(formData.permissions) !== 1 ? 'ões' : 'ão'} ativa{countActiveActions(formData.permissions) !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Clique no checkbox para ativar/desativar todas as ações. Expanda para configurar individualmente.
                  </p>
                  <div className="space-y-2 border border-border rounded-lg p-3 sm:p-4 bg-muted/20">
                    {renderFormPermissions('edit')}
                  </div>
                </div>

                {/* Grupo padrão */}
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
                  <Checkbox
                    id="edit-isDefault"
                    checked={formData.isDefault}
                    onCheckedChange={(checked) => setFormData({ ...formData, isDefault: checked as boolean })}
                    className="mt-0.5"
                  />
                  <div>
                    <label
                      htmlFor="edit-isDefault"
                      className="text-sm font-medium leading-none cursor-pointer"
                    >
                      Grupo padrão
                    </label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Atribuído automaticamente a novos usuários
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Modal Footer */}
            <div className="flex-shrink-0 px-4 sm:px-6 py-4">
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsEditDialogOpen(false)}
                  className="bg-transparent border-border text-foreground hover:bg-accent"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleEdit}
                  disabled={updateMutation.isPending}
                  className="bg-primary text-primary-foreground font-semibold hover:opacity-90"
                >
                  {updateMutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Users Modal */}
        <Dialog open={isUsersModalOpen} onOpenChange={setIsUsersModalOpen}>
          <DialogContent className="bg-card border-border text-foreground w-full max-w-[calc(100%-2rem)] sm:max-w-lg p-0 gap-0 max-h-[90vh] sm:max-h-[80vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex-shrink-0 px-4 sm:px-6 pt-5 pb-4">
              <DialogHeader>
                <DialogTitle className="text-lg font-semibold">
                  Usuários — {groups.find((g: any) => g.id === selectedGroupId)?.name}
                </DialogTitle>
                <DialogDescription className="text-xs sm:text-sm mt-0.5">
                  {filteredUsers.length} usuário{filteredUsers.length !== 1 ? 's' : ''} vinculado{filteredUsers.length !== 1 ? 's' : ''}
                </DialogDescription>
              </DialogHeader>
            </div>

            <Separator />

            {/* Search */}
            <div className="flex-shrink-0 px-4 sm:px-6 py-3">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou email..."
                  value={usersSearchQuery}
                  onChange={(e) => setUsersSearchQuery(e.target.value)}
                  className="pl-9 bg-background border-border"
                />
              </div>
            </div>

            {/* User List - Scrollable */}
            <ScrollArea className="flex-1 min-h-0">
              <div className="px-4 sm:px-6 pb-4 space-y-2">
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((user: any) => (
                    <div
                      key={user.id}
                      className="p-3 bg-muted/30 rounded-lg border border-border/50 hover:bg-muted/50 transition-colors"
                    >
                      <p className="font-medium text-sm text-foreground">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                      {user.department && (
                        <p className="text-xs text-muted-foreground mt-1">Departamento: {user.department}</p>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-10">
                    <Users size={32} className="mx-auto text-muted-foreground/50 mb-3" />
                    <p className="text-sm text-muted-foreground">
                      {usersSearchQuery
                        ? 'Nenhum usuário encontrado com esses critérios'
                        : 'Nenhum usuário vinculado a este grupo'}
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>

            <Separator />

            {/* Modal Footer */}
            <div className="flex-shrink-0 px-4 sm:px-6 py-4">
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={() => setIsUsersModalOpen(false)}
                  className="bg-transparent border-border text-foreground hover:bg-accent"
                >
                  Fechar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
