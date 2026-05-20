# Persona Studio

AI Avatar Content Studio — MVP.

Upload one photo → get 10 cinematic AI avatars → pick one → turn it into a viral
Instagram carousel cover. HeyGen talking-head is wired into the architecture but
disabled in this MVP.

## Stack

- Next.js 15 (App Router), React 18, TypeScript
- Tailwind CSS
- Prisma ORM → PostgreSQL
- NextAuth (Google + Email magic link)
- BullMQ + Redis (image generation queue)
- Cloudflare R2 (S3 SDK) for image storage
- Gemini Image API (`gemini-3.1-flash-image-preview`, aka Nano Banana 2)

## Development

```bash
# from monorepo root
npm install
npm run dev -w apps/persona-studio
```

Defaults to `http://localhost:3001`. Without `GEMINI_API_KEY` the image
backend returns a 1×1 placeholder PNG so the full pipeline still runs
end-to-end.

### Required env

Copy `.env.example` to `.env.local` and fill in:

- `DATABASE_URL` — PostgreSQL connection string
- `NEXTAUTH_URL`, `NEXTAUTH_SECRET`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (for Google sign-in)
- `GEMINI_API_KEY` (image generation; falls back to stub if missing)
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`,
  `R2_PUBLIC_BASE_URL`
- `REDIS_URL`

### Database

```bash
npm run prisma:generate -w apps/persona-studio
npm run prisma:migrate  -w apps/persona-studio -- --name init
```

### Workers

In production, run the BullMQ workers as separate processes:

```bash
npm run worker:avatar -w apps/persona-studio
npm run worker:cover  -w apps/persona-studio
```

## Routes

| Path               | Purpose                                  |
| ------------------ | ---------------------------------------- |
| `/`                | Landing page                             |
| `/generate`        | Upload + start avatar batch              |
| `/avatars`         | Gallery of generated avatars             |
| `/covers`          | Carousel cover editor + history          |
| `/dashboard`       | Account summary                          |
| `/billing`         | Token packs + ledger                     |
| `/admin`           | Admin (email allow-list via `ADMIN_EMAILS`) |

## API

| Method | Path                       | Purpose                              |
| ------ | -------------------------- | ------------------------------------ |
| POST   | `/api/upload`              | Upload source photo to R2            |
| POST   | `/api/generate-avatars`    | Enqueue avatar batch (10 styles)     |
| GET    | `/api/avatars`             | List avatars (optional `generationId`) |
| POST   | `/api/select-avatar`       | Mark avatar as primary               |
| POST   | `/api/generate-cover`      | Enqueue carousel cover               |
| GET    | `/api/generations/[id]`    | Poll generation status               |
| GET    | `/api/me`                  | Current user + token balance         |

## Token economics

| Action            | Cost (tokens) | Env override                |
| ----------------- | ------------- | --------------------------- |
| Sign-up grant     | 10            | `TOKENS_FREE_BALANCE`       |
| 10-avatar batch   | 10            | `TOKENS_AVATAR_GENERATION`  |
| Carousel cover    | 3             | `TOKENS_COVER_GENERATION`   |

Failed generations refund their cost automatically.

## Out of MVP scope

HeyGen video, AI reels, voice, content planner, marketplace, team accounts,
mobile app, LoRA training, in-app AI assistant. Architecture (queue, storage,
generation table) is shaped so these slot in without rework.
