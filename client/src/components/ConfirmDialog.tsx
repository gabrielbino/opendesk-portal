import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

/**
 * ConfirmDialog — modal de confirmação PADRÃO e reutilizável do projeto.
 *
 * Use SEMPRE este componente para confirmar ações (excluir, descartar, etc.) em vez do
 * `window.confirm` do navegador ou de recriar um dialog do zero. Construído sobre o
 * `ui/alert-dialog` (shadcn/Radix), com acessibilidade e foco corretos.
 *
 * É controlado (`open`/`onOpenChange`). O `onConfirm` pode ser assíncrono: enquanto resolve,
 * o botão mostra loading e o dialog só fecha no sucesso. Se o `onConfirm` lançar, o dialog
 * permanece aberto (o chamador cuida do toast de erro).
 *
 * Exemplo:
 *   <ConfirmDialog
 *     open={open} onOpenChange={setOpen}
 *     title='Excluir "Pedidos SC"?'
 *     description="Os eventos e vínculos deste caminho serão removidos."
 *     confirmLabel="Excluir" destructive
 *     onConfirm={async () => { await deleteM.mutateAsync({ id }); }}
 *   />
 */
export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Estilo de ação perigosa (vermelho) — para exclusões. */
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}

export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            className={cn(
              destructive &&
                "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600 dark:bg-red-600 dark:hover:bg-red-700",
            )}
            onClick={async (e) => {
              e.preventDefault(); // impede o auto-close do Radix p/ tratar o async
              setBusy(true);
              try {
                await onConfirm();
                onOpenChange(false);
              } catch {
                /* o chamador exibe o erro (toast); mantém o dialog aberto */
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
