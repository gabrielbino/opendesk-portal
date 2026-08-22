/**
 * Tokens de estilo PADRÃO das tabelas de dados dos painéis de estoque
 * (Superestocados, Validades Curtas, Rupturas, futuros). Fonte ÚNICA do "shell"
 * da tabela — arredondado nas pontas, borda, header escuro, cabeçalho ordenável
 * (ver `SortableHeader`). Cada painel adiciona só o que é específico (ex.: `max-h`,
 * `isolate` quando há colunas congeladas).
 *
 * Uso:
 *   <div className={cn(DATA_TABLE_SHELL, "max-h-[65vh]")}>
 *     <table className={DATA_TABLE_EL}>
 *       <thead><tr className={DATA_TABLE_HEAD_ROW}> … </tr></thead>
 *       …
 */

/** Contêiner rolável arredondado + borda (as pontas do header ficam arredondadas pelo clip). */
export const DATA_TABLE_SHELL =
  "overflow-x-auto overflow-y-auto overscroll-x-contain rounded-xl border border-slate-200";

/** Elemento `<table>` — largura natural (não `w-full`, que espreme), zebra por linha. */
export const DATA_TABLE_EL = "w-max min-w-full border-separate border-spacing-0 text-xs";

/** Linha do cabeçalho (header escuro padrão). */
export const DATA_TABLE_HEAD_ROW = "bg-slate-900 text-white";
