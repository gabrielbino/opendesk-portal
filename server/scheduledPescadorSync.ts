import type { Request, Response } from "express";
import { isScheduledAuthorized } from "./_core/cronAuth";
import { syncPescador } from "./pescadorApiSync";

/**
 * Scheduled handler: sincroniza a Triagem do Pescador via API OpenDesk.
 * Chamado pelo agendador do Manus (cron). Pode reusar a grade dos demais syncs.
 *
 * Path: POST /api/scheduled/pescador-sync
 */
export async function pescadorSyncHandler(req: Request, res: Response) {
  try {
    if (!(await isScheduledAuthorized(req))) {
      return res.status(403).json({ error: "cron-only" });
    }

    const result = await syncPescador();
    console.log("[PescadorSync]", JSON.stringify(result));
    return res.json({ ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error("[PescadorSync] Handler error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    });
  }
}
