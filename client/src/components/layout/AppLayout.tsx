import type { ReactNode } from "react";

import { usePresenceHeartbeat } from "@/hooks/usePresenceHeartbeat";
import AppTopbar from "./AppTopbar";

/**
 * Casca compartilhada das telas autenticadas: barra global (AppTopbar) no topo + o conteúdo da
 * página abaixo. Aplicada UMA vez no ProtectedRoute (App.tsx) — então o topbar aparece em todas as
 * telas sem duplicar markup. Telas cheias (Modo TV/kiosk) usam ProtectedRoute com `bare` e não
 * passam por aqui.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  usePresenceHeartbeat(); // presença do portal (marca o usuário online enquanto navega)
  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      <AppTopbar />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
