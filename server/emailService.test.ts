import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  sendEmail,
  generateTicketResponseEmailTemplate,
  generateNewTicketEmailTemplate,
} from "./_core/emailService";

// Mock fetch
global.fetch = vi.fn();

describe("Email Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateTicketResponseEmailTemplate", () => {
    it("should generate HTML email template with ticket response", () => {
      const template = generateTicketResponseEmailTemplate({
        ticketId: "bilhete_001",
        ticketTitle: "Sistema não funciona",
        responderName: "João Admin",
        responseContent: "Já resolvemos o problema. Teste agora.",
        ticketUrl: "https://opendesk.manus.space/suporte/1",
      });

      expect(template).toContain("bilhete_001");
      expect(template).toContain("Sistema não funciona");
      expect(template).toContain("João Admin");
      expect(template).toContain("Já resolvemos o problema. Teste agora.");
      expect(template).toContain("https://opendesk.manus.space/suporte/1");
      expect(template).toContain("<!DOCTYPE html>");
      expect(template).toContain("Resposta no Chamado");
    });

    it("should escape HTML special characters in response content", () => {
      const template = generateTicketResponseEmailTemplate({
        ticketId: "bilhete_002",
        ticketTitle: "Teste",
        responderName: "Admin",
        responseContent: "<script>alert('xss')</script>",
        ticketUrl: "https://opendesk.manus.space/suporte/2",
      });

      expect(template).not.toContain("<script>");
      expect(template).toContain("&lt;script&gt;");
    });

    it("should convert newlines to HTML line breaks", () => {
      const template = generateTicketResponseEmailTemplate({
        ticketId: "bilhete_003",
        ticketTitle: "Teste",
        responderName: "Admin",
        responseContent: "Linha 1\nLinha 2\nLinha 3",
        ticketUrl: "https://opendesk.manus.space/suporte/3",
      });

      expect(template).toContain("Linha 1<br>Linha 2<br>Linha 3");
    });
  });

  describe("generateNewTicketEmailTemplate", () => {
    it("should generate HTML email template for new ticket", () => {
      const template = generateNewTicketEmailTemplate({
        ticketId: "bilhete_001",
        ticketTitle: "Problema com acesso",
        creatorName: "Maria Silva",
        description: "Não consigo acessar o sistema",
        priority: "Alta",
        ticketUrl: "https://opendesk.manus.space/suporte/1",
      });

      expect(template).toContain("bilhete_001");
      expect(template).toContain("Problema com acesso");
      expect(template).toContain("Maria Silva");
      expect(template).toContain("Não consigo acessar o sistema");
      expect(template).toContain("Alta");
      expect(template).toContain("<!DOCTYPE html>");
      expect(template).toContain("Novo Chamado Aberto");
    });

    it("should apply correct priority color", () => {
      const templateAlta = generateNewTicketEmailTemplate({
        ticketId: "bilhete_001",
        ticketTitle: "Teste",
        creatorName: "User",
        description: "Teste",
        priority: "Alta",
        ticketUrl: "https://opendesk.manus.space/suporte/1",
      });

      const templateMedia = generateNewTicketEmailTemplate({
        ticketId: "bilhete_002",
        ticketTitle: "Teste",
        creatorName: "User",
        description: "Teste",
        priority: "Média",
        ticketUrl: "https://opendesk.manus.space/suporte/2",
      });

      const templateBaixa = generateNewTicketEmailTemplate({
        ticketId: "bilhete_003",
        ticketTitle: "Teste",
        creatorName: "User",
        description: "Teste",
        priority: "Baixa",
        ticketUrl: "https://opendesk.manus.space/suporte/3",
      });

      // Check that different colors are applied
      expect(templateAlta).toContain("#dc3545"); // Red for Alta
      expect(templateMedia).toContain("#ffc107"); // Yellow for Média
      expect(templateBaixa).toContain("#28a745"); // Green for Baixa
    });
  });

  describe("sendEmail", () => {
    it("should send email successfully", async () => {
      const mockFetch = global.fetch as any;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => "",
      });

      const result = await sendEmail({
        to: "user@example.com",
        subject: "Test Email",
        htmlContent: "<p>Test content</p>",
      });

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should return false when email service fails", async () => {
      const mockFetch = global.fetch as any;
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "Service error",
      });

      const result = await sendEmail({
        to: "user@example.com",
        subject: "Test Email",
        htmlContent: "<p>Test content</p>",
      });

      expect(result).toBe(false);
    });

    it("should return false when email service is unavailable", async () => {
      const mockFetch = global.fetch as any;
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await sendEmail({
        to: "user@example.com",
        subject: "Test Email",
        htmlContent: "<p>Test content</p>",
      });

      expect(result).toBe(false);
    });

    it("should include correct headers in request", async () => {
      const mockFetch = global.fetch as any;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => "",
      });

      await sendEmail({
        to: "user@example.com",
        subject: "Test Email",
        htmlContent: "<p>Test content</p>",
      });

      const callArgs = mockFetch.mock.calls[0];
      const options = callArgs[1];

      expect(options.method).toBe("POST");
      expect(options.headers["content-type"]).toBe("application/json");
      expect(options.headers["authorization"]).toContain("Bearer");
    });

    it("should generate plain text version from HTML", async () => {
      const mockFetch = global.fetch as any;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => "",
      });

      await sendEmail({
        to: "user@example.com",
        subject: "Test Email",
        htmlContent: "<p>Test <strong>content</strong> here</p>",
      });

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.textContent).toContain("Test");
      expect(body.textContent).toContain("content");
      expect(body.textContent).toContain("here");
      expect(body.textContent).not.toContain("<");
      expect(body.textContent).not.toContain(">");
    });
  });
});
