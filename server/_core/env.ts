export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  connectorSharedToken: process.env.CONNECTOR_SHARED_TOKEN ?? "",
  /** Token compartilhado com o bot "Envio de Parcial" (roda no servidor local). */
  parcialBotToken: process.env.PARCIAL_BOT_TOKEN ?? "",
  /** Token compartilhado com os agentes do "Monitor de Integrações" (coletor + WA gateway na VM). */
  monitorAgenteToken: process.env.MONITOR_AGENTE_TOKEN ?? "",
  /**
   * Token para autorizar os jobs agendados (`/api/scheduled/*`) via header
   * `Authorization: Bearer <token>` quando o portal roda FORA do Manus (crontab/systemd timers).
   * No Manus, a autorização segue pelo `isCron` do SDK; ver server/_core/cronAuth.ts.
   */
  cronSharedToken: process.env.CRON_SHARED_TOKEN ?? "",
  /**
   * Storage de arquivos (anexos/uploads/backup). Desacopla do Forge do Manus.
   * - "forge" (padrão se houver credencial Forge): storage do Manus (compat).
   * - "s3":    S3 ou compatível (MinIO) — ver campos s3*.
   * - "local": disco local da VM (servido em /local-storage/*).
   * Sem STORAGE_DRIVER: usa "forge" se houver credencial, senão "local".
   */
  storageDriver: (process.env.STORAGE_DRIVER ?? "").trim().toLowerCase(),
  /** Base pública do portal (ex.: https://portal.dominio) para montar URLs absolutas do storage local. */
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? "").replace(/\/+$/, ""),
  /** Storage local: diretório-raiz dos arquivos. */
  localStorageDir: process.env.LOCAL_STORAGE_DIR ?? "./data/uploads",
  /** Storage S3/MinIO. */
  s3Bucket: process.env.S3_BUCKET ?? "",
  s3Region: process.env.S3_REGION ?? "us-east-1",
  s3Endpoint: process.env.S3_ENDPOINT ?? "", // vazio = AWS; preencher p/ MinIO
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  s3ForcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "").toLowerCase() === "true", // MinIO = true
  /** URL pública do bucket (opcional). Se vazio, `storageGet` devolve URL pré-assinada. */
  s3PublicUrl: (process.env.S3_PUBLIC_URL ?? "").replace(/\/+$/, ""),
};
