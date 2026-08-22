# Operação do Bot "Envio de Parcial" (Windows — LEGADO)

> ⚠️ **A partir de 2026-07-03 o bot roda na VM Ubuntu `srvappapi` (systemd).**
> Para operar o bot atual, use **[OPERACAO-LINUX.md](OPERACAO-LINUX.md)**.
> Este arquivo cobre o **modo Windows (Tarefa Agendada)**, mantido como referência/legado
> caso o bot volte a rodar no servidor Windows.

Guia prático de **como operar o bot** no servidor Windows local: iniciar, parar, reiniciar,
ver logs, **atualizar o código** e resolver problemas comuns.

- Instalação/arquitetura: [README.md](README.md)
- Decisões/contrato com o portal: [../docs/envio-parcial-handoff.md](../docs/envio-parcial-handoff.md)
- Fluxos gerais do projeto: [../docs/runbook-operacoes.md](../docs/runbook-operacoes.md)

> **Regra de ouro:** o bot é um **processo separado** que roda no servidor local. O portal
> (no Manus) **não** atualiza nem reinicia o bot — quem mexe no código do bot precisa
> **atualizar o arquivo no servidor e reiniciar o processo**.

---

## 0. Como o bot está rodando? (descobrir o gerenciador)

O bot é mantido vivo por **um** destes (verifique qual está em uso):

- **Tarefa Agendada do Windows** (padrão de produção — ver `scripts/install-task.ps1`):
  ```powershell
  Get-ScheduledTask -TaskName "OpenDesk Bot - Envio de Parcial" | Get-ScheduledTaskInfo
  ```
- **PM2**:
  ```bash
  pm2 list        # procure "bot-envio-parcial"
  ```
- **Terminal direto** (`node index.js` numa janela aberta) — só para teste/dev.

Use os comandos da seção correspondente abaixo.

---

## 1. Iniciar / Parar / Reiniciar / Status

### Tarefa Agendada (PowerShell como Administrador)
```powershell
Start-ScheduledTask  -TaskName "OpenDesk Bot - Envio de Parcial"   # iniciar
Stop-ScheduledTask   -TaskName "OpenDesk Bot - Envio de Parcial"   # parar
# Reiniciar = parar + iniciar:
Stop-ScheduledTask -TaskName "OpenDesk Bot - Envio de Parcial"; Start-ScheduledTask -TaskName "OpenDesk Bot - Envio de Parcial"
Get-ScheduledTask -TaskName "OpenDesk Bot - Envio de Parcial" | Get-ScheduledTaskInfo   # status
```

### PM2
```bash
pm2 start ecosystem.config.js     # iniciar (1ª vez)
pm2 restart bot-envio-parcial     # reiniciar
pm2 stop bot-envio-parcial        # parar
pm2 status                        # status
pm2 logs bot-envio-parcial        # logs ao vivo
```

### Terminal direto (dev/teste)
```bash
cd bot-envio-parcial
node index.js        # Ctrl+C para parar; rode de novo para reiniciar
```

---

## 2. Atualizar o código do bot (deploy de nova versão) ⭐

> ⚠️ **O servidor do bot NÃO tem repositório git.** Deploy = **cópia manual** dos arquivos
> alterados (não existe `git pull` aqui). O Manus publica a partir do GitHub, mas o servidor
> Windows do bot é separado e sem repo.

Sempre que o `bot-envio-parcial/` mudar (ex.: a função de **desconectar WhatsApp**), faça no
servidor:

```powershell
# 1. Copiar os arquivos alterados para a pasta do bot no servidor
#    (do seu commit/GitHub para a máquina do servidor — pen drive, rede, RDP, etc.)
#    Ex. dos arquivos que costumam mudar: index.js, scripts\, queries\, gerar_imagem.py

# 2. Instalar dependências SÓ se package.json mudou
npm install              # pule se não mudou dependência

# 3. Reiniciar o processo (seção 1, conforme o gerenciador). Ex. Tarefa Agendada:
Stop-ScheduledTask -TaskName "OpenDesk Bot - Envio de Parcial"; Start-ScheduledTask -TaskName "OpenDesk Bot - Envio de Parcial"
#    (se scripts\install-task.ps1 mudou, rode-o de novo em vez do stop/start — reinstala a tarefa)
```

> Não precisa reescanear o QR ao atualizar o código — a sessão em `.wwebjs_auth/` é preservada
> (a menos que você apague a sessão de propósito; ver seção 4).

**Como confirmar que pegou a versão nova:** acompanhe os logs (seção 5) ou teste pelo portal
um comando da nova versão (ex.: "Desconectar WhatsApp" deve logar
`Desconexao solicitada pelo portal...`).

---

## 3. Operações pelo PORTAL (sem tocar no servidor)

No portal: **Comercial → Envio de Parcial**. Estes comandos chegam ao bot no próximo
heartbeat (~3s) — o bot precisa estar **online** (indicador no card):

As ações de manutenção ficam no **menu ⋮ (kebab)** do cabeçalho:

| Ação no portal | O que faz no bot |
|---|---|
| **Conectar WhatsApp** | Abre o modal com o QR (publicado pelo bot). Escaneie no celular. |
| **Reconectar WhatsApp** (⋮) | *Soft-restart*: reconecta só o WhatsApp (mantém sessão, sem QR), **mesmo processo/código**, ~10s. Use quando o WhatsApp trava mas o bot segue online. |
| **Reiniciar processo** (⋮) | *Hard-restart*: o bot faz `process.exit` → o **wrapper `run-bot.cmd` sobe de novo** (~5s), **recarregando o código**. Use após publicar versão nova ou reset geral. **Requer a tarefa instalada pelo `install-task.ps1` atual** (que roda o wrapper em loop). Se a tarefa ainda apontar direto pro `node index.js` (versão antiga), o botão derruba e **não volta** — reinstale com `install-task.ps1`. |
| **Desconectar WhatsApp** (⋮) | Faz `logout()` (despareia a conta) → apaga a sessão → **novo QR**. Trocar de número/conta. |
| **Pausar / Retomar** | Liga/desliga os envios (não derruba a conexão). |
| **Enviar agora** | Dispara um envio imediato daquela região. |
| **Configurações** | Horários, janela do último dia útil. |

> As ações do menu ⋮ só funcionam com o bot **rodando o código atualizado** (seção 2) e
> **online**. Diferença-chave: **Reconectar WhatsApp** NÃO recarrega o código (mesmo processo);
> só o **Reiniciar processo** recarrega (via `process.exit` + Tarefa Agendada).

---

## 4. Sessão do WhatsApp (conectar / desconectar / limpar)

- **Conectar (1ª vez ou após desconectar):** o QR aparece no portal e no terminal. Celular →
  WhatsApp → Dispositivos conectados → Conectar dispositivo.
- **Desconectar pelo portal:** botão "Desconectar WhatsApp" (recomendado).
- **Limpar a sessão manualmente** (forçar novo QR sem o portal):
  ```bash
  # parar o bot primeiro (seção 1), depois:
  rmdir /s /q .wwebjs_auth      # Windows
  # rm -rf .wwebjs_auth         # Linux/Mac
  # iniciar o bot de novo → novo QR
  ```
- **Lock órfão do Chrome** ("browser is already running"): o bot remove o `SingletonLock`
  sozinho; se persistir, pare o bot, apague
  `.wwebjs_auth/session-opendesk-painel/Singleton*` e reinicie.

---

## 5. Ver logs

- **PM2:** `pm2 logs bot-envio-parcial` (ao vivo) · `pm2 logs bot-envio-parcial --lines 200`.
- **Terminal direto:** os logs saem na própria janela.
- **Tarefa Agendada:** não há console visível; para depurar, **pare a tarefa** e rode
  `node index.js` numa janela para ver a saída.
- **No portal:** aba de **Logs** do submódulo mostra os últimos eventos (o bot publica via
  `/api/parcial/log`). Útil para acompanhar de longe.

---

## 6. Troubleshooting

| Sintoma | Provável causa / o que fazer |
|---|---|
| Portal mostra o bot **offline** | Processo caiu (reinicie — seção 1) · `HELPDESK_URL`/`PARCIAL_BOT_TOKEN` errados no `.env` · sem internet até o Manus. |
| Comando do portal **não surte efeito** (toast OK, nada acontece) | Bot rodando **código antigo** → atualize e reinicie (seção 2). Ou bot apontando para **outro servidor** (`HELPDESK_URL`). |
| **401 / 403** nos endpoints | `PARCIAL_BOT_TOKEN` do bot ≠ do helpdesk. Ajuste e reinicie. |
| **QR não aparece** no portal | Bot offline, ou ainda inicializando; veja os logs. Force com "Desconectar WhatsApp" ou limpe a sessão (seção 4). |
| Status **erro_banco** | Sem acesso ao SQL Server (`DB_*` no `.env`, rede interna, senha com `#` precisa de aspas). |
| Chrome não sobe como **SYSTEM** | Troque o principal da Tarefa Agendada para o usuário Administrador (nota no `install-task.ps1`). |
| **RAM alta** | Chrome headless consome memória; monitorar. Reiniciar o bot libera. |
| **"Reiniciar processo" derruba mas NÃO volta** | Tarefa Agendada instalada por versão **antiga** do `install-task.ps1` (roda `node index.js` direto, sem wrapper). O `process.exit` mata e nada relança. **Reinstale**: `.\scripts\install-task.ps1` (a versão atual roda o wrapper `run-bot.cmd` em loop). |

---

## 7. Checklist — publicar nova versão do bot

1. Código novo copiado para o servidor (**cópia manual** — o servidor não tem git; ver seção 2).
2. `npm install` **apenas** se mudou `package.json`.
3. Reiniciar o processo (PM2 `restart` ou parar+iniciar a Tarefa Agendada).
4. Conferir nos logs que subiu sem erro e que o **heartbeat** voltou (portal mostra online).
5. Testar o comando novo pelo portal.
