# Deploy on your own server

Single-VPS deploy via Docker Compose. Everything (Next.js app, yt-dlp
microservice, static AI-Office site, Postgres, reverse proxy with
auto-HTTPS) runs on one box, behind Caddy.

## Prerequisites

- A VPS running Ubuntu 22.04+ / Debian 12+ (any Linux with Docker works).
  For Hetzner Cloud specifics see [Hetzner notes](#hetzner-cloud) below.
- A domain name with an `A` record pointing at the VPS public IP, OR
  use `<IP>.sslip.io` (free DNS-via-IP, works with Let's Encrypt — see
  Hetzner notes for the trick).
- Docker Engine 24+ and Docker Compose plugin installed:

  ```sh
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker $USER && newgrp docker
  ```

## First-time setup

```sh
git clone <repo-url> ai-command-center
cd ai-command-center

cp .env.example .env
# edit .env — fill DOMAIN, POSTGRES_PASSWORD, *_API_KEY values

docker compose up -d --build
```

What happens:
1. `postgres` boots, sees `db/init.sql` in `/docker-entrypoint-initdb.d/`
   and creates all tables + indexes + pgvector extension.
2. `transcribe` (Next.js) connects to Postgres via `DATABASE_URL`.
3. `ytdlp` boots and is reachable inside the network as
   `http://ytdlp:8000`.
4. `caddy` proxies your domain to the Next.js container and issues a
   Let's Encrypt cert on first request. `office.<DOMAIN>` serves the
   legacy static site (`apps/ai-office`).

Check it: `https://<DOMAIN>/transcribe` should load.

## Updates

```sh
git pull
docker compose up -d --build
```

Compose rebuilds only what changed (cached layers). Downtime ≈ seconds.

## Database migrations

`db/init.sql` is the source of truth and runs **only on first boot of an
empty postgres volume**. For schema changes on an existing DB:

```sh
docker compose exec -T postgres psql -U app -d app < db/init.sql
```

The script is idempotent (`create table if not exists`, `add column if
not exists`).

## Backups

Postgres data lives in the `postgres_data` named volume. To dump:

```sh
docker compose exec -T postgres pg_dump -U app -d app > backup-$(date +%F).sql
```

Restore with `psql -U app -d app < backup.sql`.

For automation, schedule that command via cron + push the dump to S3 /
Backblaze.

## TLS / domain

Caddy reads `DOMAIN` from `.env`. To run on a different domain or add
subdomains, edit `Caddyfile` and run `docker compose restart caddy`.

For local dev without a domain, set `DOMAIN=localhost` — Caddy will
generate a self-signed cert and serve over HTTPS on the host. Telegram
Mini App won't connect to a self-signed host though.

## Telegram Mini App webhook

In BotFather, set the Mini App URL to `https://<DOMAIN>/transcribe`.
That's it — no Vercel / no Supabase involved.

## Admin authentication

The kanban board at `/admin`, the personal `/me` second-brain, and the
`/assistants` chat are protected by HTTP Basic Auth via
`apps/transcribe/src/middleware.ts`. Configure two env vars:

```
ADMIN_USERNAME=admin
ADMIN_PASSWORD=$(openssl rand -base64 32)
```

When `ADMIN_PASSWORD` is empty, every request to a private path
returns 401 (fail-secure). After changing the password, restart the
app container — no rebuild needed:

```sh
docker compose restart transcribe
```

`/transcribe` and `/api/transcribe/*` stay open so the Telegram Mini
App works for anonymous users. Server-side verification of Telegram
`initData` against `TELEGRAM_BOT_TOKEN` is not yet wired up — anyone
who can reach `/api/transcribe` can use it, so don't share the URL
publicly until that lands.

## Operational notes

- The transcribe container is stateless. You can scale it horizontally
  with `docker compose up -d --scale transcribe=3` and let Caddy
  round-robin between replicas.
- Postgres is **single-node**. For production redundancy, snapshot the
  volume regularly (and consider streaming replication if you ever
  outgrow a single box).
- The legacy `ai-office` static site is served by a vanilla nginx
  container — no build step. Just edit files under `apps/ai-office/`
  and `docker compose restart ai-office`.

## Hetzner Cloud

The whole stack runs on a single Hetzner Cloud VPS without any
provider-specific tweaks. Two helper files live in
`deploy/hetzner/`:

- `setup-existing.sh` — idempotent bash to provision an already-running
  server (installs Docker, configures ufw, adds 2 GB swap). Run it once:

  ```sh
  scp deploy/hetzner/setup-existing.sh user@<server-ip>:~
  ssh user@<server-ip> bash setup-existing.sh
  ssh user@<server-ip>            # log out and back in for `docker` group
  ```

- `cloud-init.yaml` — Hetzner Cloud "Cloud config" / user-data for new
  servers. Paste it into the user-data field when creating the server
  (after substituting `<REPO_URL>` and `<BRANCH>`). The server boots
  fully provisioned with the repo already cloned at
  `/opt/ai-command-center`.

### Sizing

| Plan  | vCPU | RAM  | Disk     | €/mo | When to pick                          |
| ----- | ---- | ---- | -------- | ---- | ------------------------------------- |
| CX22  | 2    | 4 GB | 40 GB    | ~4   | Default for personal use              |
| CX32  | 4    | 8 GB | 80 GB    | ~7   | Heavy parallel Deepgram / many users  |
| CPX21 | 3    | 4 GB | 80 GB    | ~6   | AMD CPU, faster Next.js build         |

CX22 with the 2 GB swap from `setup-existing.sh` builds the Next.js
image in ~2 min and serves traffic comfortably for one user / one Mini
App. Pick a location physically close to your users (`hel1` for EU,
`ash` for US, `sin` for Asia).

### Persistent data — Hetzner Volume

By default Postgres data lives in the `postgres_data` Docker named
volume on the server's root disk. If you want it to survive server
re-creation:

1. Create a Hetzner Volume (e.g. 20 GB), attach it to the server. It
   auto-mounts at `/mnt/HC_Volume_<id>`.
2. In `docker-compose.yml` replace the `postgres_data` line under
   `services.postgres.volumes` with a bind mount:

   ```yaml
       - /mnt/HC_Volume_<id>/postgres:/var/lib/postgresql/data
   ```

3. `docker compose down && docker compose up -d`. Existing data won't
   migrate automatically — `pg_dump` first if you've already accumulated
   anything you care about.

### HTTPS without a domain — sslip.io

Telegram Mini Apps require HTTPS, but you can skip buying a domain by
using `sslip.io`: any subdomain like `1.2.3.4.sslip.io` resolves to
`1.2.3.4` via public DNS, so Let's Encrypt happily issues a real cert
for it through Caddy's normal ACME flow.

In `.env`:

```
DOMAIN=1.2.3.4.sslip.io          # your Hetzner public IPv4 here
```

Then `docker compose up -d --build`. The Mini App URL becomes
`https://1.2.3.4.sslip.io/transcribe` — paste that into BotFather. When
you eventually buy a real domain, just point its A record at the same
IP and change `DOMAIN` in `.env`; Caddy will fetch a new cert
automatically.

### Hetzner firewall (optional)

You can either rely on the in-VM `ufw` that `setup-existing.sh`
configures, or use Hetzner's network-level firewall in the Cloud
Console. If you use the network firewall, allow:

- TCP 22 (SSH) — restrict source to your IP if possible
- TCP 80, TCP 443, UDP 443 (Caddy + HTTP/3)

Everything else can stay closed; the app talks to Postgres/yt-dlp over
the internal Docker network only.

### Snapshots

In the Hetzner Console: Server → Snapshots → "Take snapshot". Hetzner
charges per-GB-month for stored snapshots (€0.012/GB), so a 40 GB
snapshot is ~€0.50/month. Take one before any risky `docker compose`
operation; restore is one click.
