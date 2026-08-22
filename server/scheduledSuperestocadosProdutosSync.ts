import type { Request, Response } from "express";
import { isScheduledAuthorized } from "./_core/cronAuth";
import { syncAllProdutos, syncAllVendas } from "./superestocadosApiSync";

/**
 * Scheduled handler: sincroniza o painel do Superestocados via API OpenDesk —
 * PRODUTOS (rotação do painel) e depois VENDAS (dependem dos códigos do painel).
 * Substitui o job `dias_estoque` (CSV) do conector.
 *
 * Path: POST /api/scheduled/superestocados-produtos-sync
 */
export async function superestocadosProdutosSyncHandler(req: Request, res: Response) {
  try {
    if (!(await isScheduledAuthorized(req))) {
      return res.status(403).json({ error: "cron-only" });
    }

    const produtos = await syncAllProdutos();
    const vendas = await syncAllVendas();
    const result = { ok: produtos.ok && vendas.ok, produtos, vendas };
    console.log("[SuperestocadosProdutosSync]", JSON.stringify(result));
    return res.json({ ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error("[SuperestocadosProdutosSync] Handler error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    });
  }
}
