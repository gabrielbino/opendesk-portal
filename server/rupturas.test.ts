import { describe, expect, it } from "vitest";

import { parseNumeroBr } from "./erpQueries";
import { calcPctRuptura } from "./db/rupturas";
// Util do cliente é TS puro (sem imports/aliases) → importável direto no teste do server.
import { emojiRuptura, pctRuptura } from "../client/src/lib/rupturas";

describe("parseNumeroBr (formato brasileiro vindo da API)", () => {
  it("interpreta vírgula como separador decimal", () => {
    expect(parseNumeroBr("9,5")).toBeCloseTo(9.5);
    expect(parseNumeroBr("7,125")).toBeCloseTo(7.125);
    expect(parseNumeroBr("192,63157894737")).toBeCloseTo(192.63157894737);
  });

  it("trata ponto como separador de milhar quando há vírgula", () => {
    expect(parseNumeroBr("1.234,56")).toBeCloseTo(1234.56);
  });

  it("aceita inteiros e devolve null para vazio/inválido", () => {
    expect(parseNumeroBr("61")).toBe(61);
    expect(parseNumeroBr("")).toBeNull();
    expect(parseNumeroBr(null)).toBeNull();
    expect(parseNumeroBr(undefined)).toBeNull();
    expect(parseNumeroBr("abc")).toBeNull();
  });
});

describe("calcPctRuptura", () => {
  it("calcula a porcentagem", () => {
    expect(calcPctRuptura(10, 200)).toBeCloseTo(5);
    expect(calcPctRuptura(3, 12)).toBeCloseTo(25);
  });

  it("evita divisão por zero", () => {
    expect(calcPctRuptura(5, 0)).toBe(0);
    expect(calcPctRuptura(0, 0)).toBe(0);
  });

  it("é equivalente ao helper do cliente", () => {
    expect(calcPctRuptura(7, 140)).toBeCloseTo(pctRuptura(7, 140));
  });
});

describe("emojiRuptura (faixas e bordas)", () => {
  it("abaixo de 5% → 😁", () => {
    expect(emojiRuptura(0)).toBe("😁");
    expect(emojiRuptura(4.9)).toBe("😁");
    expect(emojiRuptura(5)).toBe("😁"); // 5 exato ainda é feliz (> 5 vira preocupado)
  });

  it("acima de 5% → 😨", () => {
    expect(emojiRuptura(5.1)).toBe("😨");
    expect(emojiRuptura(10)).toBe("😨");
  });

  it("acima de 10% → 😢", () => {
    expect(emojiRuptura(10.1)).toBe("😢");
    expect(emojiRuptura(15)).toBe("😢");
  });

  it("acima de 15% → 🤯", () => {
    expect(emojiRuptura(15.1)).toBe("🤯");
    expect(emojiRuptura(80)).toBe("🤯");
  });
});
