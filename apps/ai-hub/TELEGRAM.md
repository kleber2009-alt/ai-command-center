# Telegram Mini App · @aicex_one_bot

> Live: https://t.me/aicex_one_bot
> Mini App URL: https://aihub-app.46-62-215-11.nip.io/tma
> Webhook URL: https://aihub-app.46-62-215-11.nip.io/api/telegram/webhook

## Архитектура

```
┌──────────────────┐
│  @aicex_one_bot  │
└──┬──────────┬────┘
   │          │
   │ webhook  │ menu button → Mini App
   ▼          ▼
┌──────────────────────────────────────────┐
│   /api/telegram/webhook   /tma           │
│   (commands)              (entry page)   │
│                                          │
│   /api/auth/telegram  ←  initData HMAC   │
│   (creates session, sets cookie)         │
│                                          │
│   /play/[slug]  ←  authenticated session │
└──────────────────────────────────────────┘
```

## Flow юзера

1. Юзер открывает `@aicex_one_bot` в Telegram
2. Видит menu-кнопку «🎨 Открыть AI Hub» (внизу слева от поля ввода)
3. Клик → Telegram открывает WebView с URL `…/tma`
4. На `/tma` страница:
   - Подгружает `telegram-web-app.js`
   - Берёт `window.Telegram.WebApp.initData`
   - POST на `/api/auth/telegram` с initData
   - Сервер валидирует HMAC против `TELEGRAM_BOT_TOKEN`
   - Создаёт или находит юзера (email = `tg-<telegram_id>@aihub.telegram`)
   - Триггер БД даёт 100 welcome bonus токенов (только для новых)
   - Создаёт session row + ставит cookie `__Secure-authjs.session-token`
   - Редиректит на `/play/nano-banana-2` (или `start_param` если есть)
5. Юзер пользуется playground'ом внутри Telegram WebView

## Команды бота

| Команда | Что делает |
|---|---|
| `/start` | Welcome + кнопка «Открыть AI Hub» |
| `/app` | То же что `/start` |
| `/banana` | Кнопка с deep-link на `/play/nano-banana-2` |
| `/balance` | Баланс токенов юзера (если уже регистрировался) |
| `/history` | Последние 5 генераций |
| `/help` | Справка по командам и ценам |

## Конфиг бота (через Bot API)

Все 4 настройки применены 2026-05-19:

| Endpoint | Что устанавливает |
|---|---|
| `setChatMenuButton` | Web App button `🎨 Открыть AI Hub` → `/tma` |
| `setMyCommands` | 6 команд (start, app, banana, balance, history, help) |
| `setMyDescription` | Длинное описание (для страницы бота) |
| `setMyShortDescription` | Короткое (под аватаром в чате) |
| `setWebhook` | URL вебхука + secret_token |

### Переустановить меню/команды

```bash
TOKEN='<TELEGRAM_BOT_TOKEN из .env.production>'
APP_URL=https://aihub-app.46-62-215-11.nip.io/tma

# Menu button
curl -X POST "https://api.telegram.org/bot${TOKEN}/setChatMenuButton" \
  -H "Content-Type: application/json" \
  -d "{\"menu_button\":{\"type\":\"web_app\",\"text\":\"🎨 Открыть AI Hub\",\"web_app\":{\"url\":\"${APP_URL}\"}}}"

# Commands
curl -X POST "https://api.telegram.org/bot${TOKEN}/setMyCommands" \
  -H "Content-Type: application/json" \
  -d '{"commands":[
    {"command":"start",   "description":"🚀 Открыть AI Creative Hub"},
    {"command":"app",     "description":"🎨 Запустить Mini App"},
    {"command":"banana",  "description":"🍌 Nano Banana 2"},
    {"command":"balance", "description":"💰 Баланс токенов"},
    {"command":"history", "description":"📜 Мои генерации"},
    {"command":"help",    "description":"❓ Как это работает"}
  ]}'

# Webhook
WEBHOOK=https://aihub-app.46-62-215-11.nip.io/api/telegram/webhook
SECRET='<TELEGRAM_WEBHOOK_SECRET из .env.production>'
curl -X POST "https://api.telegram.org/bot${TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"${WEBHOOK}\",\"secret_token\":\"${SECRET}\",\"allowed_updates\":[\"message\"]}"

# Snapshot
curl -s "https://api.telegram.org/bot${TOKEN}/getWebhookInfo"
```

## Env vars (в .env.production)

| Var | Что |
|---|---|
| `TELEGRAM_BOT_TOKEN` | API token от @BotFather для @aicex_one_bot |
| `TELEGRAM_WEBAPP_URL` | URL Mini App, передаётся в `setChatMenuButton` |
| `TELEGRAM_WEBHOOK_SECRET` | Shared-secret для проверки `X-Telegram-Bot-Api-Secret-Token` |

## Безопасность

- **initData валидация:** server-side HMAC-SHA256 в `src/lib/telegram/validate.ts`
  - secret_key = HMAC(key="WebAppData", message=BOT_TOKEN)
  - calc_hash = HMAC(secret_key, sorted_params_joined_by_newline)
  - Сравнение через `timingSafeEqual`
- **auth_date check:** initData отклоняется если старше 24h
- **Webhook secret:** Telegram присылает X-Telegram-Bot-Api-Secret-Token header, проверяем match
- **Cookie:** `SameSite=None; Secure; HttpOnly` — обязательно для Telegram WebView (cross-origin)
- **Synthetic email:** `tg-<telegram_id>@aihub.telegram` — гарантирует UNIQUE constraint Auth.js не конфликтует с реальными email'ами

## Тестирование

1. Открыть https://t.me/aicex_one_bot
2. Нажать «🎨 Открыть AI Hub» в меню — должен открыться `/play/nano-banana-2`
3. В чате с ботом `/balance` — должно показать текущий баланс
4. `/history` — 5 последних jobs

## Файлы

| Путь | Что |
|---|---|
| `src/lib/telegram/validate.ts` | HMAC валидация initData |
| `src/lib/telegram/api.ts` | wrapper вокруг Bot API (sendMessage, webAppButton) |
| `src/app/api/auth/telegram/route.ts` | initData → session cookie |
| `src/app/api/telegram/webhook/route.ts` | Команды бота |
| `src/app/tma/page.tsx` | Entry page Mini App |
| `src/app/tma/TmaBoot.tsx` | Client — TG SDK + auth + redirect |
