# OpenDesk — guia para agentes/desenvolvedores

Portal corporativo multi-módulo (Suporte, Desenvolvimento, Almoxarifado, Gestão de Negócios,
Indicadores, Administração). Antes de mexer, leia também **[README.md](README.md)** (visão geral +
como subir) e **[docs/produto-opendesk.md](docs/produto-opendesk.md)** (arquitetura, contrato da
query-api e runbook de operação/desenvolvimento).

## Stack

Vite + React 19 · tRPC v11 · Drizzle ORM + MySQL 8 · Tailwind v4 (config via CSS, sem
`tailwind.config`) + shadcn/ui · Lucide · Wouter. **Gerenciador: pnpm** (`pnpm add/remove/install` —
nunca `npm`/`yarn` no portal; desincroniza o lockfile). i18n **pt-BR** (datas DD/MM/YYYY, BRL via
`Intl`, fuso `America/Sao_Paulo` tratado na apresentação).

## Estrutura

```
client/      React (páginas em src/pages, componentes reutilizáveis em src/components)
server/      Express + tRPC (routers/, db.ts, erpApi.ts/erpQueries.ts, scheduled*.ts)
shared/      código compartilhado client/server (permissions.ts, regras puras, tipos)
drizzle/     schema.ts (fonte do schema)
services/    query-api (API de queries nomeadas) + demo-erp (seed do ERP sintético)
connector/   agentes de borda (coletor de arquivos, gateway WhatsApp)
scripts/     bootstrap (schema.sql + seed.sql) e utilitários
```

## Princípios

1. **Reuso primeiro (DRY).** Algo usado por 2+ módulos vira camada compartilhada. Ex. da integração em
   3 camadas: `server/erpApi.ts` (transporte: login/token/`executarQuery`) → `server/erpQueries.ts`
   (uma função por query nomeada, normalizando linhas) → módulo (mapeia p/ o domínio + persiste).
   Nunca copie a chamada+parse de uma query em vários módulos.
2. **Nomes de tabela** com prefixo do submódulo (`suporte_*`, `projetos_*`, `superestocados_*`,
   `monarq_*`, …). Índices e `UNIQUE` coerentes.
3. **UI segue o que já existe** — shadcn/ui + Lucide, Skeleton no loading, cores contextuais,
   pt-BR/BRL, **mobile-first**. Componentes reutilizáveis: `PanelHeader`, `KpiGrid`/`KpiCard`,
   `SegmentedTabs`, `DataTablePagination`, `MultiSelectFilter`, `ConfirmDialog` (nunca `window.confirm`).
   Precisou de um componente que não existe? Crie um reutilizável em `client/src/components/`.
4. **Performance** — paginação/limites, índices, evite N+1, cache no React Query (`staleTime`).
5. **Projeto limpo** — sem import/arquivo órfão; remova scripts one-off quando a feature definitiva entrar.

## Checklist de permissão (todo módulo/submódulo novo)

1. Chave em `MODULES` (`shared/permissions.ts`).
2. Nó na **`PERMISSION_TREE`** (fonte única: gera a UI de atribuição e a visibilidade dos hubs), com
   label "Pai — Filho". Hubs são nós sem `module`.
3. Rótulo em `server/permissionMiddleware.ts` (`getModuleLabel`).
4. Rota em `App.tsx` com `<PermissionGuard module={MODULES.X}>`.
5. Entrada no hub (`ModuleHub`/`SubmoduleConfig` com `permissionKey`).
6. Encapsulamento: card aparece se houver QUALQUER filho (`anyOf` / `hasAnyChildPermission`).
7. Router tRPC com `requirePermission(MODULES.X, ACTIONS.Y)`.

> Modelo hierárquico: granted por folha (submódulo), UI agrupa por hub, o "pai" marca/desmarca filhos.
> Admin (`role === 'admin'`) faz bypass de todas as checagens.

## Gotchas críticos

- **`drizzle-kit generate/migrate` está dessincronizado** — não use `db:push`/`drizzle-kit generate`.
  Mudança de schema: SQL puro idempotente. O `scripts/bootstrap/schema.sql` é um **dump do schema
  vigente** (fonte determinística para bootstrap).
- **Cookies em HTTP local:** `server/_core/cookies.ts` usa `SameSite=Lax` em HTTP e `None; Secure` em
  HTTPS. Intencional — não unifique.
- **`dotenv@17` corta valores em `#`** — valores de `.env` com `#` precisam de aspas duplas.
- **Fuso:** a conexão fixa `timezone=Z` (UTC). Exiba em horário local com `Intl`/`timeZone`. Timestamps
  que voltam como string "naive" (ex.: projeções `sql<string>` de MIN/MAX) devem ser tratados como UTC
  antes de `new Date(...)` — ver `parseUtc` em `server/monitorArquivosControlPlane.ts`.
- **Arquivos `.sql` lidos por conectores podem ter BOM** — salve sem BOM.

## Antes de fechar

- `pnpm check` (tsc) e `pnpm test` (vitest — testes de DB exigem `DATABASE_URL` no ambiente) verdes.
- Commits descritivos em português. Não invente fórmulas/regras — confirme quando houver ambiguidade.
