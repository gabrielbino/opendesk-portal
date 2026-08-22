import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, QrCode, LogOut, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import WhatsAppQrView from "@/components/WhatsAppQrView";

/**
 * Modal REUTILIZÁVEL de contas de WhatsApp (status + QR de pareamento + grupos).
 *
 * Núcleo comum ao Monitor de Integrações (WA Gateway, multi-conta, COM re-parear) e ao Envio de
 * Parcial (1 conta, SEM re-parear). O que muda entre eles é só: título/descrição, a lista de
 * `contas` (cada consumidor mapeia sua fonte para `WhatsAppContaView`) e se passa `onReparear`.
 * O QR reusa `WhatsAppQrView`. Mantém o estado FORA (o consumidor busca os dados e faz o poll).
 */
export interface WhatsAppContaView {
  id: string;
  nome: string;
  /** 'conectado' | 'aguardando_qr' | 'reconectando' | 'desconectado' | 'erro'. */
  status: string;
  /** Agente (gateway/bot) reportando dentro da janela de heartbeat — já resolvido pelo consumidor. */
  online: boolean;
  qrDataUrl?: string | null;
  grupos?: string[] | null;
}

export interface WhatsAppContasModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titulo: string;
  descricao?: ReactNode;
  contas: WhatsAppContaView[];
  loading?: boolean;
  /** Mensagem quando não há contas. */
  vazio?: ReactNode;
  /** Se presente, mostra o botão "Re-parear (novo QR)" por conta e chama isto ao clicar. */
  onReparear?: (conta: WhatsAppContaView) => void;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  conectado: { label: "Conectado", cls: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300" },
  aguardando_qr: { label: "Aguardando pareamento", cls: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300" },
  reconectando: { label: "Reconectando", cls: "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300" },
  desconectado: { label: "Desconectado", cls: "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300" },
  erro: { label: "Erro", cls: "border-red-300 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300" },
};

export default function WhatsAppContasModal({
  open,
  onOpenChange,
  titulo,
  descricao,
  contas,
  loading = false,
  vazio,
  onReparear,
}: WhatsAppContasModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[96vw] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {descricao && <DialogDescription>{descricao}</DialogDescription>}
        </DialogHeader>

        {loading ? (
          <div className="h-40 animate-pulse rounded bg-muted" />
        ) : contas.length === 0 ? (
          <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
            {vazio ?? "Nenhuma conta cadastrada."}
          </p>
        ) : (
          <div className="space-y-4">
            {contas.map((c) => {
              const meta = STATUS_META[c.status] ?? STATUS_META.desconectado;
              const mostrarQr = c.status !== "conectado" && !!c.qrDataUrl;
              return (
                <div key={c.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{c.nome}</p>
                      <p className="text-[11px] text-muted-foreground">conta: {c.id}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <span className={cn("h-1.5 w-1.5 rounded-full", c.online ? "bg-emerald-500" : "bg-slate-400")} />
                        {c.online ? "online" : "offline"}
                      </span>
                      <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", meta.cls)}>
                        {meta.label}
                      </span>
                    </div>
                  </div>

                  {mostrarQr ? (
                    <WhatsAppQrView
                      className="mt-3"
                      dataUrl={c.qrDataUrl}
                      instrucoes={
                        <span className="inline-flex items-center gap-1.5">
                          <QrCode className="h-3.5 w-3.5" /> WhatsApp → Aparelhos conectados → Conectar aparelho
                        </span>
                      }
                    />
                  ) : c.status === "conectado" ? (
                    <p className="mt-2 flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" /> Pareado e pronto para enviar.
                    </p>
                  ) : (
                    <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <AlertTriangle className="h-4 w-4" />
                      {c.online ? "Aguardando o QR do agente…" : "Agente offline — sem sinal na VM."}
                    </p>
                  )}

                  {c.grupos && c.grupos.length > 0 && (
                    <details className="mt-3">
                      <summary className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                        <Users className="h-3.5 w-3.5" /> {c.grupos.length} grupo(s) visível(is) nesta conta
                      </summary>
                      <ul className="mt-1.5 max-h-40 space-y-0.5 overflow-y-auto pl-5 text-[11px] text-muted-foreground">
                        {c.grupos.map((g, i) => (
                          <li key={i} className="truncate" title={g}>• {g}</li>
                        ))}
                      </ul>
                    </details>
                  )}

                  {onReparear && (
                    <div className="mt-3 flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-rose-600 hover:text-rose-700"
                        onClick={() => onReparear(c)}
                      >
                        <LogOut className="mr-1 h-3.5 w-3.5 text-muted-foreground" /> Desconectar WhatsApp
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
