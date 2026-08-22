import { ReactNode } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PowerBiEmbedProps {
  /** Título da tela (ex.: "Cortes — BI"). */
  title: string;
  /** Subtítulo (opcional; escondido no mobile). */
  subtitle?: string;
  /** URL de embed público do Power BI (publish-to-web). */
  embedUrl: string;
  /** Ícone no header (lucide). */
  icon: ReactNode;
  /** Gradiente do ícone (ex.: "from-rose-500 to-rose-600"). */
  iconGradient?: string;
  /** Rota do botão Voltar (padrão: sub-hub Visões Power BI). */
  backPath?: string;
}

/**
 * PowerBiEmbed — tela padrão para relatórios Power BI embarcados (header + iframe full-height).
 * Reutilizável por qualquer visão BI (Cortes, Vendas, ...). Mobile-first: header compacto,
 * subtítulo só no `sm`+, iframe ocupa a altura restante.
 */
export default function PowerBiEmbed({
  title,
  subtitle,
  embedUrl,
  icon,
  iconGradient = "from-rose-500 to-rose-600",
  backPath = "/indicadores/visoes-bi",
}: PowerBiEmbedProps) {
  const [, navigate] = useLocation();

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-border bg-card px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate(backPath)}>
              <ArrowLeft size={18} />
            </Button>
            <div className="flex min-w-0 items-center gap-2">
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white [&>svg]:h-4 [&>svg]:w-4",
                  iconGradient,
                )}
              >
                {icon}
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-sm font-semibold leading-tight sm:text-base">{title}</h1>
                {subtitle && (
                  <p className="hidden truncate text-xs leading-tight text-muted-foreground sm:block">{subtitle}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Iframe — ocupa a altura restante */}
      <main className="min-h-0 flex-1 p-2 sm:p-4">
        <div className="relative h-full w-full overflow-hidden rounded-lg border border-border bg-black/5">
          <iframe
            title={`${title} (Power BI)`}
            src={embedUrl}
            className="absolute inset-0 h-full w-full"
            allowFullScreen
            loading="lazy"
          />
        </div>
      </main>
    </div>
  );
}
