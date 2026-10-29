# Откуда брать рилсы Ильи и их метрики

Нужны по каждому рилсу: просмотры, комментарии, репосты/шеры (и сохранения), подпись, ссылка и прямая
ссылка на видео. Источники по качеству данных:

| Источник | Где работает | Репосты/шеры | Видео | Что нужно |
|---|---|---|---|---|
| **Windsor MCP** (`instagram`) | чат с Claude (Desktop, Code, облако) | да | `media_url` | коннектор Windsor.ai, аккаунт 17841446275691322 |
| **Graph API** | везде, в т.ч. Студия Кадрика | да | `media_url` | `IG_ACCESS_TOKEN` (+ `IG_USER_ID`) |
| **Apify** | везде | нет (только просмотры, комменты, лайки) | `videoUrl` | `APIFY_TOKEN` (тот же, что у infra-worker) |
| **ChatPlace + yt-dlp** | чат с Claude | нет; зато «лиды» — сколько написали кодовое слово | yt-dlp | MCP ChatPlace, `pip install yt-dlp` |
| **Ссылки** | везде | — | через Apify или файл | Илья присылает ссылку(и) на рилс |

## Windsor MCP — основной путь в чате

```
mcp__Windsor_ai__get_data(
  connector="instagram", accounts=["17841446275691322"], date_preset="last_180d",
  fields=["media_id","timestamp","media_type","media_product_type","media_permalink","media_shortcode",
          "media_views","media_total_comments_count","media_total_like_count","media_shares","media_reposts",
          "media_saved","media_reel_avg_watch_time","media_caption","media_url","media_thumbnail_url"],
  filters=[["media_product_type","eq","REELS"]])
```

Ответ целиком (JSON с `data`) сохрани в `~/reel-work/remake/_scan/windsor.json` (Write) и запусти
`fetch_reels.py --windsor ~/reel-work/remake/_scan/windsor.json`. Если ответ `pending` — повтори тот же вызов.

**«Uh-oh! These are not your real numbers… Free plan includes 1 account»** — на бесплатном плане Windsor
подключено два аккаунта (`instagram` и `instagram_public`). Скажи Илье: отключить `instagram_public`
на https://onboard.windsor.ai/app/ (или перейти на платный план) и через минуту повторить. `fetch_reels.py`
сам узнаёт эту заглушку и останавливается с этой подсказкой. Пока не починили — Graph API, Apify или ссылки.

## ChatPlace + yt-dlp — без Windsor и токенов

1. `mcp__Chat_Place__automations_triggers_list_instagram_media(botId="01a18057-4ab5-7031-8b95-82612de8269c")` — 300 последних
   постов @ilia.paliy (подпись, ссылка, обложка). Ответ большой: инструмент сам сохранит его в файл — бери этот путь.
2. `mcp__Chat_Place__automations_list_with_stats(botId=…)` — сохрани компактно в `~/reel-work/remake/_scan/chatplace_automations.json`:
   `[{"name", "startMessages", "totalClients"}]`. `totalClients` — сколько людей написали слово: прямой сигнал, что призыв сработал.
3. `fetch_reels.py --chatplace <файл постов> --automations <файл автоматизаций>` — рилсы (ссылки `/reel/`), кодовое слово
   из подписи, лиды по слову, лайки и комментарии 24 свежих через yt-dlp. Рилсы, которые Instagram прячет от части
   аудитории, помечаются `restricted` и в кандидаты не идут (их без входа не скачать).
Лимит: Instagram отдаёт анонимно несколько десятков запросов подряд, потом просит вход — 15–30 минут паузы.
Обогащение и скачивание победителя делят этот лимит, поэтому `--enrich` не больше 24.

## Graph API

`IG_ACCESS_TOKEN` — долгоживущий токен с `instagram_basic` + `instagram_manage_insights` (токен вида `IGAA…`
→ graph.instagram.com, `EAA…` → graph.facebook.com и `IG_USER_ID`, по умолчанию 17841446275691322).
Подходит и `META_TOKEN`, если у него есть эти права. `fetch_reels.py --source graph`.

## Apify

`APIFY_TOKEN` (актор `apify~instagram-scraper`, можно сменить `APIFY_INSTAGRAM_ACTOR`). Профиль скрейпится
публично, поэтому шеров и репостов нет — их вес делится между просмотрами и комментариями.
`fetch_reels.py --source apify`. Тот же токен `grab.py` использует, когда ссылка на видео протухла.

## Ссылки

Илья прислал ссылку(и) — `fetch_reels.py --links <url> …`, затем `rank.py` (если ссылок несколько)
или сразу `grab.py <url>`. Без Apify метрик нет, а видео может не скачаться (Instagram требует вход):
тогда попроси файл и запусти `grab.py <путь к mp4>`.

## Студия Кадрика (без MCP)

У Claude в боте нет MCP-коннекторов: Instagram — только Graph API, Apify или ссылка в тексте задачи;
аватар — только REST (`HEYGEN_API_KEY` в `.env` бота или профиле оболочки). Чего нет — назови в отчёте одной
строкой, что добавить.
