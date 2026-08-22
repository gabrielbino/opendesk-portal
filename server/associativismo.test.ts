import { describe, it, expect } from "vitest";
import { reconciliar, normalizarCnpj, type MembroGrupo } from "@shared/associativismo";

const membros: MembroGrupo[] = [
  { cnpj: "02215338000277", codGrupo: 1, desGrupo: "SC USIMED" }, // no grupo alvo
  { cnpj: "02215338000196", codGrupo: 1, desGrupo: "SC USIMED" }, // no grupo alvo, some da planilha → remover
  { cnpj: "11111111000191", codGrupo: 2, desGrupo: "OUTRO GRUPO" }, // em outro grupo → cadastrar
];

describe("associativismo.reconciliar", () => {
  it("normalizarCnpj remove máscara e mantém dígitos", () => {
    expect(normalizarCnpj("02.215.338/0002-77")).toBe("02215338000277");
    expect(normalizarCnpj(" 123 ")).toBe("123");
    expect(normalizarCnpj(null)).toBe("");
  });

  it("classifica em jaNoGrupo / aCadastrar / aRemover e ignora fora da base", () => {
    const r = reconciliar({
      codGrupos: [1],
      // planilha: um já no grupo, um de outro grupo (cadastrar), um fora da base (ignora)
      cnpjsPlanilha: ["02.215.338/0002-77", "11111111000191", "99999999000100"],
      membros,
    });
    expect(r.jaNoGrupo.map((i) => i.cnpj)).toEqual(["02215338000277"]);
    expect(r.aCadastrar.map((i) => i.cnpj)).toEqual(["11111111000191"]);
    // aCadastrar carrega o grupo ATUAL (de onde ele sai)
    expect(r.aCadastrar[0]).toMatchObject({ grupoAtualCod: 2, grupoAtualDesc: "OUTRO GRUPO" });
    // 02215338000196 está no grupo 1 mas não veio na planilha → remover
    expect(r.aRemover.map((i) => i.cnpj)).toEqual(["02215338000196"]);
    expect(r.ignorados).toBe(1);
    expect(r.totalPlanilha).toBe(3);
  });

  it("deduplica a planilha e ignora vazios/inválidos", () => {
    const r = reconciliar({
      codGrupos: [1],
      cnpjsPlanilha: ["02215338000277", "02215338000277", "", "  "],
      membros,
    });
    expect(r.totalPlanilha).toBe(1);
    expect(r.jaNoGrupo).toHaveLength(1);
  });

  it("planilha vazia → tudo do grupo alvo vira aRemover", () => {
    const r = reconciliar({ codGrupos: [1], cnpjsPlanilha: [], membros });
    expect(r.aRemover.map((i) => i.cnpj).sort()).toEqual(["02215338000196", "02215338000277"].sort());
    expect(r.jaNoGrupo).toHaveLength(0);
    expect(r.aCadastrar).toHaveLength(0);
  });

  it("multi-grupo (escopo consolidado): grupos 1 e 2 no escopo", () => {
    const r = reconciliar({
      codGrupos: [1, 2],
      // 11111111000191 está no grupo 2 (agora dentro do escopo) → já no grupo
      cnpjsPlanilha: ["02215338000277", "11111111000191"],
      membros,
    });
    expect(r.jaNoGrupo.map((i) => i.cnpj).sort()).toEqual(["02215338000277", "11111111000191"].sort());
    expect(r.aCadastrar).toHaveLength(0); // ninguém fora do escopo {1,2}
    // 02215338000196 (grupo 1, no escopo) não veio na planilha → remover
    expect(r.aRemover.map((i) => i.cnpj)).toEqual(["02215338000196"]);
  });
});
