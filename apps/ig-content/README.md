# IG Serial Content — Instagram Serial Content Automation System

A serial Instagram content operating system: plan 30/60/90-day campaigns,
generate Reels scripts and carousels with Claude, track production status,
record metrics, and get AI recommendations.

## Stack

- Next.js 14 (App Router) · TypeScript · Tailwind CSS · shadcn-style UI
- Supabase (PostgreSQL + Auth, row-level security)
- Anthropic Claude API (5 content agents)
- Recharts · TanStack Table
- Deploy target: Vercel

## Quick start

```bash
cd apps/ig-content
cp .env.example .env.local   # fill in Supabase + Anthropic keys
npm install
npm run dev                  # http://localhost:3010
```

### Supabase setup

1. Create a Supabase project.
2. Run `supabase/migrations/001_init.sql` in the SQL editor (creates tables,
   the `auth.users → public.users` trigger, and RLS policies).
3. Copy the project URL, anon key and service-role key into `.env.local`.
4. Email/password auth is enabled by default. For local testing you may want to
   disable "Confirm email" in Supabase Auth settings.

## Environment variables

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key (browser + server) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key (reserved for admin tasks) |
| `ANTHROPIC_API_KEY` | Claude API key |
| `ANTHROPIC_MODEL` | Model id, default `claude-sonnet-4-6` |

## End-to-end flow

1. Register / log in.
2. Create a campaign (the default "30 Days With Claude" template is prefilled).
3. **Generate plan** → the Strategist agent writes one `content_days` row per day.
4. Open a day → **Generate Reels** / **Generate Carousel** → edit → set status.
5. After publishing, enter metrics on the day's Metrics tab.
6. **Analyze Performance** on the dashboard / analytics page for recommendations.

## AI agents (`src/lib/agents.ts`)

| Agent | Endpoint |
|---|---|
| Content Strategist | `POST /api/campaigns/:id/generate-plan` |
| Reels Writer + Visual Director | `POST /api/content-days/:id/generate-reels` |
| Carousel Architect | `POST /api/content-days/:id/generate-carousel` |
| Analytics | `POST /api/analytics/analyze` |

All agents return strict JSON, parsed by `extractJson` in `src/lib/anthropic.ts`.
Every invocation is logged to the `ai_outputs` table.
