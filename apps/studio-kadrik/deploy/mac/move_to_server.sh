#!/bin/bash
# Переезд @studio_kadrik_bot с Mac на сервер Hetzner (рядом с @Productionskill_bot — Кадрик читает его очередь задач).
# Код, данные игроков, конфиг туннеля и systemd-юнит studio-kadrik-bot уже на сервере; этот скрипт переносит секреты
# (.env с токеном и ключ туннеля kadrik.aicex.club), останавливает Кадрика на Mac и запускает его на сервере.
#   ./move_to_server.sh
set -euo pipefail
cd "$(dirname "$0")"
SRV=root@157.180.33.173
TUN=070a9638-4a2c-4592-9fa1-33ccccebcfb2

echo "1/4 секреты → сервер"
scp -q .env "$SRV:/home/iliapaliy/studio-kadrik-bot/.env"
scp -q ~/.cloudflared/$TUN.json "$SRV:/home/iliapaliy/.cloudflared/$TUN.json"
ssh "$SRV" "chown iliapaliy:iliapaliy /home/iliapaliy/studio-kadrik-bot/.env /home/iliapaliy/.cloudflared/$TUN.json \
  && chmod 600 /home/iliapaliy/studio-kadrik-bot/.env && chmod 400 /home/iliapaliy/.cloudflared/$TUN.json"

echo "2/4 стоп Кадрика на Mac (два экземпляра с одним токеном мешают друг другу)"
launchctl bootout "gui/$(id -u)/com.ilia.studio-kadrik-bot" 2>/dev/null || true
P=~/Library/LaunchAgents/com.ilia.studio-kadrik-bot.plist
[ -f "$P" ] && mv "$P" "$P.disabled-moved-to-server"

echo "3/4 старт на сервере"
ssh "$SRV" "systemctl restart studio-kadrik-bot && sleep 15 && systemctl is-active studio-kadrik-bot && tail -6 /home/iliapaliy/studio-kadrik-bot/bot.log"

echo "4/4 проверка адреса"
curl -s -o /dev/null -w "https://kadrik.aicex.club → %{http_code}\n" --max-time 20 https://kadrik.aicex.club/
echo "Готово. Вернуть на Mac: ssh $SRV systemctl disable --now studio-kadrik-bot; mv $P.disabled-moved-to-server $P; launchctl bootstrap gui/\$(id -u) $P"
