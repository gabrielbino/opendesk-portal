import { z } from "zod";

import { ACTIONS, MODULES } from "@shared/permissions";
import { protectedProcedure, router } from "../_core/trpc";
import { requirePermission } from "../permissionMiddleware";
import { fetchGrupoClientesCnpj, type GrupoClienteRow } from "../erpQueries";
import { reconciliar } from "@shared/associativismo";

/**
 * Submódulo Comercial → Associativismo. Concilia uma planilha de CNPJs (o operador escolhe o grupo
 * alvo) com a base 1019 (`grupo_clientes_cnpj`). É pass-through AO VIVO (sem tabela): a regra pura
 * vive em @shared/associativismo; aqui só buscamos a 1019 (cache curto) e classificamos.
 */
const M = MODULES.COMERCIAL_ASSOCIATIVISMO;

const CACHE_TTL_MS = 60_000; // a base muda pouco no dia; a conciliação é ação pontual
let cache: { at: number; data: GrupoClienteRow[] } | null = null;

async function carregarMembros(): Promise<GrupoClienteRow[]> {
  const agora = Date.now();
  if (cache && agora - cache.at < CACHE_TTL_MS) return cache.data;
  const data = await fetchGrupoClientesCnpj();
  cache = { at: agora, data };
  return data;
}

export const associativismoRouter = router({
  /** Grupos de associativismo (para o seletor): código, descrição e nº de clientes. */
  listarGrupos: protectedProcedure
    .use(requirePermission(M, ACTIONS.READ))
    .query(async () => {
      const membros = await carregarMembros();
      const mapa = new Map<number, { cod: number; desc: string; qtd: number }>();
      for (const m of membros) {
        const g = mapa.get(m.codGrupo) ?? { cod: m.codGrupo, desc: m.desGrupo, qtd: 0 };
        g.qtd++;
        if (!g.desc && m.desGrupo) g.desc = m.desGrupo;
        mapa.set(m.codGrupo, g);
      }
      return Array.from(mapa.values()).sort((a, b) => a.desc.localeCompare(b.desc, "pt-BR"));
    }),

  /** Concilia a planilha (cnpjs) com os grupos alvo (escopo) → baldes jaNoGrupo/aCadastrar/aRemover. */
  reconciliar: protectedProcedure
    .use(requirePermission(M, ACTIONS.READ))
    .input(
      z.object({
        codGrupos: z.array(z.number().int().positive()).min(1).max(500),
        cnpjs: z.array(z.string().max(32)).max(500_000),
      }),
    )
    .mutation(async ({ input }) => {
      const membros = await carregarMembros();
      const descPorCod = new Map<number, string>();
      for (const m of membros) if (!descPorCod.has(m.codGrupo)) descPorCod.set(m.codGrupo, m.desGrupo);
      const grupos = input.codGrupos.map((cod) => ({ cod, desc: descPorCod.get(cod) ?? "" }));
      const res = reconciliar({ codGrupos: input.codGrupos, cnpjsPlanilha: input.cnpjs, membros });
      return { grupos, ...res };
    }),
});
