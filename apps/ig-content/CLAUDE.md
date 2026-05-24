# CLAUDE.md — ig-content (Instagram Serial Content Automation System)

Standalone Next.js 14 app (own `package.json`, not a root workspace). Serial
Instagram content OS: campaigns → AI plan → Reels/carousel generation →
status tracking → metrics → AI analytics.

## Architecture

- **App Router** under `src/app`:
  - `(auth)/login`, `(auth)/signup` — Supabase email/password auth.
  - `(app)/*` — authenticated shell (sidebar). Routes: `dashboard`,
    `campaigns`, `campaigns/[id]`, `content/[dayId]`, `analytics`.
  - `api/*` — route handlers (see endpoint map below).
  - `auth/callback`, `auth/signout` — session exchange / logout.
- **Auth + RLS**: `src/middleware.ts` → `src/lib/supabase/middleware.ts`
  refreshes the session and redirects unauthenticated users to `/login`.
  Server queries use `src/lib/supabase/server.ts`; the browser client is
  `src/lib/supabase/client.ts`. Every table is row-level-security scoped to
  `auth.uid()` (see `supabase/migrations/001_init.sql`), so most routes rely
  on RLS rather than manual ownership checks.
- **AI layer**: `src/lib/anthropic.ts` (client + `extractJson`), `src/lib/agents.ts`
  (the 5 agents). All agent calls are persisted to `ai_outputs`.
- **Analytics**: `src/lib/analytics.ts` — `fetchMetrics` (RLS-scoped join) +
  `summarize` produce the dashboard/analytics aggregates.
- **UI**: hand-written shadcn-style primitives in `src/components/ui` (no Radix
  dependency). Dark + amber theme via CSS vars in `globals.css`.

## Conventions

- UI strings in Russian, identifiers/comments in English (matches monorepo).
- Icons: `lucide-react`, no emojis in UI.
- Client components start with `'use client'`.
- Arrays (hooks, structure, hashtags) are edited as newline/space text and
  split on save.

## Endpoint map

```
GET/POST              /api/campaigns
GET/PUT/DELETE        /api/campaigns/:id
GET                   /api/campaigns/:id/days
POST                  /api/campaigns/:id/generate-plan        (Strategist)
GET/PUT               /api/content-days/:id
POST                  /api/content-days/:id/generate-reels    (Reels + Visual)
POST                  /api/content-days/:id/generate-carousel (Carousel)
POST                  /api/content-days/:id/metrics
GET/PUT               /api/reels/:id
GET/PUT               /api/carousels/:id
GET                   /api/analytics
POST                  /api/analytics/analyze                  (Analytics)
```

## Gotchas

- `generate-plan` deletes and replaces all `content_days` for the campaign.
- `generate-reels` / `generate-carousel` upsert a single row keyed on
  `content_day_id` (regeneration overwrites).
- AI generation failures return HTTP 502 with the spec's exact message
  ("Content generation failed. Please try again.").
- Dev server runs on port **3010** to avoid clashing with `transcribe` (3000).
- Not wired into the root `npm` workspaces — run `npm install` inside this dir.
