import { describe, it, expect } from "vitest";

// Replicamos a funcao aqui para testar isoladamente
function sanitizeIsoDate(dateStr: string): string {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateStr;
  const [, yearStr, monthStr, dayStr] = match;
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  if (month < 1 || month > 12) return dateStr;
  const lastDay = new Date(year, month, 0).getDate();
  const correctedDay = Math.min(day, lastDay);
  return `${yearStr}-${monthStr}-${String(correctedDay).padStart(2, "0")}`;
}

describe("sanitizeIsoDate", () => {
  it("deve manter datas validas inalteradas", () => {
    expect(sanitizeIsoDate("2026-06-30")).toBe("2026-06-30");
    expect(sanitizeIsoDate("2026-01-31")).toBe("2026-01-31");
    expect(sanitizeIsoDate("2026-12-31")).toBe("2026-12-31");
    expect(sanitizeIsoDate("2026-02-28")).toBe("2026-02-28");
  });

  it("deve corrigir 2026-06-31 para 2026-06-30 (junho tem 30 dias)", () => {
    expect(sanitizeIsoDate("2026-06-31")).toBe("2026-06-30");
  });

  it("deve corrigir 2026-02-30 para 2026-02-28 (fevereiro)", () => {
    expect(sanitizeIsoDate("2026-02-30")).toBe("2026-02-28");
  });

  it("deve corrigir 2024-02-30 para 2024-02-29 (ano bissexto)", () => {
    expect(sanitizeIsoDate("2024-02-30")).toBe("2024-02-29");
  });

  it("deve corrigir 2026-04-31 para 2026-04-30 (abril tem 30 dias)", () => {
    expect(sanitizeIsoDate("2026-04-31")).toBe("2026-04-30");
  });

  it("deve corrigir 2026-09-31 para 2026-09-30 (setembro tem 30 dias)", () => {
    expect(sanitizeIsoDate("2026-09-31")).toBe("2026-09-30");
  });

  it("deve corrigir 2026-11-31 para 2026-11-30 (novembro tem 30 dias)", () => {
    expect(sanitizeIsoDate("2026-11-31")).toBe("2026-11-30");
  });

  it("deve retornar string invalida sem alterar (para zod rejeitar)", () => {
    expect(sanitizeIsoDate("abc")).toBe("abc");
    expect(sanitizeIsoDate("2026-13-01")).toBe("2026-13-01"); // mes invalido
    expect(sanitizeIsoDate("2026-00-15")).toBe("2026-00-15"); // mes 0
  });

  it("deve lidar com meses de 31 dias sem alterar", () => {
    expect(sanitizeIsoDate("2026-01-31")).toBe("2026-01-31"); // janeiro
    expect(sanitizeIsoDate("2026-03-31")).toBe("2026-03-31"); // marco
    expect(sanitizeIsoDate("2026-05-31")).toBe("2026-05-31"); // maio
    expect(sanitizeIsoDate("2026-07-31")).toBe("2026-07-31"); // julho
    expect(sanitizeIsoDate("2026-08-31")).toBe("2026-08-31"); // agosto
    expect(sanitizeIsoDate("2026-10-31")).toBe("2026-10-31"); // outubro
    expect(sanitizeIsoDate("2026-12-31")).toBe("2026-12-31"); // dezembro
  });
});
