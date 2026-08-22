#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Backup de pedidos (retenção semanal) — instalar como systemd timer (Linux)
# ─────────────────────────────────────────────────────────────────────────────
# Instala o serviço (oneshot) + o timer (poll a cada 10 min). Espelha o
# install-service.sh do coletor. Rode na VM srvappapi, na pasta do backup.
#
# Uso (na pasta do backup, com sudo):
#   sudo bash scripts/install-timer.sh
#
# Variáveis opcionais:
#   SERVICE_USER=opendesk   # usuário que roda o job (padrão: dono da pasta / SUDO_USER)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

NAME="backup-pedidos"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JOB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

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
  RUN_USER="$(stat -c '%U' "$JOB_DIR")"
fi

echo "=== Backup de pedidos (retenção) — instalador systemd (timer) ==="
echo "Pasta do job : $JOB_DIR"
echo "Node.js      : $NODE_BIN ($("$NODE_BIN" --version))"
echo "Usuário      : $RUN_USER"
echo ""

if [ ! -f "$JOB_DIR/index.mjs" ]; then
  echo "[ERRO] index.mjs não encontrado em $JOB_DIR — copie os arquivos primeiro." >&2
  exit 1
fi
if [ ! -f "$JOB_DIR/.env" ]; then
  echo "[AVISO] $JOB_DIR/.env não existe. Crie a partir de .env.example antes de iniciar."
fi
if [ ! -d "$JOB_DIR/node_modules" ]; then
  echo "[AVISO] node_modules ausente — rode 'npm install' na pasta do job (precisa de 'archiver')."
fi

# Serviço (oneshot) a partir do template.
sed -e "s|__USER__|${RUN_USER}|g" \
    -e "s|__DIR__|${JOB_DIR}|g" \
    -e "s|__NODE__|${NODE_BIN}|g" \
    "$SCRIPT_DIR/${NAME}.service" > "/etc/systemd/system/${NAME}.service"
echo "[OK] Serviço em /etc/systemd/system/${NAME}.service"

# Timer (sem placeholders).
cp "$SCRIPT_DIR/${NAME}.timer" "/etc/systemd/system/${NAME}.timer"
echo "[OK] Timer em /etc/systemd/system/${NAME}.timer"

systemctl daemon-reload
systemctl enable "${NAME}.timer" >/dev/null 2>&1 || true
systemctl restart "${NAME}.timer"

echo ""
systemctl --no-pager --lines=0 status "${NAME}.timer" || true
echo ""
echo "Próximos disparos :  systemctl list-timers ${NAME}.timer"
echo "Rodar manual agora :  sudo systemctl start ${NAME}.service   (ou: node index.mjs --mes 2026-07 --dry-run)"
echo "Ver logs           :  journalctl -u ${NAME}.service -f"
