import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy, registerLocalStorage } from "./storageProxy";
import { registerUploadRoute } from "../uploadRoute";
import uploadAttachmentRouter from "../uploadAttachment";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { ENV } from "./env";
import {
  connectorSyncPayloadSchema,
  isConnectorAuthorized,
  processConnectorSync,
} from "../superestocadosConnectorIngestion";
import { registerParcialBridge } from "../parcialBridge";
import { registerMonitorArquivosBridge } from "../monitorArquivosBridge";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // Storage proxy for /manus-storage/* paths (Forge/Manus — compat) + /local-storage/* (driver local)
  registerStorageProxy(app);
  registerLocalStorage(app);
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // Connector health check endpoint
  app.get("/api/connector/health", (req, res) => {
    if (!ENV.connectorSharedToken.trim()) {
      return res.status(503).json({
        success: false,
        message: "A credencial do conector ainda não foi configurada no ambiente do painel.",
      });
    }

    if (!isConnectorAuthorized(req.headers.authorization, ENV.connectorSharedToken)) {
      return res.status(401).json({
        success: false,
        message: "Token do conector inválido ou ausente.",
      });
    }

    return res.status(200).json({
      success: true,
      connector: "ok",
      timestamp: new Date().toISOString(),
    });
  });

  // Connector product codes endpoint — retorna os códigos dos produtos
  // cadastrados no painel para uma região, usado pelo conector para filtrar a query de vendas
  app.get("/api/connector/products/:region", async (req, res) => {
    if (!ENV.connectorSharedToken.trim()) {
      return res.status(503).json({
        success: false,
        message: "A credencial do conector ainda não foi configurada no ambiente do painel.",
      });
    }

    if (!isConnectorAuthorized(req.headers.authorization, ENV.connectorSharedToken)) {
      return res.status(401).json({
        success: false,
        message: "Token do conector inválido ou ausente.",
      });
    }

    const region = (req.params.region ?? "").toUpperCase();
    if (region !== "SC" && region !== "RS") {
      return res.status(400).json({
        success: false,
        message: "Região inválida. Use SC ou RS.",
      });
    }

    try {
      const { getRegionProductCodes } = await import("../db/superestocados");
      // Suporta filtro opcional por tipo: ?tipo=medicamento ou ?tipo=nao_medicamento
      const tipoParam = (req.query.tipo as string | undefined)?.trim().toLowerCase();
      const tipoProduto = tipoParam === "medicamento" || tipoParam === "nao_medicamento" ? tipoParam : undefined;
      const codes = await getRegionProductCodes(region as "SC" | "RS", tipoProduto as any);
      return res.status(200).json({
        success: true,
        region,
        ...(tipoProduto ? { tipoProduto } : {}),
        count: codes.length,
        codes,
      });
    } catch (error) {
      console.error("[Connector Products] Falha ao buscar códigos de produtos", error);
      return res.status(500).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Falha inesperada ao buscar códigos de produtos.",
      });
    }
  });

  // Endpoint para o connector consultar quantas datas de vendas a região possui
  // Usado para decidir entre bootstrap (0 datas) e incremental (>0 datas)
  app.get("/api/connector/sales-dates/:region", async (req, res) => {
    if (!ENV.connectorSharedToken.trim()) {
      return res.status(503).json({
        success: false,
        message: "A credencial do conector ainda não foi configurada no ambiente do painel.",
      });
    }

    if (!isConnectorAuthorized(req.headers.authorization, ENV.connectorSharedToken)) {
      return res.status(401).json({
        success: false,
        message: "Token do conector inválido ou ausente.",
      });
    }

    const region = (req.params.region ?? "").toUpperCase();
    if (region !== "SC" && region !== "RS") {
      return res.status(400).json({
        success: false,
        message: "Região inválida. Use SC ou RS.",
      });
    }

    try {
      const { getSalesDatesCount } = await import("../db/superestocados");
      const count = await getSalesDatesCount(region as "SC" | "RS");
      return res.status(200).json({
        success: true,
        region,
        count,
      });
    } catch (error) {
      console.error("[Connector Sales Dates] Falha ao consultar datas de vendas", error);
      return res.status(500).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Falha inesperada ao consultar datas de vendas.",
      });
    }
  });

  // Connector sync endpoint
  app.post("/api/connector/sync", async (req, res) => {
    if (!ENV.connectorSharedToken.trim()) {
      return res.status(503).json({
        success: false,
        message: "A credencial do conector ainda não foi configurada no ambiente do painel.",
      });
    }

    if (!isConnectorAuthorized(req.headers.authorization, ENV.connectorSharedToken)) {
      return res.status(401).json({
        success: false,
        message: "Token do conector inválido ou ausente.",
      });
    }

    const parsedPayload = connectorSyncPayloadSchema.safeParse(req.body);
    if (!parsedPayload.success) {
      return res.status(400).json({
        success: false,
        message: "Payload inválido recebido do conector.",
        issues: parsedPayload.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    try {
      const result = await processConnectorSync(parsedPayload.data);
      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      console.error("[Connector Sync] Falha ao processar carga recebida", error);
      return res.status(500).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Falha inesperada ao processar a carga do conector.",
      });
    }
  });

  // Endpoints-ponte do bot "Envio de Parcial" (consumidos pelo servidor local)
  registerParcialBridge(app);
  registerMonitorArquivosBridge(app);

  // File upload route
  registerUploadRoute(app);
  // Attachment upload route
  app.use('/api', uploadAttachmentRouter);
  // Scheduled task handlers (must be before Vite/static fallthrough)
  const { ticketAutoCloseHandler } = await import("../scheduledTicketAutoClose");
  app.post("/api/scheduled/ticket-auto-close", ticketAutoCloseHandler);

  const { dataFreshnessCheckHandler } = await import("../scheduledDataFreshnessCheck");
  app.post("/api/scheduled/data-freshness-check", dataFreshnessCheckHandler);

  const { wwebjsVersionCheckHandler } = await import("../scheduledWwebjsVersionCheck");
  app.post("/api/scheduled/wwebjs-version-check", wwebjsVersionCheckHandler);

  const { superestocadosVendasSyncHandler } = await import("../scheduledSuperestocadosVendasSync");
  app.post("/api/scheduled/superestocados-vendas-sync", superestocadosVendasSyncHandler);

  const { superestocadosProdutosSyncHandler } = await import("../scheduledSuperestocadosProdutosSync");
  app.post("/api/scheduled/superestocados-produtos-sync", superestocadosProdutosSyncHandler);

  const { validadesCurtasSyncHandler } = await import("../scheduledValidadesCurtasSync");
  app.post("/api/scheduled/validades-curtas-sync", validadesCurtasSyncHandler);

  const { rupturasSyncHandler } = await import("../scheduledRupturasSync");
  app.post("/api/scheduled/rupturas-sync", rupturasSyncHandler);

  const { pescadorSyncHandler } = await import("../scheduledPescadorSync");
  app.post("/api/scheduled/pescador-sync", pescadorSyncHandler);

  const { compradoresMarcasSyncHandler } = await import("../scheduledCompradoresMarcasSync");
  app.post("/api/scheduled/compradores-marcas-sync", compradoresMarcasSyncHandler);

  const { indicadoresPedidosLayoutSnapshotHandler } = await import("../scheduledIndicadoresPedidosLayoutSnapshot");
  app.post("/api/scheduled/indicadores-pedidos-layout-snapshot", indicadoresPedidosLayoutSnapshotHandler);

  const { indicadoresAlertaCfvHandler } = await import("../scheduledIndicadoresAlertaCfv");
  app.post("/api/scheduled/indicadores-alerta-cfv", indicadoresAlertaCfvHandler);

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    
    // Schedule daily backup at 2 AM
    scheduleDailyBackup();
  });
}

/**
 * Schedules daily backup at 2 AM (S3 + GitHub)
 */
function scheduleDailyBackup() {
  const now = new Date();
  const next2AM = new Date(now);
  next2AM.setHours(2, 0, 0, 0);
  
  // If 2 AM has already passed today, schedule for tomorrow
  if (next2AM <= now) {
    next2AM.setDate(next2AM.getDate() + 1);
  }
  
  const msUntilNext2AM = next2AM.getTime() - now.getTime();
  
  console.log(`[Backup] Next automatic backup scheduled for ${next2AM.toLocaleString('pt-BR')}`);
  
  const runAllBackups = async () => {
    // S3 Backup
    try {
      const { runDailyBackup } = await import('../cronBackup');
      await runDailyBackup();
    } catch (error) {
      console.error('[Backup] Error running S3 backup:', error);
    }
    
    // GitHub Backup
    try {
      const { runGitHubBackup } = await import('../githubBackup');
      const result = await runGitHubBackup();
      if (result.success) {
        console.log(`[Backup] GitHub backup completed: ${result.message}`);
      } else {
        console.error(`[Backup] GitHub backup failed: ${result.message}`);
      }
    } catch (error) {
      console.error('[Backup] Error running GitHub backup:', error);
    }
  };
  
  setTimeout(async () => {
    await runAllBackups();
    
    // Schedule next backup (24 hours later)
    setInterval(runAllBackups, 24 * 60 * 60 * 1000); // 24 hours
  }, msUntilNext2AM);
}

startServer().catch(console.error);
