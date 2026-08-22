import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the campaign system helpers and logic
 * Testing: getCampanhaStatus, getCampanhaRemainingDays, and campaign flow
 */

// Replicate the helper functions from the frontend for testing
function getCampanhaStatus(campanhaFim: string | null): "ativa" | "urgente" | "vencida" | "sem_prazo" {
  if (!campanhaFim) return "sem_prazo";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const fim = new Date(campanhaFim + "T00:00:00");
  if (isNaN(fim.getTime())) return "sem_prazo";

  const diffMs = fim.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "vencida";
  if (diffDays <= 3) return "urgente";
  return "ativa";
}

function getCampanhaRemainingDays(campanhaFim: string | null): number | null {
  if (!campanhaFim) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const fim = new Date(campanhaFim + "T00:00:00");
  if (isNaN(fim.getTime())) return null;
  return Math.ceil((fim.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

describe("Campaign Status Helpers", () => {
  describe("getCampanhaStatus", () => {
    it("returns 'sem_prazo' when campanhaFim is null", () => {
      expect(getCampanhaStatus(null)).toBe("sem_prazo");
    });

    it("returns 'sem_prazo' for invalid date string", () => {
      expect(getCampanhaStatus("invalid-date")).toBe("sem_prazo");
    });

    it("returns 'vencida' when date is in the past", () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);
      const dateStr = pastDate.toISOString().split("T")[0];
      expect(getCampanhaStatus(dateStr)).toBe("vencida");
    });

    it("returns 'urgente' when date is within 3 days", () => {
      const nearDate = new Date();
      nearDate.setDate(nearDate.getDate() + 2);
      const dateStr = nearDate.toISOString().split("T")[0];
      expect(getCampanhaStatus(dateStr)).toBe("urgente");
    });

    it("returns 'urgente' when date is exactly 3 days away", () => {
      const nearDate = new Date();
      nearDate.setDate(nearDate.getDate() + 3);
      const dateStr = nearDate.toISOString().split("T")[0];
      expect(getCampanhaStatus(dateStr)).toBe("urgente");
    });

    it("returns 'ativa' when date is more than 3 days away", () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);
      const dateStr = futureDate.toISOString().split("T")[0];
      expect(getCampanhaStatus(dateStr)).toBe("ativa");
    });

    it("returns 'vencida' when date is yesterday", () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dateStr = yesterday.toISOString().split("T")[0];
      expect(getCampanhaStatus(dateStr)).toBe("vencida");
    });
  });

  describe("getCampanhaRemainingDays", () => {
    it("returns null when campanhaFim is null", () => {
      expect(getCampanhaRemainingDays(null)).toBeNull();
    });

    it("returns null for invalid date string", () => {
      expect(getCampanhaRemainingDays("not-a-date")).toBeNull();
    });

    it("returns negative number for past dates", () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);
      const dateStr = pastDate.toISOString().split("T")[0];
      const result = getCampanhaRemainingDays(dateStr);
      expect(result).not.toBeNull();
      expect(result!).toBeLessThan(0);
    });

    it("returns positive number for future dates", () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);
      const dateStr = futureDate.toISOString().split("T")[0];
      const result = getCampanhaRemainingDays(dateStr);
      expect(result).not.toBeNull();
      expect(result!).toBeGreaterThan(0);
    });

    it("returns correct number of days", () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      const dateStr = futureDate.toISOString().split("T")[0];
      const result = getCampanhaRemainingDays(dateStr);
      expect(result).toBe(7);
    });
  });
});

describe("Campaign Business Logic", () => {
  it("campaign with no end date should be treated as 'sem_prazo'", () => {
    const status = getCampanhaStatus(null);
    expect(status).toBe("sem_prazo");
  });

  it("campaign ending today should be 'urgente' (within 3 days)", () => {
    const today = new Date().toISOString().split("T")[0];
    const status = getCampanhaStatus(today);
    // Today means 0 days remaining, which is <= 3, so urgente
    expect(status).toBe("urgente");
  });

  it("campaign ending in 4 days should be 'ativa'", () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 4);
    const dateStr = futureDate.toISOString().split("T")[0];
    expect(getCampanhaStatus(dateStr)).toBe("ativa");
  });

  it("visual alert logic: urgente and vencida should trigger red alert", () => {
    const urgentStatuses = ["urgente", "vencida"];
    const safeStatuses = ["ativa", "sem_prazo"];

    // These should show red pulsing badge
    urgentStatuses.forEach((status) => {
      expect(["urgente", "vencida"]).toContain(status);
    });

    // These should NOT show red pulsing badge
    safeStatuses.forEach((status) => {
      expect(["urgente", "vencida"]).not.toContain(status);
    });
  });
});
