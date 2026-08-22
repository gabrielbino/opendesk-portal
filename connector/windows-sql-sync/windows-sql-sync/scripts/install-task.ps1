# ────────────────────────────────────────────────────────────────────────────────
# OpenDesk Connector - Instalador de Tarefas Agendadas (Windows Task Scheduler)
# ────────────────────────────────────────────────────────────────────────────────
# Uso: Abrir PowerShell como Administrador e executar:
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
#   .\scripts\install-task.ps1
#
# Tarefas criadas:
#   1. "OpenDesk Connector - CSV SC"       -> csv-rotation-sc  -- seg-sex 07:00
#   2. "OpenDesk Connector - CSV RS"       -> csv-rotation-rs  -- seg-sex 07:05
#   3. "OpenDesk Connector - SQL Sync"     -> todos os SQL     -- seg-sex 07:10
# ────────────────────────────────────────────────────────────────────────────────

param(
  [string]$ConnectorRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [string]$NodeExe = "node"
)

# Não parar no erro do schtasks /delete (tarefa pode não existir ainda)
$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "=== OpenDesk Connector - Instalador de Tarefas Agendadas ===" -ForegroundColor Cyan
Write-Host "Diretorio do conector: $ConnectorRoot"
Write-Host ""

# Verifica se node está disponível
try {
  $nodeVersion = & $NodeExe --version 2>&1
  Write-Host "Node.js encontrado: $nodeVersion" -ForegroundColor Green
} catch {
  Write-Host "[AVISO] Node.js nao encontrado em '$NodeExe'." -ForegroundColor Yellow
}

Write-Host ""

# Definição das tarefas: Nome, Argumento --job, Horário
$tasks = @(
  @{ Name = "OpenDesk Connector - CSV SC";   Args = "--job=csv-rotation-sc"; Time = "07:00"; Desc = "Le CSV de dias de estoque SC e rotaciona produtos no painel" },
  @{ Name = "OpenDesk Connector - CSV RS";   Args = "--job=csv-rotation-rs"; Time = "07:05"; Desc = "Le CSV de dias de estoque RS e rotaciona produtos no painel" },
  @{ Name = "OpenDesk Connector - SQL Sync"; Args = "";                       Time = "07:10"; Desc = "Executa jobs SQL (vendas, lotes) apos rotacao CSV" }
)

$allOk = $true

foreach ($task in $tasks) {
  $taskName = $task.Name
  $taskArgs = $task.Args
  $taskTime = $task.Time
  $taskDesc = $task.Desc

  Write-Host "Configurando: $taskName ($taskTime)" -ForegroundColor Yellow
  Write-Host "  $taskDesc"

  # Remove tarefa existente — ignora erro se não existir
  $deleteOutput = schtasks /delete /tn "$taskName" /f 2>&1
  # (silencioso — não exibe erro se não existia)

  # Monta o comando da tarefa
  if ($taskArgs) {
    $trCommand = "cmd /c cd /d `"$ConnectorRoot`" `&`& node .\src\index.mjs $taskArgs"
  } else {
    $trCommand = "cmd /c cd /d `"$ConnectorRoot`" `&`& node .\src\index.mjs"
  }

  # Cria a tarefa agendada
  $createOutput = schtasks /create `
    /tn "$taskName" `
    /sc WEEKLY `
    /d MON,TUE,WED,THU,FRI `
    /st $taskTime `
    /ru SYSTEM `
    /tr "$trCommand" `
    /rl HIGHEST `
    /f 2>&1

  if ($LASTEXITCODE -eq 0) {
    Write-Host "  [OK] Tarefa criada com sucesso." -ForegroundColor Green
  } else {
    Write-Host "  [ERRO] Falha ao criar tarefa:" -ForegroundColor Red
    Write-Host "  $createOutput" -ForegroundColor Red
    $allOk = $false
  }

  Write-Host ""
}

Write-Host "=== Resultado ===" -ForegroundColor Cyan
if ($allOk) {
  Write-Host "Todas as tarefas foram criadas com sucesso!" -ForegroundColor Green
} else {
  Write-Host "Algumas tarefas falharam. Verifique os erros acima." -ForegroundColor Red
}

Write-Host ""
Write-Host "Para verificar as tarefas criadas:"
Write-Host "  schtasks /query /fo LIST /tn `"OpenDesk Connector - CSV SC`""
Write-Host "  schtasks /query /fo LIST /tn `"OpenDesk Connector - CSV RS`""
Write-Host "  schtasks /query /fo LIST /tn `"OpenDesk Connector - SQL Sync`""
Write-Host ""
Write-Host "Para executar manualmente agora:"
Write-Host "  schtasks /run /tn `"OpenDesk Connector - CSV SC`""
Write-Host "  schtasks /run /tn `"OpenDesk Connector - CSV RS`""
Write-Host "  schtasks /run /tn `"OpenDesk Connector - SQL Sync`""
Write-Host ""
