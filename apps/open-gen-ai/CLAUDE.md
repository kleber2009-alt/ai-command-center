# CLAUDE.md — Open Generative AI

Open-source Next.js 15 студия для image/video/lipsync генерации через
[Muapi.ai](https://muapi.ai). Полностью stateless — никакой БД, никаких
аккаунтов, никаких серверных ключей: каждый юзер приносит свой
Muapi API key, который живёт только в его browser `localStorage`.

Upstream: `https://github.com/Anil-matcha/Open-Generative-AI` (форкаем
вручную, без git submodule — три зависимых репозитория встроены как
обычные файлы).

## Архитектура

```
apps/open-gen-ai/
├── app/                      # Next.js 15 App Router
│   ├── layout.js             # root layout
│   ├── page.js               # рендерит <StandaloneShell> из packages/studio
│   └── globals.css
├── components/
│   ├── ApiKeyModal.js        # принимает Muapi key, кладёт в localStorage
│   └── StandaloneShell.js    # entry, лениво подключает studio components
├── middleware.js             # /api/v1/* → https://api.muapi.ai (rewrite)
├── next.config.mjs           # transpilePackages: studio, ai-agent,
│                             #                    workflow-builder, design-agent
├── packages/                 # 4 npm workspaces (фронтенд-пакеты)
│   ├── studio/               # core UI: ImageStudio, Header, AuthModal
│   ├── Vibe-Workflow/packages/workflow-builder/   # node-based workflow builder
│   ├── Open-Poe-AI/packages/agents/               # ai-agent (Poe-style chat)
│   └── Open-AI-Design-Agent/packages/design-agent/ # дизайн-агент на canvas
├── electron/                 # Electron-обёртка (desktop installer)
├── src/                      # vite-bundled standalone версия (.dmg/.exe/.deb)
├── public/banner.png         # лого / иконка приложения
├── Dockerfile                # multi-stage: deps → builder → runner (npm start)
└── docker-compose.yml        # standalone build (port 3001:3000)
```

## Поток запросов на генерацию

1. Пользователь открывает студию → `<ApiKeyModal>` спрашивает Muapi key.
2. Key пишется в `localStorage` (`muapi_api_key`); все последующие
   запросы клиент шлёт на `/api/v1/<model-endpoint>` с заголовком
   `x-api-key`.
3. `middleware.js` ловит `/api/v1/*` и делает `NextResponse.rewrite()`
   на `https://api.muapi.ai/<path>` — заголовки (включая `x-api-key`)
   пробрасываются как есть.
4. Muapi возвращает `request_id` → клиент опрашивает
   `/api/v1/predictions/{id}/result` до `status: completed`.
5. Результат рендерится в `<ImageStudio>` и пишется в localStorage
   (`muapi_history`).

### Что НЕ проксируется через middleware

`middleware.js` исключает три пути и оставляет их Next.js route
handlers (нужны для server-side логики):

- `/api/v1/creative-agent` — `app/api/v1/creative-agent/route.js`
- `/api/v1/get_upload_url` — `app/api/v1/get_upload_url/route.js`
- `/api/v1/upload-binary` — `app/api/v1/upload-binary/route.js`

При добавлении новых server-side роутов добавь их в whitelist в
`middleware.js`.

## Деплой

Стандартный для монорепо паттерн (см. корневой `CLAUDE.md`):

```bash
# на прод-боксе
cd /root/ai-command-center/infra
docker compose up -d --build open-gen-ai
# контейнер слушает 127.0.0.1:3008
```

Затем добавить site-блок из
`infra/snippets/host-open-gen-ai.example.caddy` в
`/etc/caddy/Caddyfile` и:

```bash
sudo caddy reload --config /etc/caddy/Caddyfile
```

Доступ: `https://open-gen-ai.46-62-215-11.nip.io/`.

Зарегистрировать карточку в Command Center:

```bash
docker exec -i aisales-postgres psql -U aisales -d aisales \
  < apps/aisales/db-init/018_open_gen_ai_project.sql
```

## Локальная разработка

Workspaces npm + Next.js dev:

```bash
cd apps/open-gen-ai
npm install            # тянет 4 workspace-пакета
npm run build:packages # собирает studio/workflow-builder/ai-agent/design-agent
npm run dev            # http://localhost:3000
```

Vite-вариант для Electron-сборки — `npm run vite:dev` (используется
только при упаковке desktop-приложения, не в продакшне).

## Известные подводные камни

- **`workflow-builder` vs `react-markdown`.** `workflow-builder` тянет
  `react-markdown ^9.0.0`, а `studio` — `^10.1.0`. В workspace это
  ОК, поскольку каждый пакет получает свою копию через npm hoist.
  Если будем выносить в общий root — может конфликтнуть.
- **Electron `afterPack.js`.** Используется только при `electron:build`
  для подписи и AppArmor-профиля. Не вмешивается в `next build`.
- **`build/local-ai`** — пустой плейсхолдер для бинаря локального
  inference, упакованного в Electron-версию. В Docker-сборке не
  используется.
- **Muapi rate limits** — apps этого не знает и не делает retry.
  Если key исчерпан, юзер увидит ошибку в `<ImageStudio>`.

## Конвенции (наследуем из корневого CLAUDE.md)

- Client-only React components с `'use client'`.
- UI-строки оригинальные (English), не локализую — это форк
  публичного апстрима.
- Иконки: `lucide-react` + `react-icons` (в студии используется
  оба пакета, оставляю как есть).
- `.env*.local` и `.env` не коммитим.
