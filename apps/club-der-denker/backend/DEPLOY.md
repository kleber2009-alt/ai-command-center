# Deploy — Club Der Denker backend + admin

Standalone Next.js app (port `3020`). Aligns with the monorepo's Docker +
Caddy + nip.io setup (see root `CLAUDE.md` → Prod infrastructure).

## 1. Database

Apply migrations (in order) to the GDPR-compliant Postgres / Supabase project
provided by the client:

```bash
psql "$DATABASE_URL" -f ../supabase/migrations/0001_init.sql
psql "$DATABASE_URL" -f ../supabase/migrations/0003_add_user_tz.sql
# optional structural scaffold (no content):
psql "$DATABASE_URL" -f ../supabase/migrations/0002_seed_example.sql
```

## 2. Environment

Copy `.env.example` → `.env.local` and fill:

| Var | Purpose |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | DB access (server-only) |
| `AUTH_SECRET` | signs user + admin session tokens |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | bootstraps the first admin on first login |
| `CRON_SECRET` | bearer token for the inactivity sweep |
| `APPLE_*`, `GOOGLE_*`, `WEB_GATEWAY_WEBHOOK_SECRET` | IAP receipt verification |

## 3. Build & run

```bash
docker compose up -d --build      # serves on :3020
```

## 4. Caddy route

Add to the prod `Caddyfile` (then `caddy reload`):

```
cdd.46-62-215-11.nip.io {
    reverse_proxy localhost:3020
}
```

Admin panel: `https://cdd.46-62-215-11.nip.io/admin` (gated by the admin login).

## 5. Inactivity sweep cron

The streak/joker sweep must fire near each user's local midnight. Run it hourly
so it catches every time zone:

```cron
# crontab -e  (on the prod box)
0 * * * * curl -fsS -X POST https://cdd.46-62-215-11.nip.io/api/cron/inactivity-sweep \
            -H "Authorization: Bearer $CRON_SECRET" >/dev/null
```

It only adjusts streak/joker — course progress is never touched.

## 6. IAP webhooks

Point the store server notifications at:

- Apple App Store Server Notifications V2 → `POST /api/iap/apple`
- Google Play RTDN (Pub/Sub push) → `POST /api/iap/google`
- Web-fallback gateway → `POST /api/iap/web`

Signature/receipt verification is stubbed (`src/lib/engine/iap.ts` +
webhook routes) — implement before going live.

## Notes

- This app is **not yet wired into Command Center** and has no CI workflow.
- Mobile client deploy (Expo / EAS) is documented in `../mobile`.
