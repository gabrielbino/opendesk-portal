@echo off
rem ==========================================================================
rem  run-bot.cmd  -- supervisor em loop do bot "Envio de Parcial"
rem ==========================================================================
rem  A Tarefa Agendada executa ESTE wrapper (nao o node direto). Ele roda o bot
rem  num laco: quando o node encerra (queda OU "Reiniciar processo" do portal,
rem  que faz process.exit), o wrapper aguarda e sobe de novo -- recarregando o
rem  codigo. Assim o botao do portal volta o bot de forma confiavel, sem depender
rem  do restart-on-failure nativo do Windows (instavel para processo continuo).
rem
rem  Uso:  run-bot.cmd  ["CAMINHO_DO_NODE_EXE"]   (opcional; se ausente usa "node" do PATH)
rem  Para PARAR de vez: Stop-ScheduledTask (encerra a arvore inteira do processo).
rem  Diagnostico: o ciclo (inicio/saida/codigo) e gravado em run-bot.log na pasta scripts.
rem ==========================================================================
setlocal EnableExtensions
set "LOG=%~dp0run-bot.log"
cd /d "%~dp0.."

set "NODE_EXE=%~1"
if "%NODE_EXE%"=="" set "NODE_EXE=node"

:loop
echo [run-bot] %date% %time% iniciando o bot com "%NODE_EXE%" ...>>"%LOG%"
"%NODE_EXE%" index.js
echo [run-bot] %date% %time% bot encerrou (codigo %errorlevel%); reiniciando em ~5s...>>"%LOG%"
ping -n 6 127.0.0.1 >nul
goto loop
