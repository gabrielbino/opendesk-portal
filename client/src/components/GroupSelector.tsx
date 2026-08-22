import { trpc } from '@/lib/trpc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

interface GroupSelectorProps {
  userId: number;
  currentGroupId?: number | null;
}

export function GroupSelector({ userId, currentGroupId }: GroupSelectorProps) {
  const { data: groups = [] } = trpc.permissionGroups.list.useQuery();
  const utils = trpc.useUtils();
  
  const assignGroupMutation = trpc.users.assignGroup.useMutation({
    onSuccess: () => {
      toast.success('Grupo atribuído com sucesso');
      utils.userManagement.listAll.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || 'Erro ao atribuir grupo');
    },
  });

  const handleGroupChange = (value: string) => {
    const groupId = value === 'none' ? null : parseInt(value);
    assignGroupMutation.mutate({ userId, groupId });
  };

  return (
    <Select
      value={currentGroupId?.toString() || 'none'}
      onValueChange={handleGroupChange}
      disabled={assignGroupMutation.isPending}
    >
      <SelectTrigger className="w-[180px] bg-muted/50 border-border text-foreground">
        <SelectValue placeholder="Sem grupo" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Sem grupo</SelectItem>
        {groups.map((group: any) => (
          <SelectItem key={group.id} value={group.id.toString()}>
            {group.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
