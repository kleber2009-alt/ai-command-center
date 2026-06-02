# CLAUDE.md — Club Der Denker

Universal **course engine**: native mobile app (iOS + Android) + backend + DB +
admin. Drives a time- and progress-gated interactive learning program. This is
a content-agnostic engine — no course content lives in the repo.

> Source spec: `Technisches Lastenheft RU v1.2` (confidential tender). The
> engine rules below are the binding interpretation of that spec.

## Layout

```
apps/club-der-denker/
├── backend/        # Next.js 14 (App Router) — REST API + admin panel. Port 3020.
│   └── src/
│       ├── app/api/        # public + admin API routes
│       ├── app/admin/      # admin panel (dashboard, content, posts, users, leads)
│       └── lib/engine/     # ⭐ core business logic (levels, unlock, streak, community, iap)
├── mobile/         # Expo / React Native — funnel + course + feed + profile
│   └── src/
│       ├── screens/        # funnel order: Funnel→Case→Branch→[Objection|Email]→Paywall→Register→Course
│       ├── components/     # ItemCard = display→input→feedback mechanic
│       ├── api/ store/ cache/ i18n/
└── supabase/migrations/    # Postgres schema (cdd_* tables)
```

## The engine (binding rules — all in `backend/src/lib/engine/`)

| Module | Rule (spec) |
|---|---|
| `levels.ts` | 112 items, 4/day × 28 days. Levels by **progress only** (not correctness/time): L1 guest · L2 after purchase/4th item · L3 at 25% (28) · L4 at 50% (56) · L5 after all 112. |
| `unlock.ts` | Next pack of 4 unlocks at **00:00 local device tz**. Mid-pack always open. Backend re-checks on every answer; client sends IANA tz each request. |
| `streak.ts` | One-time **joker** granted on purchase. 1 skipped day → joker consumed, streak preserved. Skip with no joker, or ≥2 days at once → streak resets to 0. **Reset never touches `items_completed`.** |
| `community.ts` | Read-only feed. 28-day access window from purchase; final level (5) or window-end locks it → subscription paywall; active subscription overrides. |
| `iap.ts` | Apple/Google receipt validation → access flags. No card data ever stored (PCI-DSS via stores). Web-fallback gateway supported. |

Engine modules are pure/unit-tested: `cd backend && npm test`.

## Funnel order (spec 3.1 — strict, do not reorder)

1. Direct start, no splash → 2. three anonymous free items → 3. case →
4. binary A/B (A=objection screen, B=progress) → 5. **email only**, before any
price → 6. paywall/IAP → 7. set password (lead → user) after confirmed payment.

## When changing this app

- Business rule change → edit `backend/src/lib/engine/*` **and** its test.
- New API → `backend/src/app/api/**`; admin UI → `backend/src/app/admin/**`.
- Mobile flow → `mobile/src/screens/**`; keep funnel order intact.
- Schema → add a new `supabase/migrations/NNNN_*.sql` (never edit applied ones).

## Tech stack (monorepo-aligned)

Next.js 14 + Supabase/Postgres (like `ig-content`, `ai-hub`) for backend+admin;
Expo React Native for mobile. i18n: 6 locales (de/en/ru/es/fr/it). Auth: scoped
scrypt + signed tokens in the scaffold — swap for Auth.js/Supabase Auth in prod.

## Status

**Scaffold** (structure + verified engine + API/admin/mobile skeletons). Not yet
deployed; not in Command Center. See `README.md` for run steps and the
open TODOs (real IAP verification, social auth, cron inactivity sweep, asset
storage, deploy).
