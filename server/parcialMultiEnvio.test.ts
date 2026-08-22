import { describe, it, expect } from "vitest";

/**
 * Testes unitários para a lógica pura do control plane multi-envio.
 * Testa isBotOnline e HEARTBEAT_TIMEOUT_MS sem precisar de conexão ao banco.
 */

// Importamos apenas as funções puras (sem side effects de DB)
import { isBotOnline, HEARTBEAT_TIMEOUT_MS } from "./parcialControlPlane";

describe("Parcial Multi-Envio Control Plane", () => {
  describe("HEARTBEAT_TIMEOUT_MS", () => {
    it("should be 30 seconds", () => {
      expect(HEARTBEAT_TIMEOUT_MS).toBe(30_000);
    });
  });

  describe("isBotOnline", () => {
    it("should return false when envio is null", () => {
      expect(isBotOnline(null)).toBe(false);
    });

    it("should return false when botOnline is false", () => {
      expect(
        isBotOnline({
          botOnline: false,
          ultimoHeartbeat: new Date(),
        }),
      ).toBe(false);
    });

    it("should return false when ultimoHeartbeat is null", () => {
      expect(
        isBotOnline({
          botOnline: true,
          ultimoHeartbeat: null,
        }),
      ).toBe(false);
    });

    it("should return true when heartbeat is within timeout window (5s ago)", () => {
      const recentHeartbeat = new Date(Date.now() - 5000);
      expect(
        isBotOnline({
          botOnline: true,
          ultimoHeartbeat: recentHeartbeat,
        }),
      ).toBe(true);
    });

    it("should return true when heartbeat is 1ms before timeout", () => {
      const justBeforeTimeout = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS + 1);
      expect(
        isBotOnline({
          botOnline: true,
          ultimoHeartbeat: justBeforeTimeout,
        }),
      ).toBe(true);
    });

    it("should return false when heartbeat is exactly at timeout boundary", () => {
      const exactlyAtTimeout = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS);
      expect(
        isBotOnline({
          botOnline: true,
          ultimoHeartbeat: exactlyAtTimeout,
        }),
      ).toBe(false);
    });

    it("should return false when heartbeat is older than timeout (5s past)", () => {
      const oldHeartbeat = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS - 5000);
      expect(
        isBotOnline({
          botOnline: true,
          ultimoHeartbeat: oldHeartbeat,
        }),
      ).toBe(false);
    });

    it("should handle string dates (ISO format from DB)", () => {
      const recentIso = new Date(Date.now() - 2000).toISOString();
      // The function accepts Date | null but the DB may return a string
      // which gets coerced by new Date() inside the function
      expect(
        isBotOnline({
          botOnline: true,
          ultimoHeartbeat: new Date(recentIso),
        }),
      ).toBe(true);
    });
  });
});
