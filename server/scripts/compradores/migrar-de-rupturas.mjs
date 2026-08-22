/**
 * Migração: semeia o registro compartilhado de compradores (gn_*) a partir do
 * `rupturas_compradores` já existente em produção — preserva os vínculos manuais.
 * Idempotente (upsert por nome de comprador e por marca).
 *
 * Uso: node server/scripts/compradores/migrar-de-rupturas.mjs
 * Pré-requisito: rodar antes o apply-schema.mjs (gn_compradores/gn_comprador_marcas/gn_marcas).
 *
 * Regra: cada `fornecedor` do rupturas_compradores vira uma marca vinculada ao comprador
 * de mesmo nome. Se a mesma marca já estiver vinculada a OUTRO comprador em gn_*, mantém o
 * vínculo existente (não sobrescreve) e loga o conflito.
 */

import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não definida no .env. Aborte.");
    process.exit(1);
  }
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [rows] = await conn.execute(
      "SELECT fornecedor, comprador FROM rupturas_compradores WHERE comprador IS NOT NULL AND TRIM(comprador) <> ''",
    );
    if (!rows.length) {
      console.log("Nenhum vínculo em rupturas_compradores — nada a migrar.");
      return;
    }

    // 1) Cria compradores distintos (por nome).
    const nomes = [...new Set(rows.map((r) => String(r.comprador).trim()))];
    for (const nome of nomes) {
      await conn.execute(
        "INSERT INTO gn_compradores (nome) VALUES (?) ON DUPLICATE KEY UPDATE nome = VALUES(nome)",
        [nome],
      );
    }
    const [compradorRows] = await conn.execute("SELECT id, nome FROM gn_compradores");
    const idPorNome = new Map(compradorRows.map((c) => [c.nome, c.id]));

    // 2) Vincula cada marca ao seu comprador (respeitando UNIQUE(marca) — não sobrescreve).
    let vinculadas = 0;
    let conflitos = 0;
    for (const r of rows) {
      const marca = String(r.fornecedor).trim();
      const compradorId = idPorNome.get(String(r.comprador).trim());
      if (!marca || !compradorId) continue;

      const [existente] = await conn.execute(
        `SELECT cm.compradorId, c.nome FROM gn_comprador_marcas cm
           JOIN gn_compradores c ON c.id = cm.compradorId
          WHERE cm.marca = ?`,
        [marca],
      );
      if (existente.length) {
        if (existente[0].compradorId !== compradorId) {
          conflitos++;
          console.warn(`  ⚠ "${marca}" já vinculada a "${existente[0].nome}" — mantido (origem apontava outro).`);
        }
        continue;
      }
      await conn.execute(
        "INSERT INTO gn_comprador_marcas (compradorId, marca) VALUES (?, ?)",
        [compradorId, marca],
      );
      vinculadas++;
      // Garante a marca no catálogo também.
      await conn.execute(
        "INSERT INTO gn_marcas (marca) VALUES (?) ON DUPLICATE KEY UPDATE marca = VALUES(marca)",
        [marca],
      );
    }

    console.log(
      `\n✓ Migração concluída: ${nomes.length} comprador(es), ${vinculadas} marca(s) vinculada(s)` +
        (conflitos ? `, ${conflitos} conflito(s) mantidos` : "") +
        `.\n  (o catálogo completo de marcas vem depois pelo sync de marcas — compradores-marcas-sync.)`,
    );
  } catch (err) {
    console.error("\n✗ Falha:", err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();
