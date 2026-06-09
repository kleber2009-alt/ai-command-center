# Architecture — Club Der Denker

Design rationale for the course engine. Maps each spec section to its
implementation and explains the non-obvious decisions.

## 1. Tech stack choice

The tender is open on technology. We align with the monorepo's existing,
proven stack to keep operational cost low and reuse deploy patterns:

- **Backend + admin: Next.js 14 (App Router) + Postgres/Supabase** — same as
  `ig-content` and `ai-hub`. One deployable serves both the REST API (route
  handlers) and the admin panel (server components). `output: 'standalone'`
  for a slim Docker image, matching the rest of `infra`.
- **Mobile: Expo / React Native** — a single codebase ships iOS + Android
  (spec 2 allows cross-platform), with `react-native-iap` for store billing and
  `expo-localization` for device language.
- **DB: Postgres** — relational integrity fits the strict invariants (exactly
  4 items/day, unique progress rows, purchase idempotency).

The engine logic is isolated in `backend/src/lib/engine/` as **pure functions**
so it is unit-testable without a DB and could later be shared with the client.

## 2. Data model (`supabase/migrations/0001_init.sql`)

- `cdd_users` — single table for the lead→user lifecycle (`status`:
  guest/lead/active/blocked). The anonymous funnel writes a `lead` (email only);
  step 7 sets `password_hash` and promotes to `active`. Progress, streak, joker
  and the community window are columns here for cheap reads.
- `cdd_items` + `cdd_item_translations` — content is content-agnostic and
  localized per row. DB constraints enforce the spec's hard shape: course items
  have `global_order 1..112`, `day_index 1..28`, `day_slot 1..4`, all unique.
- `cdd_progress` — one row per answered item (`unique(user_id,item_id)` makes
  answers idempotent). Stores `local_day` + `local_tz` so the unlock check is
  reproducible on the server.
- `cdd_feed_*` — admin-authored, localized, category-filtered, read-only.
- `cdd_purchases` + `cdd_iap_webhooks` — validated receipts and raw webhook log
  (idempotency + audit). **No card data** — only opaque store transaction ids.

## 3. The engine (binding rules)

### Levels — `levels.ts`
Driven solely by `items_completed`. Thresholds: 25% → item 28, 50% → item 56.
`purchased` separates L1 (guest) from L2 ("right after purchase"). Correctness
and time are explicitly ignored.

### Time-lock — `unlock.ts`
The decision is "is a fresh pack available?". Mid-pack (`itemsCompleted % 4 ≠ 0`)
is always open. At a pack boundary, the next pack opens only when the user's
current **local day** (computed via `Intl.DateTimeFormat` with the device's
IANA tz) is strictly later than the local day of the last completion. This:
- handles arbitrary tz changes (the client sends its tz with every request);
- is enforced server-side in `POST /course/answer` (HTTP 423 when locked) so a
  tampered client cannot bypass it.

### Streak + joker — `streak.ts`
`registerActivity` runs on each completion; `applyInactivitySweep` is meant for
a daily cron at the user's local midnight. The joker absorbs exactly one missed
day (streak preserved); any further miss, or a ≥2-day gap, resets the streak to
0. The reset returns a new streak state only — **`items_completed` is never
touched**, satisfying the spec's critical rule.

### Community — `community.ts`
Access = within the 28-day window OR an active subscription. Final level (5)
locks the feed even inside the window; an active subscription overrides the
final-level lock. Returns `showPaywall` so the client swaps the feed for the
subscription window.

### IAP — `iap.ts`
`applyValidatedReceipt` is the single choke point that upserts a purchase and
flips access flags (and grants the joker + opens the 28-day window on first
course purchase). Provider-specific signature/receipt verification is stubbed
in the webhook routes (`/api/iap/{apple,google,web}`) and is the main
production TODO.

## 4. Funnel (spec 3.1) — client-driven, server-recorded

The strict order lives in `mobile/src/navigation/index.tsx`. The app opens
directly on the first free item (no splash/registration). Free answers and the
A/B branch are posted as anonymous `cdd_lead_events` keyed by a device id until
the email is captured at step 5 (before any price). Payment (step 6) precedes
account creation (step 7), enforced server-side: `/auth/register` refuses unless
an active `course_access` purchase exists.

## 5. Non-functional

- **Offline (spec 5)** — `mobile/src/cache/offline.ts` persists the current
  4-item pack and queues answers; they sync when connectivity returns.
- **i18n (spec 5)** — 6 locales; device language by default with an instant
  in-profile override (`mobile/src/i18n`). API content is localized per row.
- **Security/GDPR** — HTTPS only; scrypt password hashing; soft-delete + PII
  scrub on account deletion; service-role key server-only; no card data stored.

## 6. Admin (spec 6)

Next.js server-component panel: dashboard (content completeness, users, leads,
email→purchase conversion), course content grid (28×4 + free + case across
locales), feed post editor, user management, leads table. CRUD endpoints
(`/api/admin/*`) and admin auth are scaffolded as the next step.

## Production gaps (tracked in README)

Real IAP verification · social auth · local-midnight inactivity cron · asset
storage · production auth provider · admin CRUD wiring · Docker/Caddy deploy.
