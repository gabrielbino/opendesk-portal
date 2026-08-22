import { TRPCError } from "@trpc/server";
import * as db from "../db";

export type NotificationPayload = {
  title: string;
  content: string;
};

const TITLE_MAX_LENGTH = 1200;
const CONTENT_MAX_LENGTH = 20000;

const trimValue = (value: string): string => value.trim();
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const validatePayload = (input: NotificationPayload): NotificationPayload => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Notification title is required." });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Notification content is required." });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`,
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`,
    });
  }
  return { title, content };
};

/**
 * Notifica o "dono" do projeto na infra PRÓPRIA (sem Manus): grava no **sino interno**
 * (`sys_notificacoes`) para todos os usuários `admin`. Retorna `true` se ao menos 1 admin foi
 * notificado. Antes usava o serviço de notificação do Manus/Forge (indisponível fora do Manus);
 * agora é 100% no banco local — aparece no sino do portal para os admins.
 */
export async function notifyOwner(payload: NotificationPayload): Promise<boolean> {
  const { title, content } = validatePayload(payload);
  try {
    const admins = await db.getUsersByRole("admin");
    if (admins.length === 0) {
      console.warn("[Notification] Nenhum admin cadastrado para notificar.");
      return false;
    }
    await Promise.all(
      admins.map((u) => db.createNotification({ userId: u.id, type: "system", title, message: content })),
    );
    console.log(`[Notification] Notificação gravada no sino de ${admins.length} admin(s).`);
    return true;
  } catch (error) {
    console.warn("[Notification] Falha ao gravar no sino interno:", error);
    return false;
  }
}
