/**
 * Endpoints-ponte do submódulo "Envio de Parcial" — MULTI-ENVIO.
 *
 * São consumidos pelo BOT (whatsapp-web.js) que roda no servidor Windows local.
 * Autenticação por token compartilhado no header Authorization: Bearer <token>.
 *
 * Endpoints multi-envio (novos):
 *   POST /api/parcial/v2/heartbeat       → heartbeat global (retorna lista de envios)
 *   POST /api/parcial/v2/heartbeat/:slug → heartbeat por envio
 *   POST /api/parcial/v2/imagem/:slug    → publica imagem por envio
 *   POST /api/parcial/v2/medias/:slug    → publica médias por envio
 *
 * Endpoints legado (mantidos para retrocompatibilidade):
 *   POST /api/parcial/heartbeat  → heartbeat singleton (SC, id=1)
 *   POST /api/parcial/log        → append de log
 *   POST /api/parcial/qr         → publica QR
 *   POST /api/parcial/imagem     → publica imagem (SC, id=1)
 *   POST /api/parcial/medias     → publica médias (SC, id=1)
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { ENV } from "./_core/env";
import { isConnectorAuthorized } from "./superestocadosConnectorIngestion";
import * as cp from "./parcialControlPlane";

/** Valida o token do bot; responde 503/401 e retorna false se não autorizado. */
function authorize(req: Request, res: Response): boolean {
  if (!ENV.parcialBotToken.trim()) {
    res.status(503).json({
      success: false,
      message: "A credencial do bot de Envio de Parcial ainda não foi configurada no painel.",
    });
    return false;
  }
  if (!isConnectorAuthorized(req.headers.authorization, ENV.parcialBotToken)) {
    res.status(401).json({ success: false, message: "Token do bot inválido ou ausente." });
    return false;
  }
  return true;
}

const statusEnum = z.enum([
  "iniciando",
  "rodando",
  "pausado",
  "aguardando_qr",
  "reconectando",
  "erro_banco",
]);

const optionalDate = z
  .string()
  .datetime({ offset: true })
  .nullable()
  .optional()
  .transform((v) => (v == null ? v : new Date(v)));

const heartbeatSchema = z.object({
  status: statusEnum,
  ultimoEnvio: optionalDate,
  proximoEnvio: optionalDate,
});

const logSchema = z.object({
  nivel: z.enum(["ok", "info", "warn", "erro"]),
  msg: z.string().min(1).max(512),
});

const qrSchema = z.object({
  dataUrl: z.string().nullable(),
  ts: z.string().datetime({ offset: true }).optional(),
});

const imagemSchema = z.object({
  base64: z.string().min(1),
  mimeType: z.string().max(32).optional(),
  geradoEm: z.string().datetime({ offset: true }).optional(),
});

const mediasSchema = z.object({
  medias: z.record(z.string(), z.number()),
});

const mediasRcaSchema = z.object({
  mediasGerenteRca: z.record(z.string(), z.record(z.string(), z.number())),
});

const gruposSchema = z.object({
  grupos: z.array(z.string().max(255)).max(500),
});

const previewsSchema = z.object({
  previews: z
    .array(
      z.object({
        sig: z.string().min(1).max(80),
        label: z.string().min(1).max(255),
        base64: z.string().min(1),
        mimeType: z.string().max(32).optional(),
        geradoEm: z.string().datetime({ offset: true }).optional(),
      }),
    )
    .max(50),
});

async function handle(res: Response, fn: () => Promise<unknown>) {
  try {
    const data = await fn();
    return res.status(200).json({ success: true, ...(data ? { data } : {}) });
  } catch (error) {
    console.error("[Parcial Bridge] Falha ao processar requisição do bot", error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Falha inesperada no control plane.",
    });
  }
}

/** Resolve envioId a partir do slug no URL param. */
async function resolveEnvio(req: Request, res: Response): Promise<number | null> {
  const slug = req.params.slug;
  if (!slug) {
    res.status(400).json({ success: false, message: "Slug do envio ausente." });
    return null;
  }
  const envio = await cp.getEnvioBySlug(slug);
  if (!envio) {
    res.status(404).json({ success: false, message: `Envio "${slug}" não encontrado.` });
    return null;
  }
  return envio.id;
}

export function registerParcialBridge(app: Express) {
  // ═══════════════════════════════════════════════════════════════════════════
  // V2 — MULTI-ENVIO
  // ═══════════════════════════════════════════════════════════════════════════

  // Heartbeat global: reporta status e recebe lista de todos os envios habilitados.
  app.post("/api/parcial/v2/heartbeat", async (req, res) => {
    if (!authorize(req, res)) return;
    const parsed = heartbeatSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Payload de heartbeat inválido." });
    }
    return handle(res, () => cp.heartbeatPullAll(parsed.data));
  });

  // Heartbeat por envio (slug).
  app.post("/api/parcial/v2/heartbeat/:slug", async (req, res) => {
    if (!authorize(req, res)) return;
    const envioId = await resolveEnvio(req, res);
    if (envioId === null) return;
    const parsed = heartbeatSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Payload de heartbeat inválido." });
    }
    return handle(res, () => cp.heartbeatPullEnvio(envioId, parsed.data));
  });

  // Publica imagem por envio (slug).
  app.post("/api/parcial/v2/imagem/:slug", async (req, res) => {
    if (!authorize(req, res)) return;
    const envioId = await resolveEnvio(req, res);
    if (envioId === null) return;
    const parsed = imagemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Payload de imagem inválido." });
    }
    const geradoEm = parsed.data.geradoEm ? new Date(parsed.data.geradoEm) : new Date();
    return handle(res, () =>
      cp.setImagem(envioId, parsed.data.base64, parsed.data.mimeType ?? "image/png", geradoEm),
    );
  });

  // Publica os previews por recorte de um envio (substitui o conjunto atual).
  app.post("/api/parcial/v2/previews/:slug", async (req, res) => {
    if (!authorize(req, res)) return;
    const envioId = await resolveEnvio(req, res);
    if (envioId === null) return;
    const parsed = previewsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Payload de previews inválido." });
    }
    const items = parsed.data.previews.map((p) => ({
      sig: p.sig,
      label: p.label,
      base64: p.base64,
      mimeType: p.mimeType ?? "image/png",
      geradoEm: p.geradoEm ? new Date(p.geradoEm) : new Date(),
    }));
    return handle(res, () => cp.replacePreviews(envioId, items));
  });

  // Publica a lista de grupos do WhatsApp (1 bot = 1 conta → singleton).
  app.post("/api/parcial/v2/grupos", async (req, res) => {
    if (!authorize(req, res)) return;
    const parsed = gruposSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Payload de grupos inválido." });
    }
    return handle(res, () => cp.setGruposWa(parsed.data.grupos));
  });

  // Publica médias calculadas por envio (slug).
  app.post("/api/parcial/v2/medias/:slug", async (req, res) => {
    if (!authorize(req, res)) return;
    const envioId = await resolveEnvio(req, res);
    if (envioId === null) return;
    const parsed = mediasSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Payload de médias inválido." });
    }
    return handle(res, () => cp.updateEnvio(envioId, { medias: parsed.data.medias }));
  });

  // Publica os RCAs por gerência ({gerencia:{rca:media}}) — fonte dos RCAs por
  // área no portal (checkboxes de "RCAs por área").
  app.post("/api/parcial/v2/rcas/:slug", async (req, res) => {
    if (!authorize(req, res)) return;
    const envioId = await resolveEnvio(req, res);
    if (envioId === null) return;
    const parsed = mediasRcaSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Payload de RCAs inválido." });
    }
    return handle(res, () => cp.updateEnvio(envioId, { mediasGerenteRca: parsed.data.mediasGerenteRca }));
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // V1 — LEGADO (retrocompatibilidade com bot antigo, opera no envio SC id=1)
  // ═══════════════════════════════════════════════════════════════════════════

  // Polling principal: reporta status + recebe config/comandos (singleton SC).
  app.post("/api/parcial/heartbeat", async (req, res) => {
    if (!authorize(req, res)) return;
    const parsed = heartbeatSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Payload de heartbeat inválido." });
    }
    return handle(res, () => cp.heartbeatPullLegacy(parsed.data));
  });

  // Append de log.
  app.post("/api/parcial/log", async (req, res) => {
    if (!authorize(req, res)) return;
    const parsed = logSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Payload de log inválido." });
    }
    return handle(res, () => cp.addLog(parsed.data.nivel, parsed.data.msg));
  });

  // Publica (ou limpa) o QR Code.
  app.post("/api/parcial/qr", async (req, res) => {
    if (!authorize(req, res)) return;
    const parsed = qrSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Payload de QR inválido." });
    }
    const ts = parsed.data.ts ? new Date(parsed.data.ts) : new Date();
    return handle(res, () => cp.setQr(parsed.data.dataUrl, ts));
  });

  // Publica a última imagem gerada (legado: SC id=1).
  app.post("/api/parcial/imagem", async (req, res) => {
    if (!authorize(req, res)) return;
    const parsed = imagemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Payload de imagem inválido." });
    }
    const geradoEm = parsed.data.geradoEm ? new Date(parsed.data.geradoEm) : new Date();
    return handle(res, () =>
      cp.setImagem(1, parsed.data.base64, parsed.data.mimeType ?? "image/png", geradoEm),
    );
  });

  // Médias de referência CALCULADAS pelo bot (legado: SC id=1).
  app.post("/api/parcial/medias", async (req, res) => {
    if (!authorize(req, res)) return;
    const parsed = mediasSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Payload de médias inválido." });
    }
    return handle(res, () => cp.updateEnvio(1, { medias: parsed.data.medias }));
  });
}
