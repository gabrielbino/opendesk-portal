// Storage de arquivos PLUGGABLE (anexos/uploads/backup), desacoplado do Manus.
//
// Driver escolhido por STORAGE_DRIVER (server/_core/env.ts):
//   - "forge": storage do Manus (Forge) — compat com o que já existe (padrão se houver credencial).
//   - "s3":    S3 da AWS ou compatível (MinIO via S3_ENDPOINT + S3_FORCE_PATH_STYLE).
//   - "local": disco local da VM (servido em /local-storage/* — ver registerLocalStorage).
//   - auto (sem STORAGE_DRIVER): "forge" se houver credencial Forge, senão "local".
//
// A interface pública (storagePut/storageGet) é a MESMA em qualquer driver — os consumidores
// (uploadRoute, uploadAttachment, backupService, subscriptions) não mudam. Ver docs/migracao-infra-propria.md §3.2.

import { promises as fs } from "fs";
import path from "path";
import { ENV } from "./_core/env";

type Driver = "s3" | "local" | "forge";

function resolveDriver(): Driver {
  const d = ENV.storageDriver;
  if (d === "s3" || d === "local" || d === "forge") return d;
  // auto: usa Forge se houver credencial (compat Manus), senão disco local.
  return ENV.forgeApiUrl && ENV.forgeApiKey ? "forge" : "local";
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

// ───────────────────────── Forge (Manus) ─────────────────────────
function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
function forgeConfig() {
  if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
    throw new Error(
      "Storage 'forge': defina BUILT_IN_FORGE_API_URL e BUILT_IN_FORGE_API_KEY (ou troque STORAGE_DRIVER para s3/local)."
    );
  }
  return { baseUrl: ENV.forgeApiUrl.replace(/\/+$/, ""), apiKey: ENV.forgeApiKey };
}
function forgeAuth(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey}` };
}
function toFormData(data: Buffer | Uint8Array | string, contentType: string, fileName: string): FormData {
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as any], { type: contentType });
  const form = new FormData();
  form.append("file", blob, fileName || "file");
  return form;
}
async function forgePut(key: string, data: Buffer | Uint8Array | string, contentType: string) {
  const { baseUrl, apiKey } = forgeConfig();
  const uploadUrl = new URL("v1/storage/upload", ensureTrailingSlash(baseUrl));
  uploadUrl.searchParams.set("path", key);
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: forgeAuth(apiKey),
    body: toFormData(data, contentType, key.split("/").pop() ?? key),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`Storage upload failed (${response.status} ${response.statusText}): ${message}`);
  }
  const url = (await response.json()).url;
  return { key, url };
}
async function forgeGet(key: string) {
  const { baseUrl, apiKey } = forgeConfig();
  const downloadApiUrl = new URL("v1/storage/downloadUrl", ensureTrailingSlash(baseUrl));
  downloadApiUrl.searchParams.set("path", key);
  const response = await fetch(downloadApiUrl, { method: "GET", headers: forgeAuth(apiKey) });
  return { key, url: (await response.json()).url as string };
}

// ───────────────────────── Local (disco) ─────────────────────────
function localBase(): string {
  return path.resolve(ENV.localStorageDir);
}
/** Caminho absoluto no disco, com guarda contra path traversal (`..`). */
export function localStoragePath(key: string): string {
  const base = localBase();
  const full = path.resolve(base, normalizeKey(key));
  if (full !== base && !full.startsWith(base + path.sep)) {
    throw new Error("Chave de storage inválida.");
  }
  return full;
}
function localUrl(key: string): string {
  const rel = `/local-storage/${key}`;
  return ENV.publicBaseUrl ? `${ENV.publicBaseUrl}${rel}` : rel;
}
async function localPut(key: string, data: Buffer | Uint8Array | string, _contentType: string) {
  const full = localStoragePath(key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  const buf = typeof data === "string" ? Buffer.from(data, "utf-8") : Buffer.from(data as any);
  await fs.writeFile(full, buf);
  return { key, url: localUrl(key) };
}
async function localGet(key: string) {
  return { key, url: localUrl(key) };
}

// ───────────────────────── S3 / MinIO ─────────────────────────
// Import LAZY do SDK: só carrega @aws-sdk quando o driver é "s3" (deploys forge/local não precisam dele).
let _s3mod: Promise<typeof import("@aws-sdk/client-s3")> | null = null;
let _presignMod: Promise<typeof import("@aws-sdk/s3-request-presigner")> | null = null;
let _s3client: import("@aws-sdk/client-s3").S3Client | null = null;
const S3_URL_TTL = 7 * 24 * 3600; // 7 dias (pré-assinada)

async function s3Client() {
  if (_s3client) return _s3client;
  if (!ENV.s3Bucket) throw new Error("Storage 's3': defina S3_BUCKET (+ S3_REGION e credenciais).");
  const { S3Client } = await (_s3mod ??= import("@aws-sdk/client-s3"));
  _s3client = new S3Client({
    region: ENV.s3Region,
    ...(ENV.s3Endpoint ? { endpoint: ENV.s3Endpoint } : {}),
    forcePathStyle: ENV.s3ForcePathStyle,
    ...(ENV.s3AccessKeyId && ENV.s3SecretAccessKey
      ? { credentials: { accessKeyId: ENV.s3AccessKeyId, secretAccessKey: ENV.s3SecretAccessKey } }
      : {}),
  });
  return _s3client;
}
function s3PublicUrl(key: string): string | null {
  return ENV.s3PublicUrl ? `${ENV.s3PublicUrl}/${key}` : null;
}
async function s3SignedGet(key: string): Promise<string> {
  const client = await s3Client();
  const { GetObjectCommand } = await (_s3mod ??= import("@aws-sdk/client-s3"));
  const { getSignedUrl } = await (_presignMod ??= import("@aws-sdk/s3-request-presigner"));
  return getSignedUrl(client, new GetObjectCommand({ Bucket: ENV.s3Bucket, Key: key }), { expiresIn: S3_URL_TTL });
}
async function s3Put(key: string, data: Buffer | Uint8Array | string, contentType: string) {
  const client = await s3Client();
  const { PutObjectCommand } = await (_s3mod ??= import("@aws-sdk/client-s3"));
  const body = typeof data === "string" ? Buffer.from(data, "utf-8") : Buffer.from(data as any);
  await client.send(new PutObjectCommand({ Bucket: ENV.s3Bucket, Key: key, Body: body, ContentType: contentType }));
  const url = s3PublicUrl(key) ?? (await s3SignedGet(key));
  return { key, url };
}
async function s3Get(key: string) {
  return { key, url: s3PublicUrl(key) ?? (await s3SignedGet(key)) };
}

// ───────────────────────── API pública ─────────────────────────
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  switch (resolveDriver()) {
    case "forge":
      return forgePut(key, data, contentType);
    case "s3":
      return s3Put(key, data, contentType);
    case "local":
      return localPut(key, data, contentType);
  }
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  switch (resolveDriver()) {
    case "forge":
      return forgeGet(key);
    case "s3":
      return s3Get(key);
    case "local":
      return localGet(key);
  }
}
