#!/usr/bin/env bash
# Закрыть dashboard.aicex.club паролем (Caddy). В дашборде финансы и выплаты — открытым он быть не должен.
# Запуск под root на сервере дашборда:
#   curl -fsSL https://raw.githubusercontent.com/kleber2009-alt/ai-command-center/main/apps/funnel-analytics/deploy/protect.sh | bash
# Спросит пароль (в историю команд не попадёт), сохранит хеш в /etc/funnel-analytics.auth
# и включит вход в блоке funnel-analytics. setup-server.sh потом берёт пароль из того же файла.
# Caddyfile сначала копируется в Caddyfile.bak.<время>; если Caddy не принял настройку — копия возвращается.
set -euo pipefail
CF=/etc/caddy/Caddyfile
AUTH=/etc/funnel-analytics.auth
USER_NAME="${FUNNEL_DASHBOARD_USER:-aicex}"
command -v caddy >/dev/null || { echo "Здесь нет Caddy — скрипт для сервера дашборда"; exit 1; }
grep -q '# >>> funnel-analytics' "$CF" || { echo "В $CF нет блока funnel-analytics — сначала setup-server.sh"; exit 1; }

read -rsp "Новый пароль для дашборда: " P < /dev/tty; echo
read -rsp "Ещё раз: " P2 < /dev/tty; echo
[ -n "$P" ] && [ "$P" = "$P2" ] || { echo "Пароли пустые или не совпали — ничего не изменено"; exit 1; }
HASH=$(caddy hash-password --plaintext "$P")
unset P P2
[ -n "$HASH" ] || { echo "Caddy не выдал хеш пароля — ничего не изменено"; exit 1; }
(umask 077; printf '%s %s\n' "$USER_NAME" "$HASH" > "$AUTH")

TS=$(date +%Y%m%d_%H%M%S)
cp "$CF" "$CF.bak.$TS"
python3 - "$CF" "$AUTH" <<'PY'
import re, sys
cf, auth = sys.argv[1:]
user, h = open(auth).read().split()[:2]
s = open(cf).read()
m = re.search(r"# >>> funnel-analytics\n.*?# <<< funnel-analytics", s, flags=re.S)
block = re.sub(r"\tbasic_?auth \{\n.*?\n\t\}\n", "", m.group(0), flags=re.S)
block = block.replace("\tfile_server\n", "\tbasic_auth {\n\t\t%s %s\n\t}\n\tfile_server\n" % (user, h), 1)
open(cf, "w").write(s[:m.start()] + block + s[m.end():])
PY
valid() { caddy validate --config "$CF" --adapter caddyfile >/dev/null 2>&1; }
# Caddy старше 2.8 знает директиву только как basicauth
valid || { sed -i 's/^\tbasic_auth {/\tbasicauth {/' "$CF"; valid; } || {
  cp "$CF.bak.$TS" "$CF"; echo "Caddy не принял настройку — вернул старый конфиг, сайт не тронут"; exit 1; }
systemctl reload caddy
echo "Готово: dashboard.aicex.club спрашивает логин «$USER_NAME» и пароль. Копия старого конфига: $CF.bak.$TS"
