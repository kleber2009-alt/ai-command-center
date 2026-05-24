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
POST                  /api/campaigns/:id/generate-plan        (Strategist + RAG)
GET/PUT               /api/content-days/:id
POST                  /api/content-days/:id/generate-reels    (Reels + Visual + RAG)
POST                  /api/content-days/:id/generate-carousel (Carousel + RAG)
POST                  /api/content-days/:id/metrics           (+ auto-ingest to library)
GET/PUT               /api/reels/:id
GET/PUT               /api/carousels/:id
GET                   /api/analytics
POST                  /api/analytics/analyze                  (Analytics)
POST                  /api/feedback                           (1-5 rating + tags)
GET/POST              /api/learnings                          (list / weekly summary)
GET/POST              /api/library
DELETE                /api/library/:id
```

## Self-learning subsystem (migration 002)

The agents improve via knowledge base + RAG + metrics + feedback + weekly
learnings — no fine-tuning. Tables: `content_library` (pgvector embeddings),
`feedback`, `agent_learnings`, `generation_logs`.

- **Embeddings**: `src/lib/embeddings.ts` — OpenAI `text-embedding-3-small`
  (1536 dims, matches the `vector()` column). Returns `null` (and the system
  degrades gracefully) in demo mode, without `OPENAI_API_KEY`, or on error.
- **Scoring**: `src/lib/scoring.ts` `performanceScore()` mirrors the SQL
  `calc_performance_score()` — weights saves/shares/follows/leads above views.
- **RAG**: `src/lib/knowledge.ts` `retrieveContext()` builds the generation
  context (top-5 + bottom-3 similar via `match_content_library` RPC, brand
  rules, learnings, negative-feedback tags). When embeddings are off it falls
  back to performance-score ranking. Injected into the Strategist/Reels/Carousel
  prompts via the `ragContext` arg in `src/lib/agents.ts`.
- **Learning engine**: `src/lib/learnings.ts` `runWeeklyLearning()` condenses
  recent metrics + feedback into `agent_learnings` (triggered from `/analytics`).
- **Auto-grow**: posting metrics upserts the published unit into
  `content_library` with its score + embedding (`ingestPublishedContent`).
- **UI**: `/library` (knowledge base), feedback widget in the editors, agent
  memory + weekly-learning button on `/analytics`.

## Gotchas

- `generate-plan` deletes and replaces all `content_days` for the campaign.
- `generate-reels` / `generate-carousel` upsert a single row keyed on
  `content_day_id` (regeneration overwrites).
- AI generation failures return HTTP 502 with the spec's exact message
  ("Content generation failed. Please try again.").
- Dev server runs on port **3010** to avoid clashing with `transcribe` (3000).
- Not wired into the root `npm` workspaces — run `npm install` inside this dir.

## Deploy

Standalone Docker container + Caddy on Hetzner; Supabase Cloud for DB/Auth.
Full runbook in `DEPLOY.md`. Artifacts: `Dockerfile` (build context = this
dir, multi-stage standalone), `docker-compose.yml`, `deploy/Caddyfile.snippet`,
`.env.production.example`. Public URL: `igcontent.46-62-215-11.nip.io` → host
port 3010.

Gotcha: `NEXT_PUBLIC_*` (Supabase URL + anon key) are inlined at **build**
time and passed as compose build args; changing them requires
`docker compose up -d --build`, not just a restart.
