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
```

## Open TODOs before production

- Real Apple App Store Server API + Google Play Developer API receipt
  verification (JWS / Pub/Sub) in `lib/engine/iap.ts` + webhook routes.
- Social auth (Google / Apple Sign-In) provider routes.
- Cron **inactivity sweep** at each user's local midnight (`streak.applyInactivitySweep`).
- Media/asset storage for item images/videos (bucket + signed URLs).
- Swap the scaffold auth (scrypt + signed token) for Auth.js / Supabase Auth.
- Admin CRUD wiring (`/api/admin/*`) behind admin auth.
- Dockerfile + compose + Caddy route for deploy.

See `ARCHITECTURE.md` for the full design rationale and `CLAUDE.md` for the
orientation/rules summary.
