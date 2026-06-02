# Getting Started — Club Der Denker (local / VS Code)

Everything you need to clone the project and run it locally in VS Code.

## 1. Get the code

```bash
git clone https://github.com/kleber2009-alt/ai-command-center.git
cd ai-command-center
git checkout claude/affectionate-wozniak-NU6zI   # the feature branch (PR #50)
```

> The app lives under `apps/club-der-denker/`. The rest of the repo is the
> existing monorepo — you only need this folder.

## 2. Open in VS Code (recommended)

```bash
code apps/club-der-denker/club-der-denker.code-workspace
```

This opens a **multi-root workspace** with four folders (backend, mobile,
supabase, landing), recommended extensions, format-on-save, ESLint, and ready
**Tasks** (Terminal → Run Task): `backend: dev`, `backend: typecheck`,
`backend: test`, `mobile: start`. Accept the "Install recommended extensions"
prompt.

## 3. Backend (API + admin) — Next.js, port 3020

```bash
cd apps/club-der-denker/backend
cp .env.example .env.local        # fill the values (see below)
npm install
npm run dev                       # http://localhost:3020  (admin at /admin)
npm run typecheck                 # tsc --noEmit
npm test                          # 16 engine unit tests
```

Minimum `.env.local` to boot the admin/API locally:

```
SUPABASE_URL=...                  # a Supabase project (EU region for prod)
SUPABASE_SERVICE_ROLE_KEY=...     # service role key (server-only!)
AUTH_SECRET=$(openssl rand -base64 32)
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=change-me          # bootstraps the first admin on first login
```

Apply the DB schema to your Supabase/Postgres (SQL editor or `psql`):

```
supabase/migrations/0001_init.sql
supabase/migrations/0003_add_user_tz.sql
supabase/migrations/0004_storage_bucket.sql
supabase/migrations/0005_password_resets.sql
supabase/migrations/0002_seed_example.sql   # optional: empty 112-item skeleton
```

Other env vars (social auth, IAP, SMTP, Pub/Sub) are in `.env.example` and only
needed when you wire those features — see `PRODUCTION_CHECKLIST.md`.

## 4. Mobile (Expo / React Native)

```bash
cd apps/club-der-denker/mobile
npm install
npm run typecheck
npm start                         # Expo dev server — press i (iOS) / a (Android)
```

Point the app at your backend and stores in **`app.json` → `expo.extra`**:

```json
"extra": {
  "apiBaseUrl": "http://<your-LAN-ip>:3020",   // not localhost on a device
  "googleIosClientId": "", "googleAndroidClientId": "", "googleWebClientId": "",
  "iapCourseSku": "course_access", "iapCommunitySku": "community_subscription"
}
```

> IAP (`react-native-iap`) and Apple/Google sign-in need a **dev build** or real
> store config — they don't run in Expo Go. The funnel, course, feed and profile
> work against the local backend without them.

## 5. Landing

Static — just open `../../landings/club-der-denker/index.html` in a browser
(also `datenschutz.html`, `impressum.html`, `agb.html`, `konto-loeschen.html`).

## 6. Where things are

| Area | Path |
|---|---|
| Engine (rules, tested) | `backend/src/lib/engine/` |
| API routes | `backend/src/app/api/**` |
| Admin panel | `backend/src/app/admin/**` |
| Mobile screens | `mobile/src/screens/**` |
| Mobile navigation | `mobile/src/navigation/index.tsx` |
| DB schema | `supabase/migrations/**` |
| UI preview (mockups) | `preview/index.html` |

## 7. Read next

- `README.md` — architecture & run details.
- `ARCHITECTURE.md` — design rationale per spec section.
- `CLAUDE.md` — orientation + the binding engine rules.
- `PRODUCTION_CHECKLIST.md` — staged path to release.
- `backend/DEPLOY.md` — Docker / Caddy / cron / webhooks.

## 8. Common gotchas

- **Admin shows only a login** → no DB connection; check `SUPABASE_*` in `.env.local`.
- **Mobile can't reach API** → use your machine's LAN IP in `apiBaseUrl`, not `localhost`.
- **`next build` crashes on /404** → always build with `NODE_ENV=production`.
- **Engine tests need `tsx`** → installed via `npm install` (devDependency).
