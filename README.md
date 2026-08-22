# OpenDesk — Portal Corporativo

Portal corporativo **multi-módulo** full-stack: central de **chamados/helpdesk**, **gestão de
projetos**, **inventário de TI**, **painéis de gestão de negócios** (estoque, rupturas, indicadores)
e um **monitor de integrações** com alertas por WhatsApp. Construído como um produto **implantável**:
sobe inteiro com `docker compose up`, com dados de demonstração já populados.

> Projeto de portfólio. Toda a marca, empresas, CNPJs, servidores e credenciais são **fictícios**.

## ✨ Destaques técnicos

- **Monólito modular** com fronteira de permissões hierárquica (árvore única → UI de atribuição +
  visibilidade dos hubs derivadas da mesma fonte).
- **Camada de integração desacoplada**: os painéis consomem uma **API de queries nomeadas** genérica
  (`chave` + `parâmetros` → `dados`), sem acoplar SQL ao portal.
- **Arquitetura "cérebro + agentes de borda"**: o portal centraliza a regra; agentes "burros"
  (coletor de arquivos, gateway WhatsApp) rodam na borda e reportam por HTTP.
- **Tempo real "bate o olho"**: KPIs, rankings, sparklines, donuts, modo TV e alertas (em tela + som +
  aba + WhatsApp).
- **i18n pt-BR** ponta a ponta (datas, moeda BRL, fuso America/São_Paulo tratado na apresentação).

## 🧱 Stack

| Camada | Tecnologias |
|---|---|
| Front | React 19, Vite 7, Tailwind v4, shadcn/ui, Wouter, TanStack Query |
| API | tRPC v11, Express, Zod |
| Dados | MySQL 8, Drizzle ORM |
| Auth | Sessão via cookie (JWT `jose`) + permissões CRUD granulares |
| Integrações | Serviço próprio de queries nomeadas · gateway WhatsApp (whatsapp-web.js) · coletor de arquivos |
| Infra | Docker Compose · pnpm |

## 🏗️ Arquitetura

```
                       ┌─────────────────────────────┐
   navegador  ◀──────▶ │  portal (React + tRPC/Express)
                       └──────┬───────────────┬───────┘
                              │               │  queries nomeadas (HTTP)
                     MySQL ◀──┘               ▼
                 (opendesk)          ┌──────────────────┐
                                     │   query-api      │──▶ MySQL (demo_erp)
                                     │ (UI de autoria)  │
                                     └──────────────────┘
   agentes de borda (processos), apontando para o portal:
     • connector/monitor-arquivos     — coletor FTP/pasta (estado .ped→._RM, SLA)
     • connector/monitor-wa-gateway   — gateway WhatsApp (pareia por QR, drena a fila)
```

- **`portal`** — a aplicação (este repositório).
- **`query-api`** (`services/query-api`) — API genérica de queries nomeadas + UI web para
  cadastrar/testar queries. Substitui o acoplamento a um ERP específico.
- **`demo-erp`** (`services/demo-erp`) — banco "ERP de cliente" sintético que alimenta os painéis.
- **agentes** (`connector/*`) — coletor de arquivos e gateway WhatsApp.

## 🚀 Subir com Docker (recomendado)

```bash
docker compose up -d
```

Sobe `db` (MySQL, com **bootstrap automático**: schema + admin + dados de demo), `query-api` e
`portal`, e dispara os *syncs* uma vez para os painéis já subirem populados.

- Portal: **http://localhost:3000** — `admin@opendesk.local` / `admin123`
- Query-API (UI de autoria): **http://localhost:4000** — `admin` / `admin`

> Zerar tudo e re-bootstrapar: `docker compose down -v && docker compose up -d`.

### Agentes de borda (opcional)

Rodam como processos apontando para o portal (é assim que rodariam no cliente):

```bash
# Gateway WhatsApp — pareie o QR pelo portal (Indicadores → Monitor de Integrações → WhatsApp)
cd connector/monitor-wa-gateway && npm install && npm start

# Coletor de arquivos — configure o caminho no portal (Monitor de Integrações → Configurar)
cd connector/monitor-arquivos && npm install && npm start
```

## 💻 Desenvolvimento local (hot reload)

```bash
docker compose up -d db        # só o banco
pnpm install
pnpm dev                       # http://localhost:3000 (HMR)
cd services/query-api && npm run dev   # em outro terminal (porta 4000)
```

Detalhes em [docs/produto-opendesk.md](docs/produto-opendesk.md) (arquitetura, contrato da query-api,
credenciais e fases do projeto).

## 🧩 Módulos

- **Suporte** — chamados com SLA, kanban, avaliações, chat.
- **Desenvolvimento** — projetos, fases, tarefas diárias, gantt.
- **Almoxarifado** — inventário de TI + **mapa interativo** (React Flow).
- **Gestão de Negócios** — Comercial, Controle de Estoque (Superestocados · Rupturas · Validades),
  Associativismo, Pescador (triagem/margem).
- **Indicadores** — Pedidos por rede, **Monitor de Integrações** (arquivos + WhatsApp).
- **Administração** — usuários, permissões CRUD, departamentos, comunicados, backup.

## ✅ Qualidade

```bash
pnpm check      # tsc --noEmit
DATABASE_URL=mysql://root:dev@127.0.0.1:3306/opendesk pnpm test   # vitest (testes de DB precisam do banco)
```

## 📄 Licença

MIT.
