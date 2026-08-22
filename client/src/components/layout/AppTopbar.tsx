import { useLocation } from "wouter";
import { BarChart3 } from "lucide-react";

import NotificationBell from "@/components/NotificationBell";
import UserMenu from "./UserMenu";

/**
 * Barra global (app bar) do portal — persistente em todas as telas autenticadas (via AppLayout).
 * Marca clicável → tela inicial · sino de notificações · menu do usuário. Não confundir com o
 * PanelHeader (cabeçalho contextual de cada página: voltar/título/ações).
 */
export default function AppTopbar() {
  const [, setLocation] = useLocation();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-[var(--background)]/95 backdrop-blur-md supports-[backdrop-filter]:bg-[var(--background)]/80">
      <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => setLocation("/dashboard")}
          className="flex shrink-0 items-center gap-3 rounded-lg px-1 py-1 transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Ir para a tela inicial"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 shadow-sm">
            <BarChart3 size={16} className="text-white" />
          </span>
          <span className="hidden text-base font-bold tracking-tight text-foreground sm:block">OpenDesk</span>
          <span className="hidden text-xs text-muted-foreground md:block">Portal Corporativo</span>
        </button>

        <div className="flex shrink-0 items-center gap-2">
          <NotificationBell />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
