import { z } from "zod";

import { ACTIONS, MODULES } from "@shared/permissions";
import {
  MONITOR_PANEL_KEYS,
  MONITOR_REGION_MODES,
  type MonitorPanelKey,
  type MonitorRegionMode,
} from "@shared/monitorTv";
import { protectedProcedure, router } from "../_core/trpc";
import { requirePermission } from "../permissionMiddleware";
import {
  createPlaylist,
  deletePlaylist,
  getPlaylistBySlug,
  listPlaylists,
  renamePlaylist,
  savePlaylistItens,
} from "../db/monitorTv";

const panelKeySchema = z.enum(MONITOR_PANEL_KEYS as unknown as [MonitorPanelKey, ...MonitorPanelKey[]]);
const regionModeSchema = z.enum(MONITOR_REGION_MODES as unknown as [MonitorRegionMode, ...MonitorRegionMode[]]);

const itemSchema = z.object({
  panelKey: panelKeySchema,
  regionMode: regionModeSchema,
  top: z.number().int().min(1).max(100),
  dwellSeconds: z.number().int().min(5).max(600),
  enabled: z.boolean(),
});

export const monitorRouter = router({
  /** Lista playlists (para o editor). */
  listPlaylists: protectedProcedure
    .use(requirePermission(MODULES.MONITOR_TV, ACTIONS.READ))
    .query(async () => {
      return listPlaylists();
    }),

  /** Playlist completa por slug (consumida pelo player e pelo editor). */
  getPlaylist: protectedProcedure
    .use(requirePermission(MODULES.MONITOR_TV, ACTIONS.READ))
    .input(z.object({ slug: z.string().trim().min(1) }))
    .query(async ({ input }) => {
      return getPlaylistBySlug(input.slug);
    }),

  /** Cria uma playlist vazia. */
  createPlaylist: protectedProcedure
    .use(requirePermission(MODULES.MONITOR_TV, ACTIONS.UPDATE))
    .input(z.object({ nome: z.string().trim().min(1).max(255) }))
    .mutation(async ({ input }) => {
      return createPlaylist(input.nome);
    }),

  /** Renomeia a playlist (slug preservado). */
  renamePlaylist: protectedProcedure
    .use(requirePermission(MODULES.MONITOR_TV, ACTIONS.UPDATE))
    .input(z.object({ id: z.number().int().positive(), nome: z.string().trim().min(1).max(255) }))
    .mutation(async ({ input }) => {
      await renamePlaylist(input.id, input.nome);
      return { ok: true };
    }),

  /** Exclui a playlist (itens caem por cascade). */
  deletePlaylist: protectedProcedure
    .use(requirePermission(MODULES.MONITOR_TV, ACTIONS.DELETE))
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await deletePlaylist(input.id);
      return { ok: true };
    }),

  /** Substitui os itens da playlist (add/remove/reorder/toggle num só save). */
  saveItens: protectedProcedure
    .use(requirePermission(MODULES.MONITOR_TV, ACTIONS.UPDATE))
    .input(z.object({ playlistId: z.number().int().positive(), itens: z.array(itemSchema).max(50) }))
    .mutation(async ({ input }) => {
      await savePlaylistItens(input.playlistId, input.itens);
      return { ok: true };
    }),
});
