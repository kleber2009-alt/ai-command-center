# Persona Studio

AI Avatar Content Studio — 1 фото → 10 AI-аватаров → HeyGen-видео или виральная обложка карусели.

Next.js 15 App Router + TS + Tailwind + Prisma (Postgres) + BullMQ (Redis) + S3-compatible storage + Gemini Image API (Nano Banana 2).

## Архитектура

```
persona-studio/
├── prisma/schema.prisma         # User / Upload / AvatarGeneration / Avatar / Cover / Video / TokenTransaction
├── src/
│   ├── app/
│   │   ├── (app)/               # auth-required routes
│   │   │   ├── dashboard/
│   │   │   ├── generate/        # upload → enqueue avatar batch
│   │   │   ├── avatars/         # grid + select + live poll
│   │   │   ├── covers/          # list + /new (cover-form preview live)
│   │   │   └── billing/         # token balance + dev-stub packs
│   │   ├── (auth)/sign-in/      # magic-link form (Auth.js v5)
│   │   └── api/                 # upload, generate-avatars, avatars/:id/select,
│   │                            # generate-cover, covers, billing/balance,
│   │                            # billing/buy-tokens (dev stub)
│   ├── lib/
│   │   ├── auth.ts              # NextAuth v5 + Nodemailer + Google
│   │   ├── prisma.ts
│   │   ├── storage.ts           # S3 client (MinIO / R2 / S3)
│   │   ├── gemini.ts            # Gemini Image API wrapper
│   │   ├── tokens.ts            # charge / refund / credit (atomic tx)
│   │   ├── queue.ts             # BullMQ queues (avatar + cover)
│   │   ├── styles.ts            # 10 avatar styles + prompt fragments
│   │   └── prompts.ts           # avatar + cover prompt builders
│   ├── workers/
│   │   ├── index.ts             # entrypoint (npm run worker)
│   │   ├── avatar-generation.worker.ts
│   │   └── cover-generation.worker.ts
│   └── components/
│       ├── nav.tsx
│       ├── upload-zone.tsx      # client — drop / upload / enqueue
│       ├── avatar-grid.tsx      # client — poll status, select
│       ├── cover-form.tsx       # client — live preview
│       └── billing-actions.tsx  # client — dev token packs
```

## Локальный запуск

### 0. Зависимости

Нужны:
- Node 20+
- Запущенный Postgres (можно использовать тот же `aisales-postgres`)
- Запущенный Redis (можно использовать тот же `aisales-redis`)
- Запущенный S3-совместимый storage (можно использовать тот же `aisales-minio`)
- Локальный SMTP для magic-link — `mailpit` уже крутится в `ai-hub` compose (:8025 web, :1025 SMTP)

### 1. Создать БД

В `aisales-postgres`:
```bash
docker exec aisales-postgres createdb -U aisales persona_studio
```

### 2. Установить deps и сгенерить prisma client

```bash
cd persona-studio
cp .env.example .env
# отредактировать .env: DATABASE_URL, S3_*, GEMINI_API_KEY, AUTH_SECRET (openssl rand -base64 32)
pnpm install                # или npm i
pnpm db:push                # создаст таблицы
```

### 3. Создать S3 bucket

В MinIO:
```bash
docker exec aisales-minio mc mb local/persona-studio-media
docker exec aisales-minio mc anonymous set download local/persona-studio-media
```

### 4. Запустить два процесса

В одной вкладке — web:
```bash
pnpm dev          # localhost:3020
```

В другой — worker:
```bash
pnpm worker       # tsx watch src/workers/index.ts
```

### 5. Войти

Открыть `http://localhost:3020`, ввести email → откроется mailpit (`http://localhost:8025`) с magic-link.

## Прод-деплой (план)

1. БД `persona_studio` в `aisales-postgres` (тот же container).
2. Bucket `persona-studio-media` в `aisales-minio` (или Cloudflare R2 — поменять `S3_*` env).
3. Compose-проект `persona-studio` рядом с `ai-hub` (`docker-compose.yml` + `Dockerfile`).
4. Два контейнера: `persona-studio-web` (:3020) + `persona-studio-worker` (no port).
5. Caddy:
   - `persona.46-62-215-11.nip.io` → статика лендинга (`persona-studio-landing/`).
   - `persona-app.46-62-215-11.nip.io` → `persona-studio-web:3020`.

## Token costs (env-driven)

```
COST_AVATAR_GENERATION=10
COST_COVER_GENERATION=3
COST_HEYGEN_VIDEO=30
SIGNUP_BONUS_TOKENS=10
```

Возврат — автоматический:
- `failed` batch → полный возврат
- `partial` batch (часть аватаров провалилась) → пропорциональный возврат
- `failed` cover → полный возврат

## TODO до GA

- [ ] HeyGen-видео pipeline (`VideoGeneration` модель уже есть, нужны worker + API + UI).
- [ ] Stripe checkout вместо dev-stub в `billing/buy-tokens`.
- [ ] Face-detect / single-person check перед enqueue avatar batch (сейчас — только MIME/size).
- [ ] Moderation layer (consent + NSFW + чужие лица).
- [ ] Admin panel (`/admin` — users / generations / costs / refund).
- [ ] Лимиты на free-плане (1 batch).
- [ ] Watermark на free-плане.
- [ ] E2E тесты (Playwright).
