@echo off
chcp 65001 >nul
title Coletor de Inventario - NetMap
echo.
echo  Coletando informacoes deste computador...
echo.

REM Executa o script PowerShell que faz a coleta (sem precisar mudar politicas do sistema).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0coletar.ps1"

echo.
echo  Pronto. O arquivo foi salvo na pasta "coletas" ao lado deste programa.
echo  Voce ja pode remover o pendrive e usar em outra maquina.
echo.
pause
