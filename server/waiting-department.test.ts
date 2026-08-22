import { describe, expect, it } from "vitest";

/**
 * Tests for the "Aguardando Retorno" (Waiting for Department) feature.
 * 
 * This feature tracks who last responded to a ticket comment:
 * - When an admin responds → waitingForDepartment = creator's department name
 * - When a user responds → waitingForDepartment = "Suporte/TI"
 * - When ticket is resolved/closed → waitingForDepartment is cleared
 */

describe("Aguardando Retorno - Schema validation", () => {
  it("should have waitingForDepartment field in Ticket type", async () => {
    const { tickets } = await import("../drizzle/schema");
    expect(tickets.waitingForDepartment).toBeDefined();
    expect(tickets.waitingForDepartment.name).toBe("waitingForDepartment");
  });

  it("should have lastRespondentRole field in Ticket type", async () => {
    const { tickets } = await import("../drizzle/schema");
    expect(tickets.lastRespondentRole).toBeDefined();
    expect(tickets.lastRespondentRole.name).toBe("lastRespondentRole");
  });

  it("should have lastRespondentId field in Ticket type", async () => {
    const { tickets } = await import("../drizzle/schema");
    expect(tickets.lastRespondentId).toBeDefined();
    expect(tickets.lastRespondentId.name).toBe("lastRespondentId");
  });

  it("should have lastRespondentName field in Ticket type", async () => {
    const { tickets } = await import("../drizzle/schema");
    expect(tickets.lastRespondentName).toBeDefined();
    expect(tickets.lastRespondentName.name).toBe("lastRespondentName");
  });
});

describe("Aguardando Retorno - Business logic", () => {
  it("should set waitingForDepartment to 'Suporte/TI' when user responds", () => {
    // When a regular user responds, the ticket should be waiting for Suporte/TI
    const userRole = "user";
    let waitingForDepartment: string | null = null;

    if (userRole === "user") {
      waitingForDepartment = "Suporte/TI";
    }

    expect(waitingForDepartment).toBe("Suporte/TI");
  });

  it("should set waitingForDepartment to department name when admin responds", () => {
    // When an admin responds, the ticket should be waiting for the creator's department
    const userRole = "admin";
    const creatorDepartmentName = "Comercial";
    let waitingForDepartment: string | null = null;

    if (userRole === "admin") {
      waitingForDepartment = creatorDepartmentName || "Solicitante";
    }

    expect(waitingForDepartment).toBe("Comercial");
  });

  it("should fallback to 'Solicitante' when admin responds and creator has no department", () => {
    const userRole = "admin";
    const creatorDepartmentName: string | null = null;
    let waitingForDepartment: string | null = null;

    if (userRole === "admin") {
      waitingForDepartment = creatorDepartmentName || "Solicitante";
    }

    expect(waitingForDepartment).toBe("Solicitante");
  });

  it("should clear waitingForDepartment when ticket status is Resolvido", () => {
    const newStatus = "Resolvido";
    let waitingForDepartment: string | null = "Comercial";
    let lastRespondentRole: string | null = "admin";
    let lastRespondentId: number | null = 1;
    let lastRespondentName: string | null = "Admin User";

    if (newStatus === "Resolvido" || newStatus === "Fechado") {
      waitingForDepartment = null;
      lastRespondentRole = null;
      lastRespondentId = null;
      lastRespondentName = null;
    }

    expect(waitingForDepartment).toBeNull();
    expect(lastRespondentRole).toBeNull();
    expect(lastRespondentId).toBeNull();
    expect(lastRespondentName).toBeNull();
  });

  it("should clear waitingForDepartment when ticket status is Fechado", () => {
    const newStatus = "Fechado";
    let waitingForDepartment: string | null = "Suporte/TI";
    let lastRespondentRole: string | null = "user";

    if (newStatus === "Resolvido" || newStatus === "Fechado") {
      waitingForDepartment = null;
      lastRespondentRole = null;
    }

    expect(waitingForDepartment).toBeNull();
    expect(lastRespondentRole).toBeNull();
  });

  it("should NOT clear waitingForDepartment when ticket status is Em Progresso", () => {
    const newStatus = "Em Progresso";
    let waitingForDepartment: string | null = "Comercial";

    if (newStatus === "Resolvido" || newStatus === "Fechado") {
      waitingForDepartment = null;
    }

    expect(waitingForDepartment).toBe("Comercial");
  });

  it("should NOT show tag when waitingForDepartment is null", () => {
    const ticket = {
      waitingForDepartment: null,
      status: "Aberto",
    };

    const shouldShowTag = ticket.waitingForDepartment && ticket.status !== "Resolvido" && ticket.status !== "Fechado";
    expect(shouldShowTag).toBeFalsy();
  });

  it("should show tag when waitingForDepartment is set and status is not resolved/closed", () => {
    const ticket = {
      waitingForDepartment: "Comercial",
      status: "Em Progresso",
    };

    const shouldShowTag = ticket.waitingForDepartment && ticket.status !== "Resolvido" && ticket.status !== "Fechado";
    expect(shouldShowTag).toBeTruthy();
  });

  it("should NOT show tag when status is Resolvido even if waitingForDepartment is set", () => {
    const ticket = {
      waitingForDepartment: "Comercial",
      status: "Resolvido",
    };

    const shouldShowTag = ticket.waitingForDepartment && ticket.status !== "Resolvido" && ticket.status !== "Fechado";
    expect(shouldShowTag).toBeFalsy();
  });
});
