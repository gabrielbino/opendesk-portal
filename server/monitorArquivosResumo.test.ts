import { describe, it, expect } from "vitest";

import { montarResumoImagem, type ResumoItem } from "@shared/monitorArquivosResumo";
import type { StatusCor } from "@shared/monitorArquivos";

const item = (nome: string, cor: StatusCor, detalhe = ""): ResumoItem => ({ nome, cor, detalhe });
const ZERO: Record<StatusCor, number> = { vermelho: 0, amarelo: 0, azul: 0, verde: 0, inativo: 0 };

describe("montarResumoImagem", () => {
  it("conta os KPIs de pedidos por cor a partir dos itens", () => {
    const p = montarResumoImagem(
      {
        geradoEm: "2026-08-12T00:00:00.000Z",
        pedidosItens: [item("A", "verde"), item("B", "verde"), item("C", "vermelho"), item("D", "azul")],
        listasItens: [],
        listasKpis: ZERO,
      },
      { incluirPedidos: true, incluirListas: true },
    );
    expect(p.pedidos.kpis).toEqual({ vermelho: 1, amarelo: 0, azul: 1, verde: 2, inativo: 0 });
    expect(p.pedidos.mostrar).toBe(true);
  });

  it("usa os KPIs de listas passados pelo cérebro (granularidade por lista)", () => {
    const listasKpis = { vermelho: 2, amarelo: 0, azul: 3, verde: 40, inativo: 6 };
    const p = montarResumoImagem(
      {
        geradoEm: "2026-08-12T00:00:00.000Z",
        pedidosItens: [],
        listasItens: [item("Integração X", "vermelho", "2 de 3 não gerada(s)")],
        listasKpis,
      },
      { incluirPedidos: true, incluirListas: true },
    );
    expect(p.listas.kpis).toEqual(listasKpis);
    expect(p.listas.mostrar).toBe(true);
  });

  it("ordena os itens pior-primeiro (vermelho → amarelo → azul → verde → inativo)", () => {
    const p = montarResumoImagem(
      {
        geradoEm: "x",
        pedidosItens: [item("verde", "verde"), item("vermelho", "vermelho"), item("azul", "azul"), item("inativo", "inativo"), item("amarelo", "amarelo")],
        listasItens: [],
        listasKpis: ZERO,
      },
      { incluirPedidos: true, incluirListas: true },
    );
    expect(p.pedidos.itens.map((i) => i.cor)).toEqual(["vermelho", "amarelo", "azul", "verde", "inativo"]);
  });

  it("não mostra a seção quando desativada ou sem itens", () => {
    const p = montarResumoImagem(
      {
        geradoEm: "x",
        pedidosItens: [item("A", "verde")],
        listasItens: [item("B", "verde")],
        listasKpis: { ...ZERO, verde: 1 },
      },
      { incluirPedidos: false, incluirListas: true },
    );
    expect(p.pedidos.mostrar).toBe(false); // desativada
    expect(p.listas.mostrar).toBe(true);

    const q = montarResumoImagem(
      { geradoEm: "x", pedidosItens: [], listasItens: [], listasKpis: ZERO },
      { incluirPedidos: true, incluirListas: true },
    );
    expect(q.pedidos.mostrar).toBe(false); // sem itens
    expect(q.listas.mostrar).toBe(false);
  });

  it("caption resume as cores das seções mostradas (vermelho sempre aparece)", () => {
    const p = montarResumoImagem(
      {
        geradoEm: "x",
        pedidosItens: [item("A", "verde"), item("B", "verde")],
        listasItens: [item("C", "vermelho")],
        listasKpis: { ...ZERO, vermelho: 1 },
      },
      { incluirPedidos: true, incluirListas: true, titulo: "Cenário" },
    );
    expect(p.caption).toContain("Cenário");
    expect(p.caption).toContain("Pedidos: 🔴0 🟢2");
    expect(p.caption).toContain("Listas: 🔴1");
  });
});
