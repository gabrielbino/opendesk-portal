# Pescador — Seed reversível

Esta pasta existe apenas enquanto o módulo Pescador é alimentado por um snapshot
estático (vindo do protótipo original). Quando a integração com a API real for
implementada, **a pasta inteira pode ser deletada** sem deixar resíduo:

- O schema das tabelas (`drizzle/schema.ts`) permanece — vai ser populado pela API.
- O router tRPC (`server/routers/pescador.ts`) permanece — apenas a fonte dos dados muda.
- A página `client/src/pages/Pescador.tsx` permanece igual.

## Como usar

```bash
# A partir da raiz do projeto helpdesk-system:
node server/scripts/pescador-seed/seed.mjs
```

O script:

1. Lê `data.js` (snapshot do protótipo de 2026-05-29).
2. Conecta ao MySQL usando as mesmas variáveis de ambiente do app (`DATABASE_URL`).
3. Limpa as tabelas Pescador (`TRUNCATE`).
4. Insere todos os registros válidos.
5. **Filtra o histórico** para os últimos 15 dias contados a partir da data mais
   recente presente no snapshot (regra atual; pode ser ajustada quando a API chegar).
6. Registra metadados em `pescador_meta` com `fonte = 'seed'`.

## O que está no snapshot

| Consulta | Tabela destino | Registros |
|---|---|---|
| `triagem` | `pescador_triagem` | ~4.067 |
| `pedidos` | `pescador_pedidos` + `pescador_pedidos_itens` | ~18.348 itens (agrupados) |
| `historico` | `pescador_historico` | ~1.491 (filtrado p/ 15 dias depois) |

## Como remover esta pasta no futuro

Quando a API real estiver implementada (substituindo essa fonte):

```bash
rm -rf server/scripts/pescador-seed/
```

Nenhum outro arquivo do projeto faz referência a este diretório.
