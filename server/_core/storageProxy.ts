import type { Express } from "express";
import { ENV } from "./env";
import { localStoragePath } from "../storage";

/**
 * Serve arquivos do storage LOCAL (STORAGE_DRIVER=local) em /local-storage/*.
 * No-op efetivo para os drivers forge/s3 (as URLs deles não passam por aqui). Ver
 * docs/migracao-infra-propria.md §3.2. A guarda contra path traversal está em localStoragePath.
 */
export function registerLocalStorage(app: Express) {
  app.get("/local-storage/*", (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    let full: string;
    try {
      full = localStoragePath(key);
    } catch {
      res.status(400).send("Invalid storage key");
      return;
    }
    res.sendFile(full, (err) => {
      if (err && !res.headersSent) res.status(404).send("Not found");
    });
  });
}

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }
    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
