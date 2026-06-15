# ytdlp — CLAUDE.md

FastAPI + yt-dlp Docker companion service. Runs on Railway (prod) or
Hetzner (`infra-ytdlp-1`).

Used by `apps/transcribe` and `services/node/infra-worker` (viral_clone pipeline)
to extract direct media URLs that Deepgram / Whisper can ingest, when our
own YouTube captions parser is rate-limited or for sources without
captions (TikTok / X / Vimeo / SoundCloud / Facebook / Instagram fallback).

Source-of-truth: `README.md` in this folder.

## Single endpoint

```
POST /extract
Authorization: Bearer $YTDLP_SERVICE_API_KEY
Body: { url: string }
Returns: { url, title, duration, ext, extractor }
```

`url` is a signed direct media URL Deepgram can ingest.

## Auth

Auth via `Authorization: Bearer $YTDLP_SERVICE_API_KEY`. Without API key set
on the service, requests pass through (don't deploy to internet without
it).

## Cookies

Instagram / YouTube cookies can be provided as base64:
- `INSTAGRAM_COOKIES_B64`
- `COOKIES_B64`

Both env-var names are accepted (legacy compat).

## Known issue

YouTube actively rate-limits datacenter IPs. For YouTube via Railway,
cookies are required. Instagram cookies are no longer needed when
`APIFY_API_TOKEN` is set in the transcribe app (Apify path bypasses
yt-dlp for Instagram).

## Models

None — this service does not call any LLM. It only resolves URLs to media.
