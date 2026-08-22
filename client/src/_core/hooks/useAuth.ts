import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

// ──────────────────────────────────────────────────────────────
// DEV-ONLY: bypass de autenticação para validação local de UI.
// Ative no .env com VITE_DEV_BYPASS_AUTH=true. NÃO usar em produção.
// ──────────────────────────────────────────────────────────────
const DEV_BYPASS_AUTH = import.meta.env.VITE_DEV_BYPASS_AUTH === "true";
const DEV_MOCK_USER = {
  id: 0,
  name: "Dev User",
  email: "dev@opendesk.local",
  role: "admin" as const,
  permissions: {} as Record<string, unknown>,
  groupId: null as number | null,
  approvalStatus: "approved" as const,
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = DEV_BYPASS_AUTH ? "/dashboard" : getLoginUrl() } =
    options ?? {};
  const utils = trpc.useUtils();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        return;
      }
      throw error;
    } finally {
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
    }
  }, [logoutMutation, utils]);

  const state = useMemo(() => {
    localStorage.setItem(
      "manus-runtime-user-info",
      JSON.stringify(meQuery.data)
    );
    return {
      user: meQuery.data ?? null,
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(meQuery.data),
    };
  }, [
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    window.location.href = redirectPath
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    state.user,
  ]);

  // DEV bypass: substitui o estado real por um usuário admin mockado.
  // Hooks acima permanecem para não violar regras do React.
  if (DEV_BYPASS_AUTH) {
    if (typeof window !== "undefined") {
      // eslint-disable-next-line no-console
      console.warn(
        "[useAuth] DEV_BYPASS_AUTH ativo — autenticação ignorada. Desative VITE_DEV_BYPASS_AUTH em produção."
      );
    }
    return {
      user: DEV_MOCK_USER as unknown as NonNullable<typeof state.user>,
      loading: false,
      error: null,
      isAuthenticated: true,
      refresh: async () => undefined,
      logout: async () => undefined,
    };
  }

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
