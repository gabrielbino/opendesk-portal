#!/usr/bin/env node
/**
 * Bootstrap do banco de DEV (após `drizzle-kit push` ter criado o schema).
 * Semeia, de forma idempotente:
 *   - 1 usuário admin (login por e-mail/senha)
 *   - alguns departamentos de exemplo
 *
 * Uso:  node scripts/dev-bootstrap.mjs
 * Requer DATABASE_URL no ambiente (ver .env).
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";

const ADMIN = {
  name: "Administrador Demo",
  email: "admin@opendesk.local",
  password: "admin123",
};

const DEPARTAMENTOS = ["Tecnologia", "Suporte", "Comercial", "Financeiro", "Operações"];

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✖ DATABASE_URL não definido (veja o .env).");
  process.exit(1);
}

const conn = await mysql.createConnection(url);
try {
  // ---- Admin ----
  const [rows] = await conn.query("SELECT id FROM sys_usuarios WHERE email = ?", [ADMIN.email]);
  if (rows.length > 0) {
    console.log(`• Admin já existe (${ADMIN.email}) — id ${rows[0].id}. Nada a fazer.`);
  } else {
    const hash = await bcrypt.hash(ADMIN.password, 10);
    await conn.query(
      `INSERT INTO sys_usuarios (name, email, passwordHash, loginMethod, role, approvalStatus, enabled, permissions)
       VALUES (?, ?, ?, 'internal', 'admin', 'approved', 1, '[]')`,
      [ADMIN.name, ADMIN.email, hash],
    );
    console.log(`✔ Admin criado: ${ADMIN.email} / ${ADMIN.password}`);
  }

  // ---- Departamentos ----
  for (const nome of DEPARTAMENTOS) {
    const [d] = await conn.query("SELECT id FROM sys_departamentos WHERE name = ?", [nome]);
    if (d.length === 0) {
      await conn.query("INSERT INTO sys_departamentos (name) VALUES (?)", [nome]);
      console.log(`✔ Departamento criado: ${nome}`);
    }
  }

  console.log("\n✅ Bootstrap concluído.");
  console.log(`   Acesse http://localhost:3000 e entre com ${ADMIN.email} / ${ADMIN.password}`);
} finally {
  await conn.end();
}
