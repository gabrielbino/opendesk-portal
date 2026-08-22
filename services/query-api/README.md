# OpenDesk — Query API

Serviço genérico de **queries nomeadas**: o portal chama `chave` + `parametros` e recebe
`{ dados: [...] }`, sem conhecer o SQL. Um admin cadastra/testa as queries por uma UI web.

Substitui a antiga "API Erp" com o **mesmo contrato** (ver `server/erpApi.ts` no portal).

## Endpoints

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/api/auth/login` | — | `{usuario,senha}` → `{token, expiraEm}` |
| POST | `/api/consulta/executar` | Bearer | `{chave, parametros}` → `{dados:[...]}` |
| GET | `/admin/queries` | Bearer admin | lista as queries cadastradas |
| PUT | `/admin/queries/:chave` | Bearer admin | cria/atualiza (`{descricao, sql_text}`) |
| DELETE | `/admin/queries/:chave` | Bearer admin | remove |
| POST | `/admin/test` | Bearer admin | testa SQL cru + parâmetros (não salva) |
| GET | `/health` | — | ping do banco-alvo |
| GET | `/` | — | UI de autoria/teste |

## Como as queries são parametrizadas

No SQL, use `:nome` para valores do chamador — **sempre bindados** (nunca concatenados):

```sql
SELECT * FROM vendas WHERE cod_estabe = :cod_estabe AND cod_produto IN (:lista_produtos)
```

Um parâmetro string com vírgulas ("1,2,3") vira **array** automaticamente, então
`IN (:lista_produtos)` expande corretamente.

## Rodar local (sem docker)

```bash
cd services/query-api
cp .env.example .env   # ajuste TARGET_DB_URL
npm install
npm run dev
```

Abra `http://localhost:4000` para a UI. Login admin padrão: `admin` / `admin`.

## Ligar o portal a este serviço

No `.env` do portal:

```
ERP_API_URL=http://localhost:4000
ERP_API_USER=portal
ERP_API_SENHA=portal-dev
```
