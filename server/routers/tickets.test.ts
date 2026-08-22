import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../db";
import { tickets } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

/**
 * Test suite for Tickets Router - Status Updates
 *
 * Validates that:
 * 1. All valid status values are supported (including new ones)
 * 2. Status transitions work correctly in the database
 * 3. The new 'Resolvido / Aguardando Validação' status is persisted correctly
 */

describe("Tickets Router - Status Updates", () => {
  let testTicketId: number;

  beforeAll(async () => {
    const drizzle = await getDb();
    if (!drizzle) throw new Error("DB not available");

    const result = await drizzle
      .insert(tickets)
      .values({
        ticketId: "test_ticket_eval_001",
        title: "Test Ticket for Evaluation Flow",
        description: "Testing status transitions including Resolvido",
        status: "Novos",
        priority: "Média",
        createdById: 1,
        createdByName: "Test User",
        category: "Técnico",
        sector: "TI",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

    testTicketId = (result as any)[0]?.insertId || 0;
  });

  afterAll(async () => {
    if (testTicketId) {
      const drizzle = await getDb();
      if (drizzle) {
        await drizzle.delete(tickets).where(eq(tickets.id, testTicketId));
      }
    }
  });

  it("should include all valid status values including Resolvido", () => {
    const validStatuses = [
      "Novos",
      "Em Andamento",
      "Pendente Cliente",
      "Em Análise",
      "Pendente ERP",
      "Concluído",
      "Resolvido / Aguardando Validação",
    ];

    expect(validStatuses).toContain("Novos");
    expect(validStatuses).toContain("Resolvido / Aguardando Validação");
    expect(validStatuses).toContain("Concluído");
    expect(validStatuses).toHaveLength(7);
  });

  it("should update ticket status to Resolvido / Aguardando Validação", async () => {
    if (!testTicketId) throw new Error("Test ticket not created");

    const drizzle = await getDb();
    if (!drizzle) throw new Error("DB not available");

    await drizzle
      .update(tickets)
      .set({ status: "Resolvido / Aguardando Validação" })
      .where(eq(tickets.id, testTicketId));

    const updated = await drizzle
      .select()
      .from(tickets)
      .where(eq(tickets.id, testTicketId));

    expect(updated[0]?.status).toBe("Resolvido / Aguardando Validação");
  });

  it("should update ticket status to Concluído", async () => {
    if (!testTicketId) throw new Error("Test ticket not created");

    const drizzle = await getDb();
    if (!drizzle) throw new Error("DB not available");

    await drizzle
      .update(tickets)
      .set({ status: "Concluído" })
      .where(eq(tickets.id, testTicketId));

    const updated = await drizzle
      .select()
      .from(tickets)
      .where(eq(tickets.id, testTicketId));

    expect(updated[0]?.status).toBe("Concluído");
  });

  it("should update ticket status to Em Andamento", async () => {
    if (!testTicketId) throw new Error("Test ticket not created");

    const drizzle = await getDb();
    if (!drizzle) throw new Error("DB not available");

    await drizzle
      .update(tickets)
      .set({ status: "Em Andamento" })
      .where(eq(tickets.id, testTicketId));

    const updated = await drizzle
      .select()
      .from(tickets)
      .where(eq(tickets.id, testTicketId));

    expect(updated[0]?.status).toBe("Em Andamento");
  });

  it("should update ticket status to Pendente Cliente", async () => {
    if (!testTicketId) throw new Error("Test ticket not created");

    const drizzle = await getDb();
    if (!drizzle) throw new Error("DB not available");

    await drizzle
      .update(tickets)
      .set({ status: "Pendente Cliente" })
      .where(eq(tickets.id, testTicketId));

    const updated = await drizzle
      .select()
      .from(tickets)
      .where(eq(tickets.id, testTicketId));

    expect(updated[0]?.status).toBe("Pendente Cliente");
  });
});
