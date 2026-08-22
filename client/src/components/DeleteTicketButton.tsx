import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

interface DeleteTicketButtonProps {
  ticketId: number;
  ticketTitle: string;
  onDelete?: () => void;
}

export function DeleteTicketButton({ ticketId, ticketTitle, onDelete }: DeleteTicketButtonProps) {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const deleteMutation = trpc.tickets.delete.useMutation({
    onSuccess: () => {
      toast.success("Chamado excluído com sucesso");
      utils.tickets.list.invalidate();
      onDelete?.();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao excluir chamado");
    },
  });

  // Only show button for admins
  if (user?.role !== 'admin') {
    return null;
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
          title="Excluir chamado"
        >
          <Trash2 className="h-5 w-5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir Chamado</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja excluir o chamado <strong>"{ticketTitle}"</strong>?
            <br />
            <br />
            Esta ação não pode ser desfeita. Todos os comentários e atividades relacionadas também serão excluídos.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => deleteMutation.mutate({ id: ticketId })}
            className="bg-red-600 hover:bg-red-700"
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
