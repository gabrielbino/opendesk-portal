import type { Area, Setor, Equipment, MapaSnapshot } from "@shared/inventarioMapa";

/** Arquivo de backup/restauração do mapa (JSON). */
export interface ProjectFile {
  meta: { nome: string; exportadoEm: string; versao: string };
  areas: Area[];
  setores: Setor[];
  equipamentos: Equipment[];
}

const VERSAO = "2.0";

export function buildProjectFile(snap: MapaSnapshot, nome = "inventario"): ProjectFile {
  return {
    meta: { nome, exportadoEm: new Date().toISOString(), versao: VERSAO },
    areas: snap.areas,
    setores: snap.setores,
    equipamentos: snap.equipamentos,
  };
}

/** Dispara o download do snapshot como arquivo .json. */
export function exportProjectJson(snap: MapaSnapshot, nome = "inventario") {
  const blob = new Blob([JSON.stringify(buildProjectFile(snap, nome), null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nome}-mapa.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Lê um arquivo .json exportado e devolve o snapshot. */
export async function importProjectJson(file: File): Promise<MapaSnapshot> {
  const texto = (await file.text()).replace(/^﻿/, "").trim();
  const dados = JSON.parse(texto);
  return {
    areas: Array.isArray(dados?.areas) ? dados.areas : [],
    setores: Array.isArray(dados?.setores) ? dados.setores : [],
    equipamentos: Array.isArray(dados?.equipamentos)
      ? dados.equipamentos
      : Array.isArray(dados?.equipments)
        ? dados.equipments
        : [],
  };
}
