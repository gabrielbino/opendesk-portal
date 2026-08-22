@echo off
setlocal
echo ============================================
echo  OpenDesk Connector - CSV Rotation (SC + RS)
echo ============================================
echo.
cd /d %~dp0\..

echo [1/2] Executando csv-rotation-sc...
node .\src\index.mjs --job=csv-rotation-sc
if %ERRORLEVEL% NEQ 0 (
  echo [ERRO] Falha no job csv-rotation-sc.
) else (
  echo [OK] csv-rotation-sc concluido.
)
echo.

echo [2/2] Executando csv-rotation-rs...
node .\src\index.mjs --job=csv-rotation-rs
if %ERRORLEVEL% NEQ 0 (
  echo [ERRO] Falha no job csv-rotation-rs.
) else (
  echo [OK] csv-rotation-rs concluido.
)
echo.

echo ============================================
echo  Execucao finalizada.
echo ============================================
endlocal
pause
