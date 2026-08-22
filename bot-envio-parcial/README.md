# Bot "Envio de Parcial" — Panorama de Pedidos Sem ST

Bot de WhatsApp que, em horários agendados, consulta o SQL Server (DMD/ERP),
gera a imagem do painel "Pedidos Sem ST" (Python/Pillow) e envia para um grupo do
WhatsApp via `whatsapp-web.js` (sem API oficial da Meta).

**Diferente da versão original**, ele não tem painel web próprio nem arquivos JSON:
é gerenciado pelo submódulo **Comercial → Envio de Parcial** do portal OpenDesk e
sincroniza por HTTPS (`/api/parcial/*`). Roda no **servidor Windows local**, junto
do conector — porque precisa de rede até o SQL Server interno (o portal é hospedado
no Manus e não alcança esse banco).

Ver também: **[OPERACAO.md](OPERACAO.md)** (como iniciar/parar/reiniciar/atualizar/depurar o
bot — runbook operacional) e `../docs/envio-parcial-handoff.md` (decisões/contrato).

## Pré-requisitos (no servidor local)

- Node.js 18+ (usa `fetch` nativo)
- Python 3.8+ com Pillow: `pip install pillow`
- Google Chrome ou Chromium (para o Puppeteer)

## Instalação

```bash
cd bot-envio-parcial
npm install
cp .env.example .env   # e preencha os valores (Windows: copy .env.example .env)
```

Preencha o `.env`:
- `HELPDESK_URL` — URL do portal (ex.: `https://painel.suaempresa.com.br`).
- `PARCIAL_BOT_TOKEN` — **o mesmo valor** configurado no ambiente do helpdesk
  (variável `PARCIAL_BOT_TOKEN`). Sem isso a ponte responde 401/503.
- `DB_*` — conexão do SQL Server (senha com `#` precisa de aspas duplas).

## Rodar

```bash
node index.js
```

Na primeira vez, o QR Code aparece **no portal** (Comercial → Envio de Parcial →
"Conectar WhatsApp") e também no terminal. Escaneie pelo celular
(Dispositivos conectados → Conectar dispositivo). A sessão fica salva em
`.wwebjs_auth/`.

## Rodar em background (PM2)

```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # execute o comando que ele imprimir
```

Comandos úteis: `pm2 logs bot-envio-parcial`, `pm2 restart bot-envio-parcial`.

> Alternativa Windows (como o conector): registrar como Tarefa Agendada / serviço
> (ex.: NSSM). O importante é manter o processo vivo e reiniciar no boot.

## Reconectar (sessão expirou / deslogou)

```bash
# apaga a sessão e força novo QR
rmdir /s /q .wwebjs_auth   # Windows
pm2 restart bot-envio-parcial
# escaneie o novo QR pelo portal
```

## Como funciona a sincronização

| Direção | Endpoint | Quando |
|---|---|---|
| bot → portal | `POST /api/parcial/heartbeat` | a cada ~3s: reporta status, recebe `grupo/cron/horário/médias/pausado` e o flag "enviar agora" |
| bot → portal | `POST /api/parcial/log` | cada evento (ok/info/warn/erro) |
| bot → portal | `POST /api/parcial/qr` | quando gera o QR (e limpa ao autenticar) |
| bot → portal | `POST /api/parcial/imagem` | após gerar a imagem (preview) |

Todas autenticadas com `Authorization: Bearer <PARCIAL_BOT_TOKEN>`.
Configurações (grupo, horário, médias) e comandos (iniciar/pausar/enviar) são
definidos no portal e aplicados pelo bot no próximo heartbeat.
