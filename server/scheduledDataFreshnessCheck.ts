import type { Request, Response } from "express";
import { isScheduledAuthorized } from "./_core/cronAuth";
import { notifyOwner } from "./_core/notification";
import { getDb } from "./db";
import { historicoVendas, superestoque } from "../drizzle/schema";
import { eq, desc, sql } from "drizzle-orm";

/**
 * Scheduled handler: checks if Superestocados data is stale and sends notification.
 * Runs daily at 10:00 UTC (07:00 BRT) — after the connectors should have synced.
 * 
 * Checks:
 * 1. Last product update (csv-rotation) — should be today
 * 2. Last sales data (vendas) — should be within 1 business day
 * 
 * Path: POST /api/scheduled/data-freshness-check
 */
export async function dataFreshnessCheckHandler(req: Request, res: Response) {
  try {
    if (!(await isScheduledAuthorized(req))) {
      return res.status(403).json({ error: "cron-only" });
    }

    const db2 = await getDb();
    if (!db2) {
      return res.status(500).json({ error: "Database unavailable" });
    }

    const now = new Date();
    const today = now.toISOString().split("T")[0]!;

    // Check 1: Last product update (csv-rotation)
    const [lastProductUpdate] = await db2
      .select({ lastUpdate: sql<Date>`MAX(updatedAt)` })
      .from(superestoque);

    const lastProductUpdateDate = lastProductUpdate?.lastUpdate;
    const lastProductUpdateStr = lastProductUpdateDate
      ? new Date(lastProductUpdateDate).toISOString().split("T")[0]
      : null;

    // Check 2: Last sales data date
    const [lastSalesDate] = await db2
      .select({ lastDate: sql<string>`MAX(dataVenda)` })
      .from(historicoVendas);

    const lastSalesDateStr = lastSalesDate?.lastDate ?? null;

    // Check 3: Count of sales dates (should be 15)
    const [salesDatesCount] = await db2
      .select({ cnt: sql<number>`COUNT(DISTINCT dataVenda)` })
      .from(historicoVendas);

    const totalSalesDates = salesDatesCount?.cnt ?? 0;

    // Determine staleness
    const issues: string[] = [];

    // Product data should have been updated today (if it's a weekday)
    const dayOfWeek = now.getUTCDay(); // 0=Sun, 6=Sat
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

    if (isWeekday && lastProductUpdateStr !== today) {
      issues.push(
        `Produtos não foram atualizados hoje. Última atualização: ${lastProductUpdateStr ?? "nunca"}`
      );
    }

    // Sales data: calculate business days since last update
    if (lastSalesDateStr) {
      const lastSales = new Date(lastSalesDateStr + "T12:00:00Z");
      const diffMs = now.getTime() - lastSales.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      // Allow 1 business day gap (weekends don't count)
      // If today is Monday, last data can be from Friday (3 days ago)
      // Otherwise, 2+ days gap is a problem
      const maxAllowedDays = dayOfWeek === 1 ? 3 : 1;

      if (diffDays > maxAllowedDays) {
        issues.push(
          `Vendas diárias desatualizadas há ${diffDays} dia(s). Última data: ${lastSalesDateStr}`
        );
      }
    } else {
      issues.push("Nenhum dado de vendas encontrado no banco.");
    }

    // Sales dates should be 15
    if (totalSalesDates < 15 && totalSalesDates > 0) {
      issues.push(
        `Apenas ${totalSalesDates} dias de vendas no banco (esperado: 15).`
      );
    }

    // Send notification if there are issues
    if (issues.length > 0) {
      const title = "⚠️ Superestocados — Dados Desatualizados";
      const content = [
        "O monitoramento automático detectou problemas na atualização dos dados do módulo Superestocados:",
        "",
        ...issues.map((issue) => `• ${issue}`),
        "",
        "**Ação necessária:** Verifique o conector no servidor ERP (SRV-ERP-DB-SQL2012) e os logs do OpenDesk Connector.",
        "",
        `Verificação realizada em: ${now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
      ].join("\n");

      await notifyOwner({ title, content });

      return res.json({
        ok: true,
        stale: true,
        issues,
        notified: true,
        timestamp: now.toISOString(),
      });
    }

    return res.json({
      ok: true,
      stale: false,
      lastProductUpdate: lastProductUpdateStr,
      lastSalesDate: lastSalesDateStr,
      totalSalesDates,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error("[DataFreshnessCheck] Handler error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      context: { url: req.url },
      timestamp: new Date().toISOString(),
    });
  }
}
