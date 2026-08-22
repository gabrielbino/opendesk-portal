/**
 * Endpoints-ponte do submódulo "Monitor de Integrações" (Indicadores).
 *
 * Consumidos pelos AGENTES que rodam na VM (rede interna), autenticados por
 * Authorization: Bearer <MONITOR_AGENTE_TOKEN>:
 *   - COLETOR de arquivos (Fase 3): faz heartbeat, recebe os caminhos a varrer e publica o
 *     snapshot de cada pasta. O CÉREBRO (aqui no portal) reconcilia e decide os alertas.
 *   - WA GATEWAY (Fase 2): drena a fila de saída e reporta o resultado do envio.
 *
 * Endpoints:
 *   POST /api/monitor-arquivos/heartbeat        → coletor online + devolve configs a varrer
 *   POST /api/monitor-arquivos/snapshot/:id     → publica o snapshot de UM caminho
 *   POST /api/monitor-arquivos/wa/pull          → gateway puxa mensagens pendentes de uma conta
 *   POST /api/monitor-arquivos/wa/report        → gateway reporta envio (ok|erro)
 *   POST /api/monitor-arquivos/wa/heartbeat     → gateway: status por conta → recebe contas + flags
 *   POST /api/monitor-arquivos/wa/qr            → gateway publica/limpa o QR de uma conta
 *   POST /api/monitor-arquivos/wa/grupos        → gateway publica a lista de grupos de uma conta
 *   POST /api/monitor-arquivos/backup/config    → job de backup: dados a arquivar (corte/extensões/caminhos)
 *   POST /api/monitor-arquivos/backup/report    → job de backup: resultado (cria notificação no sino)
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { ENV } from "./_core/env";
import { isConnectorAuthorized } from "./superestocadosConnectorIngestion";
import * as cp from "./monitorArquivosControlPlane";

function authorize(req: Request, res: Response): boolean {
  if (!ENV.monitorAgenteToken.trim()) {
    res.status(503).json({
      success: false,
      message: "A credencial dos agentes do Monitor de Integrações ainda não foi configurada no painel.",
    });
    return false;
  }
  if (!isConnectorAuthorized(req.headers.authorization, ENV.monitorAgenteToken)) {
    res.status(401).json({ success: false, message: "Token do agente inválido ou ausente." });
    return false;
  }
  return true;
}

async function handle(res: Response, fn: () => Promise<unknown>) {
  try {
    const data = await fn();
    return res.status(200).json({ success: true, ...(data ? { data } : {}) });
  } catch (error) {
    console.error("[Monitor Bridge] Falha ao processar requisição do agente", error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Falha inesperada no control plane.",
    });
  }
}

const heartbeatSchema = z.object({ versao: z.string().max(32).optional() });

const snapshotSchema = z.object({
  varreduraEm: z.string().datetime({ offset: true }).optional(),
  // mtime da PRÓPRIA pasta (fallback de geração de listas quando o arquivo já foi puxado).
  pastaMtime: z.string().datetime({ offset: true }).optional(),
  arquivos: z
    .array(
      z.object({
        nome: z.string().min(1).max(300),
        // mtime em ISO (o coletor lê fs.stat().mtime).
        mtime: z.string().datetime({ offset: true }),
      }),
    )
    .max(50000),
});

const waPullSchema = z.object({
  waContaId: z.string().max(64).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

const waReportSchema = z.object({
  id: z.number().int().positive(),
  ok: z.boolean(),
  erro: z.string().max(512).optional(),
});

const waHeartbeatSchema = z.object({
  versao: z.string().max(32).optional(),
  contas: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        status: z.string().max(24).optional(),
        online: z.boolean().optional(),
      }),
    )
    .max(50)
    .optional(),
});

const waQrSchema = z.object({
  conta: z.string().min(1).max(64),
  dataUrl: z.string().nullable(),
  ts: z.string().datetime({ offset: true }).optional(),
});

const waGruposSchema = z.object({
  conta: z.string().min(1).max(64),
  grupos: z.array(z.string().max(255)).max(1000),
});

const backupReportSchema = z.object({
  ok: z.boolean(),
  corte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  resumo: z.object({
    pastas: z.number().int().min(0),
    arquivos: z.number().int().min(0),
    zips: z.number().int().min(0),
    podados: z.number().int().min(0),
  }),
  erros: z.array(z.object({ caminho: z.string().max(512), erro: z.string().max(512) })).max(200).optional(),
});

export function registerMonitorArquivosBridge(app: Express) {
  // Heartbeat do coletor: reporta online e recebe os caminhos ativos a varrer.
  app.post("/api/monitor-arquivos/heartbeat", async (req, res) => {
    if (!authorize(req, res)) return;
    const parsed = heartbeatSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Payload de heartbeat inválido." });
    }
    return handle(res, async () => {
      await cp.heartbeatColetor(parsed.data.versao);
      // Gatilho do RESUMO DIÁRIO (sem cron): envia 1x/dia no horário-alvo se o coletor estiver online.
      // Resiliente (engole os próprios erros) — não afeta a resposta do heartbeat.
      await cp.talvezEnviarResumo(new Date());
      // `configs` = varredura de PEDIDOS (por caminho); `listas` = varredura de GERAÇÃO (por lista).
      return { configs: await cp.getConfigsParaColetar(), listas: await cp.getListasParaColetar() };
    });
  });

  // Snapshot de um caminho: lista de arquivos + mtime. O cérebro reconcilia e avalia SLA.
  app.post("/api/monitor-arquivos/snapshot/:id", async (req, res) => {
    if (!authorize(req, res)) return;
    const configId = Number(req.params.id);
    if (!Number.isInteger(configId) || configId <= 0) {
      return res.status(400).json({ success: false, message: "id de caminho inválido." });
    }
    const parsed = snapshotSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Payload de snapshot inválido." });
    }
    const arquivos = parsed.data.arquivos.map((a) => ({ nome: a.nome, mtime: new Date(a.mtime) }));
    const agora = parsed.data.varreduraEm ? new Date(parsed.data.varreduraEm) : new Date();
    const pastaMtime = parsed.data.pastaMtime ? new Date(parsed.data.pastaMtime) : null;
    return handle(res, () => cp.processarSnapshot(configId, arquivos, agora, pastaMtime));
  });

  // Snapshot de UMA lista (modo 'geracao'): mesmos payload/regras, mas o cérebro avalia presença/
  // deadline (não a máquina de estados dos pedidos).
  app.post("/api/monitor-arquivos/snapshot/lista/:id", async (req, res) => {
    if (!authorize(req, res)) return;
    const listaId = Number(req.params.id);
    if (!Number.isInteger(listaId) || listaId <= 0) {
      return res.status(400).json({ success: false, message: "id de lista inválido." });
    }
    const parsed = snapshotSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Payload de snapshot inválido." });
    }
    const arquivos = parsed.data.arquivos.map((a) => ({ nome: a.nome, mtime: new Date(a.mtime) }));
    const agora = parsed.data.varreduraEm ? new Date(parsed.data.varreduraEm) : new Date();
    const pastaMtime = parsed.data.pastaMtime ? new Date(parsed.data.pastaMtime) : null;
    return handle(res, () => cp.processarSnapshotLista(listaId, arquivos, agora, pastaMtime));
  });

  // WA gateway: puxa mensagens pendentes de uma conta.
  app.post("/api/monitor-arquivos/wa/pull", async (req, res) => {
    if (!authorize(req, res)) return;
    const parsed = waPullSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Payload de pull inválido." });
    }
    return handle(res, async () => ({
      mensagens: await cp.pullOutbox(parsed.data.waContaId ?? "monitor", parsed.data.limit ?? 20),
    }));
  });

  // WA gateway: reporta o resultado do envio de uma mensagem.
  app.post("/api/monitor-arquivos/wa/report", async (req, res) => {
    if (!authorize(req, res)) return;
    const parsed = waReportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Payload de report inválido." });
    }
    return handle(res, () => cp.reportarEnvioWa(parsed.data.id, parsed.data.ok, parsed.data.erro));
  });

  // WA gateway: heartbeat por conta → recebe as contas a rodar + flags one-shot (logout).
  app.post("/api/monitor-arquivos/wa/heartbeat", async (req, res) => {
    if (!authorize(req, res)) return;
    const parsed = waHeartbeatSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Payload de heartbeat WA inválido." });
    }
    return handle(res, () => cp.heartbeatWaGateway(parsed.data.contas ?? []));
  });

  // WA gateway: publica (ou limpa) o QR de uma conta.
  app.post("/api/monitor-arquivos/wa/qr", async (req, res) => {
    if (!authorize(req, res)) return;
    const parsed = waQrSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Payload de QR inválido." });
    }
    const ts = parsed.data.ts ? new Date(parsed.data.ts) : new Date();
    return handle(res, () => cp.setWaQr(parsed.data.conta, parsed.data.dataUrl, ts));
  });

  // WA gateway: publica a lista de grupos de uma conta.
  app.post("/api/monitor-arquivos/wa/grupos", async (req, res) => {
    if (!authorize(req, res)) return;
    const parsed = waGruposSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Payload de grupos inválido." });
    }
    return handle(res, () => cp.setWaGrupos(parsed.data.conta, parsed.data.grupos));
  });

  // Job de BACKUP: recebe os dados a arquivar (corte da retenção/extensões/retenção-zips/caminhos).
  // O QUANDO rodar é do systemd timer na VM — o portal não decide agenda.
  app.post("/api/monitor-arquivos/backup/config", async (req, res) => {
    if (!authorize(req, res)) return;
    return handle(res, () => cp.getDadosBackup());
  });

  // Job de BACKUP: reporta o resultado (cria a notificação no sino do portal).
  app.post("/api/monitor-arquivos/backup/report", async (req, res) => {
    if (!authorize(req, res)) return;
    const parsed = backupReportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Payload de report de backup inválido." });
    }
    return handle(res, () =>
      cp.registrarResultadoBackup({
        ok: parsed.data.ok,
        corte: parsed.data.corte,
        resumo: parsed.data.resumo,
        erros: parsed.data.erros ?? [],
      }),
    );
  });
}
