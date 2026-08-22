/**
 * Backup de pedidos por RETENÇÃO — submódulo "Monitor de Pedidos" (Indicadores) do portal OpenDesk.
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Job na VM Ubuntu srvappapi (systemd timer). A cada execução lê do portal o CORTE da retenção
 * (mantém na pasta só os últimos N dias; arquiva o `mtime < corte`), as extensões, a retenção
 * dos zips e os caminhos. Para CADA caminho de pedidos ativo:
 *   • seleciona os arquivos (pelas extensões) mais ANTIGOS que o corte;
 *   • agrupa por MÊS do arquivo e compacta em <caminho>_backup/<ANO>/<MÊS>/<data-do-run>.zip (pasta irmã);
 *   • REMOVE os originais arquivados (limpa a pasta que o coletor varre);
 *   • PODA as pastas-mês de backup mais velhas que `retencaoZipMeses`.
 * Se não houver nada a arquivar nem a podar → NÃO faz nada (silencioso, sem notificação).
 * Ao final (se houve algo), reporta ao portal, que cria uma NOTIFICAÇÃO no sino.
 *
 * QUANDO rodar é do systemd (não do portal): agendamento = o .timer (ex.: seg 06:00, ou de 3 em
 * 3 dias); rodar manual = `systemctl start` ou `--corte`. O portal só fornece os dados e recebe o
 * resultado. Idempotente (pula zip já existente) + atômico (.tmp → rename → só então remove).
 *
 * Uso:
 *   node index.mjs                    # usa o corte calculado pelo portal (retenção configurada)
 *   node index.mjs --corte 2026-07-28 # força um corte específico (teste): arquiva anteriores a ele
 *   node index.mjs --dry-run          # não escreve/remove/poda nada; só simula e loga
 *   node index.mjs --no-report        # não envia o report (nem cria notificação)
 *
 * Runtime: Node 18+ (fetch nativo). Zip via 'archiver'. Deploy: cópia manual + systemd timer.
 * ⚠️ ESCRITA: usa o mount rw (MOUNT_RW, ex.: /mnt/erp-rw); o coletor usa /mnt/erp em ro.
 * ⚠️ Fuso: a VM DEVE estar em America/Sao_Paulo (systemd Environment=TZ) — o mês do arquivo e a
 *    data do run são calculados no fuso local.
 */

import "dotenv/config";
import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import archiver from "archiver";

const VERSION = "backup-2.2.0";

// ── Configuração via .env ─────────────────────────────────────────────────────
const PORTAL_URL = (process.env.PORTAL_URL || "http://localhost:3000").replace(/\/+$/, "");
const AGENTE_TOKEN = process.env.MONITOR_AGENTE_TOKEN || "";
const HTTP_TIMEOUT_SEG = Math.max(10, Number(process.env.HTTP_TIMEOUT_SEG || 60));
const MOUNT_RO = (process.env.MOUNT_RO || "").replace(/\/+$/, "");
const MOUNT_RW = (process.env.MOUNT_RW || "").replace(/\/+$/, "");

// ── Args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function argVal(nome) {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : null;
}
const CORTE_OVERRIDE = argVal("--corte"); // 'AAAA-MM-DD'
const DRY_RUN = args.includes("--dry-run");
const NO_REPORT = args.includes("--no-report");

// ── Log ────────────────────────────────────────────────────────────────────
function log(nivel, ...a) {
  const ts = new Date().toISOString();
  const fn = nivel === "erro" ? console.error : nivel === "warn" ? console.warn : console.log;
  fn(`[${ts}] [${nivel.toUpperCase()}]`, ...a);
}

// ── Helpers de extensão / data (fuso SP) ────────────────────────────────────
function normalizarExtensao(ext) {
  const e = String(ext || "").trim().toLowerCase();
  if (!e) return "";
  return e.startsWith(".") ? e : "." + e;
}
function extDoNome(nome) {
  const i = nome.lastIndexOf(".");
  if (i <= 0) return "";
  return nome.slice(i).toLowerCase();
}
function partesSP(date, opts) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", ...opts })
    .formatToParts(date)
    .reduce((a, x) => ((a[x.type] = x.value), a), {});
}
function dataSP(date) {
  const p = partesSP(date, { year: "numeric", month: "2-digit", day: "2-digit" });
  return `${p.year}-${p.month}-${p.day}`;
}
function anoMesSP(date) {
  const p = partesSP(date, { year: "numeric", month: "2-digit" });
  return { ano: p.year, mes: p.month };
}
/** Um mês <ano>/<mes> está mais velho que `retencaoMeses` em relação a `agora` (SP)? */
function mesEhAntigo(ano, mes, agora, retencaoMeses) {
  const p = anoMesSP(agora);
  const atual = Number(p.ano) * 12 + (Number(p.mes) - 1);
  const alvo = ano * 12 + (mes - 1);
  return alvo < atual - Math.max(0, Math.trunc(retencaoMeses));
}

// ── Cliente HTTP da ponte (com timeout) ─────────────────────────────────────
async function api(endpoint, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_SEG * 1000);
  try {
    const res = await fetch(`${PORTAL_URL}/api/monitor-arquivos/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${AGENTE_TOKEN}` },
      body: JSON.stringify(body ?? {}),
      signal: ctrl.signal,
    });
    const txt = await res.text().catch(() => "");
    let json = null;
    try {
      json = txt ? JSON.parse(txt) : null;
    } catch {
      /* resposta não-JSON */
    }
    if (!res.ok || (json && json.success === false)) {
      const msg = (json && json.message) || txt.slice(0, 200) || res.statusText;
      throw new Error(`HTTP ${res.status} em /api/monitor-arquivos/${endpoint}: ${msg}`);
    }
    return json?.data ?? {};
  } catch (e) {
    if (e?.name === "AbortError") throw new Error(`timeout (${HTTP_TIMEOUT_SEG}s) em /${endpoint}`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ── Utilidades de arquivo ─────────────────────────────────────────────────────
function paraRw(caminho) {
  if (MOUNT_RO && MOUNT_RW && caminho.startsWith(MOUNT_RO)) return MOUNT_RW + caminho.slice(MOUNT_RO.length);
  return caminho;
}
async function existe(p) {
  return fs.access(p).then(() => true).catch(() => false);
}
/** Escreve os arquivos num .tmp (zip) e resolve com o total de bytes. */
function zipar(tmpPath, arquivos) {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(tmpPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", () => resolve(archive.pointer()));
    output.on("error", reject);
    archive.on("error", reject);
    archive.on("warning", (err) => {
      if (err.code !== "ENOENT") reject(err);
    });
    archive.pipe(output);
    for (const a of arquivos) archive.file(a.full, { name: a.nome }); // achatado
    archive.finalize();
  });
}

/** Poda pastas-mês de backup mais velhas que `retencaoMeses`. Retorna nº de zips removidos. */
async function podarAntigos(backupRoot, retencaoMeses, agora) {
  let podados = 0;
  let anos;
  try {
    anos = await fs.readdir(backupRoot, { withFileTypes: true });
  } catch {
    return 0; // ainda não existe backup/
  }
  for (const anoEnt of anos) {
    if (!anoEnt.isDirectory() || !/^\d{4}$/.test(anoEnt.name)) continue;
    const ano = Number(anoEnt.name);
    const anoDir = path.join(backupRoot, anoEnt.name);
    let meses;
    try {
      meses = await fs.readdir(anoDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const mesEnt of meses) {
      if (!mesEnt.isDirectory() || !/^\d{2}$/.test(mesEnt.name)) continue;
      if (!mesEhAntigo(ano, Number(mesEnt.name), agora, retencaoMeses)) continue;
      const mesDir = path.join(anoDir, mesEnt.name);
      try {
        const files = await fs.readdir(mesDir);
        podados += files.filter((f) => f.toLowerCase().endsWith(".zip")).length;
      } catch {
        /* ignora */
      }
      log("info", `${DRY_RUN ? "[dry-run] " : ""}podado (retenção): ${mesDir}`);
      if (!DRY_RUN) await fs.rm(mesDir, { recursive: true, force: true });
    }
    if (!DRY_RUN) {
      try {
        const rest = await fs.readdir(anoDir);
        if (rest.length === 0) await fs.rmdir(anoDir);
      } catch {
        /* ignora */
      }
    }
  }
  return podados;
}

/**
 * Arquiva UM caminho: zipa os arquivos mais antigos que o corte (agrupados por mês) e remove os
 * originais; depois poda os backups antigos. Retorna { arquivos, zips, podados }.
 */
async function arquivarCaminho(rw, corteMs, permitidas, retencaoMeses, runDate, agora) {
  let arquivos = 0;
  let zips = 0;

  // Backup fica na pasta IRMÃ (mesmo nível do pai), não dentro da pasta de pedidos.
  // Ex.: /mnt/erp-rw/Fct/SC/envio → /mnt/erp-rw/Fct/SC/envio_backup
  const backupRoot = rw.replace(/\/+$/, "") + "_backup";

  const entradas = await fs.readdir(rw, { withFileTypes: true }); // pode lançar → o main captura
  const grupos = new Map(); // 'ano/mes' → { ano, mes, files: [{nome, full}] }
  for (const ent of entradas) {
    if (ent.isDirectory()) continue; // não recursivo
    if (!permitidas.has(extDoNome(ent.name))) continue;
    const full = path.join(rw, ent.name);
    let st;
    try {
      st = await fs.stat(full);
    } catch {
      continue; // sumiu entre readdir e stat
    }
    if (!st.isFile()) continue;
    if (st.mtime.getTime() >= corteMs) continue; // dentro da retenção → fica na pasta
    const { ano, mes } = anoMesSP(st.mtime);
    const key = `${ano}/${mes}`;
    if (!grupos.has(key)) grupos.set(key, { ano, mes, files: [] });
    grupos.get(key).files.push({ nome: ent.name, full });
  }

  for (const g of Array.from(grupos.values())) {
    const backupDir = path.join(backupRoot, g.ano, g.mes);
    const zipPath = path.join(backupDir, `${runDate}.zip`);
    const tmpPath = `${zipPath}.tmp`;
    if (await existe(zipPath)) {
      log("info", `zip já existe, pulando: ${zipPath} (${g.files.length} arquivo(s) do mês)`);
      continue;
    }
    if (DRY_RUN) {
      log("info", `[dry-run] zipar ${g.files.length} arquivo(s) → ${zipPath} e remover`);
      arquivos += g.files.length;
      zips += 1;
      continue;
    }
    await fs.mkdir(backupDir, { recursive: true });
    await fs.rm(tmpPath, { force: true });
    await zipar(tmpPath, g.files);
    await fs.rename(tmpPath, zipPath);
    let rem = 0;
    for (const f of g.files) {
      try {
        await fs.unlink(f.full);
        rem++;
      } catch (e) {
        log("warn", `falha ao remover ${f.full}: ${e.message}`);
      }
    }
    arquivos += rem;
    zips += 1;
    log("info", `arquivado ${zipPath} · ${g.files.length} zipado(s), ${rem} removido(s)`);
  }

  const podados = await podarAntigos(backupRoot, retencaoMeses, agora);
  return { arquivos, zips, podados };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  log("info", `Backup Monitor de Pedidos — ${VERSION}`);
  log("info", `Portal: ${PORTAL_URL} · RO=${MOUNT_RO || "(nenhum)"} → RW=${MOUNT_RW || "(nenhum)"}`);
  if (!AGENTE_TOKEN.trim()) log("warn", "MONITOR_AGENTE_TOKEN vazio — o portal responderá 401/503.");

  let cfg;
  try {
    cfg = await api("backup/config");
  } catch (e) {
    log("erro", `não consegui consultar o portal: ${e.message}`);
    process.exit(1);
  }

  const corteData = CORTE_OVERRIDE || cfg.corteData;
  const corteMs = CORTE_OVERRIDE
    ? new Date(`${CORTE_OVERRIDE}T00:00:00-03:00`).getTime()
    : new Date(cfg.corte).getTime();
  if (!Number.isFinite(corteMs)) {
    log("erro", `corte inválido: ${CORTE_OVERRIDE || cfg.corte}`);
    process.exit(1);
  }
  // Extensão GLOBAL (fallback dos caminhos de pedidos); cada caminho pode trazer a sua própria.
  const permitidasGlobal = new Set(
    (Array.isArray(cfg.extensoesZip) && cfg.extensoesZip.length ? cfg.extensoesZip : ["._rm"]).map(normalizarExtensao),
  );
  const retencaoMeses = Number(cfg.retencaoZipMeses || 12);
  const caminhos = Array.isArray(cfg.caminhos) ? cfg.caminhos : [];
  const agora = new Date();
  const runDate = dataSP(agora);

  log(
    "info",
    `retenção · corte ${corteData} (arquiva anteriores) · ${caminhos.length} caminho(s) · ` +
      `extensões padrão [${Array.from(permitidasGlobal).join(", ")}] · poda > ${retencaoMeses} meses${DRY_RUN ? " · DRY-RUN" : ""}`,
  );

  const resumo = { pastas: 0, arquivos: 0, zips: 0, podados: 0 };
  const erros = [];

  for (const c of caminhos) {
    const rw = paraRw(c.caminho);
    // Cada caminho arquiva pela SUA extensão (ex.: lista .txt); pedidos usam a global.
    const permitidas =
      Array.isArray(c.extensoes) && c.extensoes.length
        ? new Set(c.extensoes.map(normalizarExtensao))
        : permitidasGlobal;
    try {
      const r = await arquivarCaminho(rw, corteMs, permitidas, retencaoMeses, runDate, agora);
      if (r.arquivos > 0) resumo.pastas++;
      resumo.arquivos += r.arquivos;
      resumo.zips += r.zips;
      resumo.podados += r.podados;
    } catch (e) {
      log("erro", `caminho [${c.id} ${c.nome}] "${rw}": ${e.message}`);
      erros.push({ caminho: c.caminho, erro: String(e.message).slice(0, 512) });
    }
  }

  const ok = erros.length === 0;
  log(
    "info",
    `resumo: ${resumo.pastas} pasta(s), ${resumo.arquivos} arquivo(s), ${resumo.zips} zip(s), ` +
      `${resumo.podados} podado(s), ${erros.length} erro(s)`,
  );

  // Silêncio quando não houve nada a fazer (sem arquivar/podar/erro): não reporta nem notifica.
  const nada = resumo.arquivos === 0 && resumo.zips === 0 && resumo.podados === 0 && erros.length === 0;
  if (nada) {
    log("info", "nada a arquivar ou podar — nada a fazer.");
    return;
  }
  if (NO_REPORT || DRY_RUN) {
    log("info", "report não enviado (--no-report/--dry-run).");
    return;
  }
  try {
    await api("backup/report", { ok, corte: corteData, resumo, erros });
    log("info", "report enviado ao portal (notificação criada).");
  } catch (e) {
    log("erro", `falha ao reportar: ${e.message}`);
    process.exit(1);
  }
}

main().catch((e) => {
  log("erro", `falha inesperada: ${e?.message || e}`);
  process.exit(1);
});
