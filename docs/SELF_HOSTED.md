# Self-hosted setup

Full stack runs on a single Linux VPS via docker-compose:

- **app** — Next.js (this repo)
- **db** — Postgres 16 with pgvector
- **ytdlp** — FastAPI + yt-dlp (existing service in `services/ytdlp/`)
- **caddy** — reverse proxy + automatic HTTPS

All four are wired together on an internal Docker network. Only Caddy is
exposed to the public internet (ports 80/443).

## Prerequisites

- A VPS (Hetzner CX22, DigitalOcean $6 droplet, Hostinger VPS — anything
  with ≥2 GB RAM is comfortable)
- A domain pointed at the VPS public IP (A record)
- SSH access to the VPS
- Docker + Docker Compose installed

Quick install on a fresh Ubuntu/Debian:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# log out & back in for the group change
```

## First-time deploy

```bash
# On the VPS:
git clone https://github.com/kleber2009-alt/ai-command-center.git
cd ai-command-center

# 1. Configure env
cp .env.example .env
nano .env  # fill in DOMAIN, POSTGRES_PASSWORD, ANTHROPIC_API_KEY,
          # DEEPGRAM_API_KEY, YTDLP_SERVICE_API_KEY

# 2. Build and start
docker compose up -d --build

# 3. Watch logs (Ctrl-C to detach)
docker compose logs -f app
```

The migrations in `supabase/migrations/` run automatically on the Postgres
container's first start (they're mounted via `docker-entrypoint-initdb.d`).
Caddy fetches a Let's Encrypt cert for your domain on the first HTTPS
request — give it ~10s.

Open `https://<your-domain>/transcribe` to verify.

## Telegram Mini App

After the app is live at `https://<your-domain>`:

1. Open [@BotFather](https://t.me/BotFather) → `/mybots` → your bot →
   **Bot Settings** → **Menu Button** → set URL to
   `https://<your-domain>/transcribe`.
2. (Optional) `/newapp` to give the bot a proper Mini App entry with
   icon/title.

## Migrating data from Supabase

If you previously ran on Supabase, copy the rows over with the included
script. You need a local Postgres client (`brew install postgresql` on
macOS, `apt install postgresql-client` on Debian).

1. **Get the Supabase connection string**: Supabase Dashboard →
   Project Settings → Database → "Connection string" → URI tab.
2. **Get the target connection string**: from your VPS, the host can be
   reached at `localhost` and the password is what you set in `.env`.
   For tunneling from your laptop:

   ```bash
   ssh -L 5433:localhost:5432 user@vps   # forwards local 5433 → vps:5432
   ```

   Then connection string is `postgres://app:PASSWORD@localhost:5433/app`.

3. **Run the migration**:

   ```bash
   chmod +x scripts/migrate-from-supabase.sh
   SUPABASE_DB_URL="postgresql://postgres.xxx:pwd@aws-0-...pooler.supabase.com:5432/postgres" \
   TARGET_DB_URL="postgres://app:PASSWORD@localhost:5433/app" \
     ./scripts/migrate-from-supabase.sh
   ```

   The script does `pg_dump --data-only --column-inserts` for our 5 tables
   (`transcripts`, `tasks`, `me_profile`, `me_documents`, `me_chunks`) and
   pipes the dump into the new DB. Idempotent if you re-run.

## Updating after a code change

```bash
git pull
docker compose up -d --build app   # rebuilds only the Next.js service
```

`db`, `ytdlp`, and `caddy` keep running with persistent volumes.

## Backups

The Postgres data lives in the `db_data` Docker volume. To back up:

```bash
docker compose exec db pg_dump -U app app | gzip > backup-$(date +%F).sql.gz
```

Copy the resulting `.sql.gz` off-host (rsync, scp, restic — whatever you
already use).

## Tearing down

```bash
docker compose down            # stops containers, keeps data
docker compose down -v         # ALSO wipes the db volume — careful
```
