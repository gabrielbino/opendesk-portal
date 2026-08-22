/**
 * Script para converter o wrapper principal de páginas que ainda usam
 * o fundo azul antigo para o novo padrão: flex flex-col h-screen w-screen overflow-hidden bg-[var(--background)]
 *
 * Também converte o header antigo (bg-[#0a1628]/80 ou bg-white/5 + border-white/10) para o novo padrão.
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const files = [
  'client/src/pages/Announcements.tsx',
  'client/src/pages/BackupManagement.tsx',
  'client/src/pages/Commercial.tsx',
  'client/src/pages/DailyTasks.tsx',
  'client/src/pages/DepartmentManagement.tsx',
  'client/src/pages/PermissionGroupsManagement.tsx',
  'client/src/pages/Projects.tsx',
  'client/src/pages/ProjectsDashboard.tsx',
];

const ROOT = resolve(process.cwd());

for (const rel of files) {
  const path = resolve(ROOT, rel);
  let src = readFileSync(path, 'utf8');

  // Replace old dark blue gradient backgrounds on the root wrapper
  src = src.replace(
    /className="min-h-screen bg-gradient-to-br from-\[#003366\][^"]*"/g,
    'className="flex flex-col min-h-screen bg-[var(--background)]"'
  );
  src = src.replace(
    /className="min-h-screen bg-gradient-to-br from-\[#004080\][^"]*"/g,
    'className="flex flex-col min-h-screen bg-[var(--background)]"'
  );

  // Replace old header styles
  src = src.replace(
    /className="(?:relative z-20 )?backdrop-blur-xl bg-white\/5 border-b border-white\/10 sticky top-0[^"]*"/g,
    'className="shrink-0 z-50 border-b border-border/60 bg-[var(--background)]/95 backdrop-blur-md sticky top-0"'
  );
  src = src.replace(
    /className="bg-\[#0a1628\]\/80 backdrop-blur-sm border-b border-white\/10 sticky top-0[^"]*"/g,
    'className="shrink-0 z-50 border-b border-border/60 bg-[var(--background)]/95 backdrop-blur-md sticky top-0"'
  );

  // Replace old card backgrounds
  src = src.replace(/bg-white\/10 backdrop-blur-xl border-white\/20/g, 'bg-card border-border');
  src = src.replace(/bg-white\/5 backdrop-blur-sm border border-white\/10/g, 'bg-card border-border');
  src = src.replace(/bg-white\/5 backdrop-blur-xl border-white\/10/g, 'bg-card border-border');

  // Replace old text colors
  src = src.replace(/text-blue-200(?!\s*\/)/g, 'text-muted-foreground');
  src = src.replace(/text-blue-100(?!\s*\/)/g, 'text-muted-foreground');
  src = src.replace(/text-white(?!\s*\/)/g, 'text-foreground');
  src = src.replace(/text-cyan-400(?!\s*\/)/g, 'text-primary');
  src = src.replace(/text-cyan-300(?!\s*\/)/g, 'text-primary');

  // Replace old input styles
  src = src.replace(
    /bg-white\/10 border-white\/20 text-white placeholder-blue-200 focus:border-cyan-400/g,
    'bg-card border-border text-foreground placeholder:text-muted-foreground focus:border-ring'
  );

  // Replace old select styles
  src = src.replace(
    /bg-slate-800 border-white\/20 text-white focus:outline-none focus:border-cyan-400/g,
    'bg-background border-border text-foreground focus:outline-none focus:border-ring'
  );

  // Replace animated orbs (remove them)
  src = src.replace(
    /\s*\{\/\* (Background Effects|Background with gradient|Animated background orbs) \*\/\}[\s\S]*?<\/div>\s*\{\/\* (Header|Main) \*\/\}/g,
    '\n        {/* Header */'
  );

  writeFileSync(path, src, 'utf8');
  console.log(`✓ ${rel}`);
}

console.log('\nDone!');
