import type { Request, Response } from "express";
import { isScheduledAuthorized } from "./_core/cronAuth";
import { createNotification, getUserByEmail } from "./db";

/**
 * Scheduled handler: avisa (no sino do portal) quando sai uma versão nova da
 * biblioteca `whatsapp-web.js` acima da baseline atual.
 *
 * Contexto: em 31/07/2026 o envio a GRUPOS do bot "Envio de Parcial" quebrou porque a
 * `whatsapp-web.js` 1.34.7 ficou incompatível com a atualização do WhatsApp Web (bug
 * getChats "r:r"; issues wwebjs/whatsapp-web.js #201845 e #201849). O conserto depende de a
 * lib publicar versão nova — este check monitora o npm e notifica o dono do portal quando
 * isso acontecer, para reativar os envios de grupo. Ver docs/envio-parcial-handoff.md.
 *
 * Roda diariamente pelo cron do Manus (ex.: 11:00 UTC / 08:00 BRT).
 * Path: POST /api/scheduled/wwebjs-version-check
 *
 * Notifica via sistema interno do portal (tabela sys_notificacoes) para o usuário
 * desenvolvimento@opendeskdistribuidora.com.br.
 */

/** Versão instalada/quebrada. Ao atualizar o bot, mover esta baseline junto. */
const BASELINE = "1.34.7";
const PACOTE = "whatsapp-web.js";
const TARGET_EMAIL = "desenvolvimento@opendeskdistribuidora.com.br";

/** [major, minor, patch] ignorando prerelease/build. */
function coreTupla(v: string): [number, number, number] {
  const parts = String(v).split("+")[0]!.split("-")[0]!.split(".");
  return [Number(parts[0]) || 0, Number(parts[1]) || 0, Number(parts[2]) || 0];
}

/** true se `a` tem core (major.minor.patch) maior que `b`. */
function coreMaiorQue(a: string, b: string): boolean {
  const ta = coreTupla(a);
  const tb = coreTupla(b);
  for (let i = 0; i < 3; i++) {
    if (ta[i] !== tb[i]) return ta[i]! > tb[i]!;
  }
  return false;
}

/** Envia notificação no sino do portal para o usuário-alvo. */
async function notificarPortal(title: string, message: string): Promise<boolean> {
  try {
    const user = await getUserByEmail(TARGET_EMAIL);
    if (!user) {
      console.warn(`[WwebjsVersionCheck] Usuário ${TARGET_EMAIL} não encontrado no portal.`);
      return false;
    }
    const notif = await createNotification({
      userId: user.id,
      type: "system",
      title,
      message,
    });
    return !!notif;
  } catch (err) {
    console.error("[WwebjsVersionCheck] Falha ao criar notificação no portal:", err);
    return false;
  }
}

export async function wwebjsVersionCheckHandler(req: Request, res: Response) {
  try {
    if (!(await isScheduledAuthorized(req))) {
      return res.status(403).json({ error: "cron-only" });
    }

    // Canais de versão do npm: 'latest' (estável) + dist-tags (next/beta/alpha…).
    const [latestRes, tagsRes] = await Promise.all([
      fetch(`https://registry.npmjs.org/${PACOTE}/latest`),
      fetch(`https://registry.npmjs.org/-/package/${PACOTE}/dist-tags`),
    ]);
    if (!latestRes.ok || !tagsRes.ok) {
      throw new Error(
        `Falha ao consultar o registro npm (latest ${latestRes.status}, dist-tags ${tagsRes.status}).`,
      );
    }
    const latest = (await latestRes.json()) as { version?: string };
    const tags = (await tagsRes.json()) as Record<string, string>;

    // Candidatas = versão estável 'latest' + todos os dist-tags.
    const candidatas = Array.from(
      new Set([latest.version, ...Object.values(tags)].filter((v): v is string => !!v)),
    );
    const novas = candidatas.filter((v) => coreMaiorQue(v, BASELINE));

    const carimbo = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

    if (novas.length === 0) {
      // Sem novidade: mesmo assim avisa (pedido do operador — quer saber todo dia).
      const title = "🔎 whatsapp-web.js — sem novidade";
      const message = [
        `Verificação diária: a whatsapp-web.js segue em ${latest.version ?? BASELINE} (baseline ${BASELINE}).`,
        `O envio a GRUPOS do bot "Envio de Parcial" continua quebrado, aguardando correção da biblioteca.`,
        `Contatos/gerentes recebem normal; grupos por encaminhamento manual.`,
        `Verificado em: ${carimbo}`,
      ].join("\n");
      const notified = await notificarPortal(title, message);
      return res.json({
        ok: true,
        novaVersao: false,
        baseline: BASELINE,
        latest: latest.version ?? null,
        distTags: tags,
        notified,
        timestamp: new Date().toISOString(),
      });
    }

    // Escolhe a "mais nova" pelo core; marca se é pré-lançamento (tem hífen).
    const alvo = novas.sort((a, b) => (coreMaiorQue(a, b) ? -1 : 1))[0]!;
    const ehPrerelease = alvo.includes("-");
    const canalDoAlvo =
      Object.entries(tags).find(([, v]) => v === alvo)?.[0] ??
      (alvo === latest.version ? "latest" : "?");

    const title = "🚨 whatsapp-web.js — nova versão disponível!";
    const message = [
      `Nova versão ${PACOTE} ${alvo} (canal: ${canalDoAlvo}) acima da baseline ${BASELINE}.`,
      ehPrerelease ? "⚠️ Pré-lançamento (instável), teste com cautela." : "",
      `Pode corrigir o envio a GRUPOS do bot "Envio de Parcial".`,
      `Como aplicar (VM srvappapi): cd /home/opendesk/bot-envio-parcial && npm install ${PACOTE}@${ehPrerelease ? alvo : "latest"} && sudo systemctl restart parcial-bot`,
      `Verificado em: ${carimbo}`,
    ].filter(Boolean).join("\n");

    const notified = await notificarPortal(title, message);

    return res.json({
      ok: true,
      novaVersao: true,
      alvo,
      canal: canalDoAlvo,
      prerelease: ehPrerelease,
      baseline: BASELINE,
      candidatas,
      notified,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[WwebjsVersionCheck] Handler error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    });
  }
}
