# Hetzner Deploy Runbook

Operational guide for the transcription app running on a single Hetzner
Cloud VM (`cpx21` / `cax11`) with Docker Compose + Caddy + Let's Encrypt.

## Topology

```
internet → Caddy :443 (auto-LE cert)
            ├── /api/* + /transcribe/*  →  app:3000  (Next.js 14 standalone)
            └── internal only            →  ytdlp:8080 (FastAPI + yt-dlp + ffmpeg)
```

All three services run as containers managed by `docker-compose.yml` in
this folder. `.env` holds the runtime secrets and is git-ignored.

## First-time provision

This is automated by the cloud-init template in
`bootstrap/cloudinit.template.yaml`. To do it by hand:

```bash
ssh root@<ip>
apt-get update && apt-get install -y ca-certificates curl git
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu noble stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo "/swapfile none swap sw 0 0" >> /etc/fstab
git clone https://github.com/<owner>/<repo>.git /opt/app
cd /opt/app/deploy/hetzner
cp .env.example .env   # then edit .env with real values
docker compose up -d --build
```

## Required env vars (`.env`)

| Var | Purpose | Required |
|---|---|---|
| `DOMAIN` | Hostname Caddy issues a cert for. Either real DNS A-record → server IP, or `<dashed-ip>.sslip.io`. | Yes |
| `ANTHROPIC_API_KEY` | Claude for summarize/translate/generate. | Yes |
| `DEEPGRAM_API_KEY` | Audio transcription fallback (anything not YouTube). | Yes |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL. May end with `/rest/v1/` — code normalizes. | For history/cache |
| `SUPABASE_SERVICE_KEY` | **service_role** key, not anon. With anon, INSERT is blocked by RLS. | For history/cache |
| `YTDLP_SERVICE_API_KEY` | Random string, shared between app and ytdlp container. | Yes |
| `INSTAGRAM_COOKIES_B64` | base64 of Netscape-format `cookies.txt` for IG. | For Instagram |
| `COOKIES_B64` | base64 of generic cookies.txt (mainly YouTube). | For YouTube transcription |
| `TELEGRAM_BOT_TOKEN` | From BotFather. Enables server-side initData verification on POST routes. | For Telegram Mini App security |
| `TELEGRAM_REQUIRE_INIT_DATA` | If `"true"`, all POSTs reject requests without a valid Telegram header (closes browser access). | Optional |

Generate cookies with the "Get cookies.txt LOCALLY" browser extension while
logged into instagram.com / youtube.com, then `base64 -w0 cookies.txt`.

## Redeploy after a code change

```bash
ssh root@<ip>
cd /opt/app
git pull
cd deploy/hetzner
docker compose up -d --build         # rebuilds + replaces only changed containers
docker compose logs --tail 60 app    # sanity check
```

Caddy and ytdlp containers usually don't rebuild on app-only changes.
The Next.js build runs inside the `app` container (`node:20-alpine`) and
takes ~3–5 min on a `cpx21` (4 GB RAM) — the swapfile is important here.

## Rotate a single env var

```bash
ssh root@<ip>
cd /opt/app/deploy/hetzner
sed -i 's|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=new-value|' .env
docker compose up -d                 # restart only services that read it
```

`NEXT_PUBLIC_*` vars are inlined into the client bundle at build time, so
changing them requires `--build`.

## Recover from a bad deploy

```bash
ssh root@<ip>
cd /opt/app
git log --oneline -5                 # find the last known-good commit
git checkout <sha>
cd deploy/hetzner
docker compose up -d --build
```

If the Docker daemon itself is wedged: `systemctl restart docker` then
`docker compose up -d`. Container restart policy is `unless-stopped` so a
reboot brings everything back automatically.

## Diagnostics

```bash
# what's running
docker compose ps
# follow app logs
docker compose logs -f --tail 100 app
# verify env reached the container
docker compose exec -T app printenv | grep -E '^(NEXT|SUPABASE|ANTHROPIC|DEEPGRAM|TELEGRAM|YTDLP)'
# Caddy access log
docker compose logs --tail 50 caddy
# disk + memory
df -h / ; free -h ; swapon --show
# Caddy cert health
docker compose exec -T caddy cat /data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/$DOMAIN/$DOMAIN.crt | openssl x509 -noout -dates
```

## Telegram Mini App setup (client-side)

After deploy, in BotFather chat:

1. `/setdomain` → pick your bot → enter `<DOMAIN>` (no protocol, no path).
2. `/setmenubutton` → bot → text + URL `https://<DOMAIN>/transcribe`.

Optional hardening: set `TELEGRAM_REQUIRE_INIT_DATA=true` in `.env` and
restart `app`. Browser access is now blocked; only requests carrying a
valid signed initData from your bot are accepted.

## Supabase migrations

Run once in the Supabase Dashboard → SQL Editor:

```sql
-- in order:
-- 1) supabase/migrations/001_transcripts.sql
-- 2) supabase/migrations/002_generations.sql
```

The app degrades gracefully without these (uses `local-*` sessionStorage
IDs), but you lose cross-device history and generation caching.

## When YouTube starts returning "Sign in to confirm you're not a bot"

As of 2026 YouTube aggressively blocks **datacenter IPs even with valid
cookies**. The login session that worked in a residential browser is
recognised by YouTube as "uncertain" when the request originates from
Hetzner/AWS/GCP. yt-dlp emits the bot-check error regardless of how
fresh the cookies are.

What still works against datacenter IPs:
- Videos that have public captions → our captions parser (`src/lib/youtube-captions.ts`) bypasses yt-dlp entirely
- All non-YouTube sources (Instagram, TikTok, X, direct media URLs)

What does **not** reliably work:
- Auto-transcribed videos with no manual captions, hit through datacenter IP

Options if you need YouTube to work end-to-end:
1. **Residential proxy** — point yt-dlp at a residential IP using `proxy`
   in `extractor_args`. Providers: Bright Data, Webshare, Oxylabs (~$5-20/mo).
2. **Third-party transcription API** — Tactiq, AssemblyAI's YouTube
   endpoint, etc. take the URL, do their own scraping, return text.
3. **Browser-on-server** — run a real headless Chrome with a stored
   session and have it download. Complex.

The Hetzner-only deploy ships with the cookies pipeline, the latest
yt-dlp, and the most-permissive player_client list — that's the
maximum yt-dlp can do without a proxy.

For one-off diagnostics: set `DEBUG_YTDLP_DIAG=true` in `.env`,
`docker compose up -d app`, then
`curl 'https://<DOMAIN>/api/health/ytdlp?url=https://www.youtube.com/watch?v=...'`
returns yt-dlp version, cookie domains in the merged file, and the
raw format list yt-dlp sees. Turn it off when done.

Refresh cookies anyway (might help marginally):
```bash
# from a logged-in browser: export cookies.txt for youtube.com
base64 -w0 youtube_cookies.txt
# paste the result into .env as COOKIES_B64=...
ssh root@<ip>
cd /opt/app/deploy/hetzner
nano .env   # update COOKIES_B64
docker compose up -d ytdlp
```

## Migration to a different region

```bash
# Snapshot first (Hetzner Console → Server → Snapshots)
# Then create new server in target location from that snapshot.
# Update your DNS A-record to the new IP.
# Delete the old server once DNS propagates.
```

For sslip.io users: the hostname is derived from the IP, so a new IP
means a new hostname; remember to update BotFather `/setdomain` if you
use Telegram.
