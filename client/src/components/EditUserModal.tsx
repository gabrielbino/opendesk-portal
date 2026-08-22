import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus } from "lucide-react";

interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: {
    id: number;
    name: string;
    email: string;
    departmentId?: number | null;
  };
  onSuccess?: () => void;
}

export function EditUserModal({
  isOpen,
  onClose,
  user,
  onSuccess,
}: EditUserModalProps) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [departmentId, setDepartmentId] = useState<number | null | undefined>(user.departmentId);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showNewDepartment, setShowNewDepartment] = useState(false);
  const [newDepartmentName, setNewDepartmentName] = useState('');

  const utils = trpc.useUtils();
  const { data: departments } = trpc.departments.list.useQuery();
  const updateUserMutation = trpc.userManagement.updateUser.useMutation();
  const resetPasswordMutation = trpc.userManagement.resetPassword.useMutation();
  const assignDepartmentMutation = trpc.departments.assignToUser.useMutation();
  const createDepartmentMutation = trpc.departments.create.useMutation({
    onSuccess: (newDept) => {
      toast.success('Setor criado com sucesso!');
      utils.departments.list.invalidate();
      if (newDept) {
        setDepartmentId(newDept.id);
        assignDepartmentMutation.mutate({
          userId: user.id,
          departmentId: newDept.id,
        });
      }
      setShowNewDepartment(false);
      setNewDepartmentName('');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao criar setor');
    },
  });

  const handleUpdateUser = async () => {
    if (!name.trim() || !email.trim()) {
      toast.error("Nome e email são obrigatórios");
      return;
    }

    setIsLoading(true);
    try {
      await updateUserMutation.mutateAsync({
        userId: user.id,
        name: name !== user.name ? name : undefined,
        email: email !== user.email ? email : undefined,
      });
      toast.success("Usuário atualizado com sucesso");
      onSuccess?.();
      onClose();
    } catch (error: any) {
      toast.error(error.message || "Erro ao atualizar usuário");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || !confirmPassword) {
      toast.error("Preencha os campos de senha");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("As senhas não conferem");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("A senha deve ter no mínimo 6 caracteres");
      return;
    }

    setIsLoading(true);
    try {
      await resetPasswordMutation.mutateAsync({
        userId: user.id,
        newPassword,
      });
      toast.success("Senha redefinida com sucesso");
      setNewPassword("");
      setConfirmPassword("");
      onSuccess?.();
    } catch (error: any) {
      toast.error(error.message || "Erro ao redefinir senha");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Usuário</DialogTitle>
          <DialogDescription>
            Atualize as informações do usuário {user.name}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="info" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="info">Informações</TabsTrigger>
            <TabsTrigger value="password">Senha</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="space-y-4 mt-4">
            <div>
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome do usuário"
              />
            </div>

            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
              />
            </div>

            <div>
              <Label htmlFor="department">Setor</Label>
              {showNewDepartment ? (
                <div className="flex gap-2">
                  <Input
                    value={newDepartmentName}
                    onChange={(e) => setNewDepartmentName(e.target.value)}
                    placeholder="Nome do setor"
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
                  >
                    ✕
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Select
                    value={departmentId?.toString() || "none"}
                    onValueChange={async (value) => {
                      const newDeptId = value === "none" ? null : parseInt(value);
                      setDepartmentId(newDeptId);
                      try {
                        await assignDepartmentMutation.mutateAsync({
                          userId: user.id,
                          departmentId: newDeptId,
                        });
                        toast.success("Setor atualizado com sucesso");
                        onSuccess?.();
                      } catch (error: any) {
                        toast.error(error.message || "Erro ao atualizar setor");
                      }
                    }}
                  >
                    <SelectTrigger>
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
                    variant="outline"
                    title="Criar novo setor"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={onClose}
                disabled={isLoading}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleUpdateUser}
                disabled={isLoading}
                className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600"
              >
                {isLoading ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="password" className="space-y-4 mt-4">
            <div>
              <Label htmlFor="newPassword">Nova Senha</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
              />
            </div>

            <div>
              <Label htmlFor="confirmPassword">Confirmar Senha</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirme a nova senha"
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={onClose}
                disabled={isLoading}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleResetPassword}
                disabled={isLoading}
                className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600"
              >
                {isLoading ? "Redefinindo..." : "Redefinir Senha"}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
