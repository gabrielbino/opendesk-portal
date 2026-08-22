import { describe, expect, it } from "vitest";
import {
  descreverAgenda,
  estaAtivoAgora,
  normalizarAgenda,
  partesSP,
  type Agenda,
} from "@shared/agenda";

describe("normalizarAgenda", () => {
  it("dedup, ordena e descarta dias fora de 0..6", () => {
    const a = normalizarAgenda({ diasSemana: [5, 1, 1, 9, -2, 3], horaInicio: 8, horaFim: 18 });
    expect(a.diasSemana).toEqual([1, 3, 5]);
  });

  it("aplica padrões e clampa horas para 0..24", () => {
    expect(normalizarAgenda(null)).toEqual({ diasSemana: [], horaInicio: 0, horaFim: 24 });
    expect(normalizarAgenda({ horaInicio: -5, horaFim: 99 })).toMatchObject({
      horaInicio: 0,
      horaFim: 24,
    });
  });
});

describe("estaAtivoAgora", () => {
  // Instante fixo; derivamos o dia-da-semana SP do próprio helper para o teste ser
  // auto-consistente (sem hardcodar calendário).
  const quando = new Date("2026-07-06T12:00:00Z"); // 09:00 no fuso SP (UTC-3)
  const { diaSemana, hora } = partesSP(quando);

  it("ativo quando o dia está marcado e a hora cai na janela", () => {
    const a: Agenda = { diasSemana: [diaSemana], horaInicio: hora, horaFim: hora + 1 };
    expect(estaAtivoAgora(a, quando)).toBe(true);
  });

  it("inativo quando o dia da semana não está marcado", () => {
    const outroDia = (diaSemana + 1) % 7;
    const a: Agenda = { diasSemana: [outroDia], horaInicio: 0, horaFim: 24 };
    expect(estaAtivoAgora(a, quando)).toBe(false);
  });

  it("inativo antes do início e no topo da hora final (fim exclusivo)", () => {
    expect(estaAtivoAgora({ diasSemana: [diaSemana], horaInicio: hora + 1, horaFim: 24 }, quando)).toBe(
      false,
    );
    expect(estaAtivoAgora({ diasSemana: [diaSemana], horaInicio: 0, horaFim: hora }, quando)).toBe(false);
  });

  it("sem dias marcados nunca está ativo", () => {
    expect(estaAtivoAgora({ diasSemana: [], horaInicio: 0, horaFim: 24 }, quando)).toBe(false);
  });
});

describe("descreverAgenda", () => {
  it("descreve dias + janela em pt-BR", () => {
    expect(descreverAgenda({ diasSemana: [1, 2, 3, 4, 5], horaInicio: 8, horaFim: 18 })).toBe(
      "Seg, Ter, Qua, Qui, Sex · 08:00–18:00",
    );
  });
  it("reconhece 24h e todos os dias", () => {
    expect(descreverAgenda({ diasSemana: [0, 1, 2, 3, 4, 5, 6], horaInicio: 0, horaFim: 24 })).toBe(
      "Todos os dias · 24h",
    );
  });
  it("acusa nenhum dia marcado", () => {
    expect(descreverAgenda({ diasSemana: [], horaInicio: 0, horaFim: 24 })).toBe(
      "Nenhum dia marcado (inativo)",
    );
  });
});
