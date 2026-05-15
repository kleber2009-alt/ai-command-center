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
