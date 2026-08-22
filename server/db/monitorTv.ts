/**
 * Camada de dados do Monitor TV (playlists do player /monitor).
 *
 * Playlists nomeadas + itens ordenados. O editor salva a lista inteira de itens de
 * uma vez (replace) — resolve add/remove/reorder/toggle num único save. `panelKey` e
 * `regionMode` são validados no router (server/routers/monitor.ts) a partir de
 * shared/monitorTv.ts.
 */

import { asc, eq } from "drizzle-orm";

import type {
  MonitorPanelKey,
  MonitorPlaylist,
  MonitorPlaylistItem,
  MonitorPlaylistSummary,
  MonitorRegionMode,
} from "@shared/monitorTv";
import { slugifyPlaylist } from "@shared/monitorTv";
import { monitorPlaylistItens, monitorPlaylists } from "../../drizzle/schema";
import { getDb } from "../db";

type ItemInput = {
  panelKey: MonitorPanelKey;
  regionMode: MonitorRegionMode;
  top: number;
  dwellSeconds: number;
  enabled: boolean;
};

function mapItem(row: typeof monitorPlaylistItens.$inferSelect): MonitorPlaylistItem {
  return {
    id: row.id,
    ordem: row.ordem,
    panelKey: row.panelKey as MonitorPanelKey,
    regionMode: row.regionMode as MonitorRegionMode,
    top: row.top,
    dwellSeconds: row.dwellSeconds,
    enabled: Boolean(row.enabled),
  };
}

/** Lista playlists com a contagem de itens (para a lista do editor). */
export async function listPlaylists(): Promise<MonitorPlaylistSummary[]> {
  const db = await getDb();
  if (!db) return [];

  const playlists = await db
    .select()
    .from(monitorPlaylists)
    .orderBy(asc(monitorPlaylists.nome));
  const itens = await db
    .select({ playlistId: monitorPlaylistItens.playlistId })
    .from(monitorPlaylistItens);

  const counts = new Map<number, number>();
  for (const i of itens) counts.set(i.playlistId, (counts.get(i.playlistId) ?? 0) + 1);

  return playlists.map((p) => ({
    id: p.id,
    slug: p.slug,
    nome: p.nome,
    totalItens: counts.get(p.id) ?? 0,
  }));
}

/** Playlist completa (itens ordenados) por slug, ou null se não existir. */
export async function getPlaylistBySlug(slug: string): Promise<MonitorPlaylist | null> {
  const db = await getDb();
  if (!db) return null;

  const [playlist] = await db
    .select()
    .from(monitorPlaylists)
    .where(eq(monitorPlaylists.slug, slug))
    .limit(1);
  if (!playlist) return null;

  const itemRows = await db
    .select()
    .from(monitorPlaylistItens)
    .where(eq(monitorPlaylistItens.playlistId, playlist.id))
    .orderBy(asc(monitorPlaylistItens.ordem));

  return {
    id: playlist.id,
    slug: playlist.slug,
    nome: playlist.nome,
    itens: itemRows.map(mapItem),
  };
}

/** Gera um slug único a partir do nome (sufixo -2, -3… em colisão). */
async function uniqueSlug(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  nome: string,
): Promise<string> {
  const base = slugifyPlaylist(nome) || "playlist";
  const existentes = await db
    .select({ slug: monitorPlaylists.slug })
    .from(monitorPlaylists);
  const usados = new Set(existentes.map((r) => r.slug));
  if (!usados.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidato = `${base}-${i}`.slice(0, 64);
    if (!usados.has(candidato)) return candidato;
  }
}

/** Cria uma playlist vazia. Devolve a playlist criada. */
export async function createPlaylist(nome: string): Promise<MonitorPlaylist> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível para criar a playlist.");

  const nomeLimpo = nome.trim();
  if (!nomeLimpo) throw new Error("Nome da playlist é obrigatório.");

  const slug = await uniqueSlug(db, nomeLimpo);
  await db.insert(monitorPlaylists).values({ slug, nome: nomeLimpo });

  const criada = await getPlaylistBySlug(slug);
  if (!criada) throw new Error("Falha ao criar a playlist.");
  return criada;
}

/** Renomeia a playlist (o slug NÃO muda, para não quebrar URLs em uso). */
export async function renamePlaylist(id: number, nome: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível para renomear a playlist.");

  const nomeLimpo = nome.trim();
  if (!nomeLimpo) throw new Error("Nome da playlist é obrigatório.");

  await db.update(monitorPlaylists).set({ nome: nomeLimpo }).where(eq(monitorPlaylists.id, id));
}

/** Exclui a playlist (itens caem por FK ON DELETE CASCADE). */
export async function deletePlaylist(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível para excluir a playlist.");
  await db.delete(monitorPlaylists).where(eq(monitorPlaylists.id, id));
}

/**
 * Substitui todos os itens da playlist (replace). A ordem final é a ordem do array
 * recebido (ordem = índice). Idempotente e simples: apaga tudo e reinsere.
 */
export async function savePlaylistItens(playlistId: number, itens: ItemInput[]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível para salvar os itens.");

  const [playlist] = await db
    .select({ id: monitorPlaylists.id })
    .from(monitorPlaylists)
    .where(eq(monitorPlaylists.id, playlistId))
    .limit(1);
  if (!playlist) throw new Error("Playlist não encontrada.");

  await db.delete(monitorPlaylistItens).where(eq(monitorPlaylistItens.playlistId, playlistId));

  if (itens.length) {
    await db.insert(monitorPlaylistItens).values(
      itens.map((it, idx) => ({
        playlistId,
        ordem: idx,
        panelKey: it.panelKey,
        regionMode: it.regionMode,
        top: it.top,
        dwellSeconds: it.dwellSeconds,
        enabled: it.enabled,
      })),
    );
  }
}
