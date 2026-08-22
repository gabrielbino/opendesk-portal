import { useCallback, useEffect, useState } from "react";

/**
 * Estado de "dispensar" um alerta em tela. Guarda o dismiss por sessão (localStorage, expira em 4h),
 * some quando o alerta resolve no servidor e RE-ARMA para um próximo alerta (o clique no X só some
 * com o alerta ATUAL). Compartilhado pelos alertas globais do portal (CFV, pedidos travados).
 *
 * `carregou` evita limpar o storage antes do 1º fetch do status (senão o estado indefinido zeraria
 * o dismiss indevidamente). Reutilizável por qualquer alerta em tela.
 */
const EXPIRA_MS = 4 * 60 * 60 * 1000;

export function useDismissableAlert(ativo: boolean, storageKey: string, carregou = true) {
  const [dispensado, setDispensado] = useState(() => {
    const s = localStorage.getItem(storageKey);
    if (!s) return false;
    return Date.now() - parseInt(s, 10) < EXPIRA_MS;
  });

  // Re-arma quando o alerta some (resolveu / teste limpo) — só depois do 1º fetch.
  useEffect(() => {
    if (carregou && !ativo) {
      setDispensado(false);
      localStorage.removeItem(storageKey);
    }
  }, [carregou, ativo, storageKey]);

  const dispensar = useCallback(() => {
    setDispensado(true);
    localStorage.setItem(storageKey, Date.now().toString());
  }, [storageKey]);

  return { visivel: ativo && !dispensado, dispensar };
}
