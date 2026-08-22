import { z } from "zod";
import { and, eq } from "drizzle-orm";

import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { monarqDestino } from "../../drizzle/schema";
import { upsertContato } from "../contatosStore";

/**
 * Base de CONTATOS WhatsApp compartilhada do portal — fonte única reutilizável por qualquer painel
 * (Monitor de Integrações, alerta do Pedidos por Layout, etc.). Fica sobre `monarq_destino` (os
 * destinos WhatsApp já salvos: contatos E.164 e grupos), então "localizar contatos já salvos" e
 * "adicionar novo" ficam sincronizados em todos os lugares que consomem este router + o
 * componente client `ContatoPicker`. Conta WhatsApp fixa 'monitor' (o gateway em produção).
 */
const WA_CONTA = "monitor";

async function db() {
  const conn = await getDb();
  if (!conn) throw new Error("Banco de dados indisponível.");
  return conn;
}

export const contatosRouter = router({
  /** Lista os contatos WhatsApp salvos (ativos). Qualquer usuário autenticado pode buscar. */
  listar: protectedProcedure.query(async () => {
    const conn = await db();
    const rows = await conn
      .select({
        id: monarqDestino.id,
        nome: monarqDestino.nome,
        tipo: monarqDestino.tipo,
        identificador: monarqDestino.identificador,
      })
      .from(monarqDestino)
      .where(and(eq(monarqDestino.waContaId, WA_CONTA), eq(monarqDestino.ativo, true)))
      .orderBy(monarqDestino.nome);
    return rows;
  }),

  /** Adiciona um contato/grupo à base compartilhada (idempotente por conta+tipo+identificador). */
  criar: protectedProcedure
    .input(
      z.object({
        tipo: z.enum(["contato", "grupo"]),
        identificador: z.string().min(1).max(255),
        nome: z.string().min(1).max(160),
      }),
    )
    .mutation(async ({ input }) => {
      const r = await upsertContato(input);
      if (!r) throw new Error("Banco de dados indisponível.");
      return r;
    }),
});
