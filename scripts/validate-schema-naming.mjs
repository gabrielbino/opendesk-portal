#!/usr/bin/env node
/**
 * Validação automática de nomenclatura de tabelas no schema Drizzle.
 * 
 * Regras:
 * 1. Todas as tabelas devem usar snake_case
 * 2. Todas as tabelas devem ter um prefixo de módulo válido
 * 3. Nomes devem estar em português (sem verificação automática, mas alertas)
 * 
 * Uso: node scripts/validate-schema-naming.mjs
 * Retorna exit code 1 se houver violações.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(__dirname, '../drizzle/schema.ts');

// Prefixos válidos por módulo
const VALID_PREFIXES = [
  'sys_',           // Sistema
  'suporte_',      // Suporte/Chamados
  'chat_',         // Chat
  'superestocados_', // Superestocados
  'comercial_',    // Comercial
  'repasses_',     // Repasses
  'projetos_',     // Projetos
  'tarefas_',      // Tarefas
  'responsabilidades_', // Responsabilidades
  'ti_',           // TI/Inventário
  'compras_',      // Compras
  'estoque_',      // Estoque
  'dev_',          // Desenvolvimento
];

// Tabelas de sistema que são exceção (ex: migrations do Drizzle)
const EXCEPTIONS = ['__drizzle_migrations'];

function validateSchema() {
  const content = readFileSync(schemaPath, 'utf-8');
  
  // Extrair todos os nomes de tabelas do mysqlTable("nome", ...)
  const tableRegex = /mysqlTable\("([^"]+)"/g;
  const tables = [];
  let match;
  
  while ((match = tableRegex.exec(content)) !== null) {
    tables.push(match[1]);
  }
  
  const errors = [];
  const warnings = [];
  
  for (const table of tables) {
    // Pular exceções
    if (EXCEPTIONS.includes(table)) continue;
    
    // Regra 1: snake_case (sem camelCase, sem PascalCase, sem hífens)
    if (/[A-Z]/.test(table)) {
      errors.push(`❌ "${table}" usa camelCase/PascalCase. Deve ser snake_case.`);
    }
    if (table.includes('-')) {
      errors.push(`❌ "${table}" usa hífen. Deve ser snake_case com underscore.`);
    }
    
    // Regra 2: Prefixo de módulo válido
    const hasValidPrefix = VALID_PREFIXES.some(prefix => table.startsWith(prefix));
    if (!hasValidPrefix) {
      errors.push(`❌ "${table}" não tem prefixo de módulo válido. Prefixos aceitos: ${VALID_PREFIXES.join(', ')}`);
    }
    
    // Regra 3: Sem espaços ou caracteres especiais
    if (/[^a-z0-9_]/.test(table)) {
      errors.push(`❌ "${table}" contém caracteres inválidos. Use apenas a-z, 0-9 e underscore.`);
    }
    
    // Aviso: nomes muito curtos (< 5 chars após prefixo)
    const prefix = VALID_PREFIXES.find(p => table.startsWith(p));
    if (prefix && table.slice(prefix.length).length < 3) {
      warnings.push(`⚠️  "${table}" tem nome muito curto após o prefixo. Considere um nome mais descritivo.`);
    }
  }
  
  // Relatório
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   Validação de Nomenclatura do Schema de Banco      ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`📊 Total de tabelas analisadas: ${tables.length}`);
  console.log(`✅ Tabelas conformes: ${tables.length - errors.length}`);
  console.log(`❌ Violações: ${errors.length}`);
  console.log(`⚠️  Avisos: ${warnings.length}`);
  console.log('');
  
  if (errors.length > 0) {
    console.log('── ERROS (bloqueantes) ──────────────────────────────');
    errors.forEach(e => console.log(`  ${e}`));
    console.log('');
  }
  
  if (warnings.length > 0) {
    console.log('── AVISOS (não bloqueantes) ─────────────────────────');
    warnings.forEach(w => console.log(`  ${w}`));
    console.log('');
  }
  
  if (errors.length === 0) {
    console.log('🎉 Todas as tabelas estão em conformidade com o padrão!');
    console.log('');
    
    // Mostrar resumo por módulo
    console.log('── Resumo por módulo ───────────────────────────────');
    for (const prefix of VALID_PREFIXES) {
      const count = tables.filter(t => t.startsWith(prefix)).length;
      if (count > 0) {
        console.log(`  ${prefix.padEnd(20)} ${count} tabela(s)`);
      }
    }
    console.log('');
  }
  
  // Exit code
  process.exit(errors.length > 0 ? 1 : 0);
}

validateSchema();
