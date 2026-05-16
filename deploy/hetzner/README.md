# Deploy to Hetzner Cloud

End-to-end migration from Vercel + Railway to a single Hetzner VPS
running Docker Compose. Architecture:

```
Hetzner CX22 (€4.51 / month, 2 vCPU, 4 GB RAM, 40 GB SSD)
└── docker compose
    ├── caddy   :80, :443    auto-TLS via Let's Encrypt
    ├── app     :3000        Next.js (this repo)
    └── ytdlp   :8000        FastAPI + yt-dlp (services/ytdlp/)
```

Supabase stays as a managed service — no need to self-host Postgres.

## 1. Provision the server

1. Create a Hetzner Cloud project, add an SSH key.
2. Create a CX22 server in Nuremberg/Helsinki/Ashburn, Ubuntu 24.04.
3. Note the IPv4. Open `Firewalls` → allow 22, 80, 443.
4. Point your domain's A record to that IPv4 (e.g. `transcribe.example.com`).

## 2. Install Docker

SSH in and run:

```bash
ssh root@<server-ip>

apt update && apt -y upgrade
apt install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Verify: `docker compose version`.

## 3. Clone and configure

```bash
cd /opt
git clone https://github.com/kleber2009-alt/ai-command-center.git
cd ai-command-center/deploy/hetzner
cp .env.example .env
nano .env   # fill in real keys
```

## 4. Bring it up

```bash
docker compose up -d --build
docker compose logs -f app   # watch boot
```

Caddy will obtain a Let's Encrypt cert on first request to your domain
(may take ~30 sec). Then open `https://${DOMAIN}` — you should see the
transcribe app.

## 5. Update Telegram bot

In BotFather:

- `/setdomain` → choose bot → enter `https://${DOMAIN}`
- `/mybots` → bot → `Edit Bot` → `Menu Button` → set web app URL to
  `https://${DOMAIN}/transcribe`

## 6. Updates

```bash
cd /opt/ai-command-center
git pull
cd deploy/hetzner
docker compose up -d --build
```

## 7. Backups

Supabase handles your data. To back up the env + compose config:

```bash
tar czf /root/ai-command-center-config.tgz \
  /opt/ai-command-center/deploy/hetzner/.env \
  /opt/ai-command-center/deploy/hetzner/docker-compose.yml \
  /opt/ai-command-center/deploy/hetzner/Caddyfile
```

## Troubleshooting

- **`docker compose build` fails on `NEXT_PUBLIC_*` missing** — the
  Dockerfile passes these as build args; make sure they're in `.env`.
- **YouTube returns IP-block errors** — provide `COOKIES_B64` to the
  ytdlp service. See `services/ytdlp/README.md`.
- **Caddy can't get cert** — check your A record actually points to this
  IP and ports 80/443 are open. `docker compose logs caddy`.
- **Out of memory during build** — CX22 has 4 GB which is enough; if you
  used a smaller plan, build the image elsewhere and push to a registry.
