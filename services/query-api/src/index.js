/**
 * OpenDesk — Query API (genérica, executor de queries nomeadas)
 * ------------------------------------------------------------------
 * Reproduz o contrato que o portal já consome (server/neosulApi.ts):
 *   POST /api/auth/login        { usuario, senha }      -> { token, expiraEm }
 *   POST /api/consulta/executar { chave, parametros }   -> { dados: [...] }   (Bearer)
 *
 * Além disso, expõe uma UI + CRUD de administração para CADASTRAR e TESTAR
 * queries nomeadas (chave -> SQL parametrizado). O registro fica numa tabela
 * `qapi_queries` do próprio banco-alvo (criada no boot).
 *
 * Segurança: SQL das queries é AUTORADO por admin (confiável). Os PARÂMETROS
 * do chamador são sempre BINDADOS (placeholders `:nome`), nunca concatenados.
 */
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import mysql from "mysql2/promise";

const {
  PORT = "4000",
  // Credenciais que o PORTAL usa para logar (POST /api/auth/login).
  QAPI_USER = "portal",
  QAPI_PASSWORD = "portal-dev",
  // Credenciais de ADMIN da UI (autoria de queries).
  QAPI_ADMIN_USER = "admin",
  QAPI_ADMIN_PASSWORD = "admin",
  JWT_SECRET = "query-api-dev-secret",
  // Banco-alvo (o "ERP" onde as queries rodam) e onde vive o registro de queries.
  TARGET_DB_URL = "mysql://root:dev@127.0.0.1:3306/demo_erp",
  TOKEN_TTL_MIN = "30",
} = process.env;

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ─────────────────────────── Banco-alvo + registro ───────────────────────────
const pool = mysql.createPool({ uri: TARGET_DB_URL, connectionLimit: 8, dateStrings: true });

async function ensureRegistry() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS qapi_queries (
      chave        VARCHAR(120) NOT NULL PRIMARY KEY,
      descricao    VARCHAR(500) NULL,
      sql_text     MEDIUMTEXT   NOT NULL,
      params_json  JSON         NULL,
      atualizado_em TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

// ─────────────────────────── Auth (JWT) ───────────────────────────
function fmtExpiraEm(date) {
  // "YYYY-MM-DD HH:MM:SS" (o cliente do portal aceita esse formato).
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}

function issueToken(sub, role) {
  const ttlMs = Number(TOKEN_TTL_MIN) * 60 * 1000;
  const exp = new Date(Date.now() + ttlMs);
  const token = jwt.sign({ sub, role }, JWT_SECRET, { expiresIn: `${TOKEN_TTL_MIN}m` });
  return { token, expiraEm: fmtExpiraEm(exp) };
}

function auth(requireAdmin = false) {
  return (req, res, next) => {
    const h = req.headers.authorization || "";
    const m = h.match(/^Bearer\s+(.+)$/i);
    if (!m) return res.status(401).json({ erro: "sem token" });
    try {
      const payload = jwt.verify(m[1], JWT_SECRET);
      if (requireAdmin && payload.role !== "admin") return res.status(403).json({ erro: "requer admin" });
      req.user = payload;
      next();
    } catch {
      return res.status(401).json({ erro: "token inválido/expirado" });
    }
  };
}

app.post("/api/auth/login", (req, res) => {
  const { usuario, senha } = req.body || {};
  if (usuario === QAPI_ADMIN_USER && senha === QAPI_ADMIN_PASSWORD) {
    return res.json(issueToken(usuario, "admin"));
  }
  if (usuario === QAPI_USER && senha === QAPI_PASSWORD) {
    return res.json(issueToken(usuario, "portal"));
  }
  return res.status(401).json({ erro: "credenciais inválidas" });
});

// ─────────────────────────── Execução de query nomeada ───────────────────────────
/**
 * Converte SQL com placeholders `:nome` em SQL com `?`, coletando os valores na ordem.
 * - Valor string com vírgulas vira ARRAY (para `IN (:lista)` expandir via mysql2 .query).
 * - Placeholder sem valor correspondente → erro.
 */
function bind(sqlText, parametros = {}) {
  const values = [];
  const missing = [];
  const sql = sqlText.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
    if (!(name in parametros)) {
      missing.push(name);
      return `:${name}`;
    }
    let v = parametros[name];
    if (typeof v === "string" && v.includes(",")) v = v.split(",").map((s) => s.trim());
    values.push(v);
    return "?";
  });
  if (missing.length) throw new Error(`parâmetros ausentes: ${missing.join(", ")}`);
  return { sql, values };
}

async function runNamed(chave, parametros) {
  const [rows] = await pool.query("SELECT sql_text FROM qapi_queries WHERE chave = ?", [chave]);
  if (!rows.length) {
    const err = new Error(`query não cadastrada: ${chave}`);
    err.status = 404;
    throw err;
  }
  const { sql, values } = bind(rows[0].sql_text, parametros || {});
  const [dados] = await pool.query(sql, values);
  return dados;
}

app.post("/api/consulta/executar", auth(false), async (req, res) => {
  const { chave, parametros } = req.body || {};
  if (!chave) return res.status(400).json({ erro: "informe 'chave'" });
  try {
    const dados = await runNamed(chave, parametros);
    res.json({ dados });
  } catch (e) {
    res.status(e.status || 500).json({ erro: String(e.message || e) });
  }
});

// ─────────────────────────── Admin CRUD (UI de autoria) ───────────────────────────
app.get("/admin/queries", auth(true), async (_req, res) => {
  const [rows] = await pool.query(
    "SELECT chave, descricao, sql_text, params_json, atualizado_em FROM qapi_queries ORDER BY chave",
  );
  res.json({ queries: rows });
});

app.put("/admin/queries/:chave", auth(true), async (req, res) => {
  const chave = req.params.chave;
  const { descricao = null, sql_text, params_json = null } = req.body || {};
  if (!sql_text) return res.status(400).json({ erro: "informe 'sql_text'" });
  await pool.query(
    `INSERT INTO qapi_queries (chave, descricao, sql_text, params_json)
       VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE descricao = VALUES(descricao), sql_text = VALUES(sql_text), params_json = VALUES(params_json)`,
    [chave, descricao, sql_text, params_json ? JSON.stringify(params_json) : null],
  );
  res.json({ ok: true });
});

app.delete("/admin/queries/:chave", auth(true), async (req, res) => {
  await pool.query("DELETE FROM qapi_queries WHERE chave = ?", [req.params.chave]);
  res.json({ ok: true });
});

// Testa uma query (SQL cru + parâmetros) SEM salvar — para o botão "Testar" da UI.
app.post("/admin/test", auth(true), async (req, res) => {
  const { sql_text, parametros } = req.body || {};
  if (!sql_text) return res.status(400).json({ erro: "informe 'sql_text'" });
  try {
    const { sql, values } = bind(sql_text, parametros || {});
    const [dados] = await pool.query(sql, values);
    res.json({ dados: Array.isArray(dados) ? dados.slice(0, 200) : dados, total: Array.isArray(dados) ? dados.length : 0 });
  } catch (e) {
    res.status(400).json({ erro: String(e.message || e) });
  }
});

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, erro: String(e.message || e) });
  }
});

app.use(express.static(new URL("../public", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")));

const port = Number(PORT);
ensureRegistry()
  .then(() => {
    app.listen(port, () => {
      console.log(`[query-api] ouvindo em http://localhost:${port}`);
      console.log(`[query-api] banco-alvo: ${TARGET_DB_URL.replace(/:\/\/[^@]*@/, "://***@")}`);
    });
  })
  .catch((e) => {
    console.error("[query-api] falha ao iniciar (registro):", e.message);
    process.exit(1);
  });
