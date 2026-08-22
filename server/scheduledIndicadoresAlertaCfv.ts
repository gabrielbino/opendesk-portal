import type { Request, Response } from "express";
import { and, eq, inArray } from "drizzle-orm";

import { isScheduledAuthorized } from "./_core/cronAuth";
import { getDb } from "./db";
import { indicadoresAlertaCfvConfig, monarqDestino, monarqWaOutbox } from "../drizzle/schema";
import { avaliarAlertaCfv, carregarPedidosLayout } from "./routers/indicadores";

/**
 * Scheduled handler: DISPARO SERVER-SIDE do alerta "layout sem pedidos" por WhatsApp.
 *
 * O overlay em tela é avaliado no navegador de quem está com o painel aberto; para o WhatsApp sair
 * mesmo sem ninguém olhando, esta avaliação roda no servidor (cron). Avalia ao vivo os layouts
 * configurados dentro da janela/dias (fuso SP); ao entrar em alerta, enfileira UMA mensagem para
 * cada destino WhatsApp selecionado (`monarq_wa_outbox`, conta 'monitor' — mesma fila/gateway do
 * Monitor de Integrações) e RE-alerta a cada `waRealertaMin`; quando os pedidos voltam, limpa o
 * estado. Sem re-envio duplicado: estado agregado em `waAlertaEm`/`waUltimoAlertaEm`.
 *
 * Path: POST /api/scheduled/indicadores-alerta-cfv  (sugerido a cada 10 min no Manus)
 */
export async function indicadoresAlertaCfvHandler(req: Request, res: Response) {
  try {
    if (!(await isScheduledAuthorized(req))) {
      return res.status(403).json({ error: "cron-only" });
    }

    const conn = await getDb();
    if (!conn) throw new Error("Banco de dados indisponível.");

    const rows = await conn.select().from(indicadoresAlertaCfvConfig).limit(1);
    const cfg = rows[0];
    if (!cfg || !cfg.ativo) return res.json({ ok: true, skipped: "inativo" });

    const destinoIds = Array.isArray(cfg.destinoIds) ? cfg.destinoIds : [];
    if (destinoIds.length === 0) return res.json({ ok: true, skipped: "sem destinos WhatsApp" });

    const limparEstado = () =>
      conn
        .update(indicadoresAlertaCfvConfig)
        .set({ waAlertaEm: null, waUltimoAlertaEm: null })
        .where(eq(indicadoresAlertaCfvConfig.id, cfg.id));

    // Janela/dias em fuso SP.
    const agora = new Date();
    const sp = new Date(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const dentroJanela =
      cfg.diasSemana.includes(sp.getDay()) && sp.getHours() >= cfg.horaInicio && sp.getHours() < cfg.horaFim;
    if (!dentroJanela) {
      if (cfg.waAlertaEm) await limparEstado();
      return res.json({ ok: true, skipped: "fora da janela" });
    }

    const data = await carregarPedidosLayout();
    const aval = avaliarAlertaCfv(cfg, data, agora);

    // Resolvido: pedidos voltaram → zera o ciclo (não manda "resolvido" para não poluir).
    if (!aval.alerta) {
      if (cfg.waAlertaEm) {
        await limparEstado();
        return res.json({ ok: true, resolvido: true, timestamp: agora.toISOString() });
      }
      return res.json({ ok: true, alerta: false, timestamp: agora.toISOString() });
    }

    // Em alerta: envia no início do ciclo e re-alerta a cada waRealertaMin.
    const ultimoMs = cfg.waUltimoAlertaEm ? new Date(cfg.waUltimoAlertaEm).getTime() : 0;
    const primeira = !cfg.waAlertaEm;
    const reAlerta = !primeira && agora.getTime() - ultimoMs >= cfg.waRealertaMin * 60_000;
    if (!primeira && !reAlerta) {
      return res.json({ ok: true, alerta: true, enviado: false, motivo: "aguardando re-alerta" });
    }

    const destinos = await conn
      .select({ tipo: monarqDestino.tipo, identificador: monarqDestino.identificador })
      .from(monarqDestino)
      .where(and(inArray(monarqDestino.id, destinoIds), eq(monarqDestino.ativo, true)));
    if (destinos.length === 0) {
      return res.json({ ok: true, alerta: true, enviado: false, motivo: "destinos inativos" });
    }

    const mensagem = `🔴 ${aval.mensagem}. Verifique se há pedidos travados ou problema na integração.`;
    await conn.insert(monarqWaOutbox).values(
      destinos.map((d) => ({
        waContaId: "monitor",
        tipo: d.tipo,
        identificador: d.identificador,
        mensagem,
        categoria: "alerta",
      })),
    );
    await conn
      .update(indicadoresAlertaCfvConfig)
      .set({ waAlertaEm: cfg.waAlertaEm ?? agora, waUltimoAlertaEm: agora })
      .where(eq(indicadoresAlertaCfvConfig.id, cfg.id));

    return res.json({ ok: true, alerta: true, enviado: true, destinos: destinos.length, timestamp: agora.toISOString() });
  } catch (error) {
    console.error("[IndicadoresAlertaCfv] Handler error:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
}
