# OpenDesk — do portal interno ao produto implantável

Documento-mestre do esforço de transformar o portal (ex-NEROS/Neosul) em um **produto
genérico e implantável**, com as integrações rodando localmente e orquestradas por
`docker-compose` ("produto na caixa"). Complementa o `CLAUDE.md` (que descreve o portal em si).

## Decisões (registradas com o dono do projeto)

- **Marca:** OpenDesk (`VITE_APP_ID=opendesk-portal`). Rebrand visível já aplicado (Fase 1).
- **Integrações:** subir de verdade localmente (não mockar).
- **Query-API:** construir uma **genérica nova** (não expor a da empresa), mesmo contrato do
  cliente atual + **UI para cadastrar/testar queries nomeadas**.
- **Runtime:** `docker-compose` (portal + bancos + query-api + erp-demo + wa-gateway + collector).
- **WhatsApp:** gateway real (`whatsapp-web.js`), pareando um número dedicado.
- **Infarma → ERP:** genericizar tudo, **incluindo o enum** de status de chamado
  (`Pendente Infarma` → `Pendente ERP`) com ajuste de schema + re-seed.
- **Repositório:** repo pessoal novo, **histórico zerado**, push só no final (após sanitização).
  O `origin` da empresa foi renomeado para `empresa` (sem push acidental).

## Arquitetura-alvo (docker-compose)

| Serviço | Papel | Estado |
|---|---|---|
| `portal` | app React/tRPC (este repo) | ✅ roda local |
| `db-portal` | MySQL do portal (`opendesk`) | ✅ roda local |
| `query-api` | API de **queries nomeadas** + UI de autoria/teste (substitui a "API Neosul") | ✅ pronta (`services/query-api`, porta 4000) |
| `demo-erp-db` | MySQL "ERP de cliente" sintético (vendas/estoque/pedidos) → painéis com dados | ✅ seed em `services/demo-erp` (banco `demo_erp`) |
| `wa-gateway` | gateway WhatsApp genérico (`connector/monitor-wa-gateway`) | ✅ roda local (pareado, envio testado pelo portal) |
| `collector` | coletor FTP/pasta parametrizável por cliente (`connector/monitor-arquivos`) | ✅ genericizado + roda local (heartbeat ok; caminhos vêm do portal) |

## Contrato da query-api (o portal já fala isso — `server/neosulApi.ts`)

- `POST /api/auth/login`  `{ usuario, senha }` → `{ token, expiraEm }`
- `POST /api/consulta/executar`  `{ chave, parametros }` (Bearer) → `{ dados: [ {...}, ... ] }`
- Retry automático do cliente em `401` (renova token).

### Queries nomeadas consumidas (chave → parâmetros → colunas esperadas)

Ver `server/neosulQueries.ts` para o parse exato. Resumo:

| chave | parâmetros | colunas principais retornadas |
|---|---|---|
| `venda_por_dia` | `cod_estabe`, `lista_produtos` (CSV) | `cod_estabe, cod_produto, descricao_produto, data, qtd_venda, quantidade_saida, quantidade_entrada` |
| `dia_estoque_sc` / `dia_estoque_rs` | — | `Código, Fornecedor, Fabricante, Nome Produto, Categoria, Dias de Estoque (Unidades), Qtd em Estoque, Qtd Venda Média Mês, Custo Medio Liquido, Valor Estoque Custo, Data Última Compra, Lote, Validade Lote, Estoque Lote, Data Ultima Transferencia, Qtd Venda Mes Atual/Anterior/2 Meses Anterior, Qtd Projetado Mes Atual, Preço Politica` |
| `qtd_pedido_layout` | — | `Layout, estado, Qt_Ped, Vl_pedido, DT_HORA` |
| `qtd_pedido_cortado_layout` | — | `Layout, Estado, Qt_Ped, VALOR, DT_HORA` |
| `qtd_pedido_dia` | — | `Layout, Estado, Qt_Ped` |
| `grupo_clientes_cnpj` | — | `Cgc_Cpf, Cod_GrpCli, Des_GrpCli` |
| `pescador_3` (codigoQuery 15) | `empresa, idPolCom, regiaoTributaria, varFrete, varPerdasVencidos, varContratos, varInvestEmp, varAssociativismo` | superset de Triagem/MC (ver tipo `PescadorTriagemRow`) |

> Números podem vir em formato BR ("1.234,56"); datas em ISO ou DD/MM/YYYY. O portal já normaliza.
> A 1ª coluna pode vir com BOM UTF-8 — o portal remove (`stripBomKeys`).

## Fases

- **Fase 0 — rodar local** ✅ (docker MySQL + `drizzle-kit push` + seed admin; `pnpm dev`).
- **Fase 1 — rebrand visível** ✅ (NEROS/Neosul → OpenDesk; `tsc` verde).
- **Fase 2 — integrações como produto** 🔨
  - 2a. Genericizar nomes de código/env (neosul→genérico) e **Infarma→ERP incl. enum + re-seed**.
    ✅ FEITO — `erpApi.ts`/`erpQueries.ts`, `ERP_API_*`, marca `Neosul→OpenDesk`, enum de status
    `Pendente ERP` (schema + ALTER no banco). `tsc` verde; testes afetados verdes.
    ⚠️ `vitest run server/` só fica 100% verde com `DATABASE_URL` no ambiente (o vitest não lê o `.env`).
  - 2b. **query-api** + **demo-erp-db** (painéis com dados). ✅ FEITO — Indicadores, Rupturas,
    Superestocados, Validades, Associativismo e Pescador populam do `demo_erp` via query-api.
    Syncs disparados por `POST /api/scheduled/<job>` (Bearer `CRON_SHARED_TOKEN`).
  - 2c. **wa-gateway** local (parear número real). ✅ FEITO — gateway genericizado
    (`connector/monitor-wa-gateway`, token `MONITOR_AGENTE_TOKEN`), conta `monitor` semeada,
    pareado por QR no portal, envio `[TESTE]` validado via **Indicadores → Alerta CFV → Testar**.
  - 2d. **collector** genérico (apontar para a base de qualquer cliente). ✅ FEITO — genericizado
    (`connector/monitor-arquivos`, `.env` com `PORTAL_URL`/`MONITOR_AGENTE_TOKEN`), roda local e faz
    heartbeat; os caminhos a varrer vêm do portal (config da integração). Demo de pasta: configurar
    uma integração no portal apontando p/ `C:/Users/gabri/opendesk-demo/pedidos` e soltar `.ped`.
- **Fase 3 — empacotamento** `docker-compose` unificado + README de produto + repo novo + push.

## Credenciais/portas de dev (local)

| Serviço | Porta | Credencial |
|---|---|---|
| portal | 3000 | `admin@opendesk.local` / `admin123` |
| db-portal (MySQL) | 3306 | `root` / `dev` · banco `opendesk` |
| query-api | 4000 | UI admin `admin`/`admin`; portal usa `portal`/`portal-dev` |
| demo-erp | 3306 | banco `demo_erp` no mesmo MySQL (`root`/`dev`) |
| wa-gateway | — | `PORTAL_URL=localhost:3000`, `MONITOR_AGENTE_TOKEN=dev-wa-token`; conta `monitor` |

## Runbook — operação & desenvolvimento

### Subir / parar / resetar
- **Tudo (Docker):** `docker compose up -d` · parar: `docker compose down` · **zerar dados +
  re-bootstrap:** `docker compose down -v && docker compose up -d`.
- **Só o banco (para dev com hot reload):** `docker compose up -d db` e então `pnpm dev`.
- **Bootstrap** (o que roda sozinho no 1º `up`, quando o volume está vazio):
  `scripts/bootstrap/schema.sql` (108 tabelas) → `scripts/bootstrap/seed.sql` (admin + departamentos
  + singletons de config) → `services/demo-erp/seed.sql` (ERP sintético) →
  `services/demo-erp/queries-seed.sql` (queries nomeadas). Para rodar à mão num MySQL já de pé, aplique
  os 4 na ordem (o `seed.sql` assume banco `opendesk`; os de demo criam/usam `demo_erp`).

### Serviços (rodar à mão, fora do Docker)
```bash
pnpm dev                                   # portal (porta 3000, HMR)
cd services/query-api && npm run dev       # query-api + UI (porta 4000)
cd connector/monitor-wa-gateway && npm start   # gateway WhatsApp (agente)
cd connector/monitor-arquivos && npm start     # coletor de arquivos (agente)
```

### Popular os painéis de sync (Rupturas/Superestocados/Validades/Pescador)
Os painéis pass-through (Indicadores, Associativismo) já vêm populados. Os de **sync** ingerem do ERP
sob demanda — dispare (Bearer `CRON_SHARED_TOKEN`, default dev `dev-cron-token`):
```bash
for j in rupturas-sync superestocados-produtos-sync superestocados-vendas-sync validades-curtas-sync pescador-sync; do
  curl -s -X POST "http://localhost:3000/api/scheduled/$j" -H "Authorization: Bearer dev-cron-token" -H "Content-Type: application/json"; echo; done
```
No Docker, o serviço `sync-init` já faz isso uma vez no 1º `up`.

### Parear o WhatsApp
1. Suba o gateway (`connector/monitor-wa-gateway`). 2. Portal → **Indicadores → Monitor de Integrações
→ WhatsApp** → escaneie o **QR** com um número dedicado. 3. Envie um teste em **Indicadores → Pedidos
por Layout → Configurar alerta CFV** (adicione um contato E.164 no ContatoPicker → **Testar alerta**).

### Monitorar uma pasta (coletor)
1. Suba o coletor (`connector/monitor-arquivos`). 2. Portal → **Monitor de Integrações → Configurar**
→ nova integração com **Caminho** (ex.: uma pasta local), **extensão pendente** `.ped`, **lida** `._RM`.
3. Solte um `arquivo.ped` na pasta → aparece "caiu"; renomeie p/ `._RM` → "lido"; passe do SLA → 🔴 +
alerta no WhatsApp.

### Cadastrar/testar queries nomeadas
Query-API UI em `http://localhost:4000` (`admin`/`admin`): crie uma `chave`, escreva o SQL com
`:parametro` (bind seguro; CSV vira `IN (...)`), **Testar**, **Salvar**. As queries de demo estão em
`services/demo-erp/queries.json` (+ `register-*.mjs` para recarregar).

### Editar o projeto
- Convenções, estrutura e gotchas: **[../CLAUDE.md](../CLAUDE.md)**.
- Qualidade antes de commitar: `pnpm check` (tsc) e `pnpm test` (vitest; testes de DB exigem
  `DATABASE_URL` no ambiente).
- Schema: alterações via SQL idempotente (`scripts/bootstrap/schema.sql` é um dump do schema vigente);
  **não** usar `drizzle-kit generate/migrate` (dessincronizado — ver CLAUDE.md).
