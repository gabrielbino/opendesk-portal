import type { Request, Response } from "express";
import { isScheduledAuthorized } from "./_core/cronAuth";
import * as db from "./db";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Scheduled handler: auto-close tickets that have been "Resolvido / Aguardando Validação"
 * for more than 7 days without user response.
 * 
 * Path: POST /api/scheduled/ticket-auto-close
 */
export async function ticketAutoCloseHandler(req: Request, res: Response) {
  try {
    if (!(await isScheduledAuthorized(req))) {
      return res.status(403).json({ error: "cron-only" });
    }

    const now = Date.now();
    const sevenDaysAgo = now - SEVEN_DAYS_MS;

    // Get all tickets with status "Resolvido / Aguardando Validação"
    const allTickets = await db.getAllTickets({ status: "Resolvido / Aguardando Validação" });

    // Filter tickets that have been in this status for more than 7 days
    const expiredTickets = allTickets.filter((t: any) => t.updatedAt <= sevenDaysAgo);

    if (expiredTickets.length === 0) {
      return res.json({ ok: true, closed: 0, message: "No expired tickets found" });
    }

    // Auto-close each expired ticket
    let closedCount = 0;
    for (const ticket of expiredTickets) {
      try {
        // Update ticket status to Concluído (auto-close)
        await db.updateTicket(ticket.id, {
          status: "Concluído",
          updatedAt: now,
        });

        // Register activity log
        await db.createActivity({
          ticketId: ticket.id,
          type: "status_change",
          authorId: 0,
          authorName: "Sistema",
          oldValue: "Resolvido / Aguardando Validação",
          newValue: "Concluído",
          description: "Encerrado automaticamente por falta de resposta do solicitante após 7 dias.",
          createdAt: now,
        });

        closedCount++;
      } catch (err) {
        console.error(`[TicketAutoClose] Failed to close ticket ${ticket.id}:`, err);
      }
    }

    return res.json({
      ok: true,
      closed: closedCount,
      total: expiredTickets.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[TicketAutoClose] Handler error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      context: { url: req.url },
      timestamp: new Date().toISOString(),
    });
  }
}
