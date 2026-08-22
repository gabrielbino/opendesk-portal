import { nanoid } from "nanoid";

/**
 * Gera um id curto e único para áreas, setores, equipamentos e periféricos.
 * Prefixado por tipo para facilitar leitura; cabe em VARCHAR(36).
 */
export function generateId(prefix?: string): string {
  const id = nanoid(16);
  return prefix ? `${prefix}_${id}` : id;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
