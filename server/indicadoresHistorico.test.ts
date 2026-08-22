import { describe, it, expect } from "vitest";

import {
  clampHHMM,
  dentroDaJanela,
  formatarHHMM,
  slot30,
  variacaoPct,
} from "@shared/indicadoresHistorico";

describe("indicadoresHistorico (regra pura)", () => {
  it("slot30 faz piso do minuto em :00 / :30", () => {
    expect(slot30(8, 0)).toBe("08:00");
    expect(slot30(8, 29)).toBe("08:00");
    expect(slot30(8, 30)).toBe("08:30");
    expect(slot30(8, 47)).toBe("08:30");
    expect(slot30(22, 0)).toBe("22:00");
  });

  it("formatarHHMM zero-pad", () => {
    expect(formatarHHMM(9, 5)).toBe("09:05");
    expect(formatarHHMM(14, 20)).toBe("14:20");
  });

  it("dentroDaJanela é inclusiva em 08:00 e 22:00", () => {
    expect(dentroDaJanela(7 * 60 + 59)).toBe(false);
    expect(dentroDaJanela(8 * 60)).toBe(true); // 08:00
    expect(dentroDaJanela(14 * 60 + 20)).toBe(true);
    expect(dentroDaJanela(22 * 60)).toBe(true); // 22:00
    expect(dentroDaJanela(22 * 60 + 1)).toBe(false);
  });

  it("clampHHMM limita à janela", () => {
    expect(clampHHMM("07:30")).toBe("08:00");
    expect(clampHHMM("14:20")).toBe("14:20");
    expect(clampHHMM("23:10")).toBe("22:00");
  });

  it("variacaoPct compara atual vs anterior; null sem base", () => {
    expect(variacaoPct(120, 100)).toBeCloseTo(20);
    expect(variacaoPct(80, 100)).toBeCloseTo(-20);
    expect(variacaoPct(100, 0)).toBeNull();
    expect(variacaoPct(100, null)).toBeNull();
  });
});
