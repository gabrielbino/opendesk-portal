# Operação do Bot "Envio de Parcial" — VM Ubuntu (systemd)

Guia **completo** de como o bot roda na VM Linux e tudo que você precisa para
operar, acompanhar e resolver problemas. A partir de 2026-07-03 o bot **roda na
VM Ubuntu `srvappapi`** (não mais no servidor Windows).

- Arquitetura/decisões do submódulo: [../docs/envio-parcial-handoff.md](../docs/envio-parcial-handoff.md)
- Operação no Windows (modo **legado**, se um dia voltar): [OPERACAO.md](OPERACAO.md)

> **Regra de ouro:** o bot é um **processo separado** que roda na VM. O portal (no
> Manus) **não** atualiza nem reinicia o código do bot — quem mexe no código precisa
> **copiar os arquivos para a VM e reiniciar o serviço**. A VM **não tem git** — o
> deploy é **cópia manual** (scp/WinSCP).

---

## 0. Visão geral — como funciona

```
VM UBUNTU (srvappapi) — rede interna                 MANUS (cloud) — portal OpenDesk
┌─────────────────────────────────────────┐          ┌────────────────────────────┐
│ Serviço systemd: parcial-bot            │          │ Submódulo React (portal)   │
│  • Node 20 + whatsapp-web.js            │  HTTPS    │ tRPC parcial.* + MySQL/TiDB│
│  • Chromium headless (Puppeteer)        │ ◄──────► │ control plane              │
│  • Python3 + Pillow (gera a imagem)     │ (Bearer   │ endpoints /api/parcial/*   │
│  • consulta SQL Server 10.0.0.10     │  token)   │                            │
└─────────────────────────────────────────┘          └────────────────────────────┘
        │ TCP 1433
        ▼
  SQL Server (DMD) — 10.0.0.10
```

- O bot faz **heartbeat** (~3s) para o portal: reporta status e recebe config/comandos
  (pausar, enviar agora, reiniciar, desconectar, etc.).
- A cada envio: consulta o SQL Server → gera a imagem (Python) → manda no WhatsApp para
  os grupos/contatos configurados → publica preview/log no portal.
- O **QR Code** aparece no portal (o Chromium da VM gera; o portal só exibe).

**Fatos-chave da instalação atual:**
- Serviço systemd: **`parcial-bot`** (`Restart=always`, habilitado no boot).
- Pasta do bot: **`/home/opendesk/bot-envio-parcial`**.
- Banco: **`10.0.0.10:1433`** (DB `DMD`) — a VM alcança pela rede interna.
- Portal: valor de `HELPDESK_URL` no `.env` (ex.: `https://helpdesk-sys-...manus.space`).

---

## 1. Fuso horário (IMPORTANTE)

A VM **precisa estar em `America/Sao_Paulo`**. A imagem enviada carimba a hora com o
relógio do sistema (`datetime.now()`); em UTC ela sai **+3h errada**. Ajuste uma vez:

```bash
sudo timedatectl set-timezone America/Sao_Paulo
sudo systemctl restart parcial-bot
timedatectl     # confirmar: Time zone: America/Sao_Paulo (-03)
```

> Os **logs do journald** também passam a mostrar horário de Brasília depois disso.
> (O agendamento dos envios já é fixado em `America/Sao_Paulo` no código, então os
> horários de disparo estavam certos mesmo em UTC — o problema era só o carimbo/logs.)

---

## 2. Iniciar / Parar / Reiniciar / Status

O bot roda como serviço — **independente do seu acesso SSH**. Fechar o PuTTY, deslogar
ou reiniciar a VM **não** derruba o bot (ele sobe sozinho no boot).

```bash
sudo systemctl status  parcial-bot     # status (running?)
sudo systemctl restart parcial-bot     # reiniciar
sudo systemctl stop    parcial-bot     # parar
sudo systemctl start   parcial-bot     # iniciar
sudo systemctl disable parcial-bot     # NÃO subir no boot (não para agora)
sudo systemctl enable  parcial-bot     # voltar a subir no boot
```

---

## 3. Ver logs

Os logs vão para o **journald** (o systemd cuida da rotação — não há arquivo crescendo
sem controle).

```bash
journalctl -u parcial-bot -f                 # AO VIVO (Ctrl+C sai; NÃO derruba o bot)
journalctl -u parcial-bot -n 100 --no-pager  # últimas 100 linhas (sem ficar preso)
journalctl -u parcial-bot --since "today"    # de hoje
journalctl -u parcial-bot --since "1 hour ago"
journalctl -u parcial-bot -p warning         # só warnings/erros
```

> ⚠️ O `journalctl -f` é só um **visualizador**. Ele fica na tela porque você pediu para
> "seguir" (`-f`). **Ctrl+C** para de acompanhar — o bot continua rodando. Ao acessar de
> novo, ele **não** abre sozinho; você roda o comando quando quiser olhar.

### Como é um log SAUDÁVEL (ciclo de envio normal)
```
[INFO] Iniciando ciclo de envio para: Rio Grande do Sul
[OK]   12 linhas retornadas do banco (Rio Grande do Sul)
[OK]   Imagem gerada com sucesso (Rio Grande do Sul)
[OK]   Enviado para <grupo/contato> (Rio Grande do Sul)
```
`[OK] WhatsApp autenticado` + `Cliente pronto!` = conectado. Heartbeats silenciosos = normal.

---

## 4. Atualizar o código do bot (deploy) ⭐

> A VM **não tem git**. Deploy = **cópia manual** dos arquivos alterados.

1. **Copie** os arquivos alterados para `/home/opendesk/bot-envio-parcial` (WinSCP ou
   `scp`/`pscp` do seu PC). Os que mais mudam: `index.js`, `gerar_imagem.py`, `queries/`,
   `scripts/`. **Não** leve `node_modules`, `.wwebjs_auth`, `.painel-tmp`, `__pycache__`.
2. **Só se `package.json` mudou**, reinstale dependências (como o usuário do serviço):
   ```bash
   cd ~/bot-envio-parcial && npm install
   ```
3. **Reinicie**:
   ```bash
   sudo systemctl restart parcial-bot
   ```
4. Confirme nos logs (`journalctl -u parcial-bot -f`) que subiu e o heartbeat voltou
   (portal mostra online). Não precisa reescanear o QR — a sessão em `.wwebjs_auth/` é
   preservada.

---

## 5. WhatsApp: conectar / reconectar / desconectar

Feito **pelo portal** (Comercial → Envio de Parcial), sem tocar na VM (o bot precisa
estar online):

| Ação no portal | O que faz |
|---|---|
| **Conectar WhatsApp** | Abre o QR (gerado pelo Chromium da VM). Escaneie no celular. |
| **Reconectar WhatsApp** (⋮) | Reconecta só o WhatsApp, mesmo processo (~10s). Não recarrega código. |
| **Reiniciar processo** (⋮) | `process.exit` → o **systemd sobe de novo** (`Restart=always`, ~5s), recarregando o código. |
| **Desconectar WhatsApp** (⋮) | `logout()` (despareia a conta) → apaga a sessão → **novo QR**. |
| **Pausar / Retomar** | Liga/desliga os envios sem derrubar a conexão. |
| **Enviar agora** | Dispara um envio imediato daquela região. |

**Limpar a sessão manualmente** (forçar novo QR sem o portal):
```bash
sudo systemctl stop parcial-bot
rm -rf ~/bot-envio-parcial/.wwebjs_auth
sudo systemctl start parcial-bot     # novo QR aparece no portal
```

> ⚠️ **Um bot por número**: nunca deixe o bot do Windows E o da VM pareados no mesmo
> WhatsApp ao mesmo tempo — dá **envio duplicado**. O bot do Windows deve ficar
> desabilitado (`Disable-ScheduledTask`).

---

## 6. Configuração (`.env`)

Arquivo `/home/opendesk/bot-envio-parcial/.env`. Após editar, `sudo systemctl restart parcial-bot`.

```bash
HELPDESK_URL=https://<portal>.manus.space   # URL do portal (Manus)
PARCIAL_BOT_TOKEN=<token>                    # IGUAL ao PARCIAL_BOT_TOKEN do Manus
HEARTBEAT_MS=3000

DB_SERVER=10.0.0.10     # IP do SQL Server (NÃO usar nome NetBIOS nem \INSTANCIA no Linux)
DB_PORT=1433
DB_DATABASE=DMD
DB_USER=ti
DB_PASSWORD="senha"        # entre aspas se tiver '#' (dotenv corta no #)

# Opcionais:
# CHROME_PATH=/usr/bin/chromium     # só se NÃO quiser o Chromium do Puppeteer
# PYTHON_BIN=python3                 # padrão já é python3 no Linux
# PROTOCOL_TIMEOUT_MS / WA_WEB_VERSION  # ver troubleshooting
```

---

## 7. Troubleshooting

| Sintoma | Causa provável / o que fazer |
|---|---|
| Portal mostra o bot **offline** | Serviço caiu (`systemctl status parcial-bot`; ver logs). `HELPDESK_URL`/`PARCIAL_BOT_TOKEN` errados. VM sem internet até o Manus. |
| `[heartbeat]/[qr] fetch failed` | A VM não alcança o portal. Teste `curl -sS -o /dev/null -w "%{http_code}\n" $HELPDESK_URL`. Se travar → liberar **saída HTTPS (443)** da VM para o domínio do portal. |
| `Runtime.callFunctionOn timed out` **no arranque** | Normal logo após parear (WhatsApp Web sincronizando). O bot tem retry e estabiliza. |
| Mesmo erro em **regime normal** | VM sem CPU/RAM (`free -h`, `nproc`, `top`). Chromium + WA Web quer ~1 GB+. Aumentar recursos da VM. Paliativo: subir `protocolTimeout` no `index.js`. |
| **Hora errada na imagem / nos logs** | VM fora do fuso. `sudo timedatectl set-timezone America/Sao_Paulo` + restart (ver §1). |
| Status **erro_banco** / `12 linhas` não aparece | Sem acesso ao SQL Server. Teste `nc -zv 10.0.0.10 1433`. Ver `DB_*` no `.env` (senha com `#` entre aspas). |
| Chromium não sobe (erro do Puppeteer ao lançar) | Falta lib do sistema. Reinstale as deps (§9). Ou aponte `CHROME_PATH` para um chromium do sistema. |
| Imagem **sem acento/fonte errada** | Falta `fonts-liberation` (`sudo apt install -y fonts-liberation`). |
| Envio **duplicado** | Dois bots no mesmo número (Windows + VM). Desabilite o do Windows. |
| Quebrou após um `npm install` | Faixa aberta puxou versão nova da `whatsapp-web.js`. Fixe a versão que funciona (ver §8). |

**Depurar ao vivo com saída completa** (fora do systemd):
```bash
sudo systemctl stop parcial-bot
cd ~/bot-envio-parcial && node index.js     # Ctrl+C para sair
sudo systemctl start parcial-bot            # voltar ao modo serviço
```

---

## 8. Manutenção recomendada

- **Fixar a versão da `whatsapp-web.js`**: o `package.json` usa faixa aberta (`^1.34.7`) e
  não há lockfile versionado — um `npm install` futuro pode puxar uma versão que quebra
  com o WhatsApp Web. Fixe a versão que está funcionando e versione o `package-lock.json`.
  Ver a versão atual: `cd ~/bot-envio-parcial && npm ls whatsapp-web.js`.
- **Rodar como `opendesk` (não root)**: hoje o serviço subiu como **root** (Chromium em
  `/root/.cache/puppeteer`). Funciona (por causa do `--no-sandbox`), mas o ideal é rodar
  como `opendesk`. Para trocar: `chown -R opendesk:opendesk ~/bot-envio-parcial`,
  `sudo -u opendesk bash -lc 'cd ~/bot-envio-parcial && npm install'` (baixa o Chromium no
  cache do opendesk) e reinstalar o serviço com `SERVICE_USER=opendesk`
  (`sudo SERVICE_USER=opendesk bash scripts/install-service.sh`).
- **Destinos oficiais do RS**: hoje o envio RS aponta para grupos/contatos de **teste**
  (ex.: "LOS GRANDES - teste"). Trocar pelos oficiais no portal quando for produção.

---

## 9. Reinstalar do zero (referência)

Pré-requisitos na VM Ubuntu:
```bash
# Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
# Python/Pillow + fontes + libs do Chromium headless
sudo apt install -y python3-pil fonts-liberation \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
  libpango-1.0-0 libcairo2 libatspi2.0-0 libx11-xcb1 libxshmfence1
# (Ubuntu 24.04: se reclamar de libasound2, use libasound2t64)
```
Instalar/atualizar o serviço:
```bash
cd ~/bot-envio-parcial
npm install
cp .env.example .env && nano .env        # preencher (§6)
sudo bash scripts/install-service.sh     # registra + habilita + inicia o systemd
```

Fuso horário (§1): `sudo timedatectl set-timezone America/Sao_Paulo`.

---

## 10. Arquivos e caminhos

| O quê | Onde |
|---|---|
| Código do bot | `/home/opendesk/bot-envio-parcial/` (`index.js`, `gerar_imagem.py`, `queries/`) |
| Config | `/home/opendesk/bot-envio-parcial/.env` |
| Sessão do WhatsApp | `/home/opendesk/bot-envio-parcial/.wwebjs_auth/` |
| Temporários (auto-limpos) | `/home/opendesk/bot-envio-parcial/.painel-tmp/` |
| Unit do systemd | `/etc/systemd/system/parcial-bot.service` |
| Instalador do serviço | `scripts/install-service.sh` (+ template `scripts/parcial-bot.service`) |
| Logs | journald → `journalctl -u parcial-bot` |
