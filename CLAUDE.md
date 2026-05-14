# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Next.js dev server (default :3000)
npm run build    # production build
npm start        # serve the production build
npm run lint     # next lint
```

No test runner is configured.

## Required environment variables

The app fails silently / falls back to demo data when these are missing — set them in `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — used by the browser client in `src/lib/supabase.ts`.
- `SUPABASE_SERVICE_KEY` — used **only** by the server route `src/app/api/metrics/route.ts`. Do not expose this to the client.
- `ANTHROPIC_API_KEY` — used by `src/app/api/command/route.ts` to call `api.anthropic.com`. Without it, the route returns a single fallback task with a setup-error message.

## Architecture

Next.js 14 App Router + React 18 + TypeScript + Tailwind. UI strings are Russian; comments/identifiers stay English. Path alias `@/* → src/*` (`tsconfig.json`). Dark mode is forced at the HTML root (`<html className="dark">` in `src/app/layout.tsx`); there is no light theme.

**Routing**: `src/app/page.tsx` redirects `/` → `/dashboard`. All authenticated-style pages live under the `(dashboard)` route group, which provides the fixed sidebar shell (`src/app/(dashboard)/layout.tsx`). The route group does not add a URL segment — pages render at `/dashboard`, `/team`, `/tasks`, etc.

**Page status**: Only `/dashboard` is implemented. `/team`, `/tasks`, `/metrics`, `/briefing`, `/settings` are placeholder stubs (`"В разработке"`). When asked to "build out X page", you are starting from an empty stub — use `dashboard/page.tsx` as the style reference (slate-800/50 cards with `border-slate-700/50`, JetBrains Mono for numerics, `animate-slide-in` wrapper).

**The dashboard cycle** (`src/app/(dashboard)/dashboard/page.tsx`):
1. On mount, `loadMetrics()` GETs `/api/metrics`. On failure it falls back to hardcoded demo data — don't remove this fallback unless the user explicitly asks.
2. "Запустить команду" button calls `runTeam()`, which loops through `AI_AGENTS` from `src/lib/agents.ts` **sequentially** (not in parallel) with an artificial 800–1400 ms delay per agent to animate the "thinking → done" states. Each iteration POSTs to `/api/command` and accumulates returned tasks into local state.

**Two API routes**:
- `GET /api/metrics` — server-side Supabase query using the service key. Reads `users`, `progress` (status='completed'), `subscriptions` (status='active') and computes MRR from `planPrices = { pro: 29, builder: 79, architect: 199 }`. Several outputs (`achieved`, `monthGoal`, `dailyNeeded`, `goalPercent`) are currently **hardcoded** — they are not yet derived from real data.
- `POST /api/command` — proxy to Anthropic Messages API (`claude-haiku-4-5-20251001`, `max_tokens: 300`). Request body is `{ agentId }`. The route picks a Russian prompt from `AGENT_PROMPTS` keyed by `agentId` and instructs the model to return **only** a JSON array of `{text, impact}`. The parser strips markdown fences before `JSON.parse` — keep that defense if you change the prompt.

**Supabase schema assumed by the code** (no migrations in repo):
- `users(last_active: timestamptz, ...)` — "active 7d" filters `last_active > now()-7d`.
- `progress(status: text, ...)` — completion rate counts `status='completed'`, and the denominator assumes **26 lessons per user** (`users.length * 26`). Update this constant if the curriculum changes.
- `subscriptions(status: text, plan: 'pro'|'builder'|'architect')` — MRR is `$29/$79/$199` per active sub.

**Two metrics implementations exist**: `getMetrics()` in `src/lib/supabase.ts` (client-side, anon key) and the `GET /api/metrics` route (server-side, service key). The dashboard uses the route; `getMetrics` is currently unused. Prefer extending the route — don't add new callers of the client-side `getMetrics` without a reason, since RLS on `subscriptions` would likely block it.

**AI agent registry**: `src/lib/agents.ts` exports `AI_AGENTS` (id, emoji, name, role, color). The `id` is the contract between the registry, the prompt map in `/api/command`, and the agent-status state in the dashboard — keep them in sync when adding/removing agents.

## Conventions

- Client-only React components must start with `'use client'`. The dashboard layout and page do; route handlers and `src/lib/supabase.ts` do not.
- Icons come from `lucide-react`; emojis are used as agent/category markers (kept in `AI_AGENTS` and the `BRIEFING` constant).
- The `BRIEFING` block on the dashboard is hardcoded demo content, not fetched. When wiring it to real data, replace the constant rather than reading from it.
- `next.config.js` is empty — no custom image domains, headers, or rewrites. Add them here if needed rather than via middleware.
- The model identifier `claude-haiku-4-5-20251001` is the production target; the version string visible in the sidebar footer (`claude-sonnet-4-6`) is cosmetic and out of sync — update both if you change models.
