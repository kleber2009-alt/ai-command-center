# Мониторинг и алёрты

Self-hosted healthcheck — host cron каждые 5 минут дёргает наш
`/api/health` и проверяет внешние SaaS. Алёрт в Telegram при изменении
статуса (down → recovered и обратно), плюс напоминание раз в час
если инцидент затяжной.

## Что проверяется

| Check | Что |
|---|---|
| `backend` | `GET /api/health` — 200 OK (БД доступна, Fastify живой) |
| `transcribe` | `GET /transcribe` — 200 OK (Next.js контейнер живой) |
| `elevenlabs` | `GET api.elevenlabs.io/v1/user` — токен валиден, биллинг ок |
| `tg_bot` | `GET api.telegram.org/bot$TOKEN/getMe` — токен валиден |
| `disk` | `df /` — корневой диск занят менее 85% |

## Что НЕ покрывается self-hosted мониторингом

- **Полное падение сервера** (сам мониторинг тоже не работает) — нужен external (Uptime Robot)
- **Падение DNS/сети** между сервером и интернетом — то же самое

Поэтому рекомендую ДОПОЛНИТЕЛЬНО external monitor (см. ниже).

## Setup

### 1. Установить cron

```bash
crontab -e
# Вставь содержимое /root/ai-command-center/infra/monitoring/cron.example
crontab -l   # проверить
```

Логи будут писаться в `/var/log/aio-monitor.log`.

### 2. Тестовый прогон

```bash
cd /root/ai-command-center/infra
set -a && source .env && set +a
chmod +x monitoring/check.sh
monitoring/check.sh
echo "exit: $?"
```

Первый запуск пометит все checks как OK (если всё работает) и не пришлёт алёртов. Второй запуск — тоже тишина (статус не изменился). Если что-то упадёт между запусками — придёт `🔴 <check> down`.

### 3. Имитация инцидента (для проверки что алёрты работают)

```bash
# Удали временно state-файл backend, симулируя смену статуса
rm -f /var/lib/aio-monitor/backend.status

# Теперь поломай health endpoint (например остановив ai-office)
docker compose stop ai-office

# Запусти monitor
monitoring/check.sh
# → должен прийти 🔴 backend down

# Восстанови
docker compose start ai-office
sleep 5
monitoring/check.sh
# → должен прийти 🟢 backend recovered
```

## Внешний мониторинг (Uptime Robot)

Дополнительно к self-hosted — мониторинг от внешнего провайдера, чтобы
видеть полное падение сервера/сети.

### Бесплатно: Uptime Robot

1. [uptimerobot.com](https://uptimerobot.com) → Sign Up (free) → email
2. **Add New Monitor**
   - Type: `HTTP(s)`
   - URL: `https://46.62.215.11.nip.io/api/health`
   - Friendly Name: `AI Growth Office Backend`
   - Monitoring Interval: 5 minutes (free tier)
   - Custom HTTP statuses: только `200` считать UP
3. **My Settings** → **Alert Contacts** → **Telegram**
   - Создай ОТДЕЛЬНЫЙ бот через @BotFather (не наш voice-бот!)
   - Скопируй токен, chat_id (свой), сохрани в Uptime Robot
4. В монитор: добавь этот Telegram contact как алёрт
5. Опционально: добавь ещё мониторы на `/transcribe`, `https://api.46-62-215-11.nip.io` (твой aisales API)

Free tier: 50 мониторов, 5-минутный интервал, неограниченные алёрты.

### Альтернативы

- **BetterStack** (3 free monitors, 30-сек интервал)
- **Healthchecks.io** (для бэкап-cron — отдельная задача)

## Сообщения в Telegram

При смене статуса:
- `🔴 *backend* down — HTTP 503: {"ok":false,...}`
- `🟢 *backend* recovered`

При затяжном инциденте (раз в час):
- `🔴 *backend* still down (60 min) — HTTP 503: ...`

Получает их тот же chat, что и admin-уведомления о лидах
(`TG_CHAT_ID` в `.env`) — через `/api/notify-tg`.

## Отключение / тонкая настройка

Поменять интервал: отредактируй `cron.example` (по умолчанию 5 мин).

Отключить отдельный check: закомментируй блок в `check.sh`.

Перестать напоминать раз в час: `HOURLY_REMIND_AFTER_MIN=999999` env.

Сменить URL: `BASE_URL=https://your-domain ./check.sh`

## Endpoints

`/api/health` — короткий, ~5ms. **Используй для частых мониторингов.**
Возвращает:
- 200 если БД достижима + JSON с конфигом
- 503 если БД упала

`/api/health/full` — детальный, до 5 секунд (внешние API-вызовы).
Возвращает:
- 200 если всё ОК, 503 если что-то критичное упало
- JSON со всеми checks: db, voices_active, generations_last_hour,
  elevenlabs, tg_voice_bot, voice_notes_dir

Используй для отладки, не для cron.
