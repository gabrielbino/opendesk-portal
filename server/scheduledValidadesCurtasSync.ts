import type { Request, Response } from "express";
import { isScheduledAuthorized } from "./_core/cronAuth";
import { syncAllValidadesCurtas } from "./validadesCurtasSync";

/**
 * Scheduled handler: sincroniza a tabela validades_curtas_itens com TODOS os
 * produtos que possuem lote/vencimento preenchido, via API OpenDesk.
 *
 * Roda nos mesmos horários do Superestocados (+5min offset), seg-sex BRT:
 * 07:35, 10:05, 15:05, 17:05.
 *
 * Path: POST /api/scheduled/validades-curtas-sync
 */
export async function validadesCurtasSyncHandler(req: Request, res: Response) {
  try {
    if (!(await isScheduledAuthorized(req))) {
      return res.status(403).json({ error: "cron-only" });
    }
    const result = await syncAllValidadesCurtas();
    console.log("[ValidadesCurtasSync]", JSON.stringify(result));
    return res.json({ ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error("[ValidadesCurtasSync] Handler error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    });
  }
}
