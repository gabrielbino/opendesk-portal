import type { Request } from "express";

import { sdk } from "./sdk";
import { ENV } from "./env";

/**
 * Autorização dos handlers agendados (`/api/scheduled/*`), desacoplada do Manus.
 *
 * Aceita a requisição como "cron autorizado" em DOIS caminhos (o primeiro que valer):
 *  1. Token próprio  — header `Authorization: Bearer <CRON_SHARED_TOKEN>` (crontab/systemd na VM).
 *  2. Manus (legado) — sessão `isCron` do SDK (openId `cron_*` validado no servidor OAuth do Manus).
 *
 * Assim o mesmo código roda no Manus (caminho 2) e em infra própria (caminho 1) sem `if` de ambiente.
 * Ver docs/migracao-infra-propria.md §3.1.
 */
export async function isScheduledAuthorized(req: Request): Promise<boolean> {
  // 1) Token compartilhado (infra própria)
  const token = ENV.cronSharedToken.trim();
  if (token) {
    const auth = (req.headers.authorization ?? "").trim();
    if (auth === `Bearer ${token}`) return true;
  }

  // 2) Sessão de cron do Manus (legado)
  try {
    const user = await sdk.authenticateRequest(req);
    return Boolean((user as any).isCron && (user as any).taskUid);
  } catch {
    return false;
  }
}
