/**
 * Router tRPC do submódulo "Envio de Parcial" (Comercial) — MULTI-ENVIO.
 *
 * Usado pelo PORTAL (React). Lê/escreve o control plane multi-envio.
 * O bot em si NÃO usa tRPC — ele roda no servidor local e fala HTTPS com
 * /api/parcial/* (v1 legado) ou /api/parcial/v2/* (multi-envio).
 */

import { z } from "zod";
import { ACTIONS, MODULES } from "@shared/permissions";
import { protectedProcedure, router } from "../_core/trpc";
import { requirePermission } from "../permissionMiddleware";
import * as cp from "../parcialControlPlane";

const READ = requirePermission(MODULES.ENVIO_PARCIAL, ACTIONS.READ);
const UPDATE = requirePermission(MODULES.ENVIO_PARCIAL, ACTIONS.UPDATE);

const configSchema = z.object({
  grupo: z.string().min(1).max(255).optional(),
  horaInicio: z.number().int().min(0).max(23).optional(),
  horaFim: z.number().int().min(0).max(23).optional(),
  horariosPadrao: z.array(z.number().int().min(0).max(23)).optional(),
  /** Gerências VISÍVEIS no painel completo (allowlist). Nova entra desmarcada. */
  gerentesVisiveis: z.array(z.string().min(1)).optional(),
  /** Base da Média: true = todos os vendedores da área; false = só com pedido. */
  mediaBaseTodos: z.boolean().optional(),
  /** RCAs ocultos no recorte por área (denylist). */
  rcasOcultos: z.array(z.string().min(1)).optional(),
  // medias: read-only (calculadas pelo bot)
});

export const parcialRouter = router({
  /** Lista todos os envios (regiões) cadastrados. */
  listEnvios: protectedProcedure.use(READ).query(async () => {
    const envios = await cp.listEnvios();
    return envios.map((e) => {
      // Calcula próximo envio server-side se não houver valor ou se estiver no passado
      let proximoEnvio = e.proximoEnvio;
      if (e.habilitado && !e.pausado) {
        const calculado = cp.calcularProximoEnvio(e);
        if (calculado && (!proximoEnvio || new Date(proximoEnvio).getTime() < Date.now())) {
          proximoEnvio = calculado;
        }
      }
      return {
        ...e,
        proximoEnvio,
        botConectado: cp.isBotOnline(e),
      };
    });
  }),

  /** Estado de um envio específico por ID. */
  getEnvio: protectedProcedure
    .use(READ)
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const envio = await cp.getEnvioById(input.id);
      return {
        envio,
        botConectado: cp.isBotOnline(envio),
      };
    }),

  /** Logs (compartilhados entre todos os envios). */
  getLogs: protectedProcedure
    .use(READ)
    .input(z.object({ limit: z.number().int().min(1).max(200).default(100) }).optional())
    .query(async ({ input }) => {
      return cp.getLogs(input?.limit ?? 100);
    }),

  /** QR Code (compartilhado — 1 bot = 1 WhatsApp). */
  getQr: protectedProcedure.use(READ).query(async () => {
    return cp.getQr();
  }),

  /** Imagem de preview de um envio específico. */
  getImagem: protectedProcedure
    .use(READ)
    .input(z.object({ envioId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return cp.getImagem(input.envioId);
    }),

  /** Comandos do painel: pausar, retomar, enviar agora — por envio. */
  comando: protectedProcedure
    .use(UPDATE)
    .input(z.object({
      envioId: z.number().int().positive(),
      cmd: z.enum(["pause", "start", "enviar"]),
    }))
    .mutation(async ({ input }) => {
      switch (input.cmd) {
        case "pause":
          await cp.updateEnvio(input.envioId, { pausado: true, status: "pausado" });
          return { ok: true, msg: "Bot pausado" };
        case "start":
          await cp.updateEnvio(input.envioId, { pausado: false, status: "rodando" });
          return { ok: true, msg: "Bot retomado" };
        case "enviar":
          await cp.updateEnvio(input.envioId, { forcarEnvio: true });
          return { ok: true, msg: "Envio imediato solicitado" };
      }
    }),

  /** Salva configuração de um envio (grupo, horários). Médias são read-only. */
  salvarConfig: protectedProcedure
    .use(UPDATE)
    .input(z.object({
      envioId: z.number().int().positive(),
      ...configSchema.shape,
    }))
    .mutation(async ({ input }) => {
      const { envioId, ...fields } = input;
      const patch: cp.EnvioPatch = {};
      if (fields.grupo !== undefined) patch.grupo = fields.grupo;
      if (fields.horaInicio !== undefined) patch.horaInicio = fields.horaInicio;
      if (fields.horaFim !== undefined) patch.horaFim = fields.horaFim;
      if (fields.horariosPadrao !== undefined) {
        patch.horariosPadrao = Array.from(new Set(fields.horariosPadrao)).sort((a, b) => a - b);
      }
      if (fields.gerentesVisiveis !== undefined) {
        patch.gerentesVisiveis = Array.from(new Set(fields.gerentesVisiveis));
      }
      if (fields.mediaBaseTodos !== undefined) {
        patch.mediaBaseTodos = fields.mediaBaseTodos;
      }
      if (fields.rcasOcultos !== undefined) {
        patch.rcasOcultos = Array.from(new Set(fields.rcasOcultos));
      }
      await cp.updateEnvio(envioId, patch);
      return { ok: true, msg: "Configurações salvas" };
    }),

  /** Habilitar/desabilitar um envio. */
  toggleHabilitado: protectedProcedure
    .use(UPDATE)
    .input(z.object({
      envioId: z.number().int().positive(),
      habilitado: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      const patch: cp.EnvioPatch = { habilitado: input.habilitado };
      // Ao habilitar, calcula o próximo envio imediatamente
      if (input.habilitado) {
        const envio = await cp.getEnvioById(input.envioId);
        if (envio) {
          const proximo = cp.calcularProximoEnvio({ ...envio, pausado: false });
          if (proximo) patch.proximoEnvio = proximo;
        }
      } else {
        patch.proximoEnvio = null;
      }
      await cp.updateEnvio(input.envioId, patch);
      return { ok: true, msg: input.habilitado ? "Envio habilitado" : "Envio desabilitado" };
    }),

  /** Soft-restart: reconecta o WhatsApp (mesmo processo, mantém sessão, ~10s). */
  reiniciarBot: protectedProcedure
    .use(UPDATE)
    .mutation(async () => {
      cp.solicitarReinicioBot();
      return { ok: true, msg: "Reconexão do WhatsApp solicitada — aplicada em até ~10 segundos." };
    }),

  /** Hard restart: o bot faz process.exit e a Tarefa Agendada sobe de novo (~1 min),
   * recarregando o código. */
  reiniciarProcesso: protectedProcedure
    .use(UPDATE)
    .mutation(async () => {
      cp.solicitarHardRestart();
      return { ok: true, msg: "Reinício do processo solicitado — o bot volta em até ~1 minuto." };
    }),

  /** Desconecta a conta do WhatsApp atualmente logada no bot (logout + novo QR). */
  desconectarWhatsapp: protectedProcedure
    .use(UPDATE)
    .mutation(async () => {
      cp.solicitarLogoutBot();
      return { ok: true, msg: "Desconexão solicitada — a conta sai e um novo QR aparece em até 10 segundos." };
    }),

  // ─── Destinatários: cadastro central de contatos/grupos ───────────────────

  /** Lista todos os contatos/grupos cadastrados (reutilizáveis entre envios). */
  listContatos: protectedProcedure.use(READ).query(async () => {
    return cp.listContatos();
  }),

  /** Lista de grupos do WhatsApp que o bot reportou (alimenta o dropdown). */
  getGruposWa: protectedProcedure.use(READ).query(async () => {
    const row = await cp.getGruposWa();
    return { grupos: row?.grupos ?? [], updatedAt: row?.updatedAt ?? null };
  }),

  /** Cria um contato (número E.164, só dígitos) ou grupo (nome exato). */
  criarContato: protectedProcedure
    .use(UPDATE)
    .input(z.object({
      tipo: z.enum(["grupo", "contato"]),
      identificador: z.string().trim().min(1).max(255),
      nome: z.string().trim().min(1).max(128),
    }))
    .mutation(async ({ input }) => {
      // Contato: normaliza para só dígitos (E.164 sem símbolos).
      const identificador =
        input.tipo === "contato" ? input.identificador.replace(/\D/g, "") : input.identificador;
      if (input.tipo === "contato" && identificador.length < 12) {
        throw new Error("Número inválido. Use DDI+DDD+número (ex.: 5547999998888).");
      }
      const id = await cp.createContato({ tipo: input.tipo, identificador, nome: input.nome });
      return { ok: true, id, msg: "Contato cadastrado" };
    }),

  /** Edita nome/identificador/ativo de um contato. */
  atualizarContato: protectedProcedure
    .use(UPDATE)
    .input(z.object({
      id: z.number().int().positive(),
      nome: z.string().trim().min(1).max(128).optional(),
      identificador: z.string().trim().min(1).max(255).optional(),
      ativo: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...patch } = input;
      await cp.updateContato(id, patch);
      return { ok: true, msg: "Contato atualizado" };
    }),

  /** Remove um contato (e seus vínculos, por cascade). */
  removerContato: protectedProcedure
    .use(UPDATE)
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await cp.deleteContato(input.id);
      return { ok: true, msg: "Contato removido" };
    }),

  // ─── Destinatários: vínculos contato↔envio (com filtro de áreas) ──────────

  /** Vínculos de um envio (com dados do contato). */
  listVinculos: protectedProcedure
    .use(READ)
    .input(z.object({ envioId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return cp.listVinculosByEnvio(input.envioId);
    }),

  /** Cria/atualiza o vínculo de um contato a um envio + seu filtro de áreas. */
  salvarVinculo: protectedProcedure
    .use(UPDATE)
    .input(z.object({
      contatoId: z.number().int().positive(),
      envioId: z.number().int().positive(),
      filtroTipo: z.enum(["todos", "gerencia", "rca"]),
      filtroValores: z.array(z.string().min(1)).default([]),
      habilitado: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      if (input.filtroTipo !== "todos" && input.filtroValores.length === 0) {
        throw new Error("Selecione ao menos uma área para o filtro.");
      }
      const id = await cp.upsertVinculo(input);
      return { ok: true, id, msg: "Destinatário vinculado" };
    }),

  /** Previews por recorte de um envio (painel completo + cada área). */
  listPreviews: protectedProcedure
    .use(READ)
    .input(z.object({ envioId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return cp.listPreviews(input.envioId);
    }),

  /** Solicita envio/teste imediato só para um destinatário (vínculo). */
  testarVinculo: protectedProcedure
    .use(UPDATE)
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await cp.solicitarEnvioVinculo(input.id);
      return { ok: true, msg: "Envio para este destinatário solicitado — chega em até ~10s." };
    }),

  /** Liga/desliga um vínculo sem removê-lo. */
  toggleVinculo: protectedProcedure
    .use(UPDATE)
    .input(z.object({ id: z.number().int().positive(), habilitado: z.boolean() }))
    .mutation(async ({ input }) => {
      await cp.setVinculoHabilitado(input.id, input.habilitado);
      return { ok: true, msg: input.habilitado ? "Vínculo ativado" : "Vínculo pausado" };
    }),

  /** Desvincula um contato de um envio. */
  removerVinculo: protectedProcedure
    .use(UPDATE)
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await cp.deleteVinculo(input.id);
      return { ok: true, msg: "Destinatário desvinculado" };
    }),

  // ─── Retrocompatibilidade (frontend antigo pode chamar sem envioId) ───────

  /** @deprecated Use listEnvios. Estado do envio SC (id=1). */
  getEstado: protectedProcedure.use(READ).query(async () => {
    const envio = await cp.getEnvioById(1);
    return {
      estado: envio,
      botConectado: cp.isBotOnline(envio),
    };
  }),
});
