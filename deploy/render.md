# Deploy grátis SEM cartão — TiDB Cloud (banco) + Render (app)

URL de demo 24/7 sem cartão de crédito. Porém: o app no Render **"dorme"** após ~15 min ocioso
e acorda em ~30–60 s no 1º acesso (aqueça antes de uma entrevista). O banco (TiDB) fica sempre ligado.

```
internet ─▶ Render: opendesk-portal (HTTPS *.onrender.com)
                     │
                     ├─▶ Render: opendesk-query-api ─▶ TiDB: demo_erp
                     └────────────────────────────────▶ TiDB: opendesk
```

## Fase A — Banco (TiDB Cloud Serverless)
1. Crie conta em **tidbcloud.com** (login com GitHub/Google, **sem cartão**).
2. **Create Cluster → Serverless** (tier grátis). Escolha uma região.
3. Em **Connect**, gere/anote a **senha** e copie a **connection string** (host `…tidbcloud.com`, porta `4000`, usuário, senha). O TiDB exige TLS — nosso código já liga sozinho para hosts `tidbcloud.com`.
4. **Popular o banco** (da sua máquina, na pasta do projeto). A senha fica só no seu terminal:
   ```bash
   DATABASE_URL="mysql://USUARIO:SENHA@HOST:4000/test" node scripts/bootstrap-remote.mjs
   ```
   Isso cria `opendesk` (108 tabelas + admin) e `demo_erp` (dados + queries). Ao final imprime a contagem.

> Guarde duas URLs (trocando só o nome do banco no fim):
> `…@HOST:4000/opendesk`  e  `…@HOST:4000/demo_erp`.

## Fase B — App (Render)
1. Crie conta em **render.com** (login com GitHub, **sem cartão** para o plano free).
2. **New → Blueprint** → conecte o repositório `opendesk-portal`. O Render lê o `render.yaml` e propõe
   **2 serviços**: `opendesk-query-api` e `opendesk-portal`.
3. Preencha as variáveis marcadas (as demais o Render já traz do blueprint):

   | Serviço | Variável | Valor |
   |---|---|---|
   | query-api | `TARGET_DB_URL` | `mysql://USUARIO:SENHA@HOST:4000/demo_erp` |
   | portal | `DATABASE_URL` | `mysql://USUARIO:SENHA@HOST:4000/opendesk` |
   | portal | `ERP_API_URL` | a URL pública do `opendesk-query-api` (ex.: `https://opendesk-query-api.onrender.com`) |
   | portal | `PUBLIC_BASE_URL` | a URL pública do `opendesk-portal` (ex.: `https://opendesk-portal.onrender.com`) |

   > Dica: crie/apply primeiro, veja as URLs que o Render deu a cada serviço, e cole `ERP_API_URL`/`PUBLIC_BASE_URL`; se mudar algo, é só **Manual Deploy** de novo.
4. **Apply** → o Render builda as duas imagens Docker e sobe. Acompanhe os logs.

## Fase C — Ajustes finais
1. Abra a URL do portal → login `admin@opendesk.local` / `admin123` → **troque a senha** (Administração → Usuários).
2. **Popular os painéis de sync** (uma vez): use o `CRON_SHARED_TOKEN` que o Render gerou (veja no painel do portal) e chame:
   ```bash
   for j in rupturas-sync superestocados-produtos-sync superestocados-vendas-sync validades-curtas-sync pescador-sync; do
     curl -s -X POST "https://SEU-PORTAL.onrender.com/api/scheduled/$j" \
       -H "Authorization: Bearer O_TOKEN" -H "Content-Type: application/json"; echo; done
   ```
   (Indicadores e Associativismo já funcionam sem isso.)

## Solução de problemas
| Sintoma | Causa provável |
|---|---|
| query-api "failed" no boot | `TARGET_DB_URL` errada ou sem TLS — confira host/senha; o TiDB liga TLS sozinho pelo host `tidbcloud.com`. |
| Painéis vazios | Faltou rodar o bootstrap (Fase A.4) ou os syncs (Fase C.2). |
| Portal lento no 1º acesso | Cold start do Render (normal no free) — aguarde ~1 min. |
| Erro de SQL no bootstrap | Alguma incompatibilidade TiDB — me mostre a mensagem que eu ajusto. |
