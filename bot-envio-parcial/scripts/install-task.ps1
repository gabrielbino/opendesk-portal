# ────────────────────────────────────────────────────────────────────────────
# Bot "Envio de Parcial" — instalar como Tarefa Agendada (Windows)
# ────────────────────────────────────────────────────────────────────────────
# Diferente do conector (que roda e encerra), o bot é um PROCESSO DE LONGA
# DURAÇÃO: mantém a sessão do WhatsApp e o próprio agendamento (node-cron).
# Por isso a tarefa:
#   - dispara na INICIALIZAÇÃO do Windows (AtStartup),
#   - roda como SYSTEM (sobe sem precisar de login),
#   - REINICIA automaticamente se o processo cair,
#   - não tem limite de tempo de execução.
#
# ⚙️ A tarefa executa o WRAPPER `scripts\run-bot.cmd` (não o node direto). O
#    wrapper roda `node index.js` num LOOP: quando o node encerra — por queda ou
#    pelo botão "Reiniciar processo" do portal (que faz process.exit) — o wrapper
#    sobe o bot de novo em ~5s, recarregando o código. É isso que faz o botão
#    "Reiniciar processo" voltar o bot de forma confiável, sem depender do
#    restart-on-failure nativo do Windows (que é instável para processo contínuo).
#
# Uso (PowerShell como Administrador):
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
#   .\scripts\install-task.ps1
#
# Para iniciar/parar manualmente depois:
#   Start-ScheduledTask -TaskName "OpenDesk Bot - Envio de Parcial"
#   Stop-ScheduledTask  -TaskName "OpenDesk Bot - Envio de Parcial"
# ────────────────────────────────────────────────────────────────────────────

param(
  [string]$TaskName = "OpenDesk Bot - Envio de Parcial",
  [string]$BotRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=== Bot Envio de Parcial - Instalador de Tarefa Agendada ===" -ForegroundColor Cyan
Write-Host "Diretorio do bot: $BotRoot"

# Resolve o caminho absoluto do node (SYSTEM pode nao ter 'node' no PATH)
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  Write-Host "[ERRO] Node.js nao encontrado no PATH. Instale o Node 18+ e tente de novo." -ForegroundColor Red
  exit 1
}
$NodeExe = $nodeCmd.Source
Write-Host "Node.js: $NodeExe ($(& $NodeExe --version))" -ForegroundColor Green

# Wrapper de supervisão (loop): a tarefa roda o .cmd, que relança o node ao sair.
$Wrapper = Join-Path $BotRoot "scripts\run-bot.cmd"
if (-not (Test-Path $Wrapper)) {
  Write-Host "[ERRO] Wrapper nao encontrado: $Wrapper" -ForegroundColor Red
  exit 1
}
Write-Host "Wrapper: $Wrapper" -ForegroundColor Green
Write-Host ""

# cmd.exe /c ""<wrapper>" "<node.exe>""  — passa o node absoluto (SYSTEM pode nao ter no PATH).
# As aspas EXTERNAS sao obrigatorias: com 2 pares de aspas o cmd removeria a 1a e a
# ultima, quebrando caminhos com espaco (ex.: "C:\Program Files\nodejs\node.exe").
# Envolver tudo num par extra faz o cmd remover so o par de fora, preservando os internos.
$cmdArgs = "/c `"`"$Wrapper`" `"$NodeExe`"`""
$action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\cmd.exe" -Argument $cmdArgs -WorkingDirectory $BotRoot
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit (New-TimeSpan -Seconds 0)

# Remove tarefa anterior (se existir) e registra a nova
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Register-ScheduledTask -TaskName $TaskName `
  -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
  -Description "Bot WhatsApp Envio de Parcial (Panorama Pedidos Sem ST). Processo continuo." | Out-Null

Write-Host "[OK] Tarefa '$TaskName' registrada (AtStartup, SYSTEM, reinicio automatico)." -ForegroundColor Green

# Inicia agora
Start-ScheduledTask -TaskName $TaskName
Write-Host "[OK] Tarefa iniciada." -ForegroundColor Green

# Feedback rapido: espera alguns segundos e mostra o estado + ultimo resultado.
Start-Sleep -Seconds 6
$info = Get-ScheduledTask -TaskName $TaskName | Get-ScheduledTaskInfo
$st = (Get-ScheduledTask -TaskName $TaskName).State
Write-Host ""
Write-Host "Estado da tarefa: $st | LastTaskResult: $($info.LastTaskResult)" -ForegroundColor Cyan
Write-Host "Log do wrapper:   $Wrapper -> ..\run-bot.log (na pasta scripts)" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Verificar status:  Get-ScheduledTask -TaskName `"$TaskName`" | Get-ScheduledTaskInfo" -ForegroundColor DarkGray
Write-Host "Depurar ao vivo:   pare a tarefa e rode  .\scripts\run-bot.cmd  numa janela (Ctrl+C p/ sair)." -ForegroundColor DarkGray
Write-Host ""
Write-Host "OBS: se o Chrome headless apresentar problema rodando como SYSTEM, troque o" -ForegroundColor Yellow
Write-Host "     principal para o usuario Administrador (LogonType Password/Interactive)." -ForegroundColor Yellow
