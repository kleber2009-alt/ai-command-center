# ytdlp-extractor

Tiny FastAPI service that wraps `yt-dlp` to return a direct audio URL for a
given YouTube / Instagram / TikTok / Twitter / etc. video link.

The main Next.js app calls this when our native YouTube captions parser is
blocked by Google rate limits, or when the URL points to a social network
that doesn't expose a direct media URL.

## Endpoints

- `GET /` — service info
- `GET /healthz` — health check
- `POST /extract` — body `{"url": "https://..."}`, returns
  `{"url": "<direct audio URL>", "title", "duration", "extractor", "ext"}`

The audio URL is a signed, time-limited URL hosted by the original CDN
(googlevideo for YouTube, etc.). The app downloads through Deepgram by
reference — we don't proxy the media.

## Auth (optional)

If `YTDLP_SERVICE_API_KEY` is set on the service, callers must send
`Authorization: Bearer <key>`. Otherwise the endpoint is open. Set this on
Railway so only your Vercel app can hit it.

## Cookies for Instagram / Facebook / age-gated YouTube

Many sites block scraping unless yt-dlp presents the cookies of a logged-in
session. To unlock Instagram Reels in particular, export cookies from
your browser as a Netscape `cookies.txt` file and feed them to the service.

### How to get the cookies file

1. Log into the target site in your browser (e.g. instagram.com)
2. Install the browser extension **Get cookies.txt LOCALLY** (Chrome/Firefox)
3. Open the site, click the extension, **Export** → save `cookies.txt`

### How to feed it to the service

The service accepts cookies via env var (base64-encoded) so you don't need
to mount a file.

```bash
# On your machine, encode the file:
base64 -w 0 cookies.txt
# Copy the output (one long string)
```

On Railway, add the env var:

- `INSTAGRAM_COOKIES_B64` (or generic `COOKIES_B64`) = the base64 string

Restart the Railway service. On the first call yt-dlp will write the
cookies to a temp file and use them for every extraction.

> ⚠️ The cookies expire (Instagram rotates session tokens every few weeks).
> When you start getting 401/login-required errors again, re-export cookies
> and update the env var.

## Deploy on Railway

1. Create a new project on https://railway.app
2. **New** → **Deploy from GitHub repo** → pick `kleber2009-alt/ai-command-center`
3. After it imports: **Settings** → **Service** → set **Root Directory** to
   `services/ytdlp` (otherwise Railway tries to build the whole repo as Next.js)
4. **Variables** → add `YTDLP_SERVICE_API_KEY` with any random long string
5. **Settings** → **Networking** → **Generate Domain** → copy the
   `*.up.railway.app` URL
6. Back in Vercel, add two env vars to the main app:
   - `YTDLP_SERVICE_URL=https://<your>.up.railway.app`
   - `YTDLP_SERVICE_API_KEY=<same as on Railway>`
7. Redeploy Vercel

## Local test

```bash
cd services/ytdlp
docker build -t ytdlp-extractor .
docker run --rm -p 8080:8080 ytdlp-extractor

curl -s -X POST http://localhost:8080/extract \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```
