import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { ACTIONS, PERMISSION_TREE, collectLeafModules, type PermissionNode, type UserPermissions, type ModulePermissions } from '@shared/permissions';
import { Eye, Plus, Edit, Trash2 } from 'lucide-react';

interface PermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: number;
  userName: string;
  currentPermissions: any;
  userGroupId?: number | null;
  userGroupPermissions?: any;
}

// A estrutura (grupos + rótulos) vem de PERMISSION_TREE em @shared/permissions —
// fonte única, usada também para a visibilidade dos hubs na navegação.

const ACTION_LABELS: Record<string, { label: string; icon: any }> = {
  [ACTIONS.READ]: { label: 'Visualizar', icon: Eye },
  [ACTIONS.CREATE]: { label: 'Criar', icon: Plus },
  [ACTIONS.UPDATE]: { label: 'Editar', icon: Edit },
  [ACTIONS.DELETE]: { label: 'Excluir', icon: Trash2 },
};

function parsePermissions(permissions: any): UserPermissions {
  if (!permissions) return {};
  
  // If it's a JSON string, parse it
  if (typeof permissions === 'string') {
    try {
      permissions = JSON.parse(permissions);
    } catch {
      return {};
    }
  }
  
  // If it's an array (legacy format), convert to new format with full access
  if (Array.isArray(permissions)) {
    const result: any = {};
    for (const module of permissions) {
      result[module] = {
        create: true,
        read: true,
        update: true,
        delete: true,
      };
    }
    return result as UserPermissions;
  }
  
  // If it's an object with boolean values (semi-legacy), convert to granular
  if (typeof permissions === 'object') {
    const result: any = {};
    for (const [module, value] of Object.entries(permissions)) {
      if (typeof value === 'boolean') {
        result[module] = {
          create: value,
          read: value,
          update: value,
          delete: value,
        };
      } else if (typeof value === 'object' && value !== null) {
        result[module] = value as ModulePermissions;
      }
    }
    return result as UserPermissions;
  }
  
  return {};
}

export function PermissionsDialog({
  open,
  onOpenChange,
  userId,
  userName,
  currentPermissions,
}: PermissionsDialogProps) {
  const [permissions, setPermissions] = useState<UserPermissions>(() => 
    parsePermissions(currentPermissions)
  );
  const utils = trpc.useUtils();

  // Update permissions when dialog opens with new data
  useEffect(() => {
    if (open) {
      setPermissions(parsePermissions(currentPermissions));
    }
  }, [open, currentPermissions]);

  const updatePermissionsMutation = trpc.users.updatePermissions.useMutation({
    onSuccess: () => {
      toast.success('Permissões atualizadas com sucesso!');
      utils.userManagement.listAll.invalidate();
      utils.auth.me.invalidate();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleToggleAction = (module: string, action: string) => {
    setPermissions(prev => {
      const modulePerms = (prev as any)[module] || { create: false, read: false, update: false, delete: false };
      return {
        ...prev,
        [module]: {
          ...modulePerms,
          [action]: !modulePerms[action],
        },
      };
    });
  };

  const handleToggleModule = (module: string) => {
    const modulePerms = (permissions as any)[module];
    const hasAnyPermission = modulePerms && (modulePerms.create || modulePerms.read || modulePerms.update || modulePerms.delete);
    
    // If any permission is enabled, disable all; otherwise enable all
    setPermissions(prev => ({
      ...prev,
      [module]: {
        create: !hasAnyPermission,
        read: !hasAnyPermission,
        update: !hasAnyPermission,
        delete: !hasAnyPermission,
      },
    }));
  };

  const handleSave = () => {
    // Send granular CRUD permissions object
    updatePermissionsMutation.mutate({
      userId,
      permissions,
    });
  };

  const leafHasPerm = (module: string) => {
    const p = (permissions as any)[module];
    return !!(p && (p.create || p.read || p.update || p.delete));
  };

  // Estado de um grupo a partir das folhas (submódulos-gate).
  const groupState = (node: PermissionNode): "all" | "some" | "none" => {
    const leaves = collectLeafModules(node);
    const on = leaves.filter(leafHasPerm).length;
    if (on === 0) return "none";
    return on === leaves.length ? "all" : "some";
  };

  // Marca/desmarca TODAS as folhas de um grupo (full CRUD ao marcar).
  const toggleGroup = (node: PermissionNode) => {
    const leaves = collectLeafModules(node);
    const turnOff = groupState(node) === "all";
    setPermissions((prev) => {
      const next: any = { ...prev };
      for (const m of leaves) {
        next[m] = turnOff
          ? { create: false, read: false, update: false, delete: false }
          : { create: true, read: true, update: true, delete: true };
      }
      return next;
    });
  };

  const renderLeaf = (module: string, label: string) => {
    const modulePerms = (permissions as any)[module] || { create: false, read: false, update: false, delete: false };
    const hasAnyPermission = modulePerms.create || modulePerms.read || modulePerms.update || modulePerms.delete;
    return (
      <div key={module} className="bg-card rounded-lg p-4 space-y-3">
        <div className="flex items-center space-x-3">
          <Checkbox
            id={`module-${module}`}
            checked={hasAnyPermission}
            onCheckedChange={() => handleToggleModule(module)}
            className="border-blue-300"
          />
          <Label htmlFor={`module-${module}`} className="text-foreground font-semibold cursor-pointer text-base">
            {label}
          </Label>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pl-8">
          {Object.entries(ACTION_LABELS).map(([action, { label: actionLabel, icon: Icon }]) => (
            <div key={action} className="flex items-center space-x-2 p-2 bg-card rounded hover:bg-muted/50 transition-colors">
              <Checkbox
                id={`${module}-${action}`}
                checked={modulePerms[action as keyof ModulePermissions] || false}
                onCheckedChange={() => handleToggleAction(module, action)}
                className="border-blue-300"
              />
              <Label htmlFor={`${module}-${action}`} className="text-foreground cursor-pointer flex items-center gap-1.5 text-sm">
                <Icon className="w-3.5 h-3.5" />
                {actionLabel}
              </Label>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderNode = (node: PermissionNode, depth: number) => {
    if (node.module) return renderLeaf(node.module, node.label);
    const state = groupState(node);
    return (
      <div key={`grupo-${node.label}`} className="rounded-lg border border-border p-3 space-y-3">
        <div className="flex items-center space-x-3">
          <Checkbox
            checked={state === "all" ? true : state === "some" ? "indeterminate" : false}
            onCheckedChange={() => toggleGroup(node)}
            className="border-blue-300"
          />
          <Label className="text-foreground font-bold cursor-pointer text-lg" onClick={() => toggleGroup(node)}>
            {node.label}
          </Label>
          <span className="text-[11px] text-muted-foreground">(marca/desmarca todos os submódulos)</span>
        </div>
        <div className="pl-4 space-y-3 border-l border-border">
          {node.children!.map((child) => renderNode(child, depth + 1))}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border text-foreground max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">
            Gerenciar Permissões - {userName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            Selecione as ações específicas que este usuário pode realizar em cada módulo:
          </p>

          <div className="space-y-4">
            {PERMISSION_TREE.map((node) => renderNode(node, 0))}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="bg-transparent border-border text-foreground hover:bg-accent"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={updatePermissionsMutation.isPending}
              className="bg-primary text-primary-foreground font-semibold hover:opacity-90"
            >
              {updatePermissionsMutation.isPending ? 'Salvando...' : 'Salvar Permissões'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
