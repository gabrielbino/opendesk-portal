import type { Equipment, EquipmentType, Position } from "@shared/inventarioMapa";
import { generateId } from "./ids";

/** Cria um computador em branco (status inicial Online) numa posição dada. */
export function createEmptyEquipment(tipo: EquipmentType, posicao: Position): Equipment {
  return {
    id: generateId("pc"),
    tipo,
    setorId: null,
    posicao,
    geral: {
      nome: `Novo ${tipo}`,
      patrimonio: "",
      mac: "",
      sistemaOperacional: "",
      responsavel: "",
      departamento: "",
      status: "Online",
    },
    perifericos: [],
  };
}
