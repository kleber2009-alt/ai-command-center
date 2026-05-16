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

## Как запускается у нас

Через корневой `docker-compose.yml` под именем сервиса `ytdlp`. Next.js
видит его как `http://ytdlp:8080` (`YTDLP_SERVICE_URL` подставляется
автоматически в compose). Наружу порт не выставляется — только через
внутреннюю сеть docker.

## Auth (опционально)

Если задан `YTDLP_SERVICE_API_KEY`, входящие запросы должны нести
`Authorization: Bearer <key>`. Внутри compose это не обязательно,
потому что сервис недоступен снаружи. Включи, если решишь пробросить
его наружу.

## Cookies для Instagram / Facebook / age-gated YouTube

Многие сайты блокируют скрейпинг без cookies залогиненной сессии. Чтобы
yt-dlp умел брать Instagram Reels и иногда YouTube — нужны cookies.

### Как достать cookies-файл

1. Залогинься в браузере (например, instagram.com).
2. Поставь расширение **Get cookies.txt LOCALLY** (Chrome / Firefox).
3. Открой сайт → клик по расширению → **Export** → сохрани `cookies.txt`.

### Как скормить сервису

Сервис принимает cookies через env-переменную в base64.
Один `cookies.txt` может содержать cookies для нескольких доменов
(Netscape-формат). Рекомендуется собрать в один файл cookies от
`youtube.com` и `instagram.com`.

```bash
# Linux:
cat yt_cookies.txt ig_cookies.txt | base64 -w 0
# macOS:
cat ~/Downloads/yt_cookies.txt ~/Downloads/ig_cookies.txt > combined.txt
base64 -i combined.txt | pbcopy
```

Положи результат в `.env` рядом с `docker-compose.yml`:

```
COOKIES_B64=H4sIAAAAAAA...
```

(работает и старое имя `INSTAGRAM_COOKIES_B64`). Перезапусти стек:

```bash
docker compose restart ytdlp
```

> ⚠️ Cookies протухают (Instagram и YouTube ротируют сессии раз в
> несколько недель). Когда снова поползут 401 / login-required —
> экспортируй и обнови env.

## Локальный тест без compose

```bash
cd services/ytdlp
docker build -t ytdlp-extractor .
docker run --rm -p 8080:8080 ytdlp-extractor

curl -s -X POST http://localhost:8080/extract \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```
