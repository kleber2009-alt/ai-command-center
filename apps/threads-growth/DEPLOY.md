# DEPLOY — AI Threads Growth Agent

Деплой на Hetzner идёт через GitHub Actions → SSH (как у остальных апп монорепо):
workflow `.github/workflows/deploy-threads-growth.yml` дёргает общий
`deploy-ssh` экшен, тот пуллит репо на прод (`/root/ai-command-center`), пишет
`/etc/threads-growth.env` и поднимает контейнеры через `docker-compose.yml` апп.

Контейнеры: `threads-growth-db` (pgvector), `threads-growth-api` (FastAPI :8088),
`threads-growth-bot` (Telegram-апрув).

## Триггеры деплоя

- **push в `main`** по путям `apps/threads-growth/**` (автодеплой), **или**
- **workflow_dispatch** (ручной запуск, можно указать `ref` = ветка/коммит).

> Workflow виден Actions только когда файл есть в `main`. Поэтому первый шаг —
> влить ветку в `main` (через PR). До слияния задеплоить нельзя даже вручную.

## Что должен сделать человек до первого деплоя

### 1. GitHub Secrets (Settings → Secrets and variables → Actions)

| Secret | Обязателен | Зачем |
|---|---|---|
| `HETZNER_SSH_KEY` | уже есть | SSH на прод |
| `THREADS_GROWTH_TOKEN_ENCRYPTION_KEY` | да | шифрование access_token аккаунтов (Fernet) |
| `THREADS_GROWTH_ANTHROPIC_API_KEY` | да* | анализ / генерация / реплаи |
| `THREADS_GROWTH_APIFY_TOKEN` | да* | дискавери |
| `THREADS_GROWTH_APIFY_THREADS_ACTOR` | да* | актор скрейпа Threads (+ `_TWITTER_ACTOR`, `_REDDIT_ACTOR` опц.) |
| `THREADS_GROWTH_VOYAGE_API_KEY` | опц. | эмбеддинги/дедуп (иначе лексический фолбэк) |
| `THREADS_GROWTH_TELEGRAM_BOT_TOKEN` | да** | бот-апрув |
| `THREADS_GROWTH_OWNER_TELEGRAM_ID` | да** | владелец бота |
| `THREADS_GROWTH_DB_PASSWORD` | опц. | пароль выделенной БД (по умолч. `threads_viral`) |

Fernet-ключ: `python -c "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())"`.

\* без них контейнер поднимется (health OK), но пайплайн не сможет
скрейпить/генерировать — внешние вызовы упадут с понятным сообщением.
\** без них сервис `bot` завершится с понятным сообщением (api продолжит работать).

### 2. Threads Graph API (готовится отдельно, долгий пункт)

Для публикации/реплаев/инсайтов по СВОИМ аккаунтам нужны:
- IG **Professional** аккаунт, привязанный к Threads;
- Meta-приложение + **app review** на scopes: `threads_basic`,
  `threads_content_publish`, `threads_read_replies`, `threads_manage_replies`,
  `threads_manage_insights`, `threads_keyword_search`, `threads_manage_mentions`,
  `threads_share_to_instagram`;
- долгоживущий **access_token** на каждый аккаунт-персону.

Токены заводятся через `POST /api/accounts` (шифруются на лету). До этого
discovery/scoring/generation/бот работают, а publishing/insights — нет.

### 3. Caddy (прод-роут, ручной шаг на боксе)

Добавить в `/etc/caddy/Caddyfile` (с бэкапом) и `caddy reload`:

```
threads.46-62-215-11.nip.io {
    reverse_proxy localhost:8088
}
```

### 4. n8n-кроны

Импортировать расписание из `README.md` (§14): n8n вызывает
`docker compose -f apps/threads-growth/docker-compose.yml run --rm api \
python -m app.workers.<...>` по таймингам.

## Запуск деплоя

После слияния в `main` и проставленных секретов — автодеплой по push, либо
вручную: **Actions → deploy-threads-growth → Run workflow** (ref = `main` или ветка).

Workflow сам: build → `up -d db` → `alembic upgrade head` → `up -d api bot` →
health-check `http://localhost:8088/health`.

## Откат

```bash
ssh prod
cd /root/ai-command-center
git checkout <предыдущий_коммит>
cd apps/threads-growth && docker compose up -d --force-recreate api bot
```
БД-миграции forward-only; для отката схемы — `docker compose run --rm api alembic downgrade -1`.

## Альтернатива по БД

По умолчанию — выделенный контейнер `threads-growth-db`. Можно переключить на
общий `aisales-postgres` (отдельная БД `threads_growth` + роль `threads_viral`):
тогда в секретах задать `DATABASE_URL` на него, убрать сервис `db` из compose и
создать БД/роль (write в прод-БД — **требует явного аппрува**, см. корневой CLAUDE.md).
```
