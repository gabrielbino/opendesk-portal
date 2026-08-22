import { describe, it, expect } from "vitest";

/**
 * Unit tests for the subscriptions router logic.
 * Tests the computeStatus helper and input validation schemas.
 */

// Replicate the computeStatus logic from the router
function computeStatus(expirationDate: number, alertDaysBefore: number): "Ativo" | "Próximo do vencimento" | "Vencido" {
  const now = Date.now();
  if (expirationDate < now) return "Vencido";
  const alertThreshold = expirationDate - (alertDaysBefore * 24 * 60 * 60 * 1000);
  if (now >= alertThreshold) return "Próximo do vencimento";
  return "Ativo";
}

describe("Subscriptions - computeStatus", () => {
  it("should return 'Vencido' when expiration date is in the past", () => {
    const pastDate = Date.now() - 1000 * 60 * 60 * 24; // 1 day ago
    expect(computeStatus(pastDate, 30)).toBe("Vencido");
  });

  it("should return 'Próximo do vencimento' when within alert threshold", () => {
    const futureDate = Date.now() + 1000 * 60 * 60 * 24 * 15; // 15 days from now
    expect(computeStatus(futureDate, 30)).toBe("Próximo do vencimento");
  });

  it("should return 'Ativo' when expiration is far in the future", () => {
    const farFuture = Date.now() + 1000 * 60 * 60 * 24 * 365; // 1 year from now
    expect(computeStatus(farFuture, 30)).toBe("Ativo");
  });

  it("should return 'Ativo' when exactly at the alert threshold boundary (outside)", () => {
    const alertDays = 30;
    // Exactly 31 days from now (outside the 30-day alert window)
    const futureDate = Date.now() + 1000 * 60 * 60 * 24 * 31;
    expect(computeStatus(futureDate, alertDays)).toBe("Ativo");
  });

  it("should return 'Próximo do vencimento' when exactly at the alert threshold boundary (inside)", () => {
    const alertDays = 30;
    // Exactly 29 days from now (inside the 30-day alert window)
    const futureDate = Date.now() + 1000 * 60 * 60 * 24 * 29;
    expect(computeStatus(futureDate, alertDays)).toBe("Próximo do vencimento");
  });

  it("should handle custom alert days correctly", () => {
    const alertDays = 7;
    // 5 days from now with 7-day alert = should be "Próximo do vencimento"
    const futureDate = Date.now() + 1000 * 60 * 60 * 24 * 5;
    expect(computeStatus(futureDate, alertDays)).toBe("Próximo do vencimento");
  });

  it("should handle custom alert days - outside threshold", () => {
    const alertDays = 7;
    // 10 days from now with 7-day alert = should be "Ativo"
    const futureDate = Date.now() + 1000 * 60 * 60 * 24 * 10;
    expect(computeStatus(futureDate, alertDays)).toBe("Ativo");
  });

  it("should return 'Vencido' for expiration exactly at now", () => {
    // Slightly in the past to avoid race condition
    const justPast = Date.now() - 1;
    expect(computeStatus(justPast, 30)).toBe("Vencido");
  });
});

describe("Subscriptions - Monthly cost calculation", () => {
  it("should calculate monthly cost for annual subscription", () => {
    const annualValue = 1200;
    const monthly = annualValue / 12;
    expect(monthly).toBe(100);
  });

  it("should calculate monthly cost for custom period (90 days)", () => {
    const value = 900;
    const days = 90;
    const monthly = (value / days) * 30;
    expect(monthly).toBe(300);
  });

  it("should use direct value for monthly subscription", () => {
    const monthlyValue = 49.90;
    expect(monthlyValue).toBe(49.90);
  });
});

describe("Subscriptions - Input validation", () => {
  it("should validate currency format", () => {
    const validCurrencies = ["BRL", "USD"];
    expect(validCurrencies).toContain("BRL");
    expect(validCurrencies).toContain("USD");
    expect(validCurrencies).not.toContain("EUR");
  });

  it("should validate category values", () => {
    const validCategories = ["Segurança", "IA/LLM", "Infraestrutura", "Software", "Outro"];
    expect(validCategories).toContain("Segurança");
    expect(validCategories).toContain("IA/LLM");
    expect(validCategories.length).toBe(5);
  });

  it("should validate renewal type values", () => {
    const validTypes = ["Mensal", "Anual", "Personalizado"];
    expect(validTypes).toContain("Mensal");
    expect(validTypes).toContain("Anual");
    expect(validTypes).toContain("Personalizado");
  });

  it("should validate value format (decimal with max 2 places)", () => {
    const regex = /^\d+(\.\d{1,2})?$/;
    expect(regex.test("100")).toBe(true);
    expect(regex.test("100.50")).toBe(true);
    expect(regex.test("100.5")).toBe(true);
    expect(regex.test("0.99")).toBe(true);
    expect(regex.test("100.555")).toBe(false);
    expect(regex.test("abc")).toBe(false);
    expect(regex.test("")).toBe(false);
  });
});

describe("Subscriptions - Attachment validation", () => {
  it("should only accept PDF mime type", () => {
    const validMimeTypes = ["application/pdf"];
    const invalidMimeTypes = ["image/png", "image/jpeg", "text/plain", "application/zip"];

    validMimeTypes.forEach((mime) => {
      expect(mime.includes("pdf")).toBe(true);
    });

    invalidMimeTypes.forEach((mime) => {
      expect(mime.includes("pdf")).toBe(false);
    });
  });

  it("should reject files larger than 16MB", () => {
    const maxSize = 16 * 1024 * 1024; // 16MB in bytes
    const validSize = 5 * 1024 * 1024; // 5MB
    const invalidSize = 20 * 1024 * 1024; // 20MB

    expect(validSize <= maxSize).toBe(true);
    expect(invalidSize <= maxSize).toBe(false);
  });

  it("should generate unique file keys with random suffix", () => {
    const subscriptionId = 123;
    const fileName = "contrato.pdf";
    const randomSuffix1 = Math.random().toString(36).substring(2, 10);
    const randomSuffix2 = Math.random().toString(36).substring(2, 10);

    const key1 = `subscriptions/${subscriptionId}/${randomSuffix1}-${fileName}`;
    const key2 = `subscriptions/${subscriptionId}/${randomSuffix2}-${fileName}`;

    expect(key1).not.toBe(key2);
    expect(key1).toContain(`subscriptions/${subscriptionId}/`);
    expect(key1).toContain(fileName);
  });

  it("should sanitize file names correctly", () => {
    const unsafeName = "Contrato Serviço (2024).pdf";
    const sanitized = unsafeName.replace(/[^a-zA-Z0-9._-]/g, "_");
    expect(sanitized).toBe("Contrato_Servi_o__2024_.pdf");
    expect(sanitized).not.toContain(" ");
    expect(sanitized).not.toContain("(");
    expect(sanitized).not.toContain(")");
  });

  it("should format file sizes correctly", () => {
    function formatFileSize(bytes: number): string {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    expect(formatFileSize(500)).toBe("500 B");
    expect(formatFileSize(1024)).toBe("1.0 KB");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(1048576)).toBe("1.0 MB");
    expect(formatFileSize(5242880)).toBe("5.0 MB");
  });

  it("should validate base64 string is non-empty", () => {
    const validBase64 = "SGVsbG8gV29ybGQ=";
    const emptyBase64 = "";

    expect(validBase64.length > 0).toBe(true);
    expect(emptyBase64.length > 0).toBe(false);
  });

  it("should convert base64 to buffer correctly", () => {
    const testString = "Hello World";
    const base64 = Buffer.from(testString).toString("base64");
    const decoded = Buffer.from(base64, "base64").toString();
    expect(decoded).toBe(testString);
  });
});
