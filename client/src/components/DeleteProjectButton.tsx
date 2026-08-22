import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface DeleteProjectButtonProps {
  project: {
    id: number;
    name: string;
    status: string;
  };
}

export function DeleteProjectButton({ project }: DeleteProjectButtonProps) {
  const utils = trpc.useUtils();

  const deleteProjectMutation = trpc.projects.delete.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate();
      toast.success("Projeto excluído com sucesso!");
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao excluir projeto");
    },
  });

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (project.status === "Concluído") {
      toast.error("Não é possível excluir projetos concluídos");
      return;
    }

    if (confirm(`Tem certeza que deseja excluir o projeto "${project.name}"? Esta ação não pode ser desfeita.`)) {
      deleteProjectMutation.mutate({ id: project.id });
    }
  };

  // Only show button for non-completed projects
  if (project.status === "Concluído") {
    return null;
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleDelete}
      className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 w-8"
      disabled={deleteProjectMutation.isPending}
      title="Excluir projeto"
    >
      <Trash2 className="h-5 w-5" />
    </Button>
  );
}
