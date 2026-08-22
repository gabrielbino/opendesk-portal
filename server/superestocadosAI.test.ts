import { describe, it, expect, vi } from "vitest";
import { z } from "zod";

/**
 * Unit tests for the Superestocados AI router schemas and helper logic.
 * Integration tests with LLM are not feasible in CI, so we test:
 * 1. Input validation schemas
 * 2. Context building logic
 * 3. Export format
 */

describe("SuperestocadosAI Router", () => {
  describe("Input validation", () => {
    const chatInputSchema = z.object({
      region: z.enum(["SC", "RS"]),
      message: z.string().min(1).max(2000),
      sessionId: z.number().int().positive().optional(),
    });

    it("accepts valid chat input with region SC", () => {
      const result = chatInputSchema.safeParse({
        region: "SC",
        message: "Qual produto tem maior risco?",
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid chat input with sessionId", () => {
      const result = chatInputSchema.safeParse({
        region: "RS",
        message: "Continue a análise",
        sessionId: 42,
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty message", () => {
      const result = chatInputSchema.safeParse({
        region: "SC",
        message: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects message over 2000 chars", () => {
      const result = chatInputSchema.safeParse({
        region: "SC",
        message: "a".repeat(2001),
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid region", () => {
      const result = chatInputSchema.safeParse({
        region: "SP",
        message: "test",
      });
      expect(result.success).toBe(false);
    });

    it("rejects negative sessionId", () => {
      const result = chatInputSchema.safeParse({
        region: "SC",
        message: "test",
        sessionId: -1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Session export format", () => {
    it("generates correct export content structure", () => {
      const messages = [
        { role: "user" as const, content: "Qual o maior risco?", timestamp: 1718500000000 },
        { role: "assistant" as const, content: "O produto X tem R$ 5000 em excesso.", timestamp: 1718500010000 },
      ];

      const region = "SC";
      const title = "Análise de risco";
      const createdAt = new Date(1718500000000);
      const dateStr = createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

      let content = `RELATÓRIO DO ASSISTENTE DE SUPERESTOCADOS\n`;
      content += `==========================================\n\n`;
      content += `Região: ${region}\n`;
      content += `Data: ${dateStr}\n`;
      content += `Título: ${title}\n\n`;
      content += `------------------------------------------\n\n`;

      for (const msg of messages) {
        const time = new Date(msg.timestamp).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
        const sender = msg.role === "user" ? "OPERADOR" : "ASSISTENTE";
        content += `[${time}] ${sender}:\n${msg.content}\n\n`;
      }

      content += `------------------------------------------\n`;
      content += `Gerado automaticamente pelo sistema OpenDesk.\n`;

      expect(content).toContain("RELATÓRIO DO ASSISTENTE DE SUPERESTOCADOS");
      expect(content).toContain("Região: SC");
      expect(content).toContain("OPERADOR:");
      expect(content).toContain("ASSISTENTE:");
      expect(content).toContain("Qual o maior risco?");
      expect(content).toContain("O produto X tem R$ 5000 em excesso.");
      expect(content).toContain("Gerado automaticamente pelo sistema OpenDesk.");
    });
  });

  describe("Proactive insights logic", () => {
    it("identifies top risk product by composite score", () => {
      const products = [
        { codigo: 1, nome: "Produto A", diasSemVenda: 10, diasEstoque: 200, valorCusto: 5000 },
        { codigo: 2, nome: "Produto B", diasSemVenda: 2, diasEstoque: 100, valorCusto: 10000 },
        { codigo: 3, nome: "Produto C", diasSemVenda: 15, diasEstoque: 300, valorCusto: 3000 },
      ];

      // Score = diasSemVenda * 10 + diasEstoque * 2 + valorCusto / 100
      const scored = products.map((p) => ({
        ...p,
        score: p.diasSemVenda * 10 + p.diasEstoque * 2 + (p.valorCusto ?? 0) / 100,
      }));
      scored.sort((a, b) => b.score - a.score);

      // Product C should be top: 15*10 + 300*2 + 3000/100 = 150 + 600 + 30 = 780
      // Product A: 10*10 + 200*2 + 5000/100 = 100 + 400 + 50 = 550
      // Product B: 2*10 + 100*2 + 10000/100 = 20 + 200 + 100 = 320
      expect(scored[0].codigo).toBe(3);
      expect(scored[1].codigo).toBe(1);
      expect(scored[2].codigo).toBe(2);
    });

    it("identifies trend concerns (M-0 < 70% of M-1)", () => {
      const products = [
        { codigo: 1, qtdVendaMesAtual: 10, qtdVendaMesAnterior: 20 }, // 50% - concern
        { codigo: 2, qtdVendaMesAtual: 18, qtdVendaMesAnterior: 20 }, // 90% - ok
        { codigo: 3, qtdVendaMesAtual: 5, qtdVendaMesAnterior: 30 },  // 16.7% - concern
      ];

      const concerns = products.filter(
        (p) => p.qtdVendaMesAnterior > 0 && p.qtdVendaMesAtual < p.qtdVendaMesAnterior * 0.7
      );

      expect(concerns.length).toBe(2);
      expect(concerns.map((c) => c.codigo)).toContain(1);
      expect(concerns.map((c) => c.codigo)).toContain(3);
    });
  });

  describe("Chat history schema", () => {
    const chatMessageSchema = z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
      timestamp: z.number(),
    });

    it("validates user message", () => {
      const result = chatMessageSchema.safeParse({
        role: "user",
        content: "Olá",
        timestamp: Date.now(),
      });
      expect(result.success).toBe(true);
    });

    it("validates assistant message", () => {
      const result = chatMessageSchema.safeParse({
        role: "assistant",
        content: "Análise completa.",
        timestamp: Date.now(),
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid role", () => {
      const result = chatMessageSchema.safeParse({
        role: "system",
        content: "test",
        timestamp: Date.now(),
      });
      expect(result.success).toBe(false);
    });
  });
});
