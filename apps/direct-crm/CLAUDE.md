# direct-crm — CLAUDE.md

«CRM Директа» — `direct-crm.aicex.club`. **Хозяин — Богдан, РОП** (в офисе hq2: `HEAD_CONTENT.sales.products`
в `apps/hq-office/agent-content.js`; работает с ней агент «Переписки» `chats`). Источник переписок — ChatPlace, где
работает ИИ-менеджер Директа (аккаунты @ilia.paliy и @paliy_ilya) и Telegram-боты. CRM сама в Директ не отвечает —
только когда человек пишет из неё.

- `server.mjs` — HTTP (статика `public/` + `/api/*`) и цикл раз в `SYNC_SEC` (60 с): синхронизация → разбор.
- `lib/chatplace.mjs` — ChatPlace через его MCP-сервер (JSON-RPC по HTTP, своя `user-agent`, иначе 403). Подключение —
  сервер `chatplace` из mcp-config офиса (`HQ_RUNNER_MCP_JSON` → `CHATPLACE_MCP_JSON`). Инструменты: `chats_list`,
  `chats_get`, `chats_messages` (чтение), `chats_open` / `chats_send_message` / `chats_close` (действия менеджера).
- `lib/sync.mjs` — `chats_list` (новые сверху) до водяного знака (`meta.watermark`; первый проход — `BACKFILL_DAYS` назад),
  у изменившихся чатов — сообщения страницами до первого известного. Ничего не удаляет: CRM — архив переписок.
  Ответ из CRM сохраняется сразу с id `crm-…`; когда ChatPlace вернёт его, id заменяется настоящим (без дублей).
- `lib/analyze.mjs` — Claude (`CRM_MODEL`, по умолчанию `claude-opus-5-5`, effort low, структурированный JSON) читает
  чат, когда в нём новые сообщения и он молчит `quietSec` (90 с — ИИ ChatPlace успевает ответить): `priority`
  (hot «Готов купить» / human «Нужен человек» / normal / low), `stage` (new/warm/hot/customer/lost — этап, поставленный
  вручную, не перезаписывает), `source` (кодовое слово), `summary`, `next_step`, `ai_score` 1–5 и `ai_issues` (типы — `ISSUE_TYPES`).
  Ошибка разбора чата — повтор не раньше чем через 30 мин.
- `lib/api.mjs` — очередь (`view=queue`: готовые купить и «нужен человек», плюс все, кто ждёт ответа больше 10 мин;
  кроме «разобранных» до нового сообщения клиента), все / мои, переписка, действия `take` / `release` / `reply` /
  `stage` / `priority` / `review` / `refresh`, отчёты `/api/stats?days=` (воронка, источники, оценки ИИ, ошибки, по дням,
  медиана ответа менеджера). Каждое действие — строка в `events` (кто и что).
- `lib/auth.mjs` — вход по логину и паролю: `bogdan` (`CRM_BOGDAN_PASSWORD`), `ilia` (`CRM_OWNER_PASSWORD`), или
  `CRM_USERS_JSON`. Подписанная кука `dcrm` на 30 дней, 10 неверных попыток с адреса — пауза 15 мин.
- `lib/db.mjs` — `node:sqlite` (Node ≥ 22.13), файл `DATA_DIR/crm.sqlite`: `chats`, `messages`, `events`, `meta`.
- `public/index.html` — одна страница без сборки: Очередь · Все · Мои · Воронка · Качество ИИ; на телефоне — нижние вкладки.
- `check.mjs` — проверка с поддельными ChatPlace (MCP по HTTP) и Claude; идёт в каждом деплое (`npm run check`).

Деплой: `.github/workflows/deploy-direct-crm.yml` → `deploy/server.sh` (образ `aicex-direct-crm:<релиз>`, контейнер в сети
`edge`, данные `/opt/direct-crm/data`, копия базы перед каждым запуском в `/opt/direct-crm/backup`, 7 последних,
блок `/opt/edge/sites/direct-crm.caddy`). Локально: `npm install && CRM_BOGDAN_PASSWORD=x npm start` → `:8795`
(без `CHATPLACE_MCP_JSON` показывает, что уже есть в базе).
