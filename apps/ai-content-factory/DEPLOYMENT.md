# Deployment — ai-content-factory

Прод-хост: Hetzner CX22, IP `46.62.215.11`, user `aisales`,
рабочий корень `/root/ai-command-center/` (либо `/home/aisales/ai-command-center/`
— проверь, что использует основной `infra/docker-compose.yml`).

## TL;DR

```bash
# на прод-сервере
cd /root/ai-command-center
git pull
cd apps/ai-content-factory

# первая установка
cp config/.env.example .env
nano .env                       # ANTHROPIC_API_KEY, TELEGRAM_*, VOYAGE_API_KEY

# собираем образ и запускаем под именем проекта infra
docker compose -p infra -f docker-compose.yml build
docker compose -p infra -f docker-compose.yml up -d

# логи
docker logs -f infra-ai-content-factory-1
```

После up-команды контейнер появится в `docker ps` как
`infra-ai-content-factory-1` рядом с остальными `infra-*`.

## Что внутри образа

- Node 20 slim (Debian bookworm)
- Системный `chromium` (Puppeteer вызывает его через
  `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`, свой shell не качает)
- Шрифты: `fonts-liberation`, `fonts-dejavu-core`, `fonts-noto-color-emoji`
- `better-sqlite3` + `sqlite-vec` собираются на этапе deps (python3+g++ в build-stage)
- `tini` как PID 1 (нормальный SIGTERM при `docker stop`)

Финальный образ ~280 MB (без node_modules/deps stage).

## Переменные окружения (`.env` рядом с compose)

| Переменная | Обяз. | Что |
|---|---|---|
| `ANTHROPIC_API_KEY` | да | Claude API |
| `VOYAGE_API_KEY` | опц. | Voyage AI embeddings для RAG. Без ключа generation работает без grounding. |
| `TELEGRAM_BOT_TOKEN` | для `--deliver` | бот доставки |
| `TELEGRAM_CHAT_ID` | для `--deliver` | целевой чат |
| `TZ` | опц. | `Europe/Moscow` по умолчанию |
| `MODEL_OPUS` / `MODEL_HAIKU` | опц. | переопределение моделей |

## Тома (persisted state)

- `./data/output` — рендеры карусели (PNG + caption.txt + carousel.json)
- `./data/logs` — JSON-логи пайплайнов и `claude-calls.jsonl`
- `./data/knowledge` — seed-файлы knowledge base
- `./data/factory.db` — SQLite (контент + векторы)

Бэкап `factory.db` — частью существующего `aux_backup.sh` (см. корневой
`CLAUDE.md`, секцию Backups). Добавить путь:

```bash
# в scripts/aux_backup.sh (на проде)
backup_sqlite "/root/ai-command-center/apps/ai-content-factory/data/factory.db" \
  "$tmpdir/ai-content-factory-factory.db"
```

## Phase 5 (cron scheduler) ещё не написан

Текущий `src/index.ts` — просто heartbeat и выход (exit 0). Чтобы контейнер
оставался жив для `docker exec`, в `docker-compose.yml` зашит `command:`
вида `sh -c "node dist/index.js; tail -f /dev/null"` + `restart: "no"`.

Когда `src/scheduler.ts` будет готов, удалить `command:` и сменить
`restart: "no"` → `unless-stopped` (heartbeat будет частью scheduler'а).

Пока scheduler не готов, генерируй через `docker exec`:

```bash
docker exec -it infra-ai-content-factory-1 \
  node dist/cli/carousel.js --rubric hood --topic "Тема" --episode 7 --deliver
```

Когда `src/scheduler.ts` будет готов — заменить `CMD` в Dockerfile на
`["node", "dist/scheduler.js"]` (или просто оставить `index.js`, если
scheduler импортируется оттуда).

## Caddy

Внешний HTTP не нужен — сервис общается только с Anthropic, Voyage и Telegram
исходящими запросами. Никаких записей в `Caddyfile` добавлять **не нужно**.

## Регистрация в Command Center

После того как Phase 5 закроется и контейнер реально начнёт работу — добавить
запись в `apps/command-center` (`projects.json` или его аналог):

```json
{
  "slug": "ai-content-factory",
  "label": "🏭 AI Content Factory",
  "status": "dev",
  "container": "infra-ai-content-factory-1",
  "path": "apps/ai-content-factory"
}
```

## Откат

```bash
docker compose -p infra -f docker-compose.yml down
git checkout HEAD~1 -- apps/ai-content-factory
docker compose -p infra -f docker-compose.yml up -d --build
```

`data/` остаётся на диске.

## Известные ловушки

- **Чёрные слайды** — на проде нет нужного шрифта. Решение: добавить пакет
  в Dockerfile (`fonts-jetbrains-mono` отдельно через apt не лежит — собрать
  COPY-ом из `data/assets/fonts/`).
- **Puppeteer падает на `--no-sandbox`** — Chromium внутри Docker'а требует
  `args: ['--no-sandbox']`. Это уже учтено в `src/renderers/carousel.ts`,
  проверь при апгрейде Puppeteer.
- **`sqlite-vec` версия привязана к `better-sqlite3` major** — поднимаешь
  одно, поднимай другое.
