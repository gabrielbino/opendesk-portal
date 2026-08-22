/**
 * Cliente COMPARTILHADO da API Erp (executor de queries nomeadas).
 *
 * Reutilizável por qualquer módulo do projeto — não é específico do Superestocados.
 * Cuida de: login, cache do token (com retry automático em 401) e POST autenticado.
 *
 * Base e credenciais via segredos: ERP_API_URL, ERP_API_USER, ERP_API_SENHA.
 *
 * Uso típico:
 *   import { executarQuery } from "../erpApi";
 *   const dados = await executarQuery("venda_por_dia", { cod_estabe: "1", lista_produtos: "1,2,3" });
 *
 * Para endpoints fora do executor de queries, use o POST genérico:
 *   const r = await erpApiPost("api/bancos", { ... });
 */

const API_URL = (process.env.ERP_API_URL ?? "").replace(/\/+$/, "");
const API_USER = process.env.ERP_API_USER ?? "";
const API_SENHA = process.env.ERP_API_SENHA ?? "";

const TOKEN_TTL_MAX_MS = 25 * 60 * 1000;
/** Timeout geopendesko para queries pesadas (dia_estoque pode levar 15-20s). */
const FETCH_TIMEOUT_MS = 90_000;
let tokenCache: { token: string; exp: number } | null = null;

/** A API Erp está configurada (URL + credenciais)? */
export function erpApiConfigurada(): boolean {
  return Boolean(API_URL && API_USER && API_SENHA);
}

async function getToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.exp) return tokenCache.token;

  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario: API_USER, senha: API_SENHA }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`Login na API Erp falhou: HTTP ${res.status}`);
  }
  const data = await res.json();
  if (!data?.token) {
    throw new Error("Login na API Erp não retornou 'token'.");
  }

  // expiraEm ex.: "2026-06-18 19:41:33.59" (sem fuso). Usamos como dica e limitamos
  // a TTL_MAX; um 401 numa chamada força novo login de qualquer forma.
  let ttl = TOKEN_TTL_MAX_MS;
  if (typeof data.expiraEm === "string") {
    const exp = new Date(data.expiraEm.replace(" ", "T")).getTime();
    if (Number.isFinite(exp)) ttl = Math.min(Math.max(exp - Date.now() - 60_000, 0), TOKEN_TTL_MAX_MS);
  }
  tokenCache = { token: data.token, exp: Date.now() + ttl };
  return data.token;
}

/** Limpa o token em cache (força novo login na próxima chamada). */
export function resetErpToken() {
  tokenCache = null;
}

/** POST autenticado a um caminho da API; renova o token e tenta uma vez em 401. */
export async function erpApiPost<T = any>(path: string, body: unknown, retried = false): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API_URL}/${path.replace(/^\/+/, "")}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (res.status === 401 && !retried) {
    tokenCache = null;
    return erpApiPost<T>(path, body, true);
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`API Erp ${path}: HTTP ${res.status} ${txt.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Executa uma query nomeada (POST api/consulta/executar) e devolve o array `dados`.
 * É o caminho mais comum de consumo da API.
 */
export async function executarQuery(
  chave: string,
  parametros: Record<string, unknown> = {},
): Promise<any[]> {
  const data = await erpApiPost<{ dados?: unknown }>("api/consulta/executar", { chave, parametros });
  return Array.isArray(data?.dados) ? data.dados : [];
}
