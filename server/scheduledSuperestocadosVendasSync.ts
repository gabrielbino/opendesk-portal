import type { Request, Response } from "express";
import { isScheduledAuthorized } from "./_core/cronAuth";
import { syncAllVendas } from "./superestocadosApiSync";

/**
 * Scheduled handler: sincroniza as vendas do Superestocados via API OpenDesk.
 * Chamado pelo agendador do Manus (cron). Horários previstos (BRT):
 * 07:30, 10:00, 15:00, 17:00 em dias úteis.
 *
 * Path: POST /api/scheduled/superestocados-vendas-sync
 */
export async function superestocadosVendasSyncHandler(req: Request, res: Response) {
  try {
    if (!(await isScheduledAuthorized(req))) {
      return res.status(403).json({ error: "cron-only" });
    }

    const result = await syncAllVendas();
    console.log("[SuperestocadosVendasSync]", JSON.stringify(result));
    return res.json({ ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error("[SuperestocadosVendasSync] Handler error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    });
  }
}
