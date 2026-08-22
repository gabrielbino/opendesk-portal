# ============================================================================
#  Coletor de Inventario de Computadores - NetMap
#  Coleta os dados da maquina atual e grava um arquivo JSON na pasta "coletas"
#  ao lado deste script (no proprio pendrive). Depois, importe esses JSONs no
#  NetMap ("Importar > Coletas do pendrive") para adicionar os computadores.
#
#  Nao precisa de instalacao nem de permissao de administrador.
# ============================================================================

$ErrorActionPreference = 'SilentlyContinue'

function Limpa($v) {
  $s = "$v".Trim()
  $lixo = @('No Asset Tag', 'Default string', 'None', 'To Be Filled By O.E.M.',
            'System Serial Number', 'Not Specified', 'Not Available', 'O.E.M.', 'INVALID')
  if ($lixo -contains $s) { return '' }
  return $s
}

# ---- Coleta base -----------------------------------------------------------
$cs   = Get-CimInstance Win32_ComputerSystem
$os   = Get-CimInstance Win32_OperatingSystem
$bios = Get-CimInstance Win32_BIOS
$enc  = Get-CimInstance Win32_SystemEnclosure
$cpu  = Get-CimInstance Win32_Processor | Select-Object -First 1

# RAM total (GB)
$ramBytes = (Get-CimInstance Win32_PhysicalMemory | Measure-Object -Property Capacity -Sum).Sum
$ramGB = if ($ramBytes) { [math]::Round($ramBytes / 1GB, 0) } else { $null }

# Rede: prefere o adaptador com gateway (o que esta realmente em uso)
$netAll = Get-CimInstance Win32_NetworkAdapterConfiguration -Filter 'IPEnabled=true'
$net = $netAll | Where-Object { $_.DefaultIPGateway } | Select-Object -First 1
if (-not $net) { $net = $netAll | Select-Object -First 1 }
$mac  = if ($net) { "$($net.MACAddress)" } else { '' }
$ipv4 = ''
if ($net -and $net.IPAddress) {
  $ipv4 = ($net.IPAddress | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' } | Select-Object -First 1)
}

# Patrimonio (asset tag do gabinete) e numero de serie
$assetTag = Limpa ($enc.SMBIOSAssetTag | Select-Object -First 1)
$serial   = Limpa $bios.SerialNumber

# ---- Monitores (viram perifericos) -----------------------------------------
$perifericos = @()
try {
  $mons = Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorID -ErrorAction Stop
  foreach ($m in $mons) {
    $fab = ''; $mod = ''; $ser = ''
    if ($m.ManufacturerName) { $fab = -join ($m.ManufacturerName | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ }) }
    if ($m.UserFriendlyName) { $mod = -join ($m.UserFriendlyName | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ }) }
    if ($m.SerialNumberID)   { $ser = -join ($m.SerialNumberID  | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ }) }
    $desc = (@($fab, $mod) | Where-Object { $_ }) -join ' '
    if (-not $desc) { $desc = 'Monitor' }
    $perifericos += [ordered]@{
      tipo       = 'Monitor'
      descricao  = $desc.Trim()
      # Aspas forçam string no JSON (evita números com zero à esquerda, ex.: 0048, que quebram o JSON.parse).
      patrimonio = "$(Limpa $ser)"
    }
  }
} catch { }

$osNome = ("$($os.Caption)" -replace '^\s*Microsoft\s*', '').Trim()

# ---- Monta o objeto de dados -----------------------------------------------
$dados = [ordered]@{
  coletadoEm         = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ss')
  nome               = "$($cs.Name)"
  patrimonio         = "$assetTag"
  serial             = "$serial"
  fabricante         = (Limpa $cs.Manufacturer)
  modelo             = (Limpa $cs.Model)
  mac                = $mac
  ipv4               = "$ipv4"
  sistemaOperacional = ("$osNome $($os.Version)").Trim()
  responsavel        = "$($cs.UserName)"
  departamento       = ''
  cpu                = if ($cpu) { "$($cpu.Name)".Trim() } else { '' }
  ramGB              = $ramGB
  perifericos        = @($perifericos)
}

# ---- Grava o JSON na pasta "coletas" (sem BOM, para importar sem erro) ------
$destino = Join-Path $PSScriptRoot 'coletas'
New-Item -ItemType Directory -Path $destino -Force | Out-Null

$nomeArquivo = ("$($cs.Name)" -replace '[^A-Za-z0-9_-]', '_')
if (-not $nomeArquivo) { $nomeArquivo = 'computador' }
$arquivo = Join-Path $destino ("$nomeArquivo.json")

$json = $dados | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($arquivo, $json, (New-Object System.Text.UTF8Encoding($false)))

# ---- Resumo na tela --------------------------------------------------------
Write-Host ''
Write-Host '==============================================================='
Write-Host '  Coleta concluida!'
Write-Host "   Computador : $($cs.Name)"
Write-Host "   Patrimonio : $(if ($assetTag) { $assetTag } else { '(vazio - preencher depois)' })"
Write-Host "   Serie      : $serial"
Write-Host "   MAC        : $mac"
Write-Host "   IP         : $ipv4"
Write-Host "   Sistema    : $osNome $($os.Version)"
Write-Host "   Usuario    : $($cs.UserName)"
Write-Host "   Monitores  : $($perifericos.Count)"
Write-Host "   Arquivo    : $arquivo"
Write-Host '==============================================================='
