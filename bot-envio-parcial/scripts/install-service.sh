#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Bot "Envio de Parcial" — instalar como serviço systemd (Linux headless)
# ─────────────────────────────────────────────────────────────────────────────
# Registra o bot como serviço com Restart=always (equivalente da Tarefa Agendada
# do Windows). O "Reiniciar processo" do portal (process.exit) passa a voltar o
# bot em ~5s via systemd.
#
# Uso (na pasta do bot, com sudo):
#   sudo bash scripts/install-service.sh
#
# Variáveis opcionais:
#   SERVICE_USER=opendesk   # usuário que roda o bot (padrão: dono da pasta / SUDO_USER)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SERVICE_NAME="parcial-bot"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Node: usa o do PATH (resolve o caminho absoluto — o systemd não tem seu PATH).
NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  echo "[ERRO] Node.js não encontrado no PATH. Instale o Node 18+ e tente de novo." >&2
  exit 1
fi

# Usuário do serviço: SERVICE_USER > dono da pasta do bot > SUDO_USER.
if [ -n "${SERVICE_USER:-}" ]; then
  RUN_USER="$SERVICE_USER"
elif [ -n "${SUDO_USER:-}" ]; then
  RUN_USER="$SUDO_USER"
else
  RUN_USER="$(stat -c '%U' "$BOT_DIR")"
fi

echo "=== Bot Envio de Parcial — instalador systemd ==="
echo "Pasta do bot : $BOT_DIR"
echo "Node.js      : $NODE_BIN ($("$NODE_BIN" --version))"
echo "Usuário      : $RUN_USER"
echo ""

if [ ! -f "$BOT_DIR/index.js" ]; then
  echo "[ERRO] index.js não encontrado em $BOT_DIR — copie os arquivos do bot primeiro." >&2
  exit 1
fi
if [ ! -f "$BOT_DIR/.env" ]; then
  echo "[AVISO] $BOT_DIR/.env não existe. Crie a partir de .env.example antes de iniciar."
fi

UNIT_PATH="/etc/systemd/system/${SERVICE_NAME}.service"
# Gera a unit a partir do template, substituindo os placeholders.
sed -e "s|__USER__|${RUN_USER}|g" \
    -e "s|__BOTDIR__|${BOT_DIR}|g" \
    -e "s|__NODE__|${NODE_BIN}|g" \
    "$SCRIPT_DIR/parcial-bot.service" > "$UNIT_PATH"

echo "[OK] Unit gravada em $UNIT_PATH"

systemctl daemon-reload
systemctl enable "$SERVICE_NAME" >/dev/null 2>&1 || true
systemctl restart "$SERVICE_NAME"

sleep 4
echo ""
systemctl --no-pager --lines=0 status "$SERVICE_NAME" || true
echo ""
echo "Ver logs ao vivo:  journalctl -u ${SERVICE_NAME} -f"
echo "Parar / iniciar :  sudo systemctl stop|start|restart ${SERVICE_NAME}"
