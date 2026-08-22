import { useState } from "react";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";
import ConfirmDialog from "@/components/ConfirmDialog";
import WhatsAppContasModal, { type WhatsAppContaView } from "@/components/WhatsAppContasModal";

/**
 * Contas de WhatsApp do WA Gateway (Monitor de Integrações) — wrapper fino sobre o componente
 * reutilizável `WhatsAppContasModal`. Busca as contas (poll enquanto aberto), resolve o "online"
 * pela janela de heartbeat e liga o `onReparear` (com confirmação). Só admin (adminProcedure).
 */
export interface WhatsAppModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** A conta está reportando dentro da janela de heartbeat (60s)? */
function online(c: { online: boolean; ultimoHeartbeat: string | Date | null }): boolean {
  if (!c.online || !c.ultimoHeartbeat) return false;
  return Date.now() - new Date(c.ultimoHeartbeat).getTime() < 60_000;
}

export default function WhatsAppModal({ open, onOpenChange }: WhatsAppModalProps) {
  const utils = trpc.useUtils();
  const contasQuery = trpc.monitorArquivos.listWaContas.useQuery(undefined, {
    enabled: open,
    refetchInterval: open ? 4000 : false,
  });
  const reparearM = trpc.monitorArquivos.reparearWaConta.useMutation();
  const [reparear, setReparear] = useState<{ id: string; nome: string } | null>(null);

  const contas: WhatsAppContaView[] = (contasQuery.data ?? []).map((c) => ({
    id: c.id,
    nome: c.nome,
    status: c.status,
    online: online(c),
    qrDataUrl: c.qrDataUrl,
    grupos: c.grupos,
  }));

  async function confirmarReparear() {
    if (!reparear) return;
    await reparearM.mutateAsync({ id: reparear.id });
    await utils.monitorArquivos.listWaContas.invalidate();
    toast.success("Re-pareamento solicitado — o gateway vai gerar um QR novo.");
  }

  return (
    <>
      <WhatsAppContasModal
        open={open}
        onOpenChange={onOpenChange}
        titulo="Monitor de Integrações — WhatsApp"
        descricao={
          <>
            Contas que o gateway usa para disparar os alertas. Se estiver "aguardando pareamento",
            escaneie o QR com o WhatsApp do número dedicado.
          </>
        }
        contas={contas}
        loading={contasQuery.isLoading}
        vazio='Nenhuma conta cadastrada. Rode o "apply-schema.mjs" (semeia a conta "monitor").'
        onReparear={(c) => setReparear({ id: c.id, nome: c.nome })}
      />

      <ConfirmDialog
        open={reparear !== null}
        onOpenChange={(o) => !o && setReparear(null)}
        title={`Desconectar "${reparear?.nome}"?`}
        description="A conta será desconectada e o gateway gerará um QR novo para escanear. Use para trocar o número ou recuperar uma sessão travada."
        confirmLabel="Desconectar"
        destructive
        onConfirm={confirmarReparear}
      />
    </>
  );
}
