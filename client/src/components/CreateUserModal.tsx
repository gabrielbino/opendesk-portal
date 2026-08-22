import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';

interface CreateUserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateUserModal({ open, onOpenChange }: CreateUserModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    departmentId: undefined as number | undefined,
    groupId: undefined as number | undefined,
    role: 'user' as 'admin' | 'user',
  });
  const [showNewDepartment, setShowNewDepartment] = useState(false);
  const [newDepartmentName, setNewDepartmentName] = useState('');

  const utils = trpc.useUtils();
  const { data: departments } = trpc.departments.list.useQuery();
  const { data: groups } = trpc.permissionGroups.list.useQuery();

  const createDepartmentMutation = trpc.departments.create.useMutation({
    onSuccess: (newDept) => {
      toast.success('Setor criado com sucesso!');
      utils.departments.list.invalidate();
      if (newDept) {
        setFormData({ ...formData, departmentId: newDept.id });
      }
      setShowNewDepartment(false);
      setNewDepartmentName('');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao criar setor');
    },
  });

  const createUserMutation = trpc.userManagement.createUser.useMutation({
    onSuccess: () => {
      toast.success('Usuário criado com sucesso!');
      utils.userManagement.listAll.invalidate();
      onOpenChange(false);
      setFormData({
        name: '',
        email: '',
        password: '',
        departmentId: undefined,
        groupId: undefined,
        role: 'user',
      });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao criar usuário');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.email || !formData.password) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    if (formData.password.length < 6) {
      toast.error('A senha deve ter no mínimo 6 caracteres');
      return;
    }

    createUserMutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border text-foreground max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">
            Criar Novo Usuário
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-foreground">
              Nome Completo *
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Digite o nome completo"
              className="bg-background border-border text-foreground placeholder:text-muted-foreground"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="text-foreground">
              Email *
            </Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="usuario@exemplo.com"
              className="bg-background border-border text-foreground placeholder:text-muted-foreground"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-foreground">
              Senha *
            </Label>
            <Input
              id="password"
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="Mínimo 6 caracteres"
              className="bg-background border-border text-foreground placeholder:text-muted-foreground"
              minLength={6}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="department" className="text-foreground">
                Setor (opcional)
              </Label>
              {showNewDepartment ? (
                <div className="flex gap-2">
                  <Input
                    value={newDepartmentName}
                    onChange={(e) => setNewDepartmentName(e.target.value)}
                    placeholder="Nome do setor"
                    className="bg-background border-border text-foreground placeholder:text-muted-foreground"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (newDepartmentName.trim()) {
                          createDepartmentMutation.mutate({ name: newDepartmentName.trim() });
                        }
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      if (newDepartmentName.trim()) {
                        createDepartmentMutation.mutate({ name: newDepartmentName.trim() });
                      }
                    }}
                    disabled={createDepartmentMutation.isPending}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    ✓
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setShowNewDepartment(false);
                      setNewDepartmentName('');
                    }}
                    className="bg-transparent border-border text-foreground hover:bg-accent"
                  >
                    ✕
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Select
                    value={formData.departmentId?.toString() || "none"}
                    onValueChange={(value) => setFormData({ ...formData, departmentId: value === "none" ? undefined : parseInt(value) })}
                  >
                    <SelectTrigger className="bg-background border-border text-foreground">
                      <SelectValue placeholder="Selecione um setor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem setor</SelectItem>
                      {departments?.map((dept) => (
                        <SelectItem key={dept.id} value={dept.id.toString()}>
                          {dept.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setShowNewDepartment(true)}
                    className="bg-muted hover:bg-accent text-foreground border-border"
                    title="Criar novo setor"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="group" className="text-foreground">
                Grupo de Permissões (opcional)
              </Label>
              <Select
                value={formData.groupId?.toString() || "none"}
                onValueChange={(value) => setFormData({ ...formData, groupId: value === "none" ? undefined : parseInt(value) })}
              >
                <SelectTrigger className="bg-background border-border text-foreground">
                  <SelectValue placeholder="Selecione um grupo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem grupo</SelectItem>
                  {groups?.map((group) => (
                    <SelectItem key={group.id} value={group.id.toString()}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="role" className="text-foreground">
              Papel
            </Label>
            <Select
              value={formData.role}
              onValueChange={(value: any) => setFormData({ ...formData, role: value })}
            >
              <SelectTrigger className="bg-background border-border text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">Usuário</SelectItem>
                <SelectItem value="admin">Administrador</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="bg-transparent border-border text-foreground hover:bg-accent"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={createUserMutation.isPending}
              className="bg-primary text-primary-foreground font-semibold hover:opacity-90"
            >
              {createUserMutation.isPending ? 'Criando...' : 'Criar Usuário'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
