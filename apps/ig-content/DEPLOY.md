# Deploy — ig-content (Supabase Cloud + Docker on Hetzner + Caddy)

Target: the same Hetzner box (`46.62.215.11`) as the rest of the monorepo.
The Next.js app runs in one Docker container; the database and auth are hosted
on Supabase Cloud. Caddy terminates TLS and reverse-proxies to the container.

Public URL: **https://igcontent.46-62-215-11.nip.io**

---

## 1. Supabase Cloud (one-time)

1. Create a project at https://supabase.com → **New project**.
   Pick a region close to Hetzner (e.g. EU). Save the database password.
2. **SQL Editor** → run the migrations from this repo **in order**:
   - `supabase/migrations/001_init.sql` — core tables, the
     `auth.users → public.users` trigger and RLS policies.
   - `supabase/migrations/002_self_learning.sql` — knowledge base
     (`content_library` with pgvector), `feedback`, `agent_learnings`,
     `generation_logs`, the `match_content_library` RPC and their RLS.
     Enables the `vector` extension automatically.
3. **Project Settings → API**, copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server-only secret)
4. **Authentication → URL Configuration**:
   - **Site URL**: `https://igcontent.46-62-215-11.nip.io`
   - **Redirect URLs**: add `https://igcontent.46-62-215-11.nip.io/auth/callback`
5. **Authentication → Providers → Email**: keep enabled. For a quick launch you
   may turn **Confirm email** off (users can log in immediately); turn it back
   on once SMTP is configured.

---

## 2. Get the code on the server

```bash
ssh prod                       # or: ssh root@46.62.215.11
cd /root/ai-command-center      # the monorepo checkout
git fetch origin
git checkout claude/instagram-content-automation-mvp-BS98a
git pull
cd apps/ig-content
```

## 3. Configure env

```bash
cp .env.production.example .env
nano .env                       # Supabase values + ANTHROPIC_API_KEY + OPENAI_API_KEY
```

`OPENAI_API_KEY` powers knowledge-base embeddings (RAG). It's optional — without
it, retrieval falls back to performance-score ranking — but recommended.

`.env` is git-ignored and is read by docker-compose both for build-arg
substitution (the `NEXT_PUBLIC_*` values) and for runtime injection.

## 4. Build & run

```bash
docker compose up -d --build
docker compose logs -f ig-content      # watch for "Ready"
```

The container listens on host port **3010**.

Sanity check before Caddy:
```bash
curl -I http://localhost:3010/login    # expect 200
```

## 5. Caddy (TLS + routing)

Append the block from `deploy/Caddyfile.snippet` to `/etc/caddy/Caddyfile`
(the prod source of truth), then reload Caddy:

```bash
# host Caddy:
caddy reload --config /etc/caddy/Caddyfile
# or if Caddy runs in a container, exec the reload inside it.
```

Then open https://igcontent.46-62-215-11.nip.io → you should land on `/login`.

---

## 6. Verify end-to-end

1. Register a new account → you're redirected to `/dashboard`.
2. **Campaigns → Create campaign** (the "30 Days With Claude" template is
   prefilled) → **Generate plan** → 30 days appear in the calendar.
3. Open a day → **Generate Reels** / **Generate Carousel** → edit → set status.
4. Add metrics on a day → **Analytics → Analyze Performance** for AI recs.

---

## Updating

```bash
cd /root/ai-command-center && git pull
cd apps/ig-content && docker compose up -d --build
```

## Notes / gotchas

- **`NEXT_PUBLIC_*` are baked in at build time.** Changing the Supabase URL or
  anon key requires `docker compose up -d --build` (not just a restart).
- **Never commit `.env`.** It holds the service-role key.
- `IGC_DEMO` must stay `0`/unset in prod — `1` switches to the in-memory mock.
- Port `3010` must be free on the host. If taken, change both the compose
  `ports:` mapping and the Caddy `reverse_proxy` target.
- Backups: the data lives in Supabase Cloud (managed backups on their side).
  No local pg_backup wiring is needed for this app.
