import { describe, expect, it } from "vitest";
import {
  anoMesSP,
  calcularCorte,
  dataSP,
  mesEhAntigo,
  spInicioDoDia,
} from "@shared/monitorArquivosBackup";
import { partesSP } from "@shared/agenda";

describe("dataSP / anoMesSP / spInicioDoDia", () => {
  it("formata data e mês no fuso SP", () => {
    const d = new Date("2026-07-28T12:00:00-03:00");
    expect(dataSP(d)).toBe("2026-07-28");
    expect(anoMesSP(d)).toEqual({ ano: "2026", mes: "07" });
  });
  it("um instante logo após a meia-noite SP cai no dia certo", () => {
    // 00:30 SP de 01/08 = 03:30 UTC — não pode 'voltar' para 31/07.
    const d = spInicioDoDia(2026, 8, 1);
    expect(dataSP(new Date(d.getTime() + 30 * 60000))).toBe("2026-08-01");
  });
});

describe("calcularCorte", () => {
  it("corridos: mantém os últimos N dias (corte = hoje 00:00 − (N−1) dias)", () => {
    const agora = new Date("2026-08-10T14:00:00-03:00");
    const corte = calcularCorte(agora, 2, "corridos");
    // Mantém 10/08 e 09/08 → corte no início de 09/08.
    expect(dataSP(corte)).toBe("2026-08-09");
    expect(partesSP(corte).hora).toBe(0);
  });

  it("uteis: corte é um dia útil e há exatamente N dias úteis de [corte..hoje]", () => {
    const agora = new Date("2026-08-10T06:00:00-03:00");
    const n = 5;
    const corte = calcularCorte(agora, n, "uteis");
    const wdCorte = partesSP(corte).diaSemana;
    expect(wdCorte).not.toBe(0);
    expect(wdCorte).not.toBe(6);
    // Conta dias úteis de corte até hoje (inclusive) — deve dar N.
    const hojeP = partesSP(agora);
    const hoje = spInicioDoDia(hojeP.ano, hojeP.mes, hojeP.dia).getTime();
    let uteis = 0;
    for (let t = corte.getTime(); t <= hoje; t += 86400000) {
      const wd = partesSP(new Date(t)).diaSemana;
      if (wd !== 0 && wd !== 6) uteis++;
    }
    expect(uteis).toBe(n);
    expect(corte.getTime()).toBeLessThanOrEqual(hoje);
  });

  it("N mínimo é 1", () => {
    const agora = new Date("2026-08-10T06:00:00-03:00");
    expect(calcularCorte(agora, 0, "corridos").getTime()).toBe(
      calcularCorte(agora, 1, "corridos").getTime(),
    );
  });
});

describe("mesEhAntigo", () => {
  const agora = new Date("2026-08-15T12:00:00-03:00"); // agosto/2026
  it("mantém os últimos 12 meses + o corrente", () => {
    // 12 meses antes de agosto/2026 = agosto/2025 → ainda mantido (não é antigo).
    expect(mesEhAntigo(2025, 8, agora, 12)).toBe(false);
    // 13 meses antes = julho/2025 → antigo (poda).
    expect(mesEhAntigo(2025, 7, agora, 12)).toBe(true);
    // mês corrente nunca é antigo.
    expect(mesEhAntigo(2026, 8, agora, 12)).toBe(false);
  });
});
