#!/usr/bin/env bash
# One-time: install the auto-deploy timer (systemd, every 2 minutes).
#
#   curl -fsSLo /root/autodeploy-install.sh https://raw.githubusercontent.com/kleber2009-alt/ai-command-center/claude/persona-studio-status-pU6YD/apps/persona-studio/deploy/install-autodeploy.sh
#   bash /root/autodeploy-install.sh
#
# (no pipes/ampersands: the Hetzner web console mangles them.) Brings the
# checkout to the branch first, so it works even on an outdated server.
# Change the branch later in
# /etc/persona-autodeploy.env. Status: systemctl list-timers persona-autodeploy
# Log: tail -f /var/log/persona-autodeploy.log
set -euo pipefail

INSTALL_DIR=/opt/ai-command-center
BRANCH="${1:-claude/persona-studio-status-pU6YD}"

echo "▶ Обновляю код до последней версии ветки $BRANCH"
git -C "$INSTALL_DIR" fetch -q --depth 1 origin "$BRANCH"
git -C "$INSTALL_DIR" checkout -q -B "$BRANCH" FETCH_HEAD
git -C "$INSTALL_DIR" reset -q --hard FETCH_HEAD
echo "  $(git -C "$INSTALL_DIR" log --oneline -1)"

cat > /etc/persona-autodeploy.env <<EOF
BRANCH=$BRANCH
INSTALL_DIR=$INSTALL_DIR
EOF

cat > /etc/systemd/system/persona-autodeploy.service <<EOF
[Unit]
Description=Persona Studio auto-deploy (pull $BRANCH, rebuild on change)
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
EnvironmentFile=/etc/persona-autodeploy.env
ExecStart=/bin/bash $INSTALL_DIR/apps/persona-studio/deploy/autodeploy.sh
StandardOutput=append:/var/log/persona-autodeploy.log
StandardError=append:/var/log/persona-autodeploy.log
TimeoutStartSec=3600
EOF

cat > /etc/systemd/system/persona-autodeploy.timer <<EOF
[Unit]
Description=Check for Persona Studio updates every 2 minutes

[Timer]
OnBootSec=1min
OnUnitActiveSec=2min
Unit=persona-autodeploy.service

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now persona-autodeploy.timer >/dev/null
echo "✓ Автодеплой включён: ветка $BRANCH, проверка каждые 2 минуты."
echo "  Сейчас запускаю первое обновление (5–15 минут)…"
BRANCH="$BRANCH" INSTALL_DIR="$INSTALL_DIR" bash "$INSTALL_DIR/apps/persona-studio/deploy/autodeploy.sh" --force 2>&1 | tail -5
echo "  Журнал: tail -f /var/log/persona-autodeploy.log"
