import type { Equipment, Periferico, PerifericoTipo } from "@shared/inventarioMapa";
import { PERIFERICO_TIPOS } from "@shared/inventarioMapa";
import { generateId } from "./ids";

/** Estrutura (flexível) do JSON gerado pelo coletor do pendrive. */
export interface Coleta {
  nome?: string;
  patrimonio?: string;
  serial?: string;
  mac?: string;
  sistemaOperacional?: string;
  responsavel?: string;
  departamento?: string;
  perifericos?: { tipo?: string; descricao?: string; patrimonio?: string }[];
}

/**
 * Lê o texto de um arquivo de coleta e devolve uma lista de coletas.
 * Aceita tanto um objeto único quanto um array de objetos.
 */
export function parseColetas(texto: string): Coleta[] {
  // Remove BOM eventual para não quebrar o JSON.parse.
  const limpo = texto.replace(/^﻿/, "").trim();
  const dados = JSON.parse(limpo);
  const lista: unknown[] = Array.isArray(dados) ? dados : [dados];
  return lista.filter((d): d is Coleta => !!d && typeof d === "object");
}

function normalizarTipo(tipo?: string): PerifericoTipo {
  const t = (tipo ?? "").trim();
  const achado = PERIFERICO_TIPOS.find((p) => p.toLowerCase() === t.toLowerCase());
  return achado ?? "Outro";
}

/**
 * Converte uma coleta em um Equipment pronto para o mapa. O computador
 * entra "solto" (sem setor) numa posição absoluta calculada a partir do
 * índice, para o usuário depois arrastá-lo até o setor correto.
 */
export function coletaToEquipment(coleta: Coleta, index: number): Equipment {
  const perifericos: Periferico[] = (coleta.perifericos ?? []).map((p) => ({
    id: generateId("per"),
    tipo: normalizarTipo(p.tipo),
    descricao: (p.descricao ?? "").trim(),
    patrimonio: (p.patrimonio ?? "").trim(),
  }));

  const col = index % 6;
  const row = Math.floor(index / 6);

  return {
    id: generateId("pc"),
    tipo: "Computador",
    setorId: null,
    posicao: { x: 60 + col * 140, y: 780 + row * 150 },
    geral: {
      nome: (coleta.nome ?? "Computador").trim(),
      patrimonio: (coleta.patrimonio || coleta.serial || "").trim(),
      mac: (coleta.mac ?? "").trim(),
      sistemaOperacional: (coleta.sistemaOperacional ?? "").trim(),
      responsavel: (coleta.responsavel ?? "").trim(),
      departamento: (coleta.departamento ?? "").trim(),
      status: "Online",
    },
    perifericos,
  };
}
