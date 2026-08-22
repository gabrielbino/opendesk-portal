// FASE A (extração dos anexos — roda a qualquer momento com acesso ao banco):
// Baixa TODOS os anexos do storage do Manus SEM precisar das credenciais BUILT_IN_FORGE_* e SEM
// depender do app estar no ar — usa a `fileUrl` DIRETA do CDN (CloudFront) gravada no banco. Como
// fallback (só se o app estiver no ar) tenta a rota `/manus-storage/<key>`. Salva em disco preservando
// a `key`, para depois copiar no LOCAL_STORAGE_DIR da VM. NÃO altera o banco.
//
// Uso:
//   DATABASE_URL="mysql://user:senha@host:4000/JLPd83LStLYaV7mJXtu8eL" \
//   node server/scripts/migracao/baixar-anexos-do-portal.mjs [--out ./anexos-backup]
//
// Env:
//   DATABASE_URL     conexão com o banco (o MESMO do HeidiSQL; TiDB serverless exige TLS → ligado auto p/ host remoto)
//   PORTAL_BASE_URL  (OPCIONAL) URL do portal no Manus — só usado como fallback via /manus-storage/
//   --out DIR        pasta de saída (default ./anexos-backup)
//
// Gera também `anexos-backup/manifesto.csv` (tabela,id,key,status,bytes).

import "dotenv/config";
import { promises as fs } from "fs";
import path from "path";
import mysql from "mysql2/promise";

const outIdx = process.argv.indexOf("--out");
const OUT = outIdx >= 0 ? process.argv[outIdx + 1] : "./anexos-backup";
const PORTAL = (process.env.PORTAL_BASE_URL ?? "").replace(/\/+$/, "");

const TABELAS = [
  { tabela: "suporte_anexos", keyCol: "fileKey", urlCol: "fileUrl" },
  { tabela: "projetos_anexos", keyCol: "fileKey", urlCol: "fileUrl" },
  { tabela: "admin_assinaturas_anexos", keyCol: "fileKey", urlCol: "fileUrl" },
  { tabela: "comercial_uploads", keyCol: "fileKey", urlCol: "fileUrl" },
];

function encodeKey(key) {
  return key.split("/").map(encodeURIComponent).join("/");
}
/** Encoda espaços/acentos de uma URL crua (raw) sem re-encodar o que já é válido. */
function encodarUrl(u) {
  return /%[0-9a-fA-F]{2}/.test(u) ? u : encodeURI(u); // se já parece encodada, não mexe
}
/** Candidatos de URL em ordem de preferência (URL direta do storage/CDN primeiro; via app por último). */
function resolverUrls(key, urlCru) {
  const cands = [];
  if (urlCru && /^https?:\/\//i.test(urlCru)) cands.push(encodarUrl(urlCru)); // URL direta (CloudFront) — bypassa o app
  if (PORTAL && key) cands.push(`${PORTAL}/manus-storage/${encodeKey(key)}`); // via app (só se estiver no ar)
  if (PORTAL && urlCru) {
    const m = /\/manus-storage\/(.+)$/.exec(urlCru);
    if (m) cands.push(`${PORTAL}/manus-storage/${m[1]}`);
  }
  return cands;
}
/** Detecta página de erro HTML (ex.: "Site Unavailable") pra não salvar como se fosse arquivo. */
function pareceHtmlErro(buf, contentType) {
  if (contentType && contentType.toLowerCase().includes("text/html")) return true;
  const head = buf.subarray(0, 64).toString("utf8").toLowerCase();
  return head.includes("<!doctype") || head.includes("<html") || head.includes("site unavailable");
}
async function salvar(key, buf) {
  const base = path.resolve(OUT);
  const full = path.resolve(base, key.replace(/^\/+/, ""));
  if (full !== base && !full.startsWith(base + path.sep)) throw new Error(`key inválida: ${key}`);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, buf);
}

async function conectar() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ausente.");
  const remoto = !/@(localhost|127\.0\.0\.1)[:/]/.test(url);
  return mysql.createConnection(
    remoto ? { uri: url, ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true } } : { uri: url },
  );
}

async function main() {
  // PORTAL_BASE_URL é opcional: as fileUrl são URLs diretas do CDN (CloudFront). Só é usado como
  // fallback via /manus-storage/ quando não há URL direta E o app estiver no ar.
  if (!PORTAL) console.warn("[info] PORTAL_BASE_URL não definido — usando só as URLs diretas (fileUrl).");
  const conn = await conectar();
  const manifesto = [["tabela", "id", "key", "status", "bytes"]];
  const resumo = { ok: 0, falha: 0, pulado: 0 };

  async function baixarLinha(tabela, id, key, urlCru) {
    const chaveArquivo =
      key || (urlCru && /\/manus-storage\/(.+)$/.exec(urlCru)?.[1]) || `${tabela}/${id}-${path.basename(urlCru || "arquivo")}`;
    const candidatos = resolverUrls(key, urlCru);
    if (candidatos.length === 0) {
      resumo.pulado++;
      manifesto.push([tabela, id, chaveArquivo, "sem-url", 0]);
      return;
    }
    let ultimoErro = "sem candidato válido";
    for (const url of candidatos) {
      try {
        const r = await fetch(url);
        if (!r.ok) { ultimoErro = `HTTP ${r.status}`; continue; }
        const buf = Buffer.from(await r.arrayBuffer());
        if (pareceHtmlErro(buf, r.headers.get("content-type") || "")) {
          ultimoErro = "resposta HTML (app fora do ar / URL inválida)";
          continue;
        }
        await salvar(chaveArquivo, buf);
        resumo.ok++;
        manifesto.push([tabela, id, chaveArquivo, "ok", buf.length]);
        console.log(`ok  ${tabela}#${id}  ${chaveArquivo} (${buf.length}b)`);
        return;
      } catch (e) {
        ultimoErro = e.message;
      }
    }
    resumo.falha++;
    manifesto.push([tabela, id, chaveArquivo, `erro:${ultimoErro}`, 0]);
    console.error(`ERR ${tabela}#${id}  ${chaveArquivo}: ${ultimoErro}`);
  }

  for (const { tabela, keyCol, urlCol } of TABELAS) {
    let rows;
    try {
      [rows] = await conn.execute(`SELECT id, \`${keyCol}\` AS k, \`${urlCol}\` AS u FROM \`${tabela}\``);
    } catch (e) {
      console.warn(`[skip] ${tabela}: ${e.message}`);
      continue;
    }
    for (const row of rows) {
      if (!row.k && !row.u) { resumo.pulado++; continue; }
      await baixarLinha(tabela, row.id, row.k, row.u);
    }
  }
  // chat_mensagens (só attachmentUrl)
  try {
    const [rows] = await conn.execute(
      "SELECT id, attachmentUrl AS u FROM chat_mensagens WHERE attachmentUrl IS NOT NULL AND attachmentUrl <> ''",
    );
    for (const row of rows) await baixarLinha("chat_mensagens", row.id, null, row.u);
  } catch (e) {
    console.warn(`[skip] chat_mensagens: ${e.message}`);
  }

  await conn.end();
  await fs.mkdir(path.resolve(OUT), { recursive: true });
  const csv = manifesto.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  await fs.writeFile(path.join(OUT, "manifesto.csv"), csv, "utf-8");
  console.log(`\nResumo: ${resumo.ok} baixados · ${resumo.falha} falhas · ${resumo.pulado} pulados.`);
  console.log(`Arquivos em: ${path.resolve(OUT)}  (manifesto.csv incluso)`);
  if (resumo.falha > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
