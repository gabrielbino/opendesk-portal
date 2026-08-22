import type { Request, Response } from "express";
import { isScheduledAuthorized } from "./_core/cronAuth";
import { syncMarcasCatalogo } from "./db/compradores";

/**
 * Scheduled handler: atualiza o catálogo de marcas (gn_marcas) a partir da base
 * `dia_estoque` (SC + RS). Chamado pelo agendador do Manus (cron) — pode reusar a grade
 * dos outros syncs de estoque. Também dá pra disparar pelo botão "Atualizar marcas" na UI
 * (mutation compradores.syncMarcas).
 *
 * Path: POST /api/scheduled/compradores-marcas-sync
 */
export async function compradoresMarcasSyncHandler(req: Request, res: Response) {
  try {
    if (!(await isScheduledAuthorized(req))) {
      return res.status(403).json({ error: "cron-only" });
    }

    const result = await syncMarcasCatalogo();
    console.log("[CompradoresMarcasSync]", JSON.stringify(result));
    return res.json({ ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error("[CompradoresMarcasSync] Handler error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    });
  }
}
