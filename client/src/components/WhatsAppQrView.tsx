import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Exibição REUTILIZÁVEL do QR de pareamento do WhatsApp (fundo branco + imagem, ou placeholder
 * quando não há QR) + instruções. É o núcleo comum entre o "Conectar WhatsApp" do Envio de Parcial
 * e o painel de contas do Monitor de Integrações — o que muda entre eles são só os TEXTOS
 * (`aguardando`/`instrucoes`) e o shell ao redor (1 conta × multi-conta). Extraído para não duplicar.
 */
export interface WhatsAppQrViewProps {
  /** dataURL do QR (base64). null/undefined → mostra o placeholder `aguardando`. */
  dataUrl: string | null | undefined;
  /** Texto/nó quando NÃO há QR (ex.: "já conectado" ou "aguardando o agente gerar"). */
  aguardando?: ReactNode;
  /** Instruções abaixo do QR (particularidade de cada módulo). */
  instrucoes?: ReactNode;
  /** Lado do QR em px (default 224). */
  size?: number;
  className?: string;
}

export default function WhatsAppQrView({
  dataUrl,
  aguardando,
  instrucoes,
  size = 224,
  className,
}: WhatsAppQrViewProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg bg-white p-3 dark:bg-slate-900",
        className,
      )}
    >
      {dataUrl ? (
        <img
          src={dataUrl}
          alt="QR de pareamento do WhatsApp"
          style={{ width: size, height: size }}
          className="rounded-lg border border-border"
        />
      ) : (
        <div className="py-10 text-center text-sm text-muted-foreground">
          {aguardando ?? "Aguardando o QR…"}
        </div>
      )}
      {instrucoes && <p className="text-center text-xs text-muted-foreground">{instrucoes}</p>}
    </div>
  );
}
