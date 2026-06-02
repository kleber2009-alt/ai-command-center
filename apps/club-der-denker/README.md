# Club Der Denker

Universal, content-agnostic **course engine** — native mobile app (iOS +
Android) with backend, database and admin panel. A user progresses through a
time- and progress-gated interactive program: a freemium funnel converts
anonymous guests into buyers, then a 112-element / 28-day paid program runs with
streak/joker gamification and a read-only community feed.

This folder is a **scaffold**: the data model, the core engine logic (unit
tested), and the API / admin / mobile skeletons are in place. Content,
production integrations and deploy are TODO.

## Structure

- **`backend/`** — Next.js 14 (App Router). REST API + admin panel. Port `3020`.
- **`mobile/`** — Expo / React Native client.
- **`supabase/migrations/`** — Postgres schema.

## Engine (the heart)

All binding rules live in `backend/src/lib/engine/` and are pure + unit tested:

```bash
cd backend
npm install
npm test          # 14 engine tests: levels, unlock, streak/joker, community
```

- `levels.ts` — 112 items, 4/day × 28 days; levels by progress only (L1..L5).
- `unlock.ts` — next pack unlocks at 00:00 in the device's local time zone.
- `streak.ts` — one-time joker; streak reset never affects course progress.
- `community.ts` — 28-day feed window; final level / expiry → subscription.
- `iap.ts` — store receipt → access flags; no card data stored.

## Run the backend + admin

```bash
cd backend
cp .env.example .env.local        # fill SUPABASE_URL / SERVICE_ROLE / AUTH_SECRET
npm install
# apply supabase/migrations/0001_init.sql to your Postgres / Supabase project
npm run dev                       # http://localhost:3020  (admin at /admin)
```

Key API routes (all under `/api`):

| Route | Purpose |
|---|---|
| `GET /funnel/items` | 3 free items + case (anonymous) |
| `POST /funnel/event` | anonymous funnel telemetry (A/B etc.) |
| `POST /leads` | email capture (step 5) |
| `POST /auth/register` `/login` | account creation (step 7) / login |
| `GET /course/today` | current pack, timezone-gated |
| `POST /course/answer` | record answer → progress/level/streak |
| `GET /feed` | read-only community feed (access-gated) |
| `POST /iap/{apple,google,web}` | receipt webhooks |
| `GET/PATCH/DELETE /profile` | dashboard, locale switch, GDPR delete |

## Run the mobile app

```bash
cd mobile
npm install
# set apiBaseUrl in app.json -> expo.extra.apiBaseUrl
npm start                         # Expo dev server; press i / a for iOS / Android
npm run typecheck
```

The client is a complete frontend:

- **Design system** — `src/theme.ts` (dark tokens) + `src/components/ui.tsx`
  (Screen, Button, Card, Loading, ErrorView) + `gamification.tsx`
  (ProgressBar, LevelBadge, StreakPill, StepDots).
- **Navigation** — auth-gated root (`SessionContext`): unauthenticated funnel
  stack (Funnel→Case→Branch→[Objection|Email]→Paywall→Register, + Login) and
  an authenticated bottom-tab bar (Course / Community / Profile).
- **Screens** — all funnel steps, a returning-user Login (email + Apple/Google
  buttons), Course with a level/streak/progress header + offline cache,
  read-only Feed with subscription paywall, and a Profile dashboard (level
  badge, streak, joker, instant 6-language switch, logout, GDPR delete).
- **i18n** — full UI string set across all 6 locales.

## Admin panel

Gated by a signed httpOnly session cookie (`src/lib/admin-auth.ts`). The first
admin is bootstrapped from `ADMIN_EMAIL` / `ADMIN_PASSWORD` on first login and
persisted to `cdd_admins`. Functional sections:

- **Контент курса** — interactive 28×4 grid; edit body + 3-4 options per locale
  and upload item media (image/video).
- **Лента сообщества** — create / publish / delete posts per locale with media.
- **Пользователи** — list + block / unblock.
- **Лиды / Дашборд** — conversion overview.

Admin CRUD API: `/api/admin/{login,logout,items,posts,users,upload}`. Media is
stored in the public `cdd-media` Supabase Storage bucket (migration 0004).

## Deploy

See `backend/DEPLOY.md`. Dockerfile + `docker-compose.yml` build a standalone
Next server on `:3020`. The inactivity sweep runs via cron hitting
`POST /api/cron/inactivity-sweep` hourly (guarded by `CRON_SECRET`).

## Social sign-in & IAP (end-to-end)

- **Social auth** (`/api/auth/social`): verifies Apple/Google OIDC identity
  tokens against each provider's JWKS (`lib/social-auth.ts`, via `jose`), then
  resolves by provider subject → email → new lead. Client flow in
  `mobile/src/auth/social.ts` (expo-apple-authentication + expo-auth-session),
  wired into the Login screen.
- **IAP** (`/api/iap/verify`): client-initiated, authenticated receipt
  validation — Apple StoreKit2 JWS verification + Google Play Developer API
  (`lib/engine/iap-verify.ts`). Client hook `mobile/src/iap/useIAP.ts` drives
  the course purchase (Paywall, tied to the lead via `appAccountToken` so the
  webhook validates pre-account) and the community subscription (Feed).
- **Async webhooks** (`/api/iap/{apple,google,web}`): each authenticates the
  notification — Apple signed-JWS payload, Google Pub/Sub OIDC token, web HMAC —
  then re-validates and applies the receipt. Source of truth for renewals,
  refunds and pre-account course purchases.

Required env (see `.env.example`): `APPLE_CLIENT_IDS`, `GOOGLE_CLIENT_IDS`,
`GOOGLE_PLAY_PACKAGE_NAME`, `GOOGLE_SERVICE_ACCOUNT_JSON`. Mobile client ids /
SKUs live in `mobile/app.json` → `expo.extra`.

## Open TODOs before production

- Gated (signed-URL) delivery for paid media if the public bucket is too open
  (currently public bucket with unguessable paths — see migration 0004).
- Swap the scaffold session token for Auth.js / Supabase Auth if desired.
- Wire the app into Command Center + a CI deploy workflow.

See `ARCHITECTURE.md` for the full design rationale and `CLAUDE.md` for the
orientation/rules summary.
