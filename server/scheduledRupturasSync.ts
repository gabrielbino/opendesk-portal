import type { Request, Response } from "express";
import { isScheduledAuthorized } from "./_core/cronAuth";
import { syncAllRupturas } from "./rupturasApiSync";

/**
 * Scheduled handler: sincroniza o painel de Rupturas via API OpenDesk.
 * Chamado pelo agendador do Manus (cron). Pode reusar a grade do sync de vendas do
 * Superestocados (07:30/10:00/15:00/17:00 BRT em dias úteis).
 *
 * Path: POST /api/scheduled/rupturas-sync
 */
export async function rupturasSyncHandler(req: Request, res: Response) {
  try {
    if (!(await isScheduledAuthorized(req))) {
      return res.status(403).json({ error: "cron-only" });
    }

    const result = await syncAllRupturas();
    console.log("[RupturasSync]", JSON.stringify(result));
    return res.json({ ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error("[RupturasSync] Handler error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    });
  }
}
