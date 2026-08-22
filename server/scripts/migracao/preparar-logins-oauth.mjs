// Prepara o login dos usuários que hoje entram por OAuth/SSO do Manus.
//
// Fora do Manus o SSO para de funcionar, mas o login interno (e-mail/senha) funciona. Este script
// define uma senha para cada usuário `loginMethod='oauth'` (ou sem passwordHash) na tabela
// `sys_usuarios`, para que consigam entrar após o cutover. Ver docs/migracao-infra-propria.md §3.3.
//
// Uso (na VM, com o banco JÁ importado e o `.env` preenchido):
//   node server/scripts/migracao/preparar-logins-oauth.mjs --dry-run          # só LISTA os afetados
//   node server/scripts/migracao/preparar-logins-oauth.mjs                     # gera senha ALEATÓRIA por usuário
//   node server/scripts/migracao/preparar-logins-oauth.mjs --senha-unica SENHA # mesma senha p/ todos
//
// Gera `logins-temporarios.csv` (e imprime) com e-mail → senha, para o admin distribuir.
// ⚠️ Apague esse CSV depois de comunicar as senhas. Peça troca no 1º acesso.
// Não sobrescreve quem já tem passwordHash, a menos que use --forcar.

import "dotenv/config";
import { promises as fs } from "fs";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";

const DRY = process.argv.includes("--dry-run");
const FORCAR = process.argv.includes("--forcar");
const idxSenha = process.argv.indexOf("--senha-unica");
const SENHA_UNICA = idxSenha >= 0 ? process.argv[idxSenha + 1] : null;

function senhaAleatoria() {
  // 12 chars base64url (sem símbolos problemáticos), fácil de comunicar.
  return crypto.randomBytes(9).toString("base64").replace(/[+/=]/g, "").slice(0, 12);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL ausente.");
  if (SENHA_UNICA && SENHA_UNICA.length < 6) throw new Error("--senha-unica precisa de ao menos 6 caracteres.");

  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const cond = FORCAR ? "loginMethod = 'oauth'" : "(loginMethod = 'oauth' OR passwordHash IS NULL)";
  const [rows] = await conn.execute(
    `SELECT id, name, email, loginMethod, passwordHash FROM sys_usuarios WHERE ${cond} ORDER BY email`,
  );

  if (rows.length === 0) {
    console.log("Nenhum usuário OAuth/sem senha encontrado. Nada a fazer.");
    await conn.end();
    return;
  }

  const linhas = [["email", "nome", "senha_temporaria"]];
  let alterados = 0;
  for (const u of rows) {
    if (!FORCAR && u.passwordHash) continue; // já tem senha → não mexe
    const senha = SENHA_UNICA ?? senhaAleatoria();
    if (!DRY) {
      const hash = await bcrypt.hash(senha, 10);
      await conn.execute(
        "UPDATE sys_usuarios SET passwordHash = ?, loginMethod = 'internal' WHERE id = ?",
        [hash, u.id],
      );
    }
    linhas.push([u.email ?? "", u.name ?? "", senha]);
    alterados++;
    console.log(`${DRY ? "[dry] " : ""}${u.email}  (${u.loginMethod})`);
  }

  if (!DRY && alterados > 0) {
    const csv = linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    await fs.writeFile("logins-temporarios.csv", csv, "utf-8");
    console.log("\n→ Gerado logins-temporarios.csv (APAGUE após distribuir as senhas).");
  }
  console.log(`\nResumo: ${alterados} usuário(s) ${DRY ? "seriam ajustados (DRY-RUN)" : "ajustados"}.`);
  await conn.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
