#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# WA Gateway "Monitor de Integrações" — instalar como serviço systemd (Linux)
# ─────────────────────────────────────────────────────────────────────────────
# Registra o gateway com Restart=always. Espelha o install-service.sh do coletor.
# Rode na VM srvappapi, na pasta do gateway, com sudo:
#   sudo bash scripts/install-service.sh
#
# Variável opcional: SERVICE_USER=opendesk
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SERVICE_NAME="wa-gateway"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  echo "[ERRO] Node.js não encontrado no PATH. Instale o Node 18+ e tente de novo." >&2
  exit 1
fi

if [ -n "${SERVICE_USER:-}" ]; then
  RUN_USER="$SERVICE_USER"
elif [ -n "${SUDO_USER:-}" ]; then
  RUN_USER="$SUDO_USER"
else
  RUN_USER="$(stat -c '%U' "$APP_DIR")"
fi

echo "=== WA Gateway — instalador systemd ==="
echo "Pasta   : $APP_DIR"
echo "Node.js : $NODE_BIN ($("$NODE_BIN" --version))"
echo "Usuário : $RUN_USER"
echo ""

if [ ! -f "$APP_DIR/index.mjs" ]; then
  echo "[ERRO] index.mjs não encontrado em $APP_DIR — copie os arquivos primeiro." >&2
  exit 1
fi
if [ ! -f "$APP_DIR/.env" ]; then
  echo "[AVISO] $APP_DIR/.env não existe. Crie a partir de .env.example antes de iniciar."
fi
if [ ! -d "$APP_DIR/node_modules" ]; then
  echo "[AVISO] node_modules ausente — rode 'npm install' (precisa de whatsapp-web.js + Chromium)."
fi

UNIT_PATH="/etc/systemd/system/${SERVICE_NAME}.service"
sed -e "s|__USER__|${RUN_USER}|g" \
    -e "s|__DIR__|${APP_DIR}|g" \
    -e "s|__NODE__|${NODE_BIN}|g" \
    "$SCRIPT_DIR/${SERVICE_NAME}.service" > "$UNIT_PATH"
echo "[OK] Unit gravada em $UNIT_PATH"

systemctl daemon-reload
systemctl enable "$SERVICE_NAME" >/dev/null 2>&1 || true
systemctl restart "$SERVICE_NAME"

sleep 4
echo ""
systemctl --no-pager --lines=0 status "$SERVICE_NAME" || true
echo ""
echo "Ver logs / QR:  journalctl -u ${SERVICE_NAME} -f"
echo "Parear       :  abra o portal → Monitor de Integrações → WhatsApp → escaneie o QR"
