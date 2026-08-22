import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

/** A cada quanto tempo o cliente reafirma que está online (ms). */
const HEARTBEAT_MS = 60_000;

/**
 * Presença do portal — fonte ÚNICA de "usuários online".
 *
 * Enquanto o usuário está logado, pulsa `onlineStatus.updateStatus({ isOnline: true })` no mount,
 * a cada 60s e quando a aba volta a ficar visível; marca `isOnline: false` ao sair (unmount /
 * fechar aba). Montado UMA vez no AppLayout, então cobre o portal inteiro.
 *
 * Antes o heartbeat vivia só no componente `OnlineOperators` — que nem era renderizado —, então
 * a tabela `sys_status_online` nunca era atualizada e o KPI "usuários online" (Saúde do Sistema)
 * ficava preso em linhas antigas com `isOnline=1`. A leitura correta usa janela de 2 min
 * (ver server: `getAllOnlineUsers` e `admin.getSystemHealth`).
 */
export function usePresenceHeartbeat() {
  const { isAuthenticated } = useAuth();
  const [location] = useLocation();
  const update = trpc.onlineStatus.updateStatus.useMutation();

  // Refs para o interval não reiniciar a cada navegação, mas ainda reportar a página atual.
  const pageRef = useRef(location);
  pageRef.current = location;
  const mutateRef = useRef(update.mutate);
  mutateRef.current = update.mutate;

  useEffect(() => {
    if (!isAuthenticated) return;

    const ping = () => mutateRef.current({ isOnline: true, currentPage: pageRef.current });
    const offline = () => mutateRef.current({ isOnline: false });
    const onVisible = () => {
      if (document.visibilityState === "visible") ping();
    };

    ping();
    const id = window.setInterval(ping, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("beforeunload", offline);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("beforeunload", offline);
      offline();
    };
  }, [isAuthenticated]);
}
