# 🛠️ Scripts · ops-инструменты

**Версия:** v1.0 · 16 мая 2026

Готовые скрипты для запуска и мониторинга AI Sales на сервере.

---

## 📋 Что есть

| Скрипт | Назначение | Когда запускать |
|---|---|---|
| `test_conversations.py` | Прогон 10 типовых диалогов через прод | После каждого изменения промптов · проверка качества |
| `setup_tg_webhook.sh` | Регистрация Telegram webhook | После получения токена от @BotFather + SSL |
| `setup_ssl_nip_io.sh` | HTTPS через Caddy + Let's Encrypt + nip.io | Один раз, перед подключением TG |
| `health_check.sh` | Полный мониторинг всех сервисов | Регулярно · после деплоя |

---

## 1. `test_conversations.py` · контроль качества

10 реалистичных диалоговых сценариев — приветствие, discovery, возражения, close, эскалация — прогоняются через работающий aisales-api-v2 на сервере. Покажет:

- Реальные ответы Claude на типичные ситуации
- Cost/latency по каждому
- Авто-оценку (canceleryarisms, неправильный stage, лишние "!")

```bash
# На сервере
python3 ~/test_conversations.py
# или одну сценку
python3 ~/test_conversations.py --scenario 04-objection-expensive
```

**Стоимость:** ~$0.20 за полный прогон (10 диалогов).

---

## 2. `setup_tg_webhook.sh` · подключение TG

После того как создашь бота через `@BotFather` и поднимешь HTTPS (см. шаг 3):

```bash
# На сервере
bash ~/setup_tg_webhook.sh "<BOT_TOKEN_от_BotFather>" "https://api.46-62-215-11.nip.io/webhooks/telegram"

# С секретом (рекомендуется — защита от подделок)
export TG_WEBHOOK_SECRET=$(openssl rand -hex 24)
bash ~/setup_tg_webhook.sh "<BOT_TOKEN>" "https://api..../webhooks/telegram"
# Не забудь обновить TG_WEBHOOK_SECRET в .env контейнера и сделать docker restart
```

После регистрации Telegram моментально начнёт пересылать сообщения боту в твой API.

---

## 3. `setup_ssl_nip_io.sh` · HTTPS бесплатно за 5 минут

`nip.io` — wildcard DNS, который автоматически резолвит `46-62-215-11.nip.io` → `46.62.215.11`. Никакой регистрации домена не нужно. `Caddy` автоматически получит SSL-сертификат от Let's Encrypt.

```bash
# На сервере
bash ~/setup_ssl_nip_io.sh
```

Результат:
- `https://api.46-62-215-11.nip.io/health` → твой API
- `https://api.46-62-215-11.nip.io/docs` → Swagger
- `https://api.46-62-215-11.nip.io/webhooks/telegram` → для TG

**Это тестовый домен**, для боевого продакшна купи домен и поменяй Caddyfile (1 строка).

---

## 4. `health_check.sh` · мониторинг

Полный обзор системы одной командой:

```bash
# На сервере
bash ~/health_check.sh
```

Покажет:
- 5 Docker-контейнеров (status + health)
- API endpoints (/health, /ready)
- Disk/memory/load
- Последние ошибки в логах (последние 5 минут)
- Anthropic API ключ
- TG webhook (если зарегистрирован)

Удобно поставить в cron на 5 минут:

```bash
echo "*/5 * * * * /home/aisales/health_check.sh > /tmp/aisales-health.log 2>&1" | crontab -
```

---

## 🚀 Полный setup-flow до боевого запуска

```bash
# === На маке ===
scp scripts/*.sh scripts/*.py aisales@46.62.215.11:~

# === На сервере ===
chmod +x ~/setup_*.sh ~/health_check.sh ~/test_conversations.py

# 1. SSL (5 мин · нужно для TG webhook)
bash ~/setup_ssl_nip_io.sh

# 2. Проверка что всё подключено
bash ~/health_check.sh

# 3. Получить TG bot token (через @BotFather → /newbot)
#    Скопировать токен

# 4. Зарегистрировать webhook
bash ~/setup_tg_webhook.sh "TOKEN" "https://api.46-62-215-11.nip.io/webhooks/telegram"

# 5. Прогнать качество
python3 ~/test_conversations.py

# 6. ✅ Написать боту в Telegram — он отвечает!
```

---

## 🐛 Что если...

**`setup_ssl_nip_io.sh` не получает сертификат** → проверь `sudo journalctl -u caddy -n 100`. Чаще всего: порт 80 занят (nginx), или firewall блокирует.

**`test_conversations.py` падает на одном сценарии** → запусти отдельно `python3 ~/test_conversations.py --scenario 04-...` и смотри `docker logs aisales-api-v2`.

**`setup_tg_webhook.sh` возвращает 401** → токен невалиден, перепроверь у @BotFather.

**`health_check.sh` показывает что postgres unhealthy** → `docker logs aisales-postgres --tail 50` и проверь `.env` пароль.
