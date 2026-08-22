import { and, eq } from "drizzle-orm";

import { getDb } from "./db";
import { monarqDestino } from "../drizzle/schema";

/** Conta WhatsApp fixa da base compartilhada (o gateway em produção). */
const WA_CONTA = "monitor";

/**
 * Upsert de um destino WhatsApp na base compartilhada (`monarq_destino`), idempotente por
 * conta+tipo+identificador. Fonte ÚNICA usada pelo router `contatos` E pelo Perfil do usuário
 * (WhatsApp corporativo → passa a aparecer no `ContatoPicker` de todos os painéis).
 * Contato = E.164 (só dígitos); grupo = nome ou id `@g.us`.
 */
export async function upsertContato(input: {
  tipo: "contato" | "grupo";
  identificador: string;
  nome: string;
}): Promise<{ id: number } | null> {
  const conn = await getDb();
  if (!conn) return null;

  const identificador =
    input.tipo === "contato" ? input.identificador.replace(/\D/g, "") : input.identificador.trim();
  if (!identificador) throw new Error("Identificador inválido.");
  const nome = input.nome.trim();

  const existente = await conn
    .select({ id: monarqDestino.id })
    .from(monarqDestino)
    .where(
      and(
        eq(monarqDestino.waContaId, WA_CONTA),
        eq(monarqDestino.tipo, input.tipo),
        eq(monarqDestino.identificador, identificador),
      ),
    )
    .limit(1);
  if (existente[0]) {
    await conn.update(monarqDestino).set({ nome, ativo: true }).where(eq(monarqDestino.id, existente[0].id));
    return { id: existente[0].id };
  }

  const res = await conn.insert(monarqDestino).values({
    waContaId: WA_CONTA,
    tipo: input.tipo,
    identificador,
    nome,
    ativo: true,
    universal: false,
  });
  return { id: Number((res as unknown as { insertId?: number }).insertId ?? 0) };
}
