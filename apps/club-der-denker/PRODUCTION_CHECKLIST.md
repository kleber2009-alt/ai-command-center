# Club Der Denker — Production Release Checklist

Staged path from the current scaffold to a live App Store / Google Play release,
derived from the *Technisches Lastenheft v1.2*. Legend: ✅ done in repo ·
⚙️ requires setup/accounts (owner) · 🚧 remaining code · 📝 content.

---

## Stage 1 — Operational hardening (code) ✅
- ✅ `/api/health` DB-connectivity probe (monitoring + deploy check).
- ✅ Rate limiting on public endpoints (`leads`, `funnel/event`, `auth/*`).
- 🚧 Password reset + SMTP (optional — only if email login is offered broadly).
- 🚧 Signed-URL gated media (optional; conflicts with offline cache).

## Stage 2 — Infrastructure (ТЗ §2) ⚙️
- [ ] Supabase project in an EU region (the "GDPR server"), or self-hosted PG+Storage.
- [ ] Apply migrations `0001`,`0003`,`0004` (and `0002` seed-skeleton if desired).
- [ ] Create the `cdd-media` storage bucket (migration `0004`).
- [ ] Domain + Caddy reverse-proxy + HTTPS for `cdd-backend` (:3020).
- [ ] Hourly cron → `POST /api/cron/inactivity-sweep` (Bearer `CRON_SECRET`).
- [ ] Backups + uptime monitoring (Supabase backups or wire into `aux_backup`).

## Stage 3 — Secrets & config (GitHub + env) ⚙️
Set as GitHub Actions secrets/vars for `deploy-club-der-denker.yml`:
- [ ] `CDD_SUPABASE_URL`, `CDD_SUPABASE_SERVICE_ROLE_KEY`
- [ ] `CDD_AUTH_SECRET` (`openssl rand -base64 32`)
- [ ] `CDD_ADMIN_EMAIL`, `CDD_ADMIN_PASSWORD`
- [ ] `CDD_CRON_SECRET`
- [ ] `CDD_APPLE_CLIENT_IDS`, `CDD_APPLE_BUNDLE_ID`, `APPLE_ROOT_CA_FINGERPRINT`, `APPLE_REQUIRE_ROOT_PIN=true`
- [ ] `CDD_GOOGLE_CLIENT_IDS`, `CDD_GOOGLE_PLAY_PACKAGE_NAME`, `CDD_GOOGLE_SERVICE_ACCOUNT_JSON`
- [ ] `CDD_GOOGLE_PUBSUB_AUDIENCE`, `CDD_GOOGLE_PUBSUB_SA_EMAIL`
- [ ] `CDD_WEB_GATEWAY_WEBHOOK_SECRET` (if web-fallback used)

## Stage 4 — Stores & payments (ТЗ §4) ⚙️
Apple:
- [ ] Apple Developer Program; app in App Store Connect.
- [ ] IAP products: course access (non-consumable) + community (auto-renewable monthly).
- [ ] App Store Server Notifications V2 URL → `/api/iap/apple`.
- [ ] Sign in with Apple: Services ID + key.

Google:
- [ ] Play Console app; same two IAP products.
- [ ] Play Developer API service account (`GOOGLE_SERVICE_ACCOUNT_JSON`).
- [ ] RTDN: Pub/Sub topic + push subscription → `/api/iap/google`.
- [ ] Google OAuth client ids (iOS/Android/Web) for Sign-In.

App config:
- [ ] `mobile/app.json → extra`: real `apiBaseUrl`, Google client ids, IAP SKUs
      matching the store products.

## Stage 5 — Content (ТЗ §3.1/§3.3/§6) 📝
- [ ] 3 free items + practical case + objection copy, all 6 locales.
- [ ] 112 course items (28×4) with options + feedback, all 6 locales.
- [ ] Item media (image/video) uploaded via admin.
- [ ] Product sales page copy (funnel step 6).
- [ ] Initial community feed posts (optional at launch).

## Stage 6 — Legal & compliance (ТЗ §5; store rules) ⚙️🚧
- [ ] Datenschutzerklärung, Impressum, AGB (DE) — link from landing + app.
- [ ] Apple App Privacy + Google Data safety forms.
- [ ] Public account-deletion path (Apple-required); backend `DELETE /api/profile` ✅.
- ✅ PCI-DSS by design (no card data; store interfaces only).

## Stage 7 — QA & release ⚙️
- [ ] On-device E2E (iOS+Android): funnel, sandbox purchase, tz/midnight unlock,
      joker, offline + sync, social sign-in, GDPR delete.
- [ ] EAS / native builds; store review submission.
- ✅ Engine unit tests (16), typecheck, prod build (CI: `typecheck-club-der-denker.yml`).

## Stage 8 — Command Center (optional) ⚙️
- [ ] Insert the project row into the `aisales` DB `projects` table (prod write —
      requires explicit approval). Doc entry already in root `CLAUDE.md` (row 13).

---

### Already complete in the repo
Engine (levels/unlock/streak-joker/community), all API + admin CRUD, IAP verify
+ 3 signed webhooks, social auth, media storage, cron, offline cache + sync,
i18n×6, GDPR delete, Docker/compose, CI workflows, landing, ops hardening
(health + rate limiting).
