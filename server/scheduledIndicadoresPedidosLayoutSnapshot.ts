import type { Request, Response } from "express";
import { isScheduledAuthorized } from "./_core/cronAuth";
import { snapshotPedidosLayout } from "./indicadoresHistorico";

/**
 * Scheduled handler: grava uma FOTO do painel "Pedidos por Layout" (Indicadores) para o histórico.
 *
 * Roda a cada 30 min pelo cron do Manus; o próprio handler só grava dentro da janela 08:00–22:00
 * (fuso SP) — fora dela é no-op (o cron pode ser registrado "o dia todo" em UTC sem cálculo de
 * janela cruzando a meia-noite UTC). Habilita a comparação vs. período anterior + sparkline do
 * painel (histórico DAQUI PRA FRENTE). Ver docs/indicadores-handoff.md.
 *
 * Path: POST /api/scheduled/indicadores-pedidos-layout-snapshot
 */
export async function indicadoresPedidosLayoutSnapshotHandler(req: Request, res: Response) {
  try {
    if (!(await isScheduledAuthorized(req))) {
      return res.status(403).json({ error: "cron-only" });
    }
    const r = await snapshotPedidosLayout(new Date());
    return res.json({ ok: true, ...r, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error("[IndicadoresSnapshot] Handler error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    });
  }
}
