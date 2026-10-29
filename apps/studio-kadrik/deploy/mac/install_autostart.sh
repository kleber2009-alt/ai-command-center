#!/bin/bash
# Автозапуск @studio_kadrik_bot при входе в macOS (launchd) + caffeinate: Mac не засыпает, пока бот работает.
# Удалить: launchctl bootout gui/$(id -u)/com.ilia.studio-kadrik-bot
set -euo pipefail
D="$(cd "$(dirname "$0")" && pwd)"
P=~/Library/LaunchAgents/com.ilia.studio-kadrik-bot.plist
cat > "$P" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.ilia.studio-kadrik-bot</string>
  <key>ProgramArguments</key><array><string>/usr/bin/caffeinate</string><string>-ims</string><string>$D/start.sh</string></array>
  <key>WorkingDirectory</key><string>$D</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>20</integer>
  <key>StandardOutPath</key><string>$D/bot.log</string>
  <key>StandardErrorPath</key><string>$D/bot.log</string>
</dict></plist>
PL
# bootstrap в домен пользователя gui/UID: `launchctl load` из чужого контекста (терминал агента, ssh) может
# зарегистрировать агент во временном домене, и launchd снимет бота при закрытии этого контекста.
launchctl bootout "gui/$(id -u)/$(basename "$P" .plist)" 2>/dev/null && sleep 2 || true
launchctl bootstrap "gui/$(id -u)" "$P"
echo "автозапуск включён, лог: $D/bot.log"
